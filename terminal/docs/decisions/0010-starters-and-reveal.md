# 0010 — starters as records; reveal as motion

- Starter prompts are data (`docs/prompts/starters.json`, zod-validated in `shared/src/starters`), not strings in components. Fields: `id, text, verb, expects ('text'|'component'|'page'), reveal, tags`. `matchStarter` matches typed text loosely (case, quotes, punctuation) so the starter's reveal pattern is used even when typed by hand.
- Starters seed the actions vocabulary. Every verb in the list has an action in the registry (`STARTER_ACTIONS`) and a local handler (`app/src/terminal/localCommands.ts`) or a router route.
- Lines carry `component` and `reveal` fields (added to the module's `line` table as strings, empty when unused) so a transcript can replay a composition without re-running the command.
- Reveal is one wrapper (`app/src/ui/Reveal.tsx`) and CSS keyed by `data-reveal`: `clip-path` animation plus a scan line for horizontal, `circle()` for radial, `polygon()` for diagonal, per-character delays for typewriter. Only lines newer than the transcript mount animate, so reloading does not replay every reveal. Reduced motion → 300 ms fade.
- Demo compositions (`app/src/compositions`) are built only from our own primitives and real store data, labelled "demo composition", and say "not wired: model-generated layout". The plan kanban is the real thing. Model-generated compositions from "Draw" are pass 2 (Opus 5).
