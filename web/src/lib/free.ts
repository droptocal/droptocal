import { canFetchNatively, inNativeApp, nativeFetch } from './native';
import { FREE_API } from './settings';

/**
 * A session with DropToCal's free API (free/ in this repository).
 *
 * The free API is shared by everyone, so it is rationed per installation,
 * and an installation introduces itself once with whatever proof it can
 * give: Play Integrity from the app as Play installed it, Turnstile from the
 * web page, or nothing — a build from GitHub — which gets the plain ration.
 * The token that comes back is then the Bearer key, for a week.
 */

const INSTALL_KEY = 'droptocal.install';
const SESSION_KEY = 'droptocal.freeSession';

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
/** The Google Cloud project Play Integrity is asked under; none, none asked. */
const PLAY_PROJECT = env.VITE_PLAY_CLOUD_PROJECT ?? '';
/** The Turnstile widget the web page solves; none, none solved. */
const TURNSTILE_SITEKEY = env.VITE_TURNSTILE_SITEKEY ?? '';

interface Session {
  token: string;
  expires: number;
  tier: string;
}

/** The free API said no for today, in words worth showing as they are. */
export class FreeLimit extends Error {}

/** A random id of this installation's own, which names nobody. */
export function installId(): string {
  try {
    const kept = localStorage.getItem(INSTALL_KEY);
    if (kept) return kept;
  } catch {
    /* no storage: a fresh id each time, and a fresh session with it */
  }
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try {
    localStorage.setItem(INSTALL_KEY, id);
  } catch {
    /* as above */
  }
  return id;
}

let held: Session | null = null;

function kept(): Session | null {
  if (held) return held;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) held = JSON.parse(raw) as Session;
  } catch {
    held = null;
  }
  return held;
}

export function forgetSession(): void {
  held = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing kept */
  }
}

/** Clear in Settings: the installation starts again under a new number. */
export function forgetInstallation(): void {
  forgetSession();
  try {
    localStorage.removeItem(INSTALL_KEY);
  } catch {
    /* nothing kept */
  }
}

let opening: Promise<string> | null = null;

/** The Bearer key for the free API, opening a session when there is none. */
export function freeToken(): Promise<string> {
  const session = kept();
  // A day's margin, so a read is never sent with a token about to lapse.
  if (session && session.expires > Date.now() + 86400000) return Promise.resolve(session.token);
  // Two reads at once share one introduction.
  opening ??= open().finally(() => (opening = null));
  return opening;
}

async function open(): Promise<string> {
  const install = installId();
  const proof = inNativeApp() ? await playProof(install) : await turnstileProof();
  const send = canFetchNatively() ? nativeFetch : fetch;
  const res = await send(`${FREE_API}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ install, ...proof }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<Session> & { error?: { message?: string } };
  if (!res.ok || !body.token) {
    const message = body.error?.message || `The free API could not start a session (HTTP ${res.status}).`;
    throw res.status === 429 || res.status === 403 ? new FreeLimit(message) : new Error(message);
  }
  held = { token: body.token, expires: body.expires ?? 0, tier: body.tier ?? 'none' };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(held));
  } catch {
    /* kept for this run only */
  }
  return held.token;
}

// ---- proof ----

interface Integrity {
  token(o: { cloudProjectNumber: string; requestHash: string }): Promise<{ token: string }>;
}

const integrity = (): Integrity | undefined =>
  (globalThis as { Capacitor?: { Plugins?: { Integrity?: Integrity } } }).Capacitor?.Plugins?.Integrity;

/**
 * Play's word that this is the app it installed. Not having it is no error:
 * a build from GitHub, a phone without Play, or a project not set up yet
 * simply get the plain ration.
 */
async function playProof(install: string): Promise<{ integrity?: string }> {
  const plugin = integrity();
  if (!plugin || !PLAY_PROJECT) return {};
  try {
    const { token } = await plugin.token({ cloudProjectNumber: PLAY_PROJECT, requestHash: await sha256(install) });
    return token ? { integrity: token } : {};
  } catch {
    return {};
  }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface TurnstileApi {
  render(
    el: HTMLElement,
    o: { sitekey: string; size?: string; callback: (t: string) => void; 'error-callback': () => void },
  ): string;
}

/** Cloudflare's check that a person is at the page, solved without asking them as a rule. */
async function turnstileProof(): Promise<{ turnstile?: string }> {
  if (!TURNSTILE_SITEKEY) return {};
  try {
    const api = await loadTurnstile();
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:100';
    document.body.append(box);
    try {
      const token = await new Promise<string>((resolve, reject) => {
        const late = setTimeout(() => reject(new Error('turnstile timeout')), 30000);
        api.render(box, {
          sitekey: TURNSTILE_SITEKEY,
          size: 'flexible',
          callback: (token) => {
            clearTimeout(late);
            resolve(token);
          },
          'error-callback': () => {
            clearTimeout(late);
            reject(new Error('turnstile'));
          },
        });
      });
      return { turnstile: token };
    } finally {
      box.remove();
    }
  } catch {
    return {};
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  const ready = (globalThis as { turnstile?: TurnstileApi }).turnstile;
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      const api = (globalThis as { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else reject(new Error('turnstile'));
    };
    script.onerror = () => reject(new Error('turnstile'));
    document.head.append(script);
  });
  return loading;
}
