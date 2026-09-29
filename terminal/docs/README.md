# Fresh Terminal wiki — start here

Everything about Fresh Terminal is written down in this folder, for people and for agents alike. Plain sentences, one fact per line, every fact dated. Last updated 2026-09-29 (sales site pass, Opus 5.5).

- Read it rendered: https://imagine-os.github.io/fresh-terminal/wiki/
- Read it on GitHub: https://github.com/imagine-os/fresh-terminal/tree/main/terminal/docs
- For AI readers: [llms.txt](llms.txt) lists every page with a one-line summary, and every page is plain Markdown.

**The rule** (Justin, 2026-09-29 02:11 UTC, [message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647881668439?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)): every pass updates this wiki and the Canon in the same commit. Numbered files (`prompts/`, `decisions/`, `changelog/`) are append-only: add the next number, never rewrite an old one. The Canon summarizes across them; superseded lines there are kept and marked, never deleted.

## 1. Canon: what is true now, and how it got there

Read this first.

| Page | What it says | Updated |
| --- | --- | --- |
| [canon/README.md](canon/README.md) | The Canon's own index, the vision in one paragraph, and the rules for keeping it true | 2026-09-29 |
| [canon/vision.md](canon/vision.md) | What we're building and why, in Justin's words | 2026-09-29 |
| [canon/decisions.md](canon/decisions.md) | Every decision (C-001 to C-100) with date, reason and status, reversals marked, proposals labelled | 2026-09-29 |
| [canon/prompts.md](canon/prompts.md) | All 94 of Justin's messages, word for word, with what happened after each | 2026-09-29 |
| [canon/state.md](canon/state.md) | What is live, what is not wired yet, what is in progress | 2026-09-29 |
| [canon/open-questions.md](canon/open-questions.md) | What is still undecided or waiting on Justin | 2026-09-29 |
| [canon/glossary.md](canon/glossary.md) | The house words: box, canvas, chip, dialect, Jev, recipe, replay, step, wiki and more | 2026-09-29 |
| [canon/people-and-access.md](canon/people-and-access.md) | Who is who, which repos each route can reach, secret names (never values) | 2026-09-29 |

## 2. Plan

| Page | What it says | Updated |
| --- | --- | --- |
| [plan/README.md](plan/README.md) | Our build plan by pass, order of operations, model per task (moved from `plan.md` to `docs/plan/`, C-095; not in the product UI) | 2026-09-29 |
| [plan/plan.json](plan/plan.json) | The same plan as data (id, title, status, depends_on, model, pass); the hub's Plan section and the dev viewer at `/plan` read it (people's own activity is at `/actions`) | 2026-09-29 |
| [voice-experience.md](voice-experience.md) | Terminal-talk: the voice experience we are building toward, as a 60-second demo script, the rules, and how it is built | 2026-09-29 |

## 3. Prompts: Justin's build prompts, verbatim

| Page | What it says | Updated |
| --- | --- | --- |
| [prompts/README.md](prompts/README.md) | How prompt files and `starters.json` work | 2026-09-28 |
| [prompts/0001-first-build.md](prompts/0001-first-build.md) | The first build: terminal, boxes, SpacetimeDB, "Game 1st" | 2026-09-28 |
| [prompts/0002-homepage.md](prompts/0002-homepage.md) | Homepage in the Excalidraw pattern | 2026-09-28 |
| [prompts/0003-auth-hosting.md](prompts/0003-auth-hosting.md) | Auth and hosting | 2026-09-28 |
| [prompts/0004-billing.md](prompts/0004-billing.md) | Pass-through billing and the simplest chain | 2026-09-28 |
| [prompts/0005-themes.md](prompts/0005-themes.md) | Themes for the starting page | 2026-09-28 |
| [prompts/0006-motion.md](prompts/0006-motion.md) | Motion: interactive illustration | 2026-09-28 |
| [prompts/0007-starters.md](prompts/0007-starters.md) | Sample starting prompts and the CRT reveal | 2026-09-28 |
| [prompts/0008-canvas.md](prompts/0008-canvas.md) | GitHub Pages over artifacts; the master canvas | 2026-09-28 |
| [prompts/0009-two-ways-to-pay.md](prompts/0009-two-ways-to-pay.md) | Two ways to pay | 2026-09-29 |
| [prompts/0010-voice-and-405.md](prompts/0010-voice-and-405.md) | Realtime voice, live transcript, and the 405 | 2026-09-29 |
| [prompts/0011-self-editing.md](prompts/0011-self-editing.md) | "Fail: if it can't edit itself than its not good enough" | 2026-09-29 |
| [prompts/0012-chips-and-structured-replies.md](prompts/0012-chips-and-structured-replies.md) | Clickable chips, Hoy the brand versus hoy the day, super-CLI replies | 2026-09-29 |
| [prompts/0013-skins-and-materials.md](prompts/0013-skins-and-materials.md) | Skins, materials and the best-of-3 refine loop (pass 5, queued) | 2026-09-29 |
| [prompts/0014-koi-v2.md](prompts/0014-koi-v2.md) | Koi pond v2: any-shape lily pads, stone paths, tilt, bridge and sky | 2026-09-29 |
| [prompts/0015-wiki.md](prompts/0015-wiki.md) | Keep the documentation wiki current, as a rule | 2026-09-29 |
| [prompts/0016-playback.md](prompts/0016-playback.md) | A playback scrubber for every step of a session; "evolve as we grow" | 2026-09-29 |
| [prompts/0017-domain-clerk-d1.md](prompts/0017-domain-clerk-d1.md) | "i already did cloudflare clerk": freshterminal.ai, sign-in and D1 unblocked | 2026-09-29 |
| [prompts/0018-koi-v3-canvas-v2.md](prompts/0018-koi-v3-canvas-v2.md) | "koi pond 2 came out terrible" and "The canvas you made is awful": koi v3 and canvas v2 | 2026-09-29 |
| [prompts/0019-signin-style.md](prompts/0019-signin-style.md) | "signin system should match style": Clerk in our look | 2026-09-29 |

## 4. Decisions: one per file

| Page | What it says | Updated |
| --- | --- | --- |
| [decisions/0001-repo-shape.md](decisions/0001-repo-shape.md) | One folder, one instruction at the root | 2026-09-28 |
| [decisions/0002-spacetimedb.md](decisions/0002-spacetimedb.md) | SpacetimeDB for the live layer | 2026-09-28 |
| [decisions/0003-openrouter-router.md](decisions/0003-openrouter-router.md) | One router holding one OpenRouter key | 2026-09-28 |
| [decisions/0004-dialect-v0.md](decisions/0004-dialect-v0.md) | The plain-language house dialect, v0 | 2026-09-28 |
| [decisions/0005-homepage.md](decisions/0005-homepage.md) | Homepage follows the Excalidraw pattern | 2026-09-28 |
| [decisions/0006-hosting.md](decisions/0006-hosting.md) | GitHub Pages plus Actions; a Worker-ready router | 2026-09-28 |
| [decisions/0007-auth.md](decisions/0007-auth.md) | Clerk behind a seam | 2026-09-28 |
| [decisions/0008-ledger.md](decisions/0008-ledger.md) | A ledger at the core; the simplest chain | 2026-09-28 |
| [decisions/0009-themes.md](decisions/0009-themes.md) | Themes as records in the dialect | 2026-09-28 |
| [decisions/0010-starters-and-reveal.md](decisions/0010-starters-and-reveal.md) | Starters as records; reveal as motion | 2026-09-28 |
| [decisions/0011-master-canvas.md](decisions/0011-master-canvas.md) | Pages ship on GitHub Pages; everything lands on the master canvas | 2026-09-29 |
| [decisions/0012-two-ways-to-pay.md](decisions/0012-two-ways-to-pay.md) | Our key with pass-through cost, or your own key in the browser | 2026-09-29 |
| [decisions/0013-model-tiers.md](decisions/0013-model-tiers.md) | Model tiers, checked against OpenRouter's model list | 2026-09-29 |
| [decisions/0014-voice.md](decisions/0014-voice.md) | Realtime voice behind a provider seam | 2026-09-29 |
| [decisions/0015-router-deploy.md](decisions/0015-router-deploy.md) | Router deploy and the "no router" state | 2026-09-29 |
| [decisions/0016-self-editing.md](decisions/0016-self-editing.md) | The interface is data, changed only by undoable ops | 2026-09-29 |
| [decisions/0017-chips-and-structured-replies.md](decisions/0017-chips-and-structured-replies.md) | Chip types you can set, a glossary per box, structured replies | 2026-09-29 |
| [decisions/0018-skins-and-refine.md](decisions/0018-skins-and-refine.md) | Skins as records and the best-of-3 refine loop with its stop rules | 2026-09-29 |
| [decisions/0019-playback.md](decisions/0019-playback.md) | Every step is a saved event with parents; replay first, branches and merges later | 2026-09-29 |
| [decisions/0020-domain-clerk-d1.md](decisions/0020-domain-clerk-d1.md) | freshterminal.ai on Workers, Clerk anonymous-first, accounts, boxes and ledger mirror in D1 | 2026-09-29 |
| [decisions/0021-free-credits.md](decisions/0021-free-credits.md) | Free credits enforced by the router: grants, soft prompts, abuse limits, daily cap, cost estimates | 2026-09-29 |
| [decisions/0022-koi-v3-and-canvas-v2.md](decisions/0022-koi-v3-and-canvas-v2.md) | Koi pond v3 (top-down, then tilt up; photographic) and canvas v2 (paper sheets, sections, minimap): what was wrong, what was chosen and why | 2026-09-29 |
| [decisions/0023-signin-style.md](decisions/0023-signin-style.md) | Clerk sign-in themed from the active theme: square, our fonts, accent button, no shadow, 44px, focus; what stays (Clerk branding, dev notice) | 2026-09-29 |
| [decisions/0025-sales-site.md](decisions/0025-sales-site.md) | The sales site (/about, /pricing, /faq): what Omarchy taught, best-of-3 picks, pricing as built, what is not wired, share cards, costs | 2026-09-29 |
| [decisions/0024-billing-friend-credits-hub.md](decisions/0024-billing-friend-credits-hub.md) | What Clerk Billing can and cannot do (sources), the $5 pass-through threshold, Stripe Checkout top-ups (proposed), friend credits and invite codes, the hub at /hub, costs | 2026-09-29 |

## 5. Changelog: what shipped per pass

| Page | What it says | Updated |
| --- | --- | --- |
| [changelog/0001.md](changelog/0001.md) | Pass 1: terminal, shell, dialect, router, ledger, themes, canvas | 2026-09-28 |
| [changelog/0002.md](changelog/0002.md) | Pass 2: two ways to pay, Jev routing, tagger tier, library, koi pond v1 | 2026-09-29 |
| [changelog/0003.md](changelog/0003.md) | Pass 3: voice with live transcript, router health, router live on Cloudflare | 2026-09-29 |
| [changelog/0004.md](changelog/0004.md) | Pass 4: the terminal edits itself, chips v2, structured replies, koi pond v2, the Canon, this wiki | 2026-09-29 |
| [changelog/0005.md](changelog/0005.md) | Pass 5: skins, the material library and the refine loop, with live results | 2026-09-29 |
| [changelog/0006.md](changelog/0006.md) | Replay: a playback scrubber over every step of a session; the tagline | 2026-09-29 |
| [changelog/0007.md](changelog/0007.md) | freshterminal.ai, api.freshterminal.ai, Clerk sign-in and D1 sync, with the live check | 2026-09-29 |
| [changelog/0008.md](changelog/0008.md) | Free credits enforced by the router, with the live check | 2026-09-29 |
| [changelog/0011.md](changelog/0011.md) | Daily caps for signed-in free usage ($1 per account, $10 across accounts) | 2026-09-29 |
| [changelog/0009.md](changelog/0009.md) | Product Hunt strategy page (proposed launch plan, C-077) | 2026-09-29 |
| [changelog/0010.md](changelog/0010.md) | Readable text over photo and material skins: sampled scrim, AA text, neutral small text | 2026-09-29 |
| [changelog/0012.md](changelog/0012.md) | Koi pond v3 and canvas v2 redo, best-of-3 rounds, before/after screenshots, live check | 2026-09-29 |
| [changelog/0013.md](changelog/0013.md) | The sign-in matches the theme (Clerk appearance), before/after at 390, 1280, 3840 | 2026-09-29 |
| [changelog/0016.md](changelog/0016.md) | The sales site at /about, /pricing and /faq, share cards on every public page, our own brand mark, with the live check | 2026-09-29 |
| [changelog/0014.md](changelog/0014.md) | The $5 pass-through gate, friend credits and invite codes, the hub at freshterminal.ai/hub, with the live check | 2026-09-29 |
| [changelog/0015.md](changelog/0015.md) | Actions: model and cost from the ledger, filters by status, stage, model and words, cost sort, timeline arrows, typed undo; our plan moved to `docs/plan/` (C-095) | 2026-09-29 |

## 6. Reference

| Page | What it says | Updated |
| --- | --- | --- |
| [reference/surfaces.md](reference/surfaces.md) | Every surface an agent can use: WebMCP, router API (incl. `/skin/*`, `/me`, `/sync/*`), ops as tools, `refine()`, `window.pond`, D1, SpacetimeDB, CLI, MCP, deploy workflows | 2026-09-29 |
| [pages/landing.md](pages/landing.md) | Page spec: landing (`/`) | 2026-09-29 |
| [pages/box.md](pages/box.md) | Page spec: a box (`/box/:id`), with pass 4's menu, edits and chips | 2026-09-29 |
| [pages/canvas.md](pages/canvas.md) | Page spec: the master canvas v2 (`/canvas`; v1 at `?v=1`) | 2026-09-29 |
| [pages/koi.md](pages/koi.md) | Page spec: koi pond v3 (`/pages/koi.html`): views, controls, URL options, versions | 2026-09-29 |
| [pages/actions.md](pages/actions.md) | Page doc: Actions (`/actions`): rows, statuses, model and cost from the ledger, filters, sort, views, the resizable timeline column, typed undo | 2026-09-29 |
| [pages/tags.md](pages/tags.md) | Page doc: Tags (`/tags`): every tag the person typed as a graph (default), table, list, board and timeline; filters, sort, graph options | 2026-09-29 |
| [pages/sales.md](pages/sales.md) | Page doc: the sales pages (/about, /pricing, /faq): sections, pricing, actions, languages, share tags, how to change them | 2026-09-29 |
| [pages/hub.md](pages/hub.md) | Page doc: the hub (`/hub`): who can see it, how the server checks, sections, data, actions, local preview | 2026-09-29 |
| [pages/producthunt.md](pages/producthunt.md) | Page doc: the Product Hunt strategy (`/pages/producthunt.html`): the call, pitch pick, readiness, costs; proposed | 2026-09-29 |
| [brand/registry.md](brand/registry.md) | Every brand mark in the repo: file, source, licence, date checked; what is still missing | 2026-09-29 |
| [qa/responsive-latest.md](qa/responsive-latest.md) | The latest responsive check: 28 pages and widths (landing, box, canvas, replay), 360 to 3840 | 2026-09-29 |
| [qa/skins/](qa/skins/) | Pass 5 live skin runs (before and after), the refine block at 390 and 1280, and three library "Open terminal" boxes | 2026-09-29 |

Data files: [canvas/cards.json](canvas/cards.json) (master canvas seed; add with `pnpm -C terminal canvas:add`), [prompts/starters.json](prompts/starters.json) (starter prompts), `qa/*.png` (screenshots), [qa/ledger-sample.json](qa/ledger-sample.json).

## Code map (all under `terminal/`)

- `app/` Vite + React 19 + TypeScript + Tailwind 4. `src/shell` (five regions, menu tree), `src/terminal` (composer, chips, chip popover, transcript, structured replies), `src/pages` (pages from blocks), `src/dev` (dev panel, PM viewer), `src/playback` (replay scrubber), `src/store` (local store + SpacetimeDB seam), `src/auth` (anonymous identity; Clerk `AccountProvider` when a key is built in), `src/sync` (cloud sync to D1 for signed-in people), `src/actions/registry.ts`, `src/i18n`.
- `shared/` the dialects and core types: layout dialect v0 (with `mergeDialect`), billing dialect, theme records, chip tagger and merge, ledger (integer micro-dollars, hash chain, sha256), product name constant. Pass 4: `ui/` (menu, pages, box UI, glossary), `ops/` (op schemas, engine, tool definitions), `timeline/` (steps with parent ids, state at any step, export), `reply/` (structured reply blocks), `agent/` (OpenRouter streaming, snapshot, prompt, `runTurn`).
- `router/` Hono router: route table, Jev routing, tool calling, one charge entry per turn. Node and Cloudflare Worker entries. Clerk session checks (`src/auth.ts`), D1 access (`src/d1.ts`), migrations in `router/migrations/`.
- `site/` the Worker that serves the built app on freshterminal.ai (www → apex, SPA fallback, cache headers).
- `module/` SpacetimeDB TypeScript module: tables and reducers. Type-checked, not yet published.
- `scripts/` responsive check, SPA fallback, wiki build, chain verifier, ledger sample, canvas card adder.

Rules that hold across passes: the interface changes only through ops (undoable, ledgered); one folder and one instruction at the repo root; push to `main`; git is the record, not the workflow; nothing pretends to work (placeholders say "not wired yet"); money is integers; unknown dialect words are reported, never guessed; the wiki and the Canon are updated in the same commit as the work.
