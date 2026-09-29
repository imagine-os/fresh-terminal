# Surfaces — MCP / WebMCP / CLI / API (as of the domain, sign-in and D1 pass, 2026-09-29)

Honest status: most of this is planned. What exists is listed as such.

## WebMCP (browser)

- **Exists:** `window.__actions` — `{ pages: { landing, box, canvas, dev }, list(), version: 0 }`. Every page declares its actions as `{ id, intent, permission, shortcut?, notWired? }` in `terminal/app/src/actions/registry.ts`. Every UI change that adds or removes a control updates that file. This registry is the future WebMCP tool list and the voice controller's vocabulary.
- **Exists (pass 4):** the `ft:action` window event (`{ detail: { id } }`) runs an action by id: `canvas.open`, `plan.open`, `library.open`, `settings.open`, `box.new`, `theme.cycle`, `dev.toggle`, `lang.toggle`, `sidebar.toggle`, `edit.undo`, `edit.redo`. Menu items with an `action` target and page `button` blocks use it. New registry entries: `plan.open`, `edit.undo` (mod+z), `edit.redo`, `nav.open`, `chip.edit`.
- **Exists (pass 4):** the op language is the edit surface. `shared/src/ops` exports `opSchema`, `applyOps`, `OP_TOOL_DEFS` / `ALL_TOOLS` (OpenAI-style tool definitions, names like `nav_add`) and `parseToolCall`. Any agent that can call tools can edit a box with the same tools the router gives the model.
- **Exists (koi pond page):** `window.pond` on `pages/koi.html` (v2): `addPad({shape: 'circle'|'roundedRect', size: [w, h], radius, position: [x, z]})`, `removePad(id)`, `updatePad(id, patch)`, `addPath({points: [[x, z], ...], stoneSize})`, `removePath(id)`, `setCamera({tilt 12–88, azimuth, zoom 0.55–2.2})`, `getCamera()`, `setTimeOfDay('dawn'|'day'|'dusk'|'night')`, `list()` → `{pads, paths}`, `applyJSON({pads, paths})`. Also `window.koi` (`disturb`, `ripple`, `setQuality`, `setCalm`, `stats()`). Page-local only: pass 5 (`pond-ops`) wires it to the op language.
- **Exists (2026-09-29):** actions `auth.signIn` (opens Clerk), `auth.signOut`, `sync.now`.
- **Exists (pass 5):** ops `skin.apply {skin}` and `skin.clear {target}` (tools `skin_apply`, `skin_clear`); `shared/src/refine` exports `refine()` for any agent that wants the best-of-3 loop with its own generate and score functions. Actions `skin.run`, `skin.stop`, `skin.pick`.
- **Planned:** `window.__actions.run(id, args)` over the same runner; a WebMCP manifest generated from the registry and the op tools.

## API (router)

- **Hosts (2026-09-29):** `https://api.freshterminal.ai` (custom domain) and `https://fresh-terminal-router.jmassion.workers.dev` (same Worker). The app on freshterminal.ai uses the first; Pages and workers.dev use the second.
- **Exists:** `GET /health` → `{ ok, product, version, keyConfigured, realtime, auth: { clerk, networkless }, store: { d1 } }`; `GET /rules` → resolved route table plus `allowed_models` and `escalation`.
- **`POST /route`** `{ boxId, text, chips, history?, model?, snapshot? }` (pass 4: `snapshot` is the box's menu, pages, layout, theme, themes, actions, boxes, starters, cards and glossary; chips carry `source`, `p`, `alternatives`, `note`). SSE events: `meta` (`route`, `routing`, `escalated`) | `delta` | `ops` (`ops`, `changes`, `rejected`) | `reply` (`blocks`) | `error` | `done` (`ok`, `usage`, `served_model`, `routing`, `rounds`, `costSource`, `entry`, `ms`). Tool calling with one retry for invalid ops; escalation to `anthropic/claude-sonnet-5.5` per `rules.json` `escalation`. 503 without a key, 400 for a bad body or an unlisted model.
- **`POST /tag`** `{ text, glossary?, local? }` → `{ chips, model, ok, cost_micro, ref, jev: { used, cost_micro } }`: tagger tier (strict schema), merged with the local chips, glossary applied, ambiguous spans settled by Jev.
- **Skins (pass 5):** `POST /skin/plan {boxId, text}` → `{target, material, path, source, confidence, params (refine rule), entries}`; `POST /skin/variants {boxId, path, material, target, round, n (1–3), parent, exclude}` → `{variants, entries, error?}` (library / CSS / Openverse / generated image as a data URL); `POST /skin/score {boxId, material, target, variants[{id, description, image}]}` → `{scores[{id, score, note, palette}], entries}`. `POST /route` answers a prompt Jev routes to `skin` with an SSE `skin` event and no chat call. Every response carries ledger entry drafts.
- **Realtime voice:** `GET /realtime/providers` → configured flags, models, estimated prices; `POST /realtime/session?provider=openai|gemini` → short-lived client credential (`value` + `sdp_url` for OpenAI WebRTC; `token` + `ws_url` for Gemini Live). 503 when the provider key is missing.
- **Browser-direct (own key):** the same turn from the browser (`app/src/lib/openrouterDirect.ts` over `shared/src/agent/turn.ts` `runTurn()`), with the same tools, validation and retry; our router is not involved.
- **Decisions (Jev):** `router/src/jev.ts` `decide()`, `routeIntent()` (now with `edit_ui`), `disambiguateChips()`, `needsOwner()` over `POST https://openrouter.ai/api/alpha/decisions`.
- **Accounts and sync (2026-09-29, Clerk session required: `Authorization: Bearer <Clerk session JWT>`):** `GET /me` → `{ signedIn, userId, account: { id, clerk_user_id, plan, created_at, updated_at }, sync }` (anonymous → `{ signedIn: false }`; creates the account row on first call); `GET /sync/boxes?since=<ms>` → `{ boxes: SyncBox[], server_time }`; `PUT /sync/boxes { boxes: SyncBox[] (≤100) }` → `{ accepted, conflicts, rejected, server_time }` (last writer wins on `updated_at`; `rejected` = ids owned by another account); `GET /sync/ledger?since=<ms>` → `{ entries, server_time }`; `POST /sync/ledger { entries (≤500) }` → `{ received, written, server_time }` (append-only). `SyncBox = { id, name, state_json, created_at, updated_at, deleted_at }`, schemas in `shared/src/sync`. 401 without a valid session, 503 when Clerk or D1 is not configured.
- **Free credits (2026-09-29, C-074):** `POST /credits/device {turnstile?}` → `{ device, credits }` (a passing Turnstile token is required when `GET /credits` says `turnstile: on`; signed id `fd1_<uuid>.<hmac>`, sent back as header `X-FT-Device`); `GET /credits` → `{ label, signed_in, mode, granted_micro, spent_micro, remaining_micro, soft_prompts_left, sign_in_required, limited, daily_cap_reached, turnstile }` (types in `shared/src/credits`). Paid endpoints (`/route`, `/tag`, `/skin/*`, `/realtime/session`) need a Clerk session or a device and answer `401 device_required`, `402 sign_in_required | daily_cap | account_credits_exhausted`, `403 model_needs_sign_in`, `413 too_large`, `429 rate_limited` as `{ error, code, credits? }`; a call let through on a soft prompt carries `X-FT-Soft-Prompt: n/2`. App side: `routerFetch()` and `useCredits()`.
- **Planned:** `GET /ledger/:owner` once entries live in SpacetimeDB; enforcing `needsOwner()` once identities exist server-side.

## D1 (account data, 2026-09-29)

- **Exists:** Cloudflare D1 database `fresh-terminal`, bound to the router as `DB`, schema in `router/migrations/` (`accounts`, `boxes`, `ledger_entries`), reached only through the router's `/me` and `/sync/*`. No direct client access.
- **Tables (2026-09-29):** `accounts` (with `grant_micro`, `spent_micro`, `cost_micro`), `boxes`, `ledger_entries`, `anon_devices`, `spend_daily`; migrations `0001_init.sql`, `0002_credits.sql`.
- **Deploy surfaces:** `.github/workflows/infra-verify.yml` (read-only token, zone, D1, Turnstile and Clerk checks), `sync-smoke.yml` (after each router deploy: throwaway Clerk dev user, `/me`, `/sync/*`, `/credits`, one anonymous paid call, then cleanup), `router-deploy.yml` (D1 create-if-missing, migrations, deploy, Worker secrets, smoke check), `site-deploy.yml` (app build with `VITE_BASE=/`, deploy to freshterminal.ai, Clerk production DNS when a live key exists), `pages.yml` (fallback build at `/fresh-terminal/`). All `workflow_dispatch`-able.

## SpacetimeDB (data API)

- **Exists (unpublished):** tables and reducers in `terminal/module/src/index.ts`, including pass 4's `nav_item`, `page`, `box_ui`, `glossary_term`, `edit_batch` and `line.blocks_json` with owner-checked reducers. Once published, the generated client bindings are the data API (`DbConnection`, `useTable`). Canon C-047 (2026-09-29): account data goes to Cloudflare D1 behind the router first; SpacetimeDB stays for multiplayer and presence.
- **Planned:** a procedure that calls OpenRouter from inside the module (procedures may make HTTP calls), which would let the module write `entry` rows directly.

## Docs (wiki)

- **Exists (pass 4):** the wiki at https://imagine-os.github.io/fresh-terminal/wiki/ (HTML), each page also as Markdown next to it (`/wiki/<path>.md`), and `llms.txt` at https://imagine-os.github.io/fresh-terminal/llms.txt and `/wiki/llms.txt`. Built by `scripts/build-wiki.ts` from `terminal/docs` on every Pages deploy.

## CLI

- **Exists:** `pnpm dev`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:responsive`, `pnpm -C terminal verify:chain [file]`, `pnpm -C terminal ledger:sample`, `pnpm -C terminal start:router`, `pnpm -C terminal canvas:add --title --href --kind [--thickness]`.
- **Planned:** a `fresh` CLI that speaks the dialect (`fresh do "…"`, `fresh shell "Left sidebar: rail on laptop"`; proposed in Canon C-055), and `spacetime publish` / `generate` wired into scripts once the module is published.

## MCP (server)

- **Planned:** an MCP server exposing the actions registry and the router as tools. Not started.
