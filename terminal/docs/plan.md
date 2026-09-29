# Development plan

Tasks are bound by dependencies, not calendar days. `plan.json` holds the same plan as data (id, title, status, depends_on, model, pass); the in-app PM viewer (dev mode, `D`) shows it as kanban, list and a timeline by dependency depth.

Model routing: **Fable 5.1** for judgment, architecture, shell and shared code; **Opus 5** for building modules and pages; **Sonnet 5** for mechanical passes (screenshots, Spanish fill, QA matrices). This first pass was executed entirely by Fable 5.1; the model column records who *should* own each task in later passes.

## Pass 1 (this pass) — order of operations

1. Verify external facts (SpacetimeDB TypeScript module API and CLI, OpenRouter endpoint/auth/streaming, JEV presence). — Fable 5.1
2. Repo shape: `README.md` + `terminal/` + dotfiles; single package with root script proxies. — Fable 5.1
3. `shared/`: product name constant; layout dialect v0 (types, zod, parser, printer, tests); chip tagger + tests; ledger (sha256, chain, verify, integer money, tests); billing dialect + tests; theme records + dialect + three seeds + tests. — Fable 5.1
4. `module/`: SpacetimeDB tables (box, session, line, presence, route_rule, owner, entry, theme) and reducers; type-checked against `spacetimedb@2.10.1`. — Opus 5
5. `router/`: Hono app, route table with tiers (JEV pending), OpenRouter SSE with `usage.include`, one charge entry per call, Node + Worker entries, tests. — Opus 5
6. `app/`: Shell (five regions from the dialect spec, container queries, fluid type), local store + SpacetimeDB seam, auth seam, composer (grows upward, speech), chips, suggestions, transcript streaming, boxes and `/box/:id`, top bar with shortcuts and balance, dev panel (dialect editor, size readout, PM viewer, ledger + verify, theme picker, actions, not-wired list), EN/ES, doodles, themes. — Fable 5.1 (shell/architecture), Opus 5 (pages)
7. Hosting: GitHub Pages workflow with SPA fallback; CI workflow. — Fable 5.1
8. `pnpm check:responsive` at 360/390/768/1280/1920/2560/3840 with screenshots. — Sonnet 5
9. Starters as records, `Reveal` CRT-beam motion, demo compositions for Draw. — Fable 5.1 / Opus 5
10. Port the audit and themes pages under `/pages/`, master canvas with card records. — Fable 5.1
11. Docs in the same push. — Fable 5.1

## Pass 2 — after publishing the module

- Publish the SpacetimeDB module, generate bindings, implement `SpacetimeStore` (Opus 5). Depends on: module, store seam.
- Wire Clerk into `AuthProvider`; Clerk OIDC tokens as SpacetimeDB identity (Opus 5). Depends on: auth seam, published module.
- Stripe settlement for the ledger balance (Opus 5). Depends on: ledger, Clerk.
- Shared chain published from the module; server-side hash recompute in `append_entry` (Opus 5).
- Model-based chip tagger through the JEV tier once a model id exists (Opus 5).
- Themes: camera reflection (opt-in, never uploaded) and tilt window on phone (Opus 5); 13 more themes from the themes page (Sonnet 5).
- Motion: interactive illustration runtime. Schema first (Fable 5.1): illustrations as text records, SVG shapes + named parameters + a state machine written in the dialect (states, transitions on pointer/tilt/time/voice/data, easing). Then a small runtime (Opus 5) that interpolates parameters and drives the SVG; no frame data. First uses: the empty-state doodle hints and the Glass Window specular highlight.
- Canvas layout tools: grouping, long-paper scroll cards, image upload (Opus 5).
- Model-generated compositions from Draw: the router returns a component spec built from our primitives (Opus 5).
- Canvas renders a live document model; presence of other people in a box (Opus 5).
- Spanish fill pass; QA matrix inputs x sizes x themes (Sonnet 5).

## Pass 3 — polish and new inputs

- Voice controller over the actions registry; TV remote / gamepad d-pad navigation (Opus 5).
- Repeated polish passes on legibility at 10 feet and up close on 4K.

## Pass 4 — the terminal edits itself (shipped 2026-09-29, Opus 5.5)

Model note, 2026-09-29: pass 4 onward runs on **Opus 5.5** at Justin's request (Canon C-026b). Routing inside the product is separate: chat on Haiku 4.5, edit escalation and retries on Sonnet 5.5, chips on Gemini 2.5 Flash-Lite, decisions on Jev.

1. UI as data: menu tree, pages from blocks, per-box layout/theme/style, glossary (`ui-as-data`).
2. Op language with inverses and undo (`op-language`).
3. Router tool calling with dry-run validation, one retry and escalation; the own-key path shares the turn (`router-tool-calls`, `own-key-tools`).
4. Menu tree, pages, chips v2, glossary, chip popover, super-CLI replies (`nav-tree`, `page-blocks`, `chips-v2`, `glossary`, `chip-popover`, `super-cli-replies`).
5. Koi pond v2, the Canon, the wiki (`koi-v2`, `canon`, `wiki`).
6. Standing: keep the Canon and the wiki current every pass (`canon-current`).

## Pass 5 — skins, materials and the refine loop (queued; starts after pass 4 is live)

`skin-apply-op` → `draft-material` → `refine-loop` → `refine-ui`; `pond-ops` (wire `window.pond` to ops); `koi-realism`. See prompt 0013.
