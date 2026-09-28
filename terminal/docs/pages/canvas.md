# Page: canvas (`/canvas`)

**Purpose.** The master canvas: every deliverable as a card on one pannable, zoomable surface. Paper is 1 mm thick, images 10 mm.

**Regions.** Top bar as everywhere (title "Master canvas", Canvas icon pressed); stage holds the toolbar, the surface and the detail panel; bottom bar empty; left sidebar as spec.

**Actions** (`CANVAS_ACTIONS`): shell actions plus `canvas.pan` (drag / arrows), `canvas.zoom` (wheel, pinch, + / -), `canvas.fit` (0), `canvas.card.move` (drag / arrows on a focused card), `canvas.card.open`, `canvas.card.add`.

**States.** Fit-all on mount. Selected card shows a detail panel with Open, Full screen (external hrefs) and, for our own pages, an in-place render (shadow root, scripts removed). Load failure shows a one-line note.

**Data.** `card` records from `docs/canvas/cards.json` merged with the store; moves persist per browser now, realtime with SpacetimeDB later.

**i18n keys.** `canvas.*`, `topbar.canvas`.
