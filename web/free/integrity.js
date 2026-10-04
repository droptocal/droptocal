/**
 * Play Integrity, checked here: the app asks Google for a token that says
 * "this is org.droptocal.app as Play installed it, on a real device", and
 * this decodes it with Google, as the service account in the
 * PLAY_INTEGRITY_SA secret (its JSON key, whole). Without that secret every
 * token is unproven, which is how a deployment without Play still works.
 *
 * The request hash ties a token to one installation: the app asks with the
 * SHA-256 of its id, so a token cannot be lifted and used for another.
 */

const SCOPE = 'https://www.googleapis.com/auth/playintegrity';
/** A token older than this was not made for this request. */
const FRESH_MS = 10 * 60 * 1000;

let access = { token: '', until: 0 };

export async function playIntegrity(env, token, install, pkg) {
  if (!env.PLAY_INTEGRITY_SA) return { ok: false, reason: 'play integrity not configured' };
  let payload;
  try {
    const res = await fetch(`https://playintegrity.googleapis.com/v1/${pkg}:decodeIntegrityToken`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrity_token: String(token) }),
    });
    if (!res.ok) return { ok: false, reason: `decode ${res.status}: ${(await res.text()).slice(0, 200)}` };
    payload = (await res.json()).tokenPayloadExternal;
  } catch (err) {
    return { ok: false, reason: `decode failed: ${err.message}` };
  }

  const request = payload?.requestDetails ?? {};
  if (request.requestPackageName !== pkg) return { ok: false, reason: 'another package' };
  if (request.requestHash !== (await sha256(install))) return { ok: false, reason: 'another installation' };
  if (Math.abs(Date.now() - Number(request.timestampMillis || 0)) > FRESH_MS) return { ok: false, reason: 'stale' };
  if (payload?.appIntegrity?.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
    return { ok: false, reason: `app: ${payload?.appIntegrity?.appRecognitionVerdict}` };
  }
  const device = payload?.deviceIntegrity?.deviceRecognitionVerdict ?? [];
  if (!device.includes('MEETS_DEVICE_INTEGRITY')) return { ok: false, reason: `device: ${device.join(',') || 'none'}` };
  return { ok: true };
}

/** An OAuth token for the service account, signed here and kept for its hour. */
async function accessToken(env) {
  if (access.token && access.until > Date.now() + 60000) return access.token;
  const account = JSON.parse(env.PLAY_INTEGRITY_SA);
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: account.client_email, scope: SCOPE, aud: account.token_uri, iat: now, exp: now + 3600 };
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pem(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetch(account.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const out = await res.json();
  access = { token: out.access_token, until: Date.now() + out.expires_in * 1000 };
  return access.token;
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pem(text) {
  const body = text.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0)).buffer;
}
