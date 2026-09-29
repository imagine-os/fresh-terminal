# Surfaces — MCP / WebMCP / CLI / API (as of pass 1)

Honest status: most of this is planned. What exists is listed as such.

## WebMCP (browser)

- **Exists:** `window.__actions` — `{ pages: { landing, box, canvas, dev }, list(), version: 0 }`. Every page declares its actions as `{ id, intent, permission, shortcut?, notWired? }` in `terminal/app/src/actions/registry.ts`. Every UI change that adds or removes a control updates that file. This registry is the future WebMCP tool list and the voice controller's vocabulary.
- **Planned:** `window.__actions.run(id, args)` dispatching to the app; a WebMCP manifest generated from the registry.

## API (router)

- **Exists:** `GET /health` → `{ ok, product, version, keyConfigured }`; `GET /rules` → resolved route table plus `allowed_models`; `POST /route` `{ boxId, text, chips, history?, model? }` → SSE `meta` (`route`, `routing` = Jev decision or rules fallback) | `delta` | `error` | `done` (`usage`, `served_model`, `routing`, `entry`). 503 without a key, 400 for a bad body or an unlisted model. `POST /tag { text }` → `{ chips, model, ok, cost_micro, ref }` from the tagger tier.
- **Browser-direct (own key):** the same chat completion call from the browser (`app/src/lib/openrouterDirect.ts`); our router is not involved.
- **Decisions (Jev):** `router/src/jev.ts` `decide()`, `routeIntent()`, `needsOwner()` over `POST https://openrouter.ai/api/alpha/decisions`.
- **Planned:** `GET /ledger/:owner` once entries live in SpacetimeDB; enforcing `needsOwner()` once identities exist server-side.

## SpacetimeDB (data API)

- **Exists (unpublished):** tables and reducers in `terminal/module/src/index.ts`. Once published, the generated client bindings are the data API (`DbConnection`, `useTable`).
- **Planned:** a procedure that calls OpenRouter from inside the module (procedures may make HTTP calls), which would let the module write `entry` rows directly.

## CLI

- **Exists:** `pnpm dev`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:responsive`, `pnpm -C terminal verify:chain [file]`, `pnpm -C terminal ledger:sample`, `pnpm -C terminal start:router`, `pnpm -C terminal canvas:add --title --href --kind [--thickness]`.
- **Planned:** a `fresh` CLI that speaks the dialect (`fresh shell "Left sidebar: rail on laptop"`), and `spacetime publish` / `generate` wired into scripts once the module is published.

## MCP (server)

- **Planned:** an MCP server exposing the actions registry and the router as tools. Not started.
