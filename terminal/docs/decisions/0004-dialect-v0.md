# 0004 — house dialect v0

The dialect is a closed vocabulary with fixed meanings so a person can write layout in plain text and the shell can be generated from it.

- Regions: `topBar, bottomBar, leftSidebar, rightSidebar, stage`.
- Behaviours: `hidden, collapsed, rail, full, floating`.
- Size classes: `phone, tablet, laptop, desk, wall`, with thresholds in em (0, 40, 64, 90, 140), never pixels.
- Fit words: `fills, hugs, wraps, stacks, sitsBeside, pinsTop, pinsBottom`.
- Spacing: `tight, cozy, roomy, airy`. Type scale: `whisper, body, heading, headline, billboard`. Materials: `flat, paper, glass, metal, glow`.
- Text form: `Left sidebar: rail on laptop, full on desk and wall, hidden on phone.` Unknown words are reported as issues, never guessed; sizes not mentioned default to `full` with a warning.
- `parseDialect(text)` → `{ spec, issues }`; `printDialect(spec)` round-trips. The default shell is written in the text form (`defaultSpecText`) so the text is the source.
- The Shell component reads the spec, measures its container with ResizeObserver (width / root font size → size class) and sets data attributes; CSS uses container queries in rem and a clamp() type scale. Dev mode edits the text live.
- Two sibling dialects reuse the same style: billing (`shared/src/billing`) and themes (`shared/src/themes`).
