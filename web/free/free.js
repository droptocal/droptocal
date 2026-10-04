/**
 * DropToCal free — an OpenAI-compatible API that costs whoever calls it
 * nothing, because it runs on Cloudflare's Workers AI and holds no key at all.
 *
 * The relay next door passes a caller's key on and buys nobody any compute.
 * This one is the opposite on purpose: it is what the app asks when nobody
 * has set up an API of their own. So it decides everything a caller could
 * otherwise spend money with — which model, how long a question, how long an
 * answer — and the allowance is shared by everyone, so it is rationed:
 *
 *   POST /v1/session            an installation introduces itself, with
 *                               proof where it has some, and gets a token
 *   POST /v1/chat/completions   with that token as its Bearer key
 *
 * What a session may use depends on the proof (see TIERS): Play Integrity
 * from the app as installed from Play, Turnstile from the web page, or none
 * at all — a build from GitHub, which no one can vouch for — and nothing
 * unproven is served once REQUIRE_PROOF is set. Under every tier sits a
 * daily ceiling for everyone together, kept below Workers AI's free
 * allowance, so however this is abused it cannot cost money: at worst it is
 * used up for the day.
 *
 * In the app a photo is read on the phone first (ML Kit), so what arrives
 * here is usually text. A browser has no such reader and sends the photo,
 * which the model can read too, at the cost of a few more tokens.
 */

import { DurableObject } from 'cloudflare:workers';
import { playIntegrity } from './integrity.js';

const DEFAULTS = {
  MODEL: '@cf/google/gemma-4-26b-a4b-it',
  // Neurons per million tokens, from Cloudflare's price list for the model above.
  NEURONS_IN: 9091,
  NEURONS_OUT: 27273,
  MAX_OUTPUT_TOKENS: 6000,
  // About 12,000 tokens. The app sends a page's first ~5,000; a photo or two
  // from a browser fits as well. Beyond this is a book, not a poster.
  MAX_TEXT_CHARS: 48000,
  MAX_BODY_BYTES: 8 * 1024 * 1024,
  // Everyone together, per UTC day. Workers AI gives 10,000 free.
  NEURONS_PER_DAY: 9000,
  // Per IP per day, whatever installations it claims to be.
  REQUESTS_PER_IP: 120,
  SESSIONS_PER_IP: 10,
  REQUIRE_PROOF: '',
  PACKAGE: 'org.droptocal.app',
  ALLOWED_ORIGINS: 'https://droptocal.org,https://localhost,capacitor://localhost,http://localhost:5173',
};

/** Requests per installation per day, by what vouched for it. */
const TIERS = { play: 40, web: 20, none: 20 };
const tiers = (env) => ({
  play: Number(env.PER_DAY_PLAY ?? TIERS.play),
  web: Number(env.PER_DAY_WEB ?? TIERS.web),
  none: Number(env.PER_DAY_NONE ?? TIERS.none),
});

const SESSION_DAYS = 7;

/** What the app may set; everything else in its request is dropped here. */
const PASSED = ['messages', 'temperature', 'response_format', 'tools', 'tool_choice'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, setting(env, 'ALLOWED_ORIGINS').split(',').map((o) => o.trim()));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    // A page from anywhere else may not spend the shared allowance. The app
    // asks natively and sends no Origin at all.
    if (origin && !headers['Access-Control-Allow-Origin']) {
      return fail(403, 'This API does not serve that origin.', headers);
    }

    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // A burst from one address waits a minute; the daily counts are below.
    if (env.LIMIT && request.method === 'POST') {
      const { success } = await env.LIMIT.limit({ key: ip });
      if (!success) return fail(429, 'Too many requests just now. Try again in a minute.', headers, 'burst');
    }

    if (request.method === 'GET' && path === '/v1/models') {
      return json(200, { object: 'list', data: [{ id: 'free', object: 'model', owned_by: 'droptocal' }] }, headers);
    }
    if (request.method === 'POST' && path === '/v1/session') return session(request, env, ip, headers);
    if (request.method === 'POST' && path === '/v1/chat/completions') return complete(request, env, ip, headers);
    return fail(404, 'POST /v1/session, then POST /v1/chat/completions', headers);
  },
};

const quota = (env) => env.QUOTA.get(env.QUOTA.idFromName('global'));

/**
 * An installation introduces itself. The id is its own random one, which
 * proves nothing alone — so what it may use is decided by the proof that
 * comes with it, and how many it may mint from one address is counted.
 */
async function session(request, env, ip, headers) {
  let asked;
  try {
    asked = await request.json();
  } catch {
    return fail(400, 'The request is not JSON.', headers);
  }
  const install = typeof asked?.install === 'string' ? asked.install : '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(install)) return fail(400, 'install must be a random id.', headers);

  let tier = 'none';
  let why = '';
  if (asked.integrity) {
    const verdict = await playIntegrity(env, asked.integrity, install, setting(env, 'PACKAGE'));
    if (verdict.ok) tier = 'play';
    else why = verdict.reason;
  } else if (asked.turnstile) {
    const verdict = await turnstile(env, asked.turnstile, ip);
    if (verdict.ok) tier = 'web';
    else why = verdict.reason;
  }
  if (tier === 'none' && setting(env, 'REQUIRE_PROOF')) {
    log({ session: 'refused', why });
    return fail(
      403,
      'The free API could not confirm this is DropToCal. Install it from Google Play, or use your own API.',
      headers,
      'proof',
    );
  }

  const made = await quota(env).open(install, tier, ip, Number(setting(env, 'SESSIONS_PER_IP')), SESSION_DAYS);
  if (!made.ok) return fail(429, made.message, headers, made.code);
  log({ session: tier, why: why || undefined });
  return json(200, { token: made.token, tier, perDay: tiers(env)[tier], expires: made.expires }, headers);
}

async function complete(request, env, ip, headers) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(401, 'Start a session first: POST /v1/session.', headers, 'session');

  const size = Number(request.headers.get('Content-Length') || 0);
  if (size > Number(setting(env, 'MAX_BODY_BYTES'))) {
    return fail(413, 'That is too large to read for free.', headers);
  }
  let asked;
  try {
    asked = await request.json();
  } catch {
    return fail(400, 'The request is not JSON.', headers);
  }
  if (!Array.isArray(asked?.messages) || asked.messages.length === 0) {
    return fail(400, 'messages is required.', headers);
  }
  if (textLength(asked.messages) > Number(setting(env, 'MAX_TEXT_CHARS'))) {
    return fail(413, 'That is longer than the free API reads in one go. Try a part of it.', headers, 'length');
  }

  const room = quota(env);
  const admitted = await room.admit(
    token,
    ip,
    tiers(env),
    Number(setting(env, 'REQUESTS_PER_IP')),
    Number(setting(env, 'NEURONS_PER_DAY')),
  );
  if (!admitted.ok) return fail(admitted.code === 'session' ? 401 : 429, admitted.message, headers, admitted.code);

  const model = setting(env, 'MODEL');
  const input = {};
  for (const name of PASSED) if (asked[name] !== undefined) input[name] = asked[name];
  const cap = Number(setting(env, 'MAX_OUTPUT_TOKENS'));
  const wanted = Number(asked.max_completion_tokens || asked.max_tokens || cap);
  input.max_completion_tokens = Math.min(wanted, cap);
  // Measured: thinking first wrote ~650 tokens for one poster, 15 times
  // the answer itself, and the answer was the same without it.
  input.chat_template_kwargs = { enable_thinking: false };
  const images = countImages(asked.messages);

  const began = Date.now();
  let answer;
  try {
    answer = await env.AI.run(model, input);
  } catch (refused) {
    // The model's own complaint, as a 400 the app reads as "ask another way".
    log({ tier: admitted.tier, images, ms: Date.now() - began, error: String(refused?.message || refused) });
    return fail(400, String(refused?.message || refused), headers);
  }

  const usage = answer?.usage ?? {};
  // Cloudflare reports what it charged; the price list is the fallback.
  const neurons =
    usage.neurons ??
    ((usage.prompt_tokens || 0) * Number(setting(env, 'NEURONS_IN')) +
      (usage.completion_tokens || 0) * Number(setting(env, 'NEURONS_OUT'))) /
      1e6;
  const day = await room.spend(token, ip, neurons);
  log({
    tier: admitted.tier,
    images,
    ms: Date.now() - began,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    neurons: Math.round(neurons * 10) / 10,
    today: Math.round(day.neurons),
    finish: answer?.choices?.[0]?.finish_reason,
  });

  // Already shaped like an OpenAI completion; the model's name is ours to give.
  return json(200, { ...answer, model: 'free' }, { ...headers, 'X-Free-Remaining': String(admitted.remaining - 1) });
}

/**
 * The counts, in one place so they are never two answers at once: sessions,
 * and today's requests per installation and per address, and neurons for
 * everyone. One instance for the whole service — each call is a few rows,
 * well inside what one Durable Object serves.
 */
export class Quota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, install TEXT, tier TEXT, expires INTEGER);
      CREATE TABLE IF NOT EXISTS counts (day TEXT, key TEXT, n REAL, PRIMARY KEY (day, key));
    `);
  }

  count(key) {
    return this.sql.exec('SELECT n FROM counts WHERE day = ? AND key = ?', today(), key).toArray()[0]?.n ?? 0;
  }

  add(key, n) {
    this.sql.exec(
      'INSERT INTO counts (day, key, n) VALUES (?, ?, ?) ON CONFLICT (day, key) DO UPDATE SET n = n + excluded.n',
      today(),
      key,
      n,
    );
  }

  async open(install, tier, ip, perIp, days) {
    if (this.count(`sessions:${ip}`) >= perIp) {
      return { ok: false, code: 'sessions', message: 'Too many new sessions from this network today. Try again tomorrow.' };
    }
    this.add(`sessions:${ip}`, 1);
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const expires = Date.now() + days * 86400000;
    this.sql.exec('INSERT INTO sessions VALUES (?, ?, ?, ?)', token, install, tier, expires);
    this.tidy();
    return { ok: true, token, expires };
  }

  async admit(token, ip, tiers, perIp, neuronsPerDay) {
    const found = this.sql.exec('SELECT install, tier, expires FROM sessions WHERE token = ?', token).toArray()[0];
    if (!found || found.expires < Date.now()) {
      return { ok: false, code: 'session', message: 'The session has expired.' };
    }
    if (this.count('neurons') >= neuronsPerDay) {
      return {
        ok: false,
        code: 'day',
        message:
          'The free API has been used up for today, by everyone together. It is back tomorrow — or set up your own API in Settings.',
      };
    }
    const used = this.count(`install:${found.install}`);
    const allowed = tiers[found.tier] ?? 0;
    if (used >= allowed) {
      return {
        ok: false,
        code: 'install',
        message: `That was today's ${allowed} free reads on this device. It is back tomorrow — or set up your own API in Settings.`,
      };
    }
    if (this.count(`ip:${ip}`) >= perIp) {
      return { ok: false, code: 'ip', message: 'This network has used its free reads for today. It is back tomorrow.' };
    }
    return { ok: true, tier: found.tier, remaining: allowed - used };
  }

  /** Counted once an answer came back, so a refused request costs nobody a read. */
  async spend(token, ip, neurons) {
    const found = this.sql.exec('SELECT install FROM sessions WHERE token = ?', token).toArray()[0];
    if (found) this.add(`install:${found.install}`, 1);
    this.add(`ip:${ip}`, 1);
    this.add('neurons', neurons);
    return { neurons: this.count('neurons') };
  }

  /** Yesterday's counts and expired sessions are of no further use. */
  tidy() {
    this.sql.exec('DELETE FROM counts WHERE day < ?', today());
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', Date.now());
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** Turnstile, which the web page solves invisibly; its secret is a Worker secret. */
async function turnstile(env, response, ip) {
  if (!env.TURNSTILE_SECRET) return { ok: false, reason: 'turnstile not configured' };
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', String(response));
  form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const out = await res.json();
    return out.success ? { ok: true } : { ok: false, reason: `turnstile: ${(out['error-codes'] || []).join(',')}` };
  } catch (err) {
    return { ok: false, reason: `turnstile unreachable: ${err.message}` };
  }
}

const setting = (env, name) => String(env[name] ?? DEFAULTS[name]);

function countImages(messages) {
  let n = 0;
  for (const m of messages) {
    if (Array.isArray(m?.content)) n += m.content.filter((p) => p?.type === 'image_url').length;
  }
  return n;
}

/** The words in a request, pictures not counted. */
function textLength(messages) {
  let n = 0;
  for (const m of messages) {
    if (typeof m?.content === 'string') n += m.content.length;
    else if (Array.isArray(m?.content)) for (const p of m.content) if (typeof p?.text === 'string') n += p.text.length;
  }
  return n;
}

/** One line per request, read with `wrangler tail` or in the dashboard's logs. */
const log = (fields) => console.log(JSON.stringify({ free: 1, ...fields }));

function cors(origin, allowed) {
  if (!origin || !allowed.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Expose-Headers': 'X-Free-Remaining',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (status, body, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/** An error in OpenAI's shape, with a code the app can act on. */
const fail = (status, message, headers, code) =>
  json(status, { error: { message, ...(code ? { code } : {}) } }, headers);
