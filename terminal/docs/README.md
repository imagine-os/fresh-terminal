# Fresh Terminal docs — start here

Everything about the product lives in this folder. Numbered files are append-only: add the next number, never rewrite an old one.

| where | what |
| --- | --- |
| [plan.md](plan.md) / [plan.json](plan.json) | development plan, order of operations, model per task. The dev-mode PM viewer reads plan.json. |
| [prompts/](prompts/) | Justin's prompts verbatim, with the reply summary once known; `starters.json` seeds the suggestion strip and the verb vocabulary |
| [decisions/](decisions/) | one decision per file: repo shape, SpacetimeDB, router, dialect, homepage, hosting, auth, ledger, themes |
| [changelog/](changelog/) | what shipped per pass and what is not wired yet |
| [reference/surfaces.md](reference/surfaces.md) | MCP / WebMCP / CLI / API abilities as of this pass |
| [pages/](pages/) | per-page spec: purpose, regions, actions, states, i18n keys |
| [canvas/cards.json](canvas/cards.json) | master canvas seed: every deliverable is a card (append with `pnpm -C terminal canvas:add`) |
| [qa/](qa/) | responsive-check output: screenshots, `responsive-latest.md`, `ledger-sample.json` |

Code map (all under `terminal/`):

- `app/` Vite + React 19 + TypeScript + Tailwind 4. `src/shell` (five regions), `src/terminal` (composer, chips, transcript, doodles), `src/dev` (dev panel, PM viewer), `src/store` (local fallback + SpacetimeDB seam), `src/auth` (anonymous now, Clerk stub), `src/actions/registry.ts`, `src/i18n`.
- `shared/` the dialects and core types: layout dialect v0, billing dialect, theme records, chip tagger, ledger (integer micro-dollars, hash chain, sha256), product name constant.
- `router/` Hono router: route table, OpenRouter streaming, one charge entry per call. Node and Cloudflare Worker entries.
- `module/` SpacetimeDB TypeScript module: tables and reducers. Type-checked, not yet published.
- `scripts/` responsive check, SPA fallback, chain verifier, ledger sample.

Rules that hold across passes: one folder and one instruction at the repo root; push to `main`; git is the record, not the workflow; nothing pretends to work (placeholders say "not wired yet"); money is integers; unknown dialect words are reported, never guessed.
