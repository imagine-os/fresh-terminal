# State

What is live, what isn't wired, and what's in progress. Snapshot taken 2026-09-29 at about 01:40 UTC (2026-09-28 8:40 PM CDT), updated about 02:10 UTC with the pass 4 push. Update this page when a pass ships; older snapshots are replaced here and kept in the repo changelog.

## Live now

| What | Where | Since |
| --- | --- | --- |
| Fresh Terminal site | https://imagine-os.github.io/fresh-terminal/ | 2026-09-29 00:07 UTC |
| A box | `/box/<id>`; new box in a theme: `/box/new?theme=<id>` | 2026-09-28 |
| Master canvas | https://imagine-os.github.io/fresh-terminal/canvas (press `C`) | 2026-09-28 |
| Plan viewer (kanban, list, timeline) | https://imagine-os.github.io/fresh-terminal/plan (also dev mode, `D`) | 2026-09-28 |
| Library of terminals | https://imagine-os.github.io/fresh-terminal/pages/library.html | 2026-09-29 00:07 UTC |
| Koi pond v2 (pass 4 push) | https://imagine-os.github.io/fresh-terminal/pages/koi.html | 2026-09-29, pass 4 |
| Koi pond v1 | https://imagine-os.github.io/fresh-terminal/pages/koi-v1.html (was `pages/koi.html` until pass 4) | 2026-09-29 00:07 UTC |
| The Canon | https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/canon/README.md, and a card on the master canvas | 2026-09-29, pass 4 |
| Audit and rebuild recommendation | https://imagine-os.github.io/fresh-terminal/pages/audit.html | 2026-09-28 |
| Old themes page | `/pages/themes.html`, now redirects to the library | 2026-09-29 |
| Router | https://fresh-terminal-router.jmassion.workers.dev (Cloudflare Worker) | 2026-09-29 01:13 UTC |
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
- Clerk sign-in. Everyone is anonymous; "save / sign in" is a placeholder.
- Stripe: taking payment for the balance.
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
- freshterminal.ai and api.freshterminal.ai (bought 2026-09-29, C-045; not pointed at anything yet).
- Canvas grouping, long-paper scroll cards, image upload.
- Company OS connection. Import of old repos and data.

## In progress

| Work | Status (2026-09-29 01:40 UTC) |
| --- | --- |
| **Pass 4: self-editing, chips v2, structured replies, koi pond v2, this Canon** | Pushed to `main` 2026-09-29 about 02:10 UTC by Opus 5.5 in one commit. Details: changelog [0004](https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/changelog/0004.md), decisions 0016 and 0017. Live check on the site follows the push. |
| **freshterminal.ai, Cloudflare and Clerk** | Decided 2026-09-29 (C-045 to C-048). Waiting on Justin: add token scopes (Zone DNS Edit, Zone Read, Account D1 Edit, all zones) and create the Clerk app with its two key secrets. Then: app on a Worker at freshterminal.ai, router at api.freshterminal.ai, sign-in, account data in D1, a Connections page. |
| **SpacetimeDB publish** | Proposed 2026-09-29 02:07 UTC (C-050). Waiting on Justin for the `SPACETIMEDB_TOKEN` secret. |
| **Proposals waiting on Justin** | Media in R2 (C-051), streamed browsers (C-052), integration ladder (C-053), recipes (C-054). Not started. |
| **Multiplayer rules** | Decided 2026-09-29 (C-049): no Liveblocks or Colyseus; our own house rules on SpacetimeDB. Not started. |
| **Pass 5: skins and the refine loop** | Next after pass 4. Instant draft, Jev picks the route, best-of-3 rounds with stop rules. |
| **Fresh Terminal company in between-gigs** | Saved to GitHub (b191350). Waiting for a Sites sync to show on between-gigs.com. |
| **This Canon** | Written 2026-09-29; in the repo with the pass 4 push, with a canvas card. Kept current every pass (plan task `canon-current`). |
