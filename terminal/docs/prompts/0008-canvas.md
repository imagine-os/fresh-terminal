# 0008 — GitHub Pages over artifacts; the master canvas

Source: Justin, same thread, 2026-09-28. Verbatim:

> id rather you give me a github page than a claude artifact. Instead of copy prompt only, we should be able to open the terminal full screen from the page you just made. Anyways, make sure that every artifact/page like this is neatly organized. This should exist on a canvas. like a card or long piece of paper. that paper is 1mm thick by default. and images can be 10mm thick by default. now as you make new things, you can put them on the master canvas, which i can organize better as we go

## Reply summary

The two published pages now ship in the repo and on GitHub Pages as `pages/audit.html` and `pages/themes.html` (self-contained, relative links). Every theme card on the themes page has "Open full screen" → `/box/new?theme=<id>`; the three built themes open directly, the other thirteen open the closest built theme with a "not built yet" toast. `/canvas` is the master canvas: pannable and zoomable (drag, wheel/pinch, arrow keys, +/-, 0 = fit all, 44 px buttons), cards are records (`card` table in the module, seeded from `docs/canvas/cards.json`, positions persist in the store), paper 1 mm and images 10 mm by default rendered as a physical edge. Five seed cards: Audit & recommendation, Start-page themes, Plan (PM viewer), Docs start here, First box. Cards open in place (our own pages render in a shadow root, no iframe) with a full-screen affordance. `C` opens the canvas; `pnpm -C terminal canvas:add --title --href --kind` appends a card. Decision: `decisions/0011-master-canvas.md`. Pass 2: grouping, long-paper scroll cards, image upload (Opus 5).
