# 0007 — sample starting prompts and the CRT reveal

Source: Justin, same thread, 2026-09-28. Verbatim:

> lets start keeping some sample starting prompts. For instance "Draw" a ShadCN Dashboard. I would want it to look like the CRT laser is drawing it. Either horizontal. Or in other cool patterns.

## Reply summary

Starters are records in `terminal/docs/prompts/starters.json` (14 seeded, append-only) read through `shared/src/starters`; the suggestion strip shows them filtered by what exists. A `Reveal` wrapper paints any block in with a CRT-beam effect (horizontal sweep with a bright scan line, radial iris, diagonal wipe, or typewriter per character); duration scales with height, capped at 1.2 s, and becomes a soft fade under reduced motion. "Draw a shadcn dashboard" and "Draw a login screen" render demo compositions from our primitives, labelled "demo composition" and marked not wired to the model; "Draw a kanban of the plan" renders the real `plan.json` kanban and is wired. Other starters run locally: switch theme, set a dialect line, verify the chain, speak, translate the interface, and "charge me nothing" replies with what it would do (not wired). Decision: `decisions/0010-starters-and-reveal.md`. Pass-2 task: model-generated compositions from Draw (Opus 5).
