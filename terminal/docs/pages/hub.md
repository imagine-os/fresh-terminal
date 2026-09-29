# Hub (`/hub`)

Date: 2026-09-29. Model: Opus 5.5. Canon C-088. Decision 0024.

- **Where:** https://freshterminal.ai/hub (only on the domain; the Pages copy points there).
- **Who:** signed-in Clerk admins. Admin = a user id in the router var `ADMIN_USER_IDS` or a verified email in the `ADMIN_EMAILS` secret. Everyone else sees a sign-in prompt, or "not a hub admin" after signing in.
- **How it is protected:** the page is an empty shell. Its content is JSON under `/hub/data/` and a session check at `/hub/api/session`, both behind the site Worker, which asks the router's `/admin/whoami` with the caller's Clerk token (401 without one, 403 for a non-admin). The credits panel calls the router's `/admin/*`, which checks again. `noindex`, `no-store`, `X-Frame-Options: DENY`.
- **Sections:** Work (every page and item, status live / in progress / not wired / planned, live links), Library (Justin's prompts word for word with what happened and the Slack link, Canon entries, decision records, changelogs; search and filters), Canon, Wiki, Plan (kanban from `plan/plan.json`, moved to `docs/plan/` in C-095), Credits (give credit, invite codes, billing threshold, recent grants, recent ledger), Secrets (names, set or missing, checked by the deploy; never values).
- **Card pictures (C-104):** each Work card starts with a picture of its page (`app/public/previews/<id>-640.jpg` / `-1280.jpg`, `srcset`, lazy, alt "Preview of …"), or a two-letter monogram with the status tag. `pnpm -C terminal hub:thumbs` shoots them; `site-deploy` re-shoots them on every deploy. `preview` in `items.json` says what to shoot (a path, `canvas:<card>`, or `false`). The hub's own cards are shot in sample mode with only Work and Credits showing.
- **Credits panel totals (C-105 to C-107):** average markup and how many chose their own, welcome credits given / blocked / waiting, referral rewards and credit given; never per person.
- **Data:** built from the docs on every site deploy by `scripts/build-hub.ts`, so it stays current. What the Work section lists lives in `terminal/app/hub/items.json`.
- **Actions** (declared in the page as `#page-actions`): `hub.search`, `hub.filter`, `hub.grant`, `hub.invite.create`, `hub.invite.disable`, `hub.threshold`, `hub.signIn`, `hub.signOut`.
- **Local preview:** `HUB_DATA=1 pnpm -C terminal build:app`, then `node scripts/qa-hub.mjs` or open `http://localhost:4173/hub/?sample=1` (sample admin numbers, localhost only).
- **Design:** the Void theme (black, phosphor green, monospace), square corners, 44 px targets, fluid type 360–3840 px, visible focus, skip link.
