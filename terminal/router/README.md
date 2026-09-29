# Router

Holds `OPENROUTER_API_KEY`, resolves intent → model → permission from `rules.json`, streams the OpenRouter reply back over SSE and emits one ledger `charge` entry per call.

- `src/app.ts` — Hono app (framework-agnostic). `GET /health`, `GET /rules`, `POST /route`, and for signed-in people `GET /me`, `GET|PUT /sync/boxes`, `GET|POST /sync/ledger` (2026-09-29).
- `src/auth.ts` — Clerk session verification (`CLERK_JWT_KEY` networkless, `CLERK_SECRET_KEY` fallback). `src/d1.ts` — D1 queries. `migrations/` — D1 schema, applied by `router-deploy`.
- `src/node.ts` — Node server for local dev (`pnpm dev:router`, port 8787). Vite proxies `/api/*` here.
- `src/worker.ts` — Cloudflare Worker entry (`wrangler.toml`). Same code.
- `rules.json` — seeded route table. The SpacetimeDB `route_rule` table overrides this once connected.
- `prices.json` — fallback prices when OpenRouter does not return `usage.cost`.

`POST /route` body: `{ boxId, text, chips, history? }`. SSE events: `meta` (resolved route), `delta` (`{text}`), `error`, `done` (`{ok, usage, costSource, entry}`).

Without a key the route call returns 503 with a hint; the app shows that as a system line. The JEV tier returns 501 until `OPENROUTER_JEV_MODEL` is set.
