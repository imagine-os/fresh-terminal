# 0020 — freshterminal.ai on Workers, Clerk anonymous-first, accounts in D1

Date: 2026-09-29. Model: Opus 5.5. Prompt: 0017. Canon: C-045 to C-048 (now built), C-064 to C-066.

## Verified before building (workflow `infra-verify`, run 36512972684, 2026-09-29 02:31 UTC)

- `CLOUDFLARE_API_TOKEN` is an active user token. It sees one zone, `freshterminal.ai` (status active, Free plan, name servers `magnolia` and `olof.ns.cloudflare.com`, activated 2026-09-29 01:43 UTC). DNS records read (zone had none), Worker routes read, Workers scripts list, D1 list and the workers.dev subdomain (`jmassion.workers.dev`) all succeeded. Write permissions are proven by the deploy itself (custom domains create DNS records; D1 create).
- Secrets present (names only): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `OPENROUTER_API_KEY`. Not set: `OPENAI_API_KEY`, `GOOGLE_API_KEY`.
- Clerk: both keys are **development** keys (`pk_test_`, `sk_test_`). Frontend API `relevant-flea-5813.clerk.accounts.dev` answers; the Backend API answers with the secret key; JWKS has one key; 0 users.

## What was built

- **The app on its own domain.** `terminal/site` is a Cloudflare Worker (`fresh-terminal-app`) with static assets from `app/dist` built with `VITE_BASE=/`, SPA fallback (`not_found_handling = "single-page-application"`), and custom domains `freshterminal.ai` and `www.freshterminal.ai` (`routes` with `custom_domain = true`; Cloudflare creates the DNS records and certificates). The Worker runs first to 301 `www` to the apex (path and query kept) and to set cache headers (hashed `/assets/*` immutable, HTML revalidates). Deployed by `.github/workflows/site-deploy.yml`. GitHub Pages keeps its own build at `/fresh-terminal/` as a fallback, and `fresh-terminal-app.jmassion.workers.dev` stays on.
- **The router on api.freshterminal.ai.** `router/wrangler.toml` adds the custom domain and keeps `workers_dev = true`. CORS and Clerk authorized parties: `https://freshterminal.ai`, `https://www.freshterminal.ai`, `https://imagine-os.github.io`, localhost 5173/4173. `Authorization` and `PUT` are allowed cross-origin.
- **Router address by origin.** `resolveRouterUrl(env, isDev, hostname)`: a build-time `VITE_ROUTER_URL` wins, dev uses `/api`, a page served from `freshterminal.ai` or `www` uses `https://api.freshterminal.ai`, everything else (GitHub Pages, workers.dev) keeps `https://fresh-terminal-router.jmassion.workers.dev`.
- **Clerk, anonymous-first.** `@clerk/react` 6.17 (Clerk's current React package; `@clerk/clerk-react` is the old name). `AccountProvider` wraps the app only when `VITE_CLERK_PUBLISHABLE_KEY` is in the build (injected from the secret in `site-deploy` and `pages`). Signed out works exactly as before (anonymous per-browser identity, localStorage). The header has a **Sign in** button that opens Clerk's modal; signed in shows a sync dot and Clerk's user menu. No key in the build: the same button, dashed, "not wired yet".
- **Session checks on the router.** `router/src/auth.ts`: `Authorization: Bearer <Clerk session JWT>` verified with `@clerk/backend` `verifyToken`, networkless with `CLERK_JWT_KEY` (the instance's PEM public key, derived by `router-deploy` from the Clerk JWKS and pushed as a Worker secret) and falling back to `CLERK_SECRET_KEY` (JWKS fetched once and cached). `authorizedParties` is the CORS list. `/route`, `/tag`, `/skin/*` and voice stay anonymous.
- **D1.** Database `fresh-terminal`, created by `router-deploy` if missing (Cloudflare API, idempotent), its id written into `wrangler.toml` at deploy time (looked up, never stored), migrations applied with `wrangler d1 migrations apply --remote`, bound as `DB`. Schema `router/migrations/0001_init.sql`: `accounts (id, clerk_user_id unique, plan default 'free', created_at, updated_at)`, `boxes (id, account_id, name, state_json, created_at, updated_at, deleted_at)`, `ledger_entries (account_id, id, box_id, kind, what, model, units, unit_kind, cost_micro, price_micro, ref, prev_hash, hash, shared_prev_hash, shared_hash, created_at, updated_at)`. Times are Unix ms. Every row keeps a stable id and `updated_at` for later multiplayer.
- **Sync endpoints.** `GET /me` (creates the account row on first sign-in), `GET /sync/boxes?since=`, `PUT /sync/boxes {boxes}`, `GET /sync/ledger?since=`, `POST /sync/ledger {entries}`. 401 without a valid session, 503 when Clerk or D1 is missing. Boxes: last writer wins on `updated_at`; a box id owned by another account is never overwritten or returned (`rejected`). Ledger: append-only (`INSERT OR IGNORE`).
- **Sync in the app.** `app/src/sync/cloud.ts` `CloudSync`: on sign-in, after edits (2 s debounce) and on window focus it pulls boxes changed since the last pull, pushes boxes whose fingerprint changed, then pushes new ledger entries. A box edited here since the last sync keeps the local version and is pushed with an `updated_at` above the server's; an untouched box adopts a newer server copy. What syncs per box: name, menu, pages, box UI (layout, theme, style, skins), glossary. Transcript lines stay in the browser (marked not wired yet).

## Limits, stated plainly

- **Clerk development instance on a real domain.** Clerk's docs (checked 2026-09-29): a development instance's Frontend API lives on `*.accounts.dev` and works cross-origin from any domain, including freshterminal.ai; it shows a "Development mode" badge, is capped at 100 users, uses a dev-browser token in the URL instead of first-party cookies, and Clerk says not to run production traffic on it. Development user data cannot be moved to production. Fine for Justin's own account now; a production instance is needed before inviting people. Steps are in Canon C-065.
- The site deploy can create the Clerk production CNAMEs itself once the live secret key (`sk_live_`) is in `CLERK_SECRET_KEY` (step "Clerk production DNS", reads `cname_targets` from the Clerk Backend API; not exercised yet).
- Clerk's sign-in screens are English only here (no Clerk localization loaded).
- Sync is not realtime: last writer wins per box, no merge inside a box. SpacetimeDB (or Durable Objects) is still the plan for live multiplayer (C-047, C-049).

## Rejected

- Cloudflare Pages for the app: Workers static assets is Cloudflare's current path, and one Worker gives the www redirect and headers without a second product.
- A DNS-record step for the app and router: custom domains on the Workers create the records and certificates themselves.
- Storing the D1 id in the repo: it is looked up each deploy so a fresh account or a recreated database needs no commit.
- `@clerk/clerk-react`: renamed; `@clerk/react` is current.
