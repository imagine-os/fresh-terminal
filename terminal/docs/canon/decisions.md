# Decisions

Every decision made in this conversation, current or reversed. Written 2026-09-29.

How to read this page:

- **Id**: `C-###` is a Canon id. When a decision changed, the versions share a number with a letter (C-004a, C-004b, C-004c). The last letter is the current one.
- **Date**: UTC. Justin's local time is CDT (UTC−5), so anything before 05:00 UTC on 2026-09-29 was still the evening of 2026-09-28 for him.
- **Status**: `current`, `superseded by C-###`, `proposed` (answered in Slack as a plan; Justin has not decided and nothing is built), or `open` (not decided; see [open-questions.md](open-questions.md)). Until 2026-09-29 02:00 UTC `proposed` also meant "agreed, not built"; entries from before then keep their wording.
- **Repo file**: the numbered decision in `imagine-os/fresh-terminal`, under `terminal/docs/decisions/`, when one exists. Those files are append-only; this page is the summary across all of them.
- When sources disagree, the newer one wins and the older one is marked superseded.

Repo decisions base URL: https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/

## Reversed decisions at a glance

| Topic | First | Then | Now (2026-09-29) |
| --- | --- | --- | --- |
| Live data layer | Convex (C-004a, 22:43) | Postgres + Electric SQL (C-004b, 22:51) | SpacetimeDB for the live layer, Company OS Postgres for business data (C-004c, 22:54) |
| Jev | "Not on OpenRouter, tier pending" (C-015a, 23:46) | — | On OpenRouter as `typesafe/jev-1.13`, used as router and judge (C-015b, 23:52) |
| Chip tagging model | Haiku 4.5 fast tier (C-016a) | — | Gemini 2.5 Flash-Lite (C-016b, 23:52); Haiku 4.5 still answers chat |
| Model doing the work | Fable 5.1, the workspace default (C-026a) | — | Opus 5.5 at Justin's request (C-026b, 00:49 on 09-29) |
| Where deliverables go | Claude artifacts (C-020a) | — | GitHub Pages plus the master canvas (C-020b, 23:38) |
| Motion | SVG/CSS core, Rive optional (C-017a, 23:12) | — | Our own text-based illustration runtime (C-017b, 23:18) |
| Router address | Repo variable `ROUTER_URL` (C-025a) | — | Baked into the app as `DEFAULT_ROUTER_URL` (C-025b, 01:13 on 09-29) |
| Refine loop length | "Up to three rounds" (C-030, 01:28:02) | — | Stops at target score, 2 rounds without gain, 5 rounds or a cost cap (C-031, 01:28:46) |
| Domain | freshterminal.app now, saything.app later (C-033a, 23:06) | .ai if available, else .net (C-033b, 01:37) | freshterminal.ai, bought by Justin on Cloudflare for 2 years (C-045, 2026-09-29) |
| Account data (boxes, glossary, ledger, nav, pages) | SpacetimeDB for the whole live surface (C-004c, 22:54) | — | Cloudflare D1 behind the router; SpacetimeDB kept for live multiplayer and presence (C-047, 2026-09-29) |
| Realtime helpers | Yjs for text and code (C-004b) | — | No Liveblocks, no Colyseus: SpacetimeDB plus our own house rules; Yjs only for long text and code (C-049, 2026-09-29) |

## Platform and stack

**C-001 · 2026-09-28 22:51 · Rebuild fresh, one step at a time**
- Decided: start a clean new build. `between-gigs` becomes an archive, import source and design reference. Company OS (its `integration` branch, not `main`) is the backend seed.
- Why: between-gigs is a single-tenant hub with a portfolio bolted on; Company OS is a disciplined multi-tenant backend with a throwaway UI. They fit together. "Carry designs, not files."
- Status: current. Company OS is not connected to fresh-terminal yet (see open-questions.md).
- Source: Justin 22:28; audit reply 22:51; [pages/audit.html](https://imagine-os.github.io/fresh-terminal/pages/audit.html).

**C-002 · 2026-09-28 22:51 · Vite + React app; leave Next.js and the Sites/Workers setup**
- Decided: the shell is a Vite + React 19 + TypeScript app. Next.js is dropped.
- Why: Next brings back the build loop Justin wants to leave. Vite and React are what agents know best.
- Status: current (proposed "yes unless you say otherwise"; built in pass 1, commit c72f05f).

**C-003 · 2026-09-28 22:51 · shadcn primitives with our own five-region shell**
- Decided: use shadcn building blocks, not shadcn's dashboard layouts. The shell has five regions: top bar, bottom bar, left sidebar, right sidebar, stage.
- Why: Justin asked for a shell whose responsiveness "simply doesnt ever break". Regions and size classes come from the dialect, measured by container, not by screen pixels.
- Status: current. Repo: [0004-dialect-v0.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0004-dialect-v0.md).

**C-004a · 2026-09-28 22:43 · Realtime layer: Convex (Supabase Realtime as fallback)**
- Why: fast to build a live document model on.
- Status: superseded by C-004b at 22:51. The Company OS audit (22:46) showed a tested Postgres backend to build on, so the live layer moved next to it.

**C-004b · 2026-09-28 22:51 · Realtime layer: Postgres + Electric SQL, Yjs for text and code fields**
- Why: keeps Company OS Postgres as the one database.
- Status: superseded by C-004c at 22:54, after Justin pointed at SpacetimeDB.

**C-004c · 2026-09-28 22:54 · Realtime layer: SpacetimeDB for the live surface; Company OS Postgres stays the system of record**
- Decided: pages, components, presence, drafts and prompt-box state live in SpacetimeDB (TypeScript modules). Business data and policies stay in Company OS Postgres.
- Why: Justin: "I like that this promises something ai can get right the first time." Logic, schema and data sit in one TypeScript module with no API layer. Game-first design suits the most demanding realtime.
- Caveats noted then: row-level security for per-tenant reads and subscription limits were not confirmed from SpacetimeDB's docs.
- Status: current, but **not wired**. The module is written and type-checked against `spacetimedb@2.10.1`, not published. The app runs on a local store (browser storage) until then.
- 2026-09-29: **partly superseded by C-047.** Account data moves to Cloudflare D1 first; SpacetimeDB stays the plan for live multiplayer and presence.
- Repo: [0002-spacetimedb.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0002-spacetimedb.md).

**C-005 · 2026-09-28 22:54 · Framework: React on Vite**
- Why: most examples for agents to learn from. Status: current.

**C-006 · 2026-09-28 23:00 · New repo `imagine-os/fresh-terminal`: one folder, one instruction, one box per visitor**
- Decided: the repo root holds `README.md` and `terminal/` (plus tooling files). Every visitor gets a "box" on first visit without signing up.
- Status: current. Repo: [0001-repo-shape.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0001-repo-shape.md).

**C-009 · 2026-09-28 23:05 · Auth: Clerk, behind a seam, not wired**
- Why: anonymous-first sign-in (the Excalidraw pattern), organizations built in for tenants, standard OpenID Connect tokens that SpacetimeDB accepts, and Company OS already planned for it. Better Auth (open source) remains a possible later swap.
- Status: current as the choice. Wiring decided 2026-09-29 in C-048 (development instance keys first). Repo: [0007-auth.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0007-auth.md).

**C-010 · 2026-09-28 23:05 · Hosting: GitHub Pages via Actions for the app; the router as a Cloudflare Worker**
- Decided: the app is a static build served by GitHub Pages. The one server piece, the router holding the keys, runs as a Cloudflare Worker (the same code can run on Node).
- Why: "Less is more", and easy to move out later (point DNS elsewhere, redeploy one worker).
- 2026-09-29: **partly superseded by C-045** (planned, not live yet). The app moves to a Cloudflare Worker with static assets at freshterminal.ai; GitHub Pages stays as a mirror.
- Status: current. Justin set Pages to deploy from Actions on 2026-09-28 (23:49). The Worker went live 2026-09-29 01:13 UTC. Repo: [0006-hosting.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0006-hosting.md), [0015-router-deploy.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0015-router-deploy.md).

**C-011 · 2026-09-28 23:04 · Tool rule: pick what AI is fast and easy with**
- Justin: "Remember, i want the things that AI is incredibly fast and easy at working with". Mainstream, heavily documented tools (Vite, React, TypeScript, Hono, Clerk, GitHub Pages). Novelty only where it buys something specific (SpacetimeDB for realtime).
- Status: current (standing rule).

**C-014 · 2026-09-28 23:00 · One OpenRouter key, held server-side, covers the models**
- Decided: the router holds one OpenRouter key and never sends it to the browser. Plus a free SpacetimeDB account when the live layer is published.
- Status: current. Repo: [0003-openrouter-router.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0003-openrouter-router.md).

**C-040 · 2026-09-28 23:09 · Don't build a React replacement; make React invisible**
- Decided: pages and components are records written in the dialect; a small runtime renders them with React underneath. Swapping the engine later is contained.
- Why: React holds a decade of edge cases (focus, events, accessibility) that agents know cold. Status: current.

**C-041 · 2026-09-29 00:05 · CI: `packageManager` in package.json is the only pnpm version**
- Why: both workflows failed on a pnpm version clash. Fixed in commit 45dcd53. Status: current.

## The prompt box and the terminal

**C-037 · 2026-09-28 22:43 · The prompt box routes; it is not a model picker**
- Decided: the box posts to a router that decides the intent, picks the model and checks permission from a table (intent → model → permission). The screen renders from the change that comes back.
- Status: current. Repo: [0003-openrouter-router.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0003-openrouter-router.md).

**C-038 · 2026-09-28 22:47 · Composer: typewriter that grows upward, chips, adaptive start**
- Decided: the composer sits on the bottom bar and grows upward as you type or speak. Words become typed chips. The first keystroke shows a suggestion strip, so nobody has to know the words first.
- Status: current (shipped pass 1; chips v2 in progress, C-028).

**C-007 · 2026-09-28 23:02 · Homepage follows the Excalidraw pattern**
- Decided: the landing page is the product. You land in a working box, no sign-up until you want to save. Icons show their shortcuts; doodles point at what is what. The look takes after spacetimedb.com.
- Status: current. Repo: [0005-homepage.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0005-homepage.md).

**C-008 · 2026-09-28 23:02 · Product name is one constant: "Fresh Terminal" for now**
- Justin: "I personally dont like the name terminal. But its what people know". The name lives in one place (`PRODUCT_NAME`), so a rename is one change plus a redirect.
- Status: current. The final name is open.

**C-018 · 2026-09-28 23:24 · Themes are records; three ship first**
- Decided: 16 theme designs written. Pass 1 ships Void (default, pure black, green block cursor), Blank Page (pure white) and Glass Window (glass over drifting fog, highlight follows the pointer). `T` cycles themes.
- Status: current. 13 themes and the camera and tilt effects are not built. Repo: [0009-themes.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0009-themes.md).

**C-019 · 2026-09-28 23:33 · Starter prompts are records; "Draw" paints in like a CRT beam**
- Decided: starters live in an append-only list (`docs/prompts/starters.json`, 14 at launch) and feed the suggestion strip. Replies reveal with a beam pattern: horizontal, radial, diagonal or typewriter.
- Status: current. "Draw a shadcn dashboard" is a demo made from our own parts; model-generated drawings are not wired. Repo: [0010-starters-and-reveal.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0010-starters-and-reveal.md).

**C-017a · 2026-09-28 23:12 · Motion: no Rive or Lottie in the core; SVG + CSS + Web Animations; Rive optional**
- Why: Rive and Lottie files come from editors, so agents can't write them from the prompt box.
- Status: superseded by C-017b.

**C-017b · 2026-09-28 23:18 · Motion: our own interactive-illustration runtime**
- Justin: "I dont care about their editor i care about what it does and how tiny and multi device it figured out how to do things".
- Decided: an illustration is a text record: SVG shapes, named parameters and a state machine written in the dialect ("when idle 3 seconds, blink"). A tiny runtime drives it on any screen.
- Status: proposed (pass 2 plan items `motion-schema`, `motion-runtime`; not built). Repo prompt: [0006-motion.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/prompts/0006-motion.md).

**C-021 · 2026-09-28 23:40 · Library of terminals replaces the themes page**
- Decided: a browsable library (search, filters, list view, keyboard, "Open full screen" on every entry). Koi Pond is entry 17.
- Status: current. Shipped in ae2c996. `pages/themes.html` now redirects to `pages/library.html`.

**C-022 · 2026-09-28 23:37 → 2026-09-29 00:31 · Koi pond: realistic, reactive, library allowed; v2 is a tiltable 3D scene**
- Decided: v1 uses three.js. v2 adds tilt and orbit, a bridge, banks and sky, lily pads of any shape (including rounded rectangles that hold cards), stone paths, twelve koi in eight varieties. Reuse open code only under permissive licenses, with attribution.
- Status: v1 current (live). v2 built and previewed 2026-09-29 01:31 UTC, not pushed; ships with the next push (pass 4). Known gaps: no reflections of the bridge or rocks, flat grass, rigid fins, washed-out daytime.

**C-027 · 2026-09-29 01:23 · The terminal must be able to edit itself**
- Justin: "Fail: if it can't edit itself than its not good enough".
- Decided: everything on screen becomes data the model can change (sidebar as a nested menu tree, pages, shell layout, theme, cards, styles). The model gets typed edit tools and is told to act, never to send you to settings. Every edit applies live with "Edited: … · Undo".
- Status: in progress (pass 4). Test: "add a Projects menu with Koi Pond and Library nested under it".

**C-028 · 2026-09-29 01:26 · Chips v2: smarter tagging, clickable chips, a glossary per box**
- Decided: the model tags as you type. Click a chip to set its type, fix its value or add a note. Each box keeps a glossary, so "Hoy" can be the brand or "today" in Spanish. When a word could be either, the chip shows both readings.
- Status: in progress (pass 4).

**C-029 · 2026-09-29 01:26 · Structured replies, "like a super-cli"**
- Decided: each reply opens with a line showing model, time and cost, then tables, steps, the edits made (with Undo) and clickable next commands.
- Status: in progress (pass 4).

**C-030 · 2026-09-29 01:28 · Skins and materials: instant draft, then Jev picks the route**
- Decided: asking to skin something gives a quick draft in the same reply, from colors and styles. Jev then picks the best real route: custom code, a generated image, an image search or a free library. Rounds run in the background and only replace what's on screen if Jev scores them better. Each round has a small cost cap and can be undone.
- Status: proposed (pass 5). The "up to three rounds" in this reply is superseded by C-031's stop rules.
- 2026-09-29: **built in pass 5.** Draft from the material library or a colour tint, then Jev picks one of five paths: library, procedural CSS, colour tokens, image search (Openverse, licence recorded) or image generation (`openai/gpt-5-image-mini`). Repo: [0018-skins-and-refine.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0018-skins-and-refine.md).

**C-031 · 2026-09-29 01:28 · Refine loop (best-of-3) is the core loop for anything that can get better**
- Justin: "make 3 versions, choose best, make 3 upgrades, choose best … Of course set an end to the loop when appropraite."
- Decided: each round makes three variants from the current best. Jev scores them; the winner becomes the new base. Stops at a target score, after two rounds with no gain, after five rounds, or at a small cost cap. You see three thumbnails with scores per round and can overrule the pick. Applies to skins, Draw layouts, pages and copy.
- Status: proposed (ships with pass 5).
- 2026-09-29: **built in pass 5** as `refine()` in `shared/src/refine/loop.ts`, used by skins. Scores come from a vision description plus a Jev score on five rungs. Stop rules as decided, with the 3¢ cap checked before each round from per-variant estimates in `router/rules.json`. Layouts, pages and copy do not use it yet.

## Money

**C-012 · 2026-09-28 23:08 · A ledger at the core; the simplest chain**
- Decided: every model call, stored byte or action writes one ledger entry (who, what, units, our cost, their price). Money is whole micro-dollars (millionths of a dollar), never decimals. Pass-through: price = OpenRouter's reported cost + a margin from the route table, default +0%. Each entry carries the hash of the one before it; one button verifies the chain. Users who agree to be "on chain" also link into a shared chain. No tokens, wallets or mining.
- Status: current (in the browser). Stripe payment and publishing the shared chain beyond the browser are not wired. Repo: [0008-ledger.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0008-ledger.md).

**C-013 · 2026-09-28 23:48 · Two ways to pay**
- Decided: use our key (through the router, pass-through billing) or bring your own OpenRouter key. Your own key stays in your browser, goes straight to OpenRouter and is never sent to us. The ledger still records own-key calls at cost with zero margin.
- Status: current (shipped ae2c996; press `K`). Repo: [0012-two-ways-to-pay.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0012-two-ways-to-pay.md).

## Models

**C-015a · 2026-09-28 23:46 · Jev "isn't listed on OpenRouter"; its tier marked pending**
- Earlier still (22:43 and 22:47), Jev was planned for screen control, tests, small edits and chip tagging.
- Status: superseded by C-015b.

**C-015b · 2026-09-28 23:52 · Jev is on OpenRouter as `typesafe/jev-1.13`; it is a decision model**
- Facts (verified 2026-09-28): made by TypeSafe AI, published on OpenRouter around 2026-09-15, about $0.042 per million input tokens, output free. It returns typed decisions only: pick one option with probabilities, yes/no with a probability, or a score. No prose, no JSON, no screen control. Not on fal or kie.
- Decided: Jev is the router (which tier handles this prompt), the permission check (is this allowed), the judge (did this pass, which is best). It cannot write chips.
- Status: current. Live on 2026-09-29: Jev picks the route for every our-key prompt. Permission checks exist but are not enforced yet. Repo: [0013-model-tiers.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0013-model-tiers.md).

**C-016a · 2026-09-28 · Haiku 4.5 as the fast tier, including tagging**
- Status: superseded for tagging by C-016b.

**C-016b · 2026-09-28 23:52 · Tagger tier: Gemini 2.5 Flash-Lite (GPT-4.1 nano as the alternate)**
- Why: about $0.10 in / $0.40 out per million tokens with native JSON output; Haiku 4.5 costs about ten times more for the same job.
- Note: the reply said "switch the fast tier off it", but what shipped (decision 0013) and the live test at 01:16 UTC on 2026-09-29 keep Haiku 4.5 as the model that answers chat. Only tagging moved. The newer, shipped state wins.
- Status: current. The model tagger is behind a dev-mode toggle; the local tagger is the default. Pass 4 (in progress) makes the model tag as you type.

**C-026a · 2026-09-28 · Fable 5.1 does the work (the workspace default)**
- Status: superseded by C-026b in Justin's threads.

**C-026b · 2026-09-29 00:49 · Opus 5.5 at Justin's request**
- Justin: "also i set you to opus 5.5 by default. not sure why youre always using fable".
- Decided: Justin's threads run on Opus 5.5. Every reply still says which model did the work. The workspace instructions still name Fable as the org default, so new threads must switch at the start.
- Status: current. Note: pass 1–3 code and koi pond v2 were built by Fable 5.1; this Canon was written by Opus 5.5.

## Delivery and documentation

**C-020a · until 2026-09-28 23:36 · Deliverables as Claude artifacts**
- The audit and the 16 themes were first published as Claude artifacts.
- Status: superseded by C-020b.

**C-020b · 2026-09-28 23:38 · Deliverables are GitHub Pages, and every one is a card on the master canvas**
- Justin: "id rather you give me a github page than a claude artifact."
- Decided: pages ship in the repo under `/pages/`. Every page, doc, image or box becomes a card on the master canvas at `/canvas`. Paper cards are 1 mm thick by default, images 10 mm, drawn as a real edge. Justin arranges the canvas over time. Theme pages can open the terminal full screen in that theme.
- Status: current. Repo: [0011-master-canvas.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0011-master-canvas.md).

**C-036 · 2026-09-28 22:31 · Build in parallel; git is the record, not the workflow**
- Justin wants many edits across the app at once, visible as they happen. Near term: agents work in parallel and push straight to `main` after a green check; prompts, decisions and changelog land in the same push. Long term: the product is the source of truth and git becomes a nightly export.
- Status: current as a principle; the "write directly onto the product" part waits on the live layer (C-004c).

**C-042 · 2026-09-29 00:49 · Setup steps Justin must do himself come as numbered steps with a link for each page**
- Justin: "your instructions are not clear enough , and you didnt give me a link to each place to get those keys."
- Decided: numbered steps, a direct link per page, exact names to paste, say plainly what is optional, do the rest ourselves.
- Status: current.

**C-043 · 2026-09-28 23:48 · Keys never go in Slack; they go in repository secrets**
- Status: current. See [people-and-access.md](people-and-access.md).

**C-034 · 2026-09-28 22:37 · Caveman and Mem Palace, done our own way**
- Decided: (1) a house "wire dialect": compact typed records and terse status lines for agent traffic. Never compress code, schemas, error text or confirmations of destructive actions. Source files stay readable. (2) Memory as a first-class tenant resource in the database: tenant → project → topic, with the original text and an optional summary side by side.
- Status: proposed, not built. This Canon is the first written piece of that memory.

**C-044 · 2026-09-29 01:37 · The memory for this work is called the Canon**
- Justin asked for "the creator memory, or whatever is a better word for it". Canon: what is true now, with the history of how it got there.
- Status: current.

## Other companies and domains

**C-032 · 2026-09-29 01:37 · Fresh Terminal added as a company in between-gigs**
- Decided: a Fresh Terminal entry under My companies (next to Playset and Bienestar), linking to the live site, repo and router. Release 3.70.
- Status: saved to GitHub `imagine-os/between-gigs` main as commit b191350 (2026-09-29 01:37 UTC). **Not on the live between-gigs.com site**: that site publishes from Sites, not GitHub, since 2026-09-27, and no Sites deploy or release receipt exists for 3.70.

**C-033a · 2026-09-28 23:06 · Domains: register freshterminal.app now, saything.app as the future name**
- Found free then: freshterminal.app and .dev, saything.app, typeandgo.app, plainwords.app and others. Taken: freshterminal.com.
- Status: superseded by C-033b. Justin said at 23:07 "freshterminal.ai is good too".

**C-033b · 2026-09-29 01:37 · Domain: freshterminal.ai if you can get it, otherwise .net**
- Why: .ai names the category; .net reads like old infrastructure. freshterminal.net is free per the .net registry; .ai could not be checked from the sandbox. Buying through Cloudflare makes DNS a one-click hookup.
- Status: superseded by C-045 (2026-09-29). Justin bought freshterminal.ai.

## Platform: domain, hosting, data, auth, realtime (2026-09-29)

**C-045 · 2026-09-29 · Domain is freshterminal.ai**
- Justin bought freshterminal.ai on Cloudflare Registrar for 2 years ("OK i paid $160 for 2 years freshterminal.ai on cloudflair").
- Plan: freshterminal.ai serves the app from a Cloudflare Worker with static assets. api.freshterminal.ai serves the router. GitHub Pages stays as a mirror.
- Status: current as the decision; **not live yet**. Supersedes C-033b; partly supersedes C-010.
- 2026-09-29: **built** (C-064): app Worker `fresh-terminal-app` on freshterminal.ai (www redirects), router on api.freshterminal.ai, GitHub Pages kept as the fallback. Live status in [state.md](state.md).

**C-046 · 2026-09-29 · Cloudflare automation runs from CI with an API token**
- Decided: automation uses a Cloudflare API token held as a CI secret, not the laptop OAuth MCP setup, so Justin never has to open Cloudflare ("Make it so i dont need to go to cloudflare and you can do everything please").
- Requested extra token scopes: Zone DNS Edit, Zone Read, Account D1 Edit, all zones.
- Status: current. Whether the token has those scopes is not verified here.
- 2026-09-29 02:31 UTC: **verified** by workflow `infra-verify` (run 36512972684): active user token, zone freshterminal.ai visible, DNS, Worker routes, Workers and D1 readable. Write access proven by the deploys (custom domains, D1 create).

**C-047 · 2026-09-29 · Account data moves to Cloudflare D1 behind the router**
- 2026-09-29 02:07: proposal C-052 would publish SpacetimeDB now instead, once Justin adds `SPACETIMEDB_TOKEN`. Until he decides, this entry stands.
- Decided: boxes, glossary, ledger, nav and pages are stored in Cloudflare D1, reached through the router, instead of publishing to SpacetimeDB now.
- Why: avoids another sign-up; the router already runs on Cloudflare.
- SpacetimeDB stays the plan for live multiplayer and presence.
- Status: current, and Justin can override it. Partly supersedes C-004c. Not built yet.
- 2026-09-29: **built** (C-066): D1 database `fresh-terminal`, accounts, boxes and a ledger mirror, synced for signed-in people only.

**C-048 · 2026-09-29 · Auth is Clerk, starting on development instance keys**
- Decided: start with the Clerk development instance. Keys are held as the secrets `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (names only; values never in the repo or Slack).
- Moving to production later is one click in the Clerk dashboard, plus DNS records we add through the Cloudflare token (C-046).
- Why: Justin wants to use his own Fresh Terminal account personally and start connecting it to things ("i'd like to start using my terminal account personally").
- Status: current. Wiring not built yet. Builds on C-009.
- 2026-09-29: **built** on the development instance (C-065). Verified 02:31 UTC: `pk_test_` / `sk_test_`, Frontend API relevant-flea-5813.clerk.accounts.dev, JWKS reachable, 0 users. "Moving to production is one click" was too short: it also needs Google and GitHub OAuth credentials of our own; steps in C-065.

**C-049 · 2026-09-29 · No Liveblocks, no Colyseus: SpacetimeDB plus our own house rules**
- Justin asked: "do we need liveblocks or colyseus for this? or does spacetimedb handle realtime, and the rest of the rules we can study other tools like liveblocks and make our own simpler cleaner rules?"
- Decided: no Liveblocks and no Colyseus. SpacetimeDB covers realtime sync and server-authoritative logic. Yjs stays for concurrent text and code, with its updates synced through our store.
- House multiplayer rules:
  - A room is a box.
  - Presence is one table (who, cursor, focus).
  - A short lease on a record while someone is editing it.
  - Version-numbered last-writer-wins for records; a CRDT only for long text and code.
  - Undo is per person.
  - Comments attach to any record.
- Alternative noted: Cloudflare Durable Objects, if Justin prefers not to sign in to SpacetimeDB.
- Status: current as the direction. Not built yet. Records carry ids and `updated_at` today; version numbers, leases and presence come with multiplayer.

## Proposed 2026-09-29 (answered in Slack 02:07–02:11 UTC, not decided)

These are plans Claude answered with. Justin has not decided them, and none is built. Facts about outside services below were read from their pages on 2026-09-29 and not tested by us unless a line says so.

**C-052 · 2026-09-29 02:07 · Publish SpacetimeDB to Maincloud from CI**
- Asked: "Get the skills you need for spacetimedb please. and give me link as needed and directions to sign up and get you going." ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647341270939?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [reply](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647671074559?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Proposed: Justin installs the CLI, runs `spacetime login`, then `spacetime login show --token`, and saves the token as the Actions secret `SPACETIMEDB_TOKEN` (name only; never the value in Slack or the repo).
- Proposed: GitHub Actions runs `spacetime login --token` and then `spacetime publish fresh-terminal --server maincloud`. The app connects to `https://maincloud.spacetimedb.com`, database `fresh-terminal`. Maincloud scales to zero when idle.
- Proposed: vendor the skills pack https://github.com/DanMossa/spacetimedb-skills into the repo so every agent reads it (https://github.com/douglance/stdb-skills as a second reference).
- Proposed: the pointer presence row (who, cursor, focus from C-049) goes live once the module is published.
- Status: proposed. The token is an open item, waiting on Justin. Conflicts with C-047 (account data in D1 first) if adopted; see [open-questions.md](open-questions.md).

**C-053 · 2026-09-29 02:07 · Media: bytes in Cloudflare R2, one row per file in SpacetimeDB**
- Asked: "where is all my media being stored? and does that stay realtime as well?" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647396138619?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [reply](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647671074559?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Fact (2026-09-29): no media is stored server-side today. Canvas image upload is not wired; the koi pond and library use files shipped with the site.
- Proposed: file bytes go to Cloudflare R2 under freshterminal.ai; each file's record (owner, box, type, size, where) is a row in SpacetimeDB, so lists and changes stay live.
- Status: proposed.

**C-054 · 2026-09-29 02:07 · Browsers: streamed, not iframes**
- Asked: "I want logged in browsers built into my window management system … the one thing i would like to avoid though is lag … too many things block iframes" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647506492349?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [reply](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647671074559?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Why: many sites refuse to load inside an iframe.
- Proposed: streamed browsers. Hyperbeam for windows people use; Browserbase or our own Fly.io machine for agents.
- Status: proposed. Lag not measured by us.

**C-055 · 2026-09-29 02:07–02:09 · Integrations: a ladder Jev chooses from; one registry exposes everything**
- Asked: plug Slack, Claude, ChatGPT, Cursor, Grok and Muse in, use Pro/Max credits, and "consider how WebMCP or any other api, cli, mcp, skills, plugins, or whatever protocal is necessary" ([message 1](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647341270939?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [message 2](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647710134419?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [reply 1](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647671074559?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [reply 2](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647779666479?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Correction recorded: Jev doesn't click. It returns decisions only. A runtime (Playwright in the agent browser) lists candidates, Jev picks one, the runtime clicks or types. Reading pages and writing text route to Flash-Lite; judgment routes to Claude.
- Keys move by API, never by screen: GitHub secrets, Cloudflare, Clerk and OpenRouter all have APIs. The browser is the last resort, and then the key comes from a vault and is never shown to a model.
- The ladder, top first: API, then CLI, then MCP, then WebMCP, then browser. Jev picks the rung and the target from a routing table that is a record, editable from the box.
- WebMCP, as reported on 2026-09-29 and **not verified by us**: a W3C Community Group draft; Chrome 146 behind a flag; a public origin trial in 149; the entry point is `document.modelContext` since 150 (was `navigator.modelContext`). Plan: expose our tools through it, and use it on other sites only when present.
- Fresh Terminal exposes, all generated from the one action registry: an MCP server, a CLI (`fresh do "…"`), a `SKILL.md` pack, a webhook (how Slack gets in), and WebMCP tools in the page.
- Plans: a Claude Pro/Max plan can be used through Agent SDK sign-in ("Sign in with Claude"), per Anthropic's help page read 2026-09-29. ChatGPT, Cursor and Grok plans can't be used from outside their apps yet; they connect as MCP clients or with API keys.
- Live input: the pointer is a presence row; webcam follow uses in-browser face landmarks targeting the pointer row; AI characters use a parameter plus state-machine model (the same idea as our illustration runtime, C-017b).
- Status: proposed.

**C-056 · 2026-09-29 02:10 · Recipes: tasks get cheaper every run**
- Asked: "every time it figures out how to do things it will then figure out how to do those thigns faster and faster until it reaches the most efficient path" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647778785799?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [reply](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647843929359?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Proposed: a first run is recorded as a trace; the trace becomes a recipe; the recipe replays with Jev checking each step; after N clean runs it replays as plain code with no model calls. When a recipe stops getting cheaper, the best-of-3 loop (C-031) tries variants.
- Proposed: each recipe splits into a shareable **shape** (steps, calls, rung choices, checks; no values) and a private **binding** (tenant, credentials, ids, personal data). Private by default. Sharing needs a secret scan, a Jev check ("contains no tenant-specific data") and the owner's approval.
- Proposed: recipes are their own pass, after SpacetimeDB is live.
- Status: proposed.

## Rules for the docs

**C-057 · 2026-09-29 02:11 · Keep the wiki and the Canon current, as a rule**
- Justin: "are you keeping and updating your documentation wiki? please do as a rule. very human and ai readable" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647881668439?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [reply](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647944459239?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Decided: the Canon and the docs wiki (`terminal/docs`) are updated in the same commit as every pass. Plain dated lines, one fact per line. Superseded lines are kept and marked, never deleted. Each page links to the Slack message that caused it. One start-here index (`terminal/docs/README.md`) and an `llms.txt` for AI readers; the same pages serve people and agents.
- Status: current (a rule from Justin). Written into the root README and [README.md](README.md). Repo prompt: 0015.

## Domain, sign-in and accounts (2026-09-29, infra pass)

**C-064 · 2026-09-29 02:50 · freshterminal.ai runs on a Worker; the router answers on api.freshterminal.ai**
- Justin, 02:28 UTC: "i already did cloudflare clerk" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790648903521149?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)).
- Decided: the app is Worker `fresh-terminal-app` (`terminal/site`) with static assets and SPA fallback, on custom domains freshterminal.ai and www.freshterminal.ai; the Worker sends www to the apex with a 301. The router Worker adds custom domain api.freshterminal.ai. Custom domains make Cloudflare create the DNS records and certificates, so there is no DNS step. Both keep their workers.dev URLs; GitHub Pages keeps its own build as the fallback.
- The app picks its router by where it is served from: api.freshterminal.ai on the domain, the workers.dev router everywhere else, so Pages is not moved until the domain is proven.
- Deploys: `site-deploy.yml` (app) and `router-deploy.yml` (router) on push to main and on demand, from GitHub Actions with `CLOUDFLARE_API_TOKEN`.
- Status: current. Repo: [0020-domain-clerk-d1.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0020-domain-clerk-d1.md). Builds C-045 and C-046.

**C-065 · 2026-09-29 02:50 · Sign-in is Clerk, anonymous-first, on the development instance for now**
- Decided: everyone starts signed out and everything works as before. A **Sign in** button in the header opens Clerk; signed in adds cloud sync. The app uses `@clerk/react` (Clerk's current React package). The router checks the Clerk session token itself, without a network call (the instance's public key is pushed as `CLERK_JWT_KEY` by the deploy; `CLERK_SECRET_KEY` is the fallback). Only `/me` and `/sync/*` need a session.
- Limit (Clerk docs, read 2026-09-29): a development instance works from any domain, including freshterminal.ai, but shows a "Development mode" badge, holds at most 100 users, and should not carry real users. Its users cannot be moved to production.
- Before inviting anyone, Justin does these steps once (about 15 minutes):
  1. https://dashboard.clerk.com → open the Fresh Terminal app → click **Development** at the top → **Create production instance** → clone the development settings.
  2. Domain: `freshterminal.ai`.
  3. **SSO connections**: Google and GitHub need our own OAuth apps in production. Google: https://console.cloud.google.com/apis/credentials (OAuth client, web; redirect URI as shown by Clerk). GitHub: https://github.com/settings/developers → New OAuth App (callback URL as shown by Clerk). Paste each client id and secret into Clerk.
  4. Production **API keys** page in Clerk → replace the GitHub secrets `CLERK_PUBLISHABLE_KEY` (`pk_live_…`) and `CLERK_SECRET_KEY` (`sk_live_…`) at https://github.com/imagine-os/fresh-terminal/settings/secrets/actions.
  5. Run the `router-deploy` and `site-deploy` workflows (https://github.com/imagine-os/fresh-terminal/actions). `site-deploy` then reads the DNS records Clerk wants (clerk., accounts., clkmail., clk._domainkey., clk2._domainkey.) and creates them in Cloudflare, DNS only. Nothing to type into Cloudflare.
  6. Back in the Clerk dashboard: wait for the **Domains** checks to pass, then press **Deploy certificates**.
- Status: current. Development instance live; production not started (waiting on Justin). Builds C-048 and C-009.

**C-066 · 2026-09-29 02:50 · Signed-in accounts, boxes and a ledger mirror live in D1; signed out stays in the browser**
- Decided: D1 database `fresh-terminal`, created by the deploy if missing. Tables: `accounts` (clerk_user_id, plan, created_at, updated_at), `boxes` (id, account_id, name, state_json, created_at, updated_at, deleted_at), `ledger_entries` (the chained entry plus account_id and updated_at). Every row keeps a stable id and `updated_at` for later multiplayer.
- Sync rule: last writer wins per box on `updated_at`; a box edited on this device since the last sync wins over an older server copy; an untouched box takes the newer server copy. Nobody can overwrite or read another account's box. The ledger mirror is append-only.
- What syncs: each box's name, menu, pages, layout, theme, style, skins and glossary, and the ledger. Transcript lines stay in the browser for now (not wired yet). Sync runs on sign-in, after edits and when the window gets focus; it is not realtime.
- Status: current. Builds C-047. SpacetimeDB or Durable Objects remain the plan for live multiplayer (C-049).

## Principles recorded as decisions

**C-035 · 2026-09-28 22:33 · A plain-language house dialect**
- Justin: "we dont need to rely on other peoples computer language, we can write our own, Even 10 Year old and 80 Year olds can understand."
- Decided: a closed vocabulary with fixed meanings, written as plain sentences ("Left sidebar: rail on laptop, full on desk and wall, hidden on phone."). Unknown words are reported, never guessed. Sibling dialects for billing and themes use the same style. Inspired by Finsweet Client-First's purpose, not its names.
- Status: current (v0). Repo: [0004-dialect-v0.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0004-dialect-v0.md).

**C-039 · 2026-09-28 23:00 · Game-first realtime over SaaS**
- Justin: "MMOs demand the most realtime, and manages worlds and economies. Likely better than saas".
- Status: current (principle).

**C-023 · 2026-09-29 00:29 · Voice behind one seam**
- Decided: browser speech is the default (free, no key), with a live transcript in the composer. OpenAI Realtime is first among paid options; Gemini Live sits behind the same seam. The OpenAI key is optional and only needed for spoken replies (00:49).
- Status: current. Browser speech live. OpenAI Realtime code complete but shows "not configured" (no key). Gemini Live audio not wired. Repo: [0014-voice.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0014-voice.md).

**C-024 · 2026-09-29 00:39 · No router, no call: the fix for "Router error: HTTP 405"**
- Why: the static Pages site answered 405 because no router existed. Now the app checks the router's health first and, if it is missing, says so and offers your own key.
- Status: current. Repo: [0015-router-deploy.md](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/decisions/0015-router-deploy.md).

**C-025a · 2026-09-29 00:42 · Router address from the repository variable `ROUTER_URL`**
- Status: superseded by C-025b.

**C-025b · 2026-09-29 01:13 · Router address baked into the app**
- Decided: the Worker address is a public constant, `DEFAULT_ROUTER_URL`; `VITE_ROUTER_URL` can override it. No variable for Justin to set.
- Status: current (commit 1d77c83).

## Stack and its exits (2026-09-29)

**C-050 · 2026-09-29 02:20 · FreshStack: the default stack is a page with an exit per piece**
- Justin: "Make a little page or component that shows the items we're using in freshterminal by default ... This is our FreshStack. the goal is that this becomes the most popular, best starter kit on the internet. until we get rid of the dependencies on those things too."
- Decided: `pages/freshstack.html` lists every default dependency (GitHub, Cloudflare, OpenRouter, Jev, SpacetimeDB, LiveKit, OpenAI Realtime, Clerk, Stripe, streamed browser, Vite+React+TypeScript, Hono, Playwright) with its job, its status (live / written, not wired / planned), how it behaves in each of the three modes (ours, your keys, self-host), and its exit. The stack is a data array in the page; agents edit the array. A canvas card `freshstack` points at it.
- Rule: a dependency may be added only with all four fields filled in, exit included. The list is meant to get shorter.
- Status: current. Page and card in the repo (this commit); live on the next Pages deploy.

**C-051 · 2026-09-29 02:20 · LiveKit for realtime voice, video and agents, wired so the owner does one step**
- Justin: "I'm building with LiveKit ... setup the mcp or cli or whatever tools you want. tell me how to get it registered so you can use it without me."
- Decided: LiveKit Agents (Python; the Node SDK does not have MCP yet) with `mcp.MCPToolset(mcp.MCPServerHTTP(<fresh-terminal router>/mcp))` so the voice agent calls the same actions as the prompt box. Deploy from GitHub Actions with `livekit/deploy-action@v2` (`create` once, then `deploy` on push) using repo secrets `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Coding agents get the LiveKit docs MCP (`https://docs.livekit.io/mcp`) and `npx skills add livekit/agent-skills`.
- Owner's one-time step: install `lk`, run `lk cloud auth` (browser sign-in, picks the project, mints a key), then copy the three values into the repo secrets. After that no dashboard visits are needed.
- Status: decided, not started. Depends on the router exposing `/mcp` (see the integrations plan in the thread, 02:07 UTC).


## Replay and the tagline (2026-09-29)

**C-058 · 2026-09-29 02:29 · Every step is a saved event; replay first, branches and merges later**
- Justin: "i need a playback scrubber that then evolves to have branching and merging capability if needed to watch through every step of our interactions with a terminal session please. Everything saved beatuifully. in the future we can save video adn audio and whatever else also, for now get us started and we can evolve as we grow" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790648981706729?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Decided: a session is a list of steps, each with `parent_ids` (a list, so a branch or a merge fits without a new shape) and a `branch_id` (only `main` today). Steps are derived from what the store already records (sessions, lines, edit batches, undo/redo ledger entries), so every existing box already replays from its first line. The interface at any step is rebuilt by reversing later edits with their stored inverses, never stored twice. Replay is read-only. One JSON file (`timeline.v0`) saves branches, steps, lines and edits. Media (audio, video, pointer) will be steps of new kinds pointing at media rows (C-053), on the same wall-clock lane.
- Surface: `/box/<id>/play?step=N`, key `P`, replay button in the top bar; scrubber with lane marks, range, transport, speed, save, "Branch from here" (not wired yet).
- Status: current. Shipped 2026-09-29 (changelog 0006, decision 0019). Branching and media are listed as not wired (`playback.branch`, `playback.media`).

**C-059 · 2026-09-29 02:29 · Tagline: "Evolve as we grow."**
- Justin: ""evolve as we grow" is great tagline" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790648992904059?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)), eleven seconds after the replay ask.
- Decided: the product tagline (`landing.tagline`, the one place named by `PRODUCT_TAGLINE_KEY`) is "Evolve as we grow." Spanish: "Evolucionamos mientras crecemos." It shows in the top bar on the landing page. Superseded: "Type, and it routes." (2026-09-28).
- Status: current.

## Pass 5 additions (2026-09-29)

**C-060 · 2026-09-29 02:46 · "Open terminal" in the library opens a new box that is already skinned**
- Justin: "open terminal from the library should simply take us to a fresh terminal window thats arleady skinned." ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790649998972349?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Decided: each of the 17 library entries links to `box/new?theme=<built theme>&skin=<material>&from=<library id>` (relative, so it works under `/fresh-terminal/`). The new box opens with that theme and the material as the stage skin, with no toast and no screen in between. The mapping lives in `shared/src/skins/terminals.ts` and a test keeps the page in step with it.
- Terminals whose look is not fully built open the closest built look with a line naming what is not wired yet: Bezel and Glass (moving bezel), You as the Camera (camera reflection), Tilt Window (phone tilt), Koi Pond (the live 3D pond inside a box; its own page stays linked), Night Sky (drifting stars).
- Status: current. Built in pass 5.
- Found then: the old links were `/box/new?...` from the site root, which on GitHub Pages leaves `/fresh-terminal/` and cannot open the app.

**C-061 · 2026-09-29 02:47 · Ontology: one edge per relation, named both ways**
- Asked: "ontology should be a big part of how you think. often 2 way connections have different meaning in each direction" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790649886159139?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [reply](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790650063160389?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Proposed: each relation is stored once as an edge with a forward label and an inverse label ("Hoy employs Sergio" / "Sergio works at Hoy"). Some relations are symmetric ("partners with"). Every edge carries its source and date. Chips and Jev share one list of types.
- Status: proposed.

**C-062 · 2026-09-29 02:47 · Connectors: one managed OAuth layer that can also be self-hosted**
- Asked: "How will we handle connectors for thingsl ike dropbox, google drive, email, whatsapp, sms, etc." ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790649886159139?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [reply](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790650063160389?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Proposed: one managed OAuth connector layer that can also be self-hosted (so it fits ours, your keys and self-host), chosen after verifying the options. First set: Google Drive, Dropbox and email over IMAP. WhatsApp and restricted Gmail scopes need vendor approval (Meta, Google) and come later.
- Status: proposed. No connector layer chosen or verified yet.

**C-063 · 2026-09-29 02:47 · Migration: originals kept, records mapped with source ids, duplicates flagged**
- Asked: "migration is a huge ability we need to build out" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790649886159139?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), [reply](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790650063160389?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Proposed: raw originals go to storage untouched. Records are mapped onto the ontology (C-065) with their source ids, so an import can be re-run. Possible duplicates are flagged for review, never merged silently. First formats: Google Takeout, Dropbox, mbox email and WhatsApp chat export. Between Gigs and Company OS are the first real imports.
- Status: proposed.
## Nesting and the logo set (2026-09-29)

**C-067 · 2026-09-29 02:44 · FreshStack nests a piece under what it runs through**
- Justin: "consider jev is a subset of open router if thats where its being used . think of organizing with nesting as appropraite." ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790649886159139?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Decided: a stack piece may name a `parent`. A child is a subset of its parent's account, key and exit, and renders inside the parent's card under "Through <parent>". Today: Jev under OpenRouter; Gemini Live (the default voice, C-023 as updated 02:29) and OpenAI Realtime (optional) under LiveKit. Cards show the piece's registered mark.
- Status: current (this commit). The ontology behind it (links with a name per direction) is the other session's proposal from the same message.

**C-068 · 2026-09-29 02:44 · Every logo ships as a set of configurations; heavier layers are costed**
- Justin: "we're going to need the Logo system to do lightmode and dark mode and transparent and more as well as each of the configurations of that logo like wide, icon only, etc. we might even consider using an inexpensive vectororizer tool as needed, and or 3D .... each step is a cost question" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790649886159139?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Decided: one colour source per mark generates six transparent SVG files (colour, mono, light, dark, wide, stacked) with `scripts/brand-variants.mjs`; `app/public/brand/index.json` is the manifest chips and cards read. Wide and stacked are our own icon + name lockups, never presented as the vendor's wordmark. Later layers in cost order: raster export (free, Playwright), vectorizing raster-only logos (free potrace/vtracer first, paid Vectorizer.AI when quality matters, cost on the ledger), 3D and motion for our own marks only (best-of-3, C-031), official wordmarks and brand kits.
- Status: current. 43 marks × 6 files generated 2026-09-29; the later layers are not automated yet (skill §4b).

## Composer fixes (2026-09-29)

**C-069 · 2026-09-29 02:54 · Modifier keys belong to the browser; the visible cursor follows the caret; a box can be removed**
- Justin: "command v is triggering the voice tool in terminal. the voice tool doesnt seem to work. ... Paste did not paste. There were issues moving the cursor around." ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790650469518959?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)) and "i cant seem to remove a box from the left side." ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790650600637069?thread_ts=1790634517.611669&cid=C0C2YAS5TL5))
- Found: the shortcut handler let Ctrl/Cmd+key inside the composer fall through to the single-key shortcuts, so Cmd+V toggled voice and swallowed the paste. The themed block cursor was always drawn at the end of the text while the browser's caret was hidden, so moving the caret backwards was invisible.
- Decided: Ctrl/Cmd combinations are never shortcuts of ours (Ctrl/Cmd+Z on an empty composer stays the one exception). The themed cursor shows only while the caret is at the end; anywhere else the browser's caret shows. Spell-check is on in the writing pad. Each box row in the sidebar has a remove control (with a confirm); removing a box deletes its lines, sessions, menu, pages, edits and box UI, and keeps its ledger entries (the chain is append-only).
- Queued from the same messages: a formatted page that grows above the writing pad as you type, editable from either side; a top-bar tools tray with the menu, tools and sign-in behind it, draggable back; multi-word phrase chips ("make sure"), tagging "learn" and "tagged"; a small timer and model line per reply (the structured header already shows model, seconds and cost for edit and schedule replies).
- Status: fixes shipped 2026-09-29 (this commit). Queued items: in progress, Justin's session.
