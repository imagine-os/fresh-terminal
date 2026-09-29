# Page: canvas (`/canvas`, v2)

**Purpose.** The master canvas: every page and doc as a paper sheet on one pannable, zoomable desk, grouped by section. Paper is 1 mm thick, images 10 mm (a mounted print), drawn as the sheet's edge and shadow.

**Versions.** v2 `/canvas` (current, 2026-09-29, decision 0022). Archived: v1 at `/canvas?v=1` (labelled "Archived version", links back). Rejected looks kept for comparison: `/canvas?look=paper`, `/canvas?look=drafting`.

**Regions.** Top bar as everywhere (breadcrumb "Master canvas"; the toolbar has no second title). Stage: toolbar (−, zoom %, +, Fit, Minimap, Tidy up when something moved, Add card, v1), the desk surface, minimap bottom right, detail panel on the right when a card is selected. Square corners throughout.

**Actions** (`CANVAS_ACTIONS`): `canvas.pan` (drag the desk, two-finger scroll, arrows), `canvas.zoom` (pinch, Ctrl/⌘+wheel, + / −), `canvas.zoom.reset` (1), `canvas.fit` (0), `canvas.minimap`, `canvas.card.select` (click, Enter), `canvas.card.open` (double-click, Enter twice, Open), `canvas.card.move` (mouse or pen drag, Alt+arrows), `canvas.card.add`, `canvas.tidy`, `canvas.v1`. Touch drags always pan (no accidental moves). Tab moves through cards and pans them into view.

**States.** Opens fitted to the whole desk (phones: one column at full width, starting at the top). The arrangement re-fits when the window changes shape until you pan or zoom yourself. Selected card: detail panel with Open, Full screen (our pages and external links), Close and a live preview (sandboxed iframe of the real page; external docs and stages show the screenshot). Added cards show "No screenshot yet" (not wired until `pnpm canvas:thumbs` runs).

**Data.** `card` records from `docs/canvas/cards.json` merged with the store; v2 reads `section` (terminal, worlds, docs, archive; anything else lands in "Added"), `thumb` and `archived`, and lays cards out with `bestLayout()` (`shared/src/canvas/layout.ts`). Moves are offsets from the laid-out slot, kept per browser (`fresh-terminal.canvas2.offsets`). Screenshots: `pnpm -C terminal canvas:thumbs [--only id,id]` after `pnpm build:app`.

**Legibility.** Titles and section labels are counter-scaled with zoom so they stay readable when zoomed out; toolbar, minimap and panel scale up from 1900 px wide (×1.3, ×1.65, ×2.1 at 3400 px) for 10-foot viewing.

**Fonts.** Section labels use Caveat 600 (SIL OFL 1.1, self-hosted at `app/public/fonts/`, licence alongside).

**i18n keys.** `canvas.*` (new in v2: `canvas.section.*`, `canvas.minimap`, `canvas.tidy`, `canvas.zoomReset`, `canvas.live`, `canvas.screenshot`, `canvas.noThumb*`, `canvas.archived*`, `canvas.v1Hint`, `canvas.surfaceHelp2`), `topbar.canvas`.
