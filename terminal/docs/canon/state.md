# State

What is live, what isn't wired, and what's in progress. Snapshot taken 2026-09-29 at about 01:40 UTC (2026-09-28 8:40 PM CDT), updated about 02:10 UTC with the pass 4 push and about 02:55 UTC with the domain, sign-in and D1 pass. Update this page when a pass ships; older snapshots are replaced here and kept in the repo changelog.

## Live now

| What | Where | Since |
| --- | --- | --- |
| Fresh Terminal site | https://imagine-os.github.io/fresh-terminal/ | 2026-09-29 00:07 UTC |
| A box | `/box/<id>`; new box in a theme: `/box/new?theme=<id>` | 2026-09-28 |
| Master canvas v2 (paper sheets, sections, minimap; C-083) | https://imagine-os.github.io/fresh-terminal/canvas (press `C`); archived v1 at `/canvas?v=1` | 2026-09-29 04:20 UTC |
| Plan viewer (kanban, list, timeline) | https://imagine-os.github.io/fresh-terminal/plan (also dev mode, `D`) | 2026-09-28 |
| Library of terminals | https://imagine-os.github.io/fresh-terminal/pages/library.html | 2026-09-29 00:07 UTC |
| Koi pond v3 (opens top-down, tilts up; C-082) | https://imagine-os.github.io/fresh-terminal/pages/koi.html | 2026-09-29 04:20 UTC |
| Koi pond v2 (archived) | https://imagine-os.github.io/fresh-terminal/pages/koi-v2.html (was `pages/koi.html` until v3) | 2026-09-29, pass 4 |
| Koi pond v1 | https://imagine-os.github.io/fresh-terminal/pages/koi-v1.html (was `pages/koi.html` until pass 4) | 2026-09-29 00:07 UTC |
| FreshStack (the default stack, three modes, exit per piece) | https://imagine-os.github.io/fresh-terminal/pages/freshstack.html | 2026-09-29 02:20 UTC, live on the next Pages deploy |
| Replay of a box (playback scrubber, every step, interface as it was) | https://imagine-os.github.io/fresh-terminal/ then press `P`, or `/box/<id>/play` | 2026-09-29 02:45 UTC, live on the next Pages deploy |
| The Canon | https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/canon/README.md, and a card on the master canvas | 2026-09-29, pass 4 |
| Product Hunt strategy (proposed; the call, pitch pick, readiness, costs) | https://imagine-os.github.io/fresh-terminal/pages/producthunt.html | 2026-09-29 03:40 UTC, live on the next Pages deploy (C-077) |
| Audit and rebuild recommendation | https://imagine-os.github.io/fresh-terminal/pages/audit.html | 2026-09-28 |
| Old themes page | `/pages/themes.html`, now redirects to the library | 2026-09-29 |
| Router | https://fresh-terminal-router.jmassion.workers.dev (Cloudflare Worker) | 2026-09-29 01:13 UTC |
| freshterminal.ai (app Worker, www → apex) | https://freshterminal.ai — see "freshterminal.ai, Cloudflare and Clerk" below for the live check | 2026-09-29, infra pass (C-064) |
| api.freshterminal.ai (same router, custom domain) | https://api.freshterminal.ai/health | 2026-09-29, infra pass (C-064) |
| Sign in (Clerk development instance) and cloud sync (D1) | Header **Sign in** button on freshterminal.ai and on Pages | 2026-09-29, infra pass (C-065, C-066) |
| Free credits, enforced by the router (25¢ per browser, 2 soft prompts, $1 per account, $2/day signed-out cap) | `GET https://api.freshterminal.ai/credits`; live check in changelog 0008 | 2026-09-29 (C-074) |
| $5 starter kit per signed-in account (C-089), no per-account daily cap (C-094), which is also the pass-through threshold (past it `402 payment_required`), friend credits and invite codes; privacy by default (`share_data` off, access grants, admin sees totals only; C-094); storage measured per account (100 MB free, not billed; C-092) | `GET /credits` → `billing`; admin API `/admin/*`; tray → Invite code | 2026-09-29 (C-086, C-087) |
| The hub (admins only, checked by the server); Work cards show a picture of each page, re-shot on every deploy | https://freshterminal.ai/hub | 2026-09-29 (C-088, C-104) |
| Markup: model cost + the account's markup past the starter kit (10% default, 5% to 100%, Settings → Your markup); starter kit and signed-out trial at cost; your key no markup | `GET /credits` → `markup`; `GET /me/markup`; `GET /health` → `credits.markup` | 2026-09-29 (C-103, C-105) |
| The $5 welcome credit once per person (verified email, no disposable or alias emails, one per device, 5 a day per /24) | `GET /credits` → `welcome` | 2026-09-29 (C-106) |
| Referrals: `?ref=` link, $5 extra for the friend, $5 plus 50% of our markup for 12 months for the referrer, 50 a month; cash-out not wired yet | Settings → Invite friends; `GET/POST /me/referral` | 2026-09-29 (C-107) |
| Sales site: about, pricing, FAQ (EN/ES, share cards) | https://freshterminal.ai/about, https://freshterminal.ai/pricing, https://freshterminal.ai/faq (also on Pages under /fresh-terminal/) | 2026-09-29 (C-097) |
| Repo | https://github.com/imagine-os/fresh-terminal, `main` (pass 4 on 2026-09-29; earlier head 1d77c83) | 2026-09-29 |
| Docs wiki | https://imagine-os.github.io/fresh-terminal/wiki/ (source: `terminal/docs/README.md`; AI index: `llms.txt`) | 2026-09-29, pass 4 |

Superseded copies: the audit and themes were first published as Claude artifacts (https://claude.ai/artifact/L8MipNPfHdVDzCNCf6ernn and https://claude.ai/artifact/NxgFUdxJ9tgu4SXGwhuKeN, 2026-09-28). The GitHub Pages copies above are the current ones.

### What works on the live site (2026-09-29)

- Type a prompt and the reply streams back through our key. Jev picks the route; Claude Haiku 4.5 answers. The first live test replied in about 1.5 seconds and cost 148 micro-dollars (about 0.015 cents). The balance in the top bar ticks up.
- Bring your own OpenRouter key (press `K`). It stays in your browser.
- Chips and starter suggestions. Superseded by pass 4: the model tagger is on by default, chips can be clicked to set a type, and each box has a glossary.
- Pass 4 (live 2026-09-29): the terminal edits itself. Prompts change the sidebar menu (nested), pages, layout, theme and styles through undoable ops; replies are structured with a header line and an Undo button. Checked live 2026-09-29 about 02:15 UTC: the nested Projects menu (Koi Pond, Library) applied, opened the right pages, undid and redid; "rename Projects to Work", "make the sidebar a rail on laptop" and "switch to Glass Window" applied; the Hoy chips and a structured reply rendered. Four model turns cost $0.0437. Details: changelog 0004.
- Found and fixed live 2026-09-29: the Sonnet 5.5 retry failed on Amazon Bedrock (`tool_choice` "any" not supported); rounds now fall back to `auto` (commit 5fccf07).
- Three themes: Void (default), Blank Page, Glass Window. `T` cycles.
- CRT "Draw" reveal, with demo drawings made from our own parts.
- Ledger with a verifiable hash chain and an opt-in shared chain, in the browser.
- Voice with a live transcript through browser speech (press `V` or the mic).
- Replay (2026-09-29): press `P` in any box to scrub through every step; the transcript, menu, layout and theme show as they were at that step; save the timeline as a file.
- English and Spanish.
- Checks: typecheck, 96 tests, build, and 21 responsive checks from 360 to 3840 wide. CI, Pages and router-deploy workflows green. Pass 4: 132 tests, 21/21 responsive.

### Commits

| Commit | Date (UTC) | What |
| --- | --- | --- |
| [c72f05f](https://github.com/imagine-os/fresh-terminal/commit/c72f05f2ecb6a16da889eededf0c11629f1d5983) | 2026-09-28 23:44 | Pass 1: terminal, shell, dialect v0, router, ledger, themes, canvas, docs |
| [ae2c996](https://github.com/imagine-os/fresh-terminal/commit/ae2c99691511f5bfb3be8af21e12e64332484889) | 2026-09-29 00:04 | Pass 2: two ways to pay, served model on the ledger, Jev routing, tagger tier, library, koi pond |
| 45dcd53 | 2026-09-29 00:05 | CI fix (pnpm version) |
| [a4927ba](https://github.com/imagine-os/fresh-terminal/commit/a4927ba9dbc8c6a36d34fcb481e6bc0431e3bc37) | 2026-09-29 00:39 | Pass 3: voice with live transcript, router health (405 fix), Cloudflare deploy workflow |
| [1d77c83](https://github.com/imagine-os/fresh-terminal/commit/1d77c83cbdb2864b41b44a870ebd06dfbba069fd) | 2026-09-29 01:13 | App points at the deployed router |

### between-gigs

- Fresh Terminal added under My companies: `imagine-os/between-gigs` commit b191350, release 3.70, 2026-09-29 01:37 UTC. On GitHub `main` only.
- **Not on between-gigs.com yet.** That site publishes from Sites, not GitHub, since 2026-09-27. No Sites deploy or release receipt exists for 3.70. The page it will appear on: https://between-gigs.com/builder/companies.

## Not wired yet (marked "not wired yet" in the app)

As of 2026-09-29:

- SpacetimeDB live store. The module is written and type-checked, not published. The app uses browser storage instead, so boxes don't sync between devices or people. 2026-09-29: account data goes to Cloudflare D1 first (C-047).
- ~~Clerk sign-in. Everyone is anonymous; "save / sign in" is a placeholder.~~ Superseded 2026-09-29 (C-065): sign-in is wired on the Clerk development instance. Still not wired: the Clerk production instance (steps in C-065), Clerk screens in Spanish, transcript lines in sync, realtime sync between devices.
- Stripe: taking payment for the balance. (2026-09-29: free credits are enforced, C-074; buying more is what is missing.) 2026-09-29 (C-086): the $5 threshold is enforced and the Stripe Checkout top-up code is in; it switches on when `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are repository secrets and the router redeploys. Charging a saved card for usage (auto top-up) is not built.
- ~~A daily cap for signed-in accounts (needed before a Clerk production instance; C-074).~~ Built 2026-09-29 (C-080): $1 per account, $10 across accounts per UTC day.
- Turnstile before a new free-credit device: built, not switched on; the Cloudflare token needs Account → Turnstile → Edit (C-074).
- Shared chain beyond the browser, and the server re-checking hashes.
- Jev permission checks: they exist but aren't enforced (no signed-in owners on the server yet).
- Model-generated "Draw" layouts (demos only).
- 13 of the 16 themes; camera-reflection and phone-tilt themes.
- Interactive-illustration runtime (our Rive-like system).
- Presence (seeing other people in a box), live cursors on the canvas.
- OpenAI Realtime spoken replies: code is complete, shows "not configured" because no OpenAI key is set.
- Gemini Live audio (token flow only; microphone capture and playback missing).
- Realtime voice pricing from real usage (estimates for now).
- Voice controller over the actions list; TV remote and gamepad navigation.
- Koi pond as an in-app theme (it's a separate page for now); `window.pond` is not wired to ops yet (pass 5).
- ~~freshterminal.ai and api.freshterminal.ai (bought 2026-09-29, C-045; not pointed at anything yet).~~ Superseded 2026-09-29 (C-064): both are deployed as Worker custom domains.
- Long-paper scroll cards, image upload, live (not scripted) card screenshots. Canvas grouping shipped in v2 (2026-09-29).
- Company OS connection. Import of old repos and data.
- Replay: branching and merging from a step (`playback.branch`), audio and video steps (`playback.media`). The timeline shape (parent ids, branch id) is ready for both. 2026-09-29.

## In progress

| Work | Status (2026-09-29 01:40 UTC) |
| --- | --- |
| **Pass 4: self-editing, chips v2, structured replies, koi pond v2, this Canon** | Pushed to `main` 2026-09-29 about 02:10 UTC by Opus 5.5 in one commit. Details: changelog [0004](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/changelog/0004.md), decisions 0016 and 0017. Live check on the site follows the push. |
| **freshterminal.ai, Cloudflare and Clerk** | Decided 2026-09-29 (C-045 to C-048). ~~Waiting on Justin: add token scopes and create the Clerk app.~~ Done by Justin about 02:28 UTC; verified 02:31 UTC (workflow run 36512972684). Built 2026-09-29 by Opus 5.5 (C-064 to C-066, decision 0020, changelog 0007): app Worker on freshterminal.ai (www → apex), router on api.freshterminal.ai, Clerk sign-in (development instance), accounts, boxes and ledger mirror in D1. Live check results: changelog 0007. Still open: Clerk production instance (Justin, steps in C-065); a Connections page. |
| **SpacetimeDB publish** | Proposed 2026-09-29 02:07 UTC (C-052). Waiting on Justin for the `SPACETIMEDB_TOKEN` secret. |
| **Proposals waiting on Justin** | Media in R2 (C-053), streamed browsers (C-054), integration ladder (C-055), recipes (C-056). Not started. |
| **Multiplayer rules** | Decided 2026-09-29 (C-049): no Liveblocks or Colyseus; our own house rules on SpacetimeDB. Not started. |
| **Pass 5: skins and the refine loop** | Built 2026-09-29 (Opus 5.5): instant draft, Jev picks the path, best-of-3 rounds with stop rules, thumbnails and Stop. Details: changelog 0005, decision 0018. Checked live on f116d86: library run 0.02¢, image search 0.10¢ over 5 rounds, CSS 0.44¢ for one round; image generation held back by the 3¢ cap (4.2¢ per image). Details: changelog 0005. |
| **Fresh Terminal company in between-gigs** | Saved to GitHub (b191350). Waiting for a Sites sync to show on between-gigs.com. |
| **This Canon** | Written 2026-09-29; in the repo with the pass 4 push, with a canvas card. Kept current every pass (plan task `canon-current`). |
| **LiveKit** (C-051) | Decided 2026-09-29 02:20 UTC. Waiting on Justin: `lk cloud auth` once, then repo secrets `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Then: agent in `terminal/agent` deployed by `livekit/deploy-action`, Fresh Terminal tools attached over MCP, LiveKit docs MCP added for coding agents. Not started. |
| **Logos and icons skill** | Added 2026-09-29 02:25 UTC at `terminal/skills/logos-and-icons/SKILL.md`: source order (official → official repo → Simple Icons → text mark), licence check, sizes, registry at `docs/brand/registry.md`, generate only for our own marks. First use: marks on the FreshStack cards and brand chips. Assets not gathered yet. |
| **Replay** (C-058) | Shipped 2026-09-29 02:45 UTC: `shared/src/timeline` (steps with parent ids, derived from the store; state rebuilt at any step; `timeline.v0` export), `app/src/playback` (scrubber, `/box/<id>/play?step=N`, key `P`). 157 tests, 28/28 responsive. Next: branches and merges once SpacetimeDB holds two heads (C-052); media steps after R2 (C-053). |
| **Tagline** (C-059) | "Evolve as we grow." set 2026-09-29 02:45 UTC in `landing.tagline` (en and es). |
| **Actions: ledger cost, filters, arrows; plan to docs/plan** (C-095) | 2026-09-29 (Opus 5.5): model and cost per row from the ledger, filters by status, stage, model and words, cost sort, timeline arrows, a remembered and keyboard-resizable label column, typed undo; our build plan moved to `docs/plan/` (hub and wiki), `/plan` stays the dev viewer. Live check in changelog 0015. |
| **Account window fits** (C-099) | Shipped 2026-09-29 (Opus 5.5): the Clerk account window is 1126 px at 1280 and 1227 px on a 1908 px screen (was ~450), full width on phones; checked signed in at seven widths by `pnpm check:clerk` and the `clerk-modal` workflow. |
| **Demos** (C-108) | Shipped 2026-09-29 06:50 UTC: `/demo/harness`, a year of made-up lines across five stages (three companies, Family, Personal) with a few hundred tags, on the Tags page; unknown names list the demos. Not yet: more demos, Actions/Replay over demo data, load-into-a-stage. |
| **Tags page** (C-100) | Shipped 2026-09-29 06:20 UTC at `/tags`: graph (default), table, list, board, timeline over every tag the person typed; tray row, seed nav, intent. Not yet: a tag's own page, rename/merge, graph on the stage. |
| **Tighter tools menu** (C-096) | Shipped 2026-09-29 05:40 UTC. |
| **Share previews everywhere** (C-102) | Shipped 2026-09-29 06:45 UTC (Opus 5.5): every public page gets tags and its own card on every build; the build fails without them. |
| **Sales pages v2** (C-101) | Shipped 2026-09-29 06:30 UTC (Opus 5.5): FreshStack look, screenshots by `pnpm sales:shots` (CI job `sales-shots`), "Get $5 free" for first sign-ups, pay what you want (preview slider not wired yet). |
| **Sales site and share cards** (C-097) | Shipped 2026-09-29 05:30 UTC (Opus 5.5). Not wired yet: "Buy credits" (pay as you go, model cost + 10%) and "Tell me when" (teams and self-host). Coming soon on the site: realtime multiplayer, live sync across devices, voice talk-back, connectors, migration, encryption with your own key, teams and self-host. |
| **Rename in place, perspective grid, publish workflow** (C-094) | Shipped 2026-09-29 05:30 UTC. `fresh-terminal` published to SpacetimeDB Maincloud 05:39 UTC (run 4; 14 tables, 19 reducers), bindings committed. Live store (`createSpacetimeStore`) still pending. FreshStack rows updated 06:10 UTC (C-098). |
| **Uniform bar, minimal tray, Actions, voice fails once** (C-090) | Shipped 2026-09-29 05:10 UTC. Terminal-talk is a switch + demo; the voice agent is next after SpacetimeDB. |
| **One line in the top bar** (C-085) | Shipped 2026-09-29 04:40 UTC: banner gone, saved/sign-in line centered in the bar, voice key in the placeholder. |
| **Review pass** (C-081) | Shipped 2026-09-29 04:45 UTC: no-op edits refused, names not ids, one Undo bar, created pages open, screen context, mood tags. |
| **No silent turns, smarter tagger, tiles, stage** (C-080) | Shipped 2026-09-29 04:20 UTC. |
| **Sign-in in our look** (C-084) | Shipped 2026-09-29 about 04:35 UTC (Opus 5.5): Clerk themed from the active theme. Justin: turn off required username and phone in Clerk; Branding toggle optional. |
| **Tighter start** (C-078) | Shipped 2026-09-29 04:00 UTC: square corners, one bottom row, centered prompt on an empty box, tags. |
| **Branded export, import, live credits** (C-076) | Shipped 2026-09-29 03:50 UTC. |
| **Clean start** (C-075) | Shipped 2026-09-29 03:40 UTC: Alt+key shortcuts while typing, free usage label, sidebar hidden with top-left icon and settings, starters and hints behind switches, calmer tray. |
| **First-run line, session export, hide the bar** (C-072) | Shipped 2026-09-29 03:30 UTC. Credits counter in the line is a placeholder until the router's `/credits` exists (other session). |
| **Readable skins** (C-079) | Shipped 2026-09-29 (Opus 5.5): text over photo and material skins at AA with the weakest scrim that passes; neutral small text; the image stays visible at the edges. Changelog 0010. |
| **Tools tray, draft page, pages keep the pad, estimates** (C-071, C-070) | Shipped 2026-09-29 03:20 UTC. Queued: editing on the draft page itself; running the mark-gathering from the page; a timer line on plain-text local replies (structured replies already show model, time and cost). |
| **Composer fixes and box removal** (C-069) | Shipped 2026-09-29 03:00 UTC: Cmd+V pastes (no longer toggles voice), the visible cursor follows the caret, spell-check on, boxes removable from the sidebar. Queued: formatted page above the pad, top-bar tools tray, phrase chips, per-reply timer line. |
| **Logo configuration set** (C-068) | Generated 2026-09-29 02:55 UTC: 43 marks × 6 files (`colour`, `-mono`, `-light`, `-dark`, `-wide`, `-stacked`) by `scripts/brand-variants.mjs`; manifest `app/public/brand/index.json`; `pages/brands.html` has a configuration switcher and a light/dark page toggle. Later layers (raster export, vectorizer, 3D, official wordmarks) are written down with costs, not automated. |
| **FreshStack nesting** (C-067) | 2026-09-29 02:55 UTC: Jev nests under OpenRouter, Gemini Live and OpenAI Realtime under LiveKit; each card shows its registered mark. |
| **Brand marks** | 52 SVG marks at `app/public/brand/<slug>/` in six configurations, one registry line each in `docs/brand/registry.md`: 43 from Simple Icons (2026-09-29 02:28 UTC) and 9 from official sites and repos via `scripts/brand-crop.mjs` (06:10 UTC, C-098); OpenAI, Slack and W3C stay text marks by their owners' terms; our own marks (Fresh Terminal, Playset, Between Gigs, Hoy, Company OS) not started. Preview page `pages/brands.html`, canvas card `brand-marks`. Chips can now show a mark for any registered brand (wiring pending). |

## 2026-10-04 — Prompt recovery and local demo repair

Source: Justin's private assistant conversation on 2026-10-04 (no public Slack permalink available). See [changelog 0021](../changelog/0021.md).

- Supersedes the earlier health-cache behavior: a temporary router timeout is retryable without reloading the page.
- The minimal landing prompt remains primary; an explicit no-cost demo toggle exposes three editable local samples. Existing Starter/Hints preferences stay intact.
- Drafts are browser-local per stage. Selecting a demo or interpreting a chip is distinct from running a prompt. Existing edit batches still provide Undo.
- Requests have visible running/complete/error/stopped feedback; cancel and navigation stop active network work. Recovery retains newer draft text.
- This entry records the implementation. Release evidence is the corresponding checked PR, deploy workflow and live browser verification; paid AI and account sign-in are separately scoped checks.
