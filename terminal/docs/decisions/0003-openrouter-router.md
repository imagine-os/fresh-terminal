# 0003 — OpenRouter router

Verified 2026-09-28 from `openrouter.ai/docs/api-reference/chat-completion` and `openrouter.ai/api/v1/models`:

- `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <key>`, model ids are `provider/model-name`, `"stream": true` yields SSE `data: {...}` chunks ending with `data: [DONE]`. `usage: { include: true }` requests usage (with cost) in the final chunk.
- No model whose id or name contains "jev" exists in the public models list. The JEV tier is therefore **pending**: its model id is a placeholder in `router/rules.json`, overridable with `OPENROUTER_JEV_MODEL`; routing to it returns 501 until then.

Decisions:

- The key lives only on the router (Node `.env` or Worker secret). The browser calls `POST /route`; in dev Vite proxies `/api` to the router.
- The route table (`rules.json`) maps intent → tier → model, with permission and margin per rule. The SpacetimeDB `route_rule` table overrides it once connected. Intent detection is local and dumb (leading action verb or known intent word); a model classifier is the JEV tier's job later.
- The router streams `meta`, `delta`, `error`, `done` SSE events and emits one `charge` entry draft per call in `done`; the client (today) or the module reducer (later) chains and stores it.
- Default model is `openrouter/auto` (OpenRouter's own router), configurable with `OPENROUTER_DEFAULT_MODEL`; the models list returned during verification showed unusual ids, so the default was not pinned to a specific model.
- Hono was chosen so the same code runs on Node and as a Cloudflare Worker.
