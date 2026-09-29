# Surfaces — MCP / WebMCP / CLI / API (as of pass 4, 2026-09-29)

Honest status: most of this is planned. What exists is listed as such.

## WebMCP (browser)

- **Exists:** `window.__actions` — `{ pages: { landing, box, canvas, dev }, list(), version: 0 }`. Every page declares its actions as `{ id, intent, permission, shortcut?, notWired? }` in `terminal/app/src/actions/registry.ts`. Every UI change that adds or removes a control updates that file. This registry is the future WebMCP tool list and the voice controller's vocabulary.
- **Exists (pass 4):** the `ft:action` window event (`{ detail: { id } }`) runs an action by id: `canvas.open`, `plan.open`, `library.open`, `settings.open`, `box.new`, `theme.cycle`, `dev.toggle`, `lang.toggle`, `sidebar.toggle`, `edit.undo`, `edit.redo`. Menu items with an `action` target and page `button` blocks use it. New registry entries: `plan.open`, `edit.undo` (mod+z), `edit.redo`, `nav.open`, `chip.edit`.
- **Exists (pass 4):** the op language is the edit surface. `shared/src/ops` exports `opSchema`, `applyOps`, `OP_TOOL_DEFS` / `ALL_TOOLS` (OpenAI-style tool definitions, names like `nav_add`) and `parseToolCall`. Any agent that can call tools can edit a box with the same tools the router gives the model.
- **Exists (koi pond page):** `window.pond` on `pages/koi.html` (v2): `addPad({shape: 'circle'|'roundedRect', size: [w, h], radius, position: [x, z]})`, `removePad(id)`, `updatePad(id, patch)`, `addPath({points: [[x, z], ...], stoneSize})`, `removePath(id)`, `setCamera({tilt 12–88, azimuth, zoom 0.55–2.2})`, `getCamera()`, `setTimeOfDay('dawn'|'day'|'dusk'|'night')`, `list()` → `{pads, paths}`, `applyJSON({pads, paths})`. Also `window.koi` (`disturb`, `ripple`, `setQuality`, `setCalm`, `stats()`). Page-local only: pass 5 (`pond-ops`) wires it to the op language.
- **Planned:** `window.__actions.run(id, args)` over the same runner; a WebMCP manifest generated from the registry and the op tools.

## API (router)

- **Exists:** `GET /health` → `{ ok, product, version, keyConfigured }`; `GET /rules` → resolved route table plus `allowed_models` and `escalation`.
- **`POST /route`** `{ boxId, text, chips, history?, model?, snapshot? }` (pass 4: `snapshot` is the box's menu, pages, layout, theme, themes, actions, boxes, starters, cards and glossary; chips carry `source`, `p`, `alternatives`, `note`). SSE events: `meta` (`route`, `routing`, `escalated`) | `delta` | `ops` (`ops`, `changes`, `rejected`) | `reply` (`blocks`) | `error` | `done` (`ok`, `usage`, `served_model`, `routing`, `rounds`, `costSource`, `entry`, `ms`). Tool calling with one retry for invalid ops; escalation to `anthropic/claude-sonnet-5.5` per `rules.json` `escalation`. 503 without a key, 400 for a bad body or an unlisted model.
- **`POST /tag`** `{ text, glossary?, local? }` → `{ chips, model, ok, cost_micro, ref, jev: { used, cost_micro } }`: tagger tier (strict schema), merged with the local chips, glossary applied, ambiguous spans settled by Jev.
- **Realtime voice:** `GET /realtime/providers` → configured flags, models, estimated prices; `POST /realtime/session?provider=openai|gemini` → short-lived client credential (`value` + `sdp_url` for OpenAI WebRTC; `token` + `ws_url` for Gemini Live). 503 when the provider key is missing.
- **Browser-direct (own key):** the same turn from the browser (`app/src/lib/openrouterDirect.ts` over `shared/src/agent/turn.ts` `runTurn()`), with the same tools, validation and retry; our router is not involved.
- **Decisions (Jev):** `router/src/jev.ts` `decide()`, `routeIntent()` (now with `edit_ui`), `disambiguateChips()`, `needsOwner()` over `POST https://openrouter.ai/api/alpha/decisions`.
- **Planned:** `GET /ledger/:owner` once entries live in SpacetimeDB; enforcing `needsOwner()` once identities exist server-side.

## SpacetimeDB (data API)

- **Exists (unpublished):** tables and reducers in `terminal/module/src/index.ts`, including pass 4's `nav_item`, `page`, `box_ui`, `glossary_term`, `edit_batch` and `line.blocks_json` with owner-checked reducers. Once published, the generated client bindings are the data API (`DbConnection`, `useTable`). Canon C-047 (2026-09-29): account data goes to Cloudflare D1 behind the router first; SpacetimeDB stays for multiplayer and presence.
- **Planned:** a procedure that calls OpenRouter from inside the module (procedures may make HTTP calls), which would let the module write `entry` rows directly.

## Docs (wiki)

- **Exists (pass 4):** the wiki at https://imagine-os.github.io/fresh-terminal/wiki/ (HTML), each page also as Markdown next to it (`/wiki/<path>.md`), and `llms.txt` at https://imagine-os.github.io/fresh-terminal/llms.txt and `/wiki/llms.txt`. Built by `scripts/build-wiki.ts` from `terminal/docs` on every Pages deploy.

## CLI

- **Exists:** `pnpm dev`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:responsive`, `pnpm -C terminal verify:chain [file]`, `pnpm -C terminal ledger:sample`, `pnpm -C terminal start:router`, `pnpm -C terminal canvas:add --title --href --kind [--thickness]`.
- **Planned:** a `fresh` CLI that speaks the dialect (`fresh do "…"`, `fresh shell "Left sidebar: rail on laptop"`; proposed in Canon C-053), and `spacetime publish` / `generate` wired into scripts once the module is published.

## MCP (server)

- **Planned:** an MCP server exposing the actions registry and the router as tools. Not started.
