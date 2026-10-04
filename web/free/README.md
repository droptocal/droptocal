# DropToCal free

The API the app asks when nobody has set up one of their own: Cloudflare
Workers AI (Gemma 4 26B, thinking off) behind an OpenAI-compatible route at
`https://api.droptocal.org/v1`. It holds no key — Workers AI is a binding —
and decides everything that costs anything: the model, how long a question
may be, how long an answer.

Photos are sent as they are and the model reads them itself. Reading the
words on the phone first (ML Kit) was tried and dropped: on real photos —
an advertising pillar, a poster at night — it mixed neighbouring posters
together or read nothing, while the model read the picture correctly, and a
photo costs about as much as its text (~200 tokens at the size it is read).

## How it is rationed

| | |
|---|---|
| `POST /v1/session` `{install, integrity?, turnstile?}` | a token for a week, with the ration its proof earns |
| `POST /v1/chat/completions` | with that token as the Bearer key |
| Play Integrity (the app as Play installed it) | 40 requests a day per installation |
| Turnstile (the web page) | 20 |
| No proof (a GitHub build, or before either is set up) | 20, or none once `REQUIRE_PROOF` is set |
| Per IP | 120 requests and 10 new sessions a day; 10 requests a minute |
| Everyone together | 9,000 neurons a day — under Workers AI's free 10,000, so it cannot cost money |
| Length | 48,000 characters of text; the app sends a long page's first 20,000 |

The counts live in one Durable Object (`Quota`, SQLite) and reset at
midnight UTC. A refused request costs nobody a read; only answers count.
Every request is logged with its tokens and the neurons Cloudflare charged
(`wrangler tail droptocal-free`, or the dashboard's logs). A poster costs
about 15 neurons, a long timetable about 30.

All limits are in `free.js` (`DEFAULTS`, `TIERS`) and can be overridden as
vars in `wrangler.toml`.

## Setting up the proof

Both are optional; without them everything runs on the plain ration.

**Play Integrity** — only meaningful once the app is installed from Play.

1. Play Console → the app → *Test and release* → *App integrity* → link a
   Google Cloud project (or create one there). Note its **project number**.
2. In that Cloud project: enable the *Google Play Integrity API*, create a
   service account, and create a JSON key for it.
3. `wrangler secret put PLAY_INTEGRITY_SA` in `web/free/`, pasting the whole JSON.
4. GitHub → Settings → Secrets and variables → Actions → *Variables*:
   `PLAY_CLOUD_PROJECT` = the project number. The next build asks Play.

**Turnstile** — for droptocal.org.

1. Cloudflare dashboard → Turnstile → add a widget for `droptocal.org`
   (mode *Managed* or *Invisible*).
2. `wrangler secret put TURNSTILE_SECRET` with its secret key.
3. GitHub variable `TURNSTILE_SITEKEY` = its site key.

Once both work, `REQUIRE_PROOF = "1"` in `wrangler.toml` turns away anything
neither vouched for.

## Deploying

The *Deploy free API* workflow, on a push to `web/free/` on main. It needs
only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and the token needs
Workers AI and custom-domain rights for `api.droptocal.org`.
