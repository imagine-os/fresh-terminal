# Fresh Terminal

A prompt-first terminal. You land in a working box, type (or speak), and what you type is routed by a small table to a model. Cost passes through to a hash-linked ledger. Dark, sparse, one folder.

**[Canon: what is true now, and how it got there](terminal/docs/canon/README.md).**

**Everything lives in [`terminal/`](terminal/).** This file is the only instruction at the root. Docs live in [`terminal/docs`](terminal/docs/README.md), starting with [`terminal/docs/README.md`](terminal/docs/README.md).

## Run

```sh
pnpm i && pnpm dev
```

- App: http://localhost:5173 (Vite; `/api/*` is proxied to the router)
- Router: http://localhost:8787 (Hono on Node; `GET /health`, `GET /rules`, `POST /route`)

Other commands: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:responsive` (Playwright, seven widths, screenshots in `terminal/docs/qa/`), `pnpm -C terminal verify:chain [ledger.json]`.

## Env

Router (`terminal/router/.env`, copy from `.env.example`; never reaches the browser):

| var | purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | the one key. Without it, `POST /route` returns 503 and the app says so in a system line. |
| `OPENROUTER_DEFAULT_MODEL` | optional; overrides `openrouter/auto` for the general tiers |
| `OPENROUTER_JEV_MODEL` | optional; overrides the Jev decisions model (default `typesafe/jev-1.13`) |
| `ROUTER_USE_JEV` | optional; `false` routes by rules only |
| `OPENROUTER_TAGGER_MODEL` | optional; overrides the tagger tier (default `google/gemini-2.5-flash-lite`) |
| `ALLOWED_ORIGINS` | comma-separated browser origins for CORS (default: the Pages origin + localhost 5173/4173) |
| `OPENAI_API_KEY` | realtime voice (OpenAI). The router mints ephemeral client secrets; the browser never sees this key. |
| `GOOGLE_API_KEY` | realtime voice (Gemini Live token minting; audio not wired yet) |

App (build-time, optional): `VITE_ROUTER_URL` (default `/api`), `VITE_BASE` (`/fresh-terminal/` on GitHub Pages), `VITE_SPACETIMEDB_URI` / `VITE_SPACETIMEDB_NAME` (recognised, not used until the module is published).

## Two ways to pay

Press `K` (key icon). Default: use Fresh Terminal's key through the router, pass-through cost plus margin. Or bring your own OpenRouter key: stored only in your browser, never sent to our router; calls go straight to OpenRouter and the ledger records price = cost. "Delete my key" removes it.

## Pages and the canvas

Static deliverable pages live in `terminal/app/public/pages/` and ship on GitHub Pages under `/pages/` (today: `audit.html`, `library.html`; `themes.html` redirects to the library). Every deliverable appears as a card on the master canvas at `/canvas` (shortcut `C`); add one with `pnpm -C terminal canvas:add --title "Name" --href pages/x.html --kind page`. Paper cards are 1 mm thick, images 10 mm.

## Voice

Press `V` or the mic. Default is browser speech recognition (no key): your words appear live as gray text and solidify into chips. In Settings (`K`) pick **OpenAI Realtime** for a spoken conversation with a live transcript (needs `OPENAI_API_KEY` on the deployed router). Gemini Live is listed but not wired for audio yet.

## Deploying the router (one-time, by the repository owner)

1. Cloudflare: create a Worker API token and note the account id.
2. GitHub → Settings → Secrets and variables → Actions → **Secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY` (optional `GOOGLE_API_KEY`).
3. Run the `router-deploy` workflow (or push to `main`). It deploys `terminal/router` with wrangler and pushes the keys into Worker secrets. Note the Worker URL it prints.
4. The deployed Worker is `https://fresh-terminal-router.jmassion.workers.dev`, committed as the app default in `terminal/app/src/config/router.ts`. A repository variable `ROUTER_URL` is optional and only overrides it.

A brand-new Cloudflare account must register a workers.dev subdomain once (dashboard → Workers & Pages) before the first deploy. Keys are never committed; `.env` files are git-ignored.

## Hosting

The static app deploys to GitHub Pages through `.github/workflows/pages.yml` on every push to `main`. Pages must be set to the "GitHub Actions" source once in the repository settings; this repo does not change settings through the API. `/box/:id` works on Pages through a `404.html` copy of `index.html`. The router runs as a Node process or as a Cloudflare Worker (`terminal/router/wrangler.toml`); moving out later is DNS plus one redeploy.

## Not wired yet

SpacetimeDB live store (module written and type-checked, not published), Clerk sign-in (seam exists, anonymous identity in use), Stripe settlement, model-generated compositions from "Draw" (demo compositions only), per-owner billing rules, server-side permission enforcement (Jev `needsOwner()` exists, nothing enforces it yet), publishing the shared ledger chain outside the browser, presence of other people, canvas document rendering, voice/TV-remote input, camera and tilt theme responses. Every visible placeholder shows a "not wired yet" tooltip and toast; the full list is in the dev-mode panel (press `D`).

Model used for this pass: Fable 5.1.
