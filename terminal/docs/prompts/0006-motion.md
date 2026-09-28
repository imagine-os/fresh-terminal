# 0006 — motion: interactive illustration (plan only in pass 1)

Source: Justin, same thread, 2026-09-28. Verbatim:

> interactive illustration. Its state machines and tiny files are good, Thats what I want! Maybe we make our own. I dont care about their editor i care about what it does and how tiny and multi device it figured out how to do things

## Reply summary

Added to the plan as a pass-2 module, no code in pass 1: illustrations as text records (SVG shapes + named parameters + a state machine written in the dialect: states, transitions on pointer/tilt/time/voice/data inputs, easing). A small runtime interpolates parameters and drives the SVG; no frame data. Schema by Fable 5.1, runtime by Opus 5. First uses: the empty-state doodle hints and the Glass Window specular highlight. Tasks `motion-schema` and `motion-runtime` in `plan.json`.
