/**
 * DropToCal free — an OpenAI-compatible API that costs whoever calls it
 * nothing, because it runs on Cloudflare's Workers AI and holds no key at all.
 *
 * The relay next door passes a caller's key on and buys nobody any compute.
 * This one is the opposite on purpose: it is what the app asks when nobody
 * has set up an API of their own. So it decides everything a caller could
 * otherwise spend money with — which model, how long an answer — and the
 * free allowance is shared by everyone, which is what the rate limit is for.
 *
 * In the app a photo is read on the phone first (ML Kit), so what arrives
 * here is usually text. A browser has no such reader and sends the photo,
 * which the model can read too, at the cost of a few more tokens.
 *
 * PROTOTYPE: every request is logged with its token counts and the neurons
 * they cost, so the price of a scan is measured rather than guessed.
 */

const DEFAULTS = {
  MODEL: '@cf/google/gemma-4-26b-a4b-it',
  // Neurons per million tokens, from Cloudflare's price list for the model above.
  NEURONS_IN: 9091,
  NEURONS_OUT: 27273,
  MAX_OUTPUT_TOKENS: 6000,
  MAX_BODY_BYTES: 8 * 1024 * 1024,
  ALLOWED_ORIGINS: 'https://droptocal.org,https://localhost,capacitor://localhost,http://localhost:5173',
};

/** What the app may set; everything else in its request is dropped here. */
const PASSED = ['messages', 'temperature', 'response_format', 'tools', 'tool_choice'];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, setting(env, 'ALLOWED_ORIGINS').split(',').map((o) => o.trim()));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    // A page from anywhere else may not spend the shared allowance. The app
    // asks natively and sends no Origin at all.
    if (origin && !headers['Access-Control-Allow-Origin']) {
      return json(403, { error: { message: 'This API does not serve that origin.' } }, headers);
    }

    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (request.method === 'GET' && path === '/v1/models') {
      return json(200, { object: 'list', data: [{ id: 'free', object: 'model', owned_by: 'droptocal' }] }, headers);
    }
    if (request.method !== 'POST' || path !== '/v1/chat/completions') {
      return json(404, { error: { message: 'POST /v1/chat/completions' } }, headers);
    }

    // One allowance for everyone: whoever asks too often waits a minute
    // rather than spending what the next person would have used.
    const who = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.LIMIT) {
      const { success } = await env.LIMIT.limit({ key: who });
      if (!success) {
        return json(429, { error: { message: 'Too many requests just now. Try again in a minute.' } }, headers);
      }
    }

    const size = Number(request.headers.get('Content-Length') || 0);
    if (size > Number(setting(env, 'MAX_BODY_BYTES'))) {
      return json(413, { error: { message: 'That is too large to read for free.' } }, headers);
    }
    let asked;
    try {
      asked = await request.json();
    } catch {
      return json(400, { error: { message: 'The request is not JSON.' } }, headers);
    }
    if (!Array.isArray(asked?.messages) || asked.messages.length === 0) {
      return json(400, { error: { message: 'messages is required.' } }, headers);
    }

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
      log({ model, images, ms: Date.now() - began, error: String(refused?.message || refused) });
      return json(400, { error: { message: String(refused?.message || refused) } }, headers);
    }

    const usage = answer?.usage ?? {};
    // Cloudflare reports what it charged; the price list is the fallback.
    const neurons =
      usage.neurons ??
      ((usage.prompt_tokens || 0) * Number(setting(env, 'NEURONS_IN')) +
        (usage.completion_tokens || 0) * Number(setting(env, 'NEURONS_OUT'))) /
        1e6;
    log({
      model,
      images,
      ms: Date.now() - began,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      neurons: Math.round(neurons * 10) / 10,
      finish: answer?.choices?.[0]?.finish_reason,
    });

    // Already shaped like an OpenAI completion; the model's name is ours to give.
    return json(200, { ...answer, model: 'free' }, headers);
  },
};

const setting = (env, name) => String(env[name] ?? DEFAULTS[name]);

function countImages(messages) {
  let n = 0;
  for (const m of messages) {
    if (Array.isArray(m?.content)) n += m.content.filter((p) => p?.type === 'image_url').length;
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
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (status, body, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
