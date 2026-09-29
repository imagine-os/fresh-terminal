# 0011 — pages ship on GitHub Pages; everything lands on the master canvas

- Deliverable pages are static HTML under `terminal/app/public/pages/` so Vite copies them and they deploy with the app to GitHub Pages under `<base>/pages/`. They stay self-contained (inline CSS, Google Fonts only) and use relative links so the Pages sub-path works.
- The themes page links each card to the terminal at `../box/new?theme=<id>`. Theme ids are slugs of the card names; `resolveThemeId` in `shared/src/themes/seed.ts` maps the 13 unbuilt themes to the closest built one and the app toasts "not built yet" (the not-wired pattern).
- The master canvas (`/canvas`) is a record-driven surface. `card` = `{id, title, kind: page|doc|image|box, href, x, y, w, h, thickness_mm, rotation, created_at, updated_at}`; defaults: paper (page/doc/box) 1 mm, image 10 mm. Seed in `docs/canvas/cards.json` (append-only; `pnpm -C terminal canvas:add` appends), merged with positions persisted in the store; the module has a `card` table with `upsert_card` and `move_card` for realtime once connected.
- Thickness is physical: two layered box-shadows scaled by `--t` (thickness in mm) inside the zoomed world, so 1 mm reads as a sheet edge and 10 mm as a mounted print, and zoom scales them naturally.
- Inputs: drag pans and moves cards, but nothing is drag-only. Arrow keys pan the focused surface and move a focused card (Shift for bigger steps); `+`/`-`/`0` zoom and fit; toolbar buttons are 44 px; wheel and two-pointer pinch zoom.
- Opening a card: select shows a detail panel; our own same-origin pages render inside a shadow root with scripts removed (no iframe); "Full screen" opens the real page; `route:/plan` opens the in-app plan; `box:first` opens the visitor's first box.
- Rule from here: every new deliverable (page, doc, image, box) is added as a card in the same push.
- Pass 2 (Opus 5): grouping, long-paper scroll cards, image upload, live cursors on the canvas.

- 2026-09-29: card "Koi Pond" added (`pages/koi.html`); `THEME_SURFACE_PAGES` in `shared/src/themes/seed.ts` sends `/box/new?theme=koi-pond` to the page until pass 3 makes it an in-app theme.
