# Page: koi pond (`/pages/koi.html`, v3)

**Purpose.** A photographic koi pond start page. It opens looking straight down at the water like a table top, then tilts up to look forward across the pond into the distance. Justin: "the difference between staring at the top of a desk or table top vs looking foward into the distance" (prompt 0018).

**Versions.** v3 `pages/koi.html` (current, 2026-09-29). Archived, with an "archived version" label: v2 `pages/koi-v2.html`, v1 `pages/koi-v1.html`. Source for v3: `terminal/pages-src/koi3/` (`npm i && npm run build`). Licences: `pages/koi-LICENSES.md`.

**Regions.** Full-bleed WebGL canvas. Top left: the Top-down / Forward switch and a hint that fades. Top right: fps, light, quality, calm, EN/ES, dev, licenses, v2, v1 (under ⋯ on phones). Right edge on wide screens: tilt slider. Bottom: etched lines and the composer. Cards ride on the three giant lily pads.

**Actions** (declared in the page as `#page-actions`): `koi.view.top`, `koi.view.forward` (`T` toggles), `koi.tilt` (drag, wheel, ↑/↓, slider), `koi.turn` (←/→, horizontal drag), `koi.feed` (tap the water), `koi.light`, `koi.quality`, `koi.calm`, `koi.lang`, `koi.pad.add`, `koi.path.add` (dev panel or composer: "add a square pad on the left", "add stones"), `koi.inbox.open` (not wired yet: toast). Composer phrases also switch views ("tilt up", "top down", "al frente", "desde arriba") and light ("make it dusk").

**States.** Loading veil until the first frame. Auto tilt ~1.5 s after the first frame unless the viewer acts first or prefers reduced motion. No WebGL: a still photo of the garden with a one-line note. Quality auto picks low on touch or small screens.

**Data.** Pads and paths live in the page (`window.pond.list()` / `applyJSON()`); not stored or synced yet.

**URL.** `?view=forward`, `?tilt=<8–90>`, `?az=<deg>`, `?q=low|high`, `?tod=day|dusk|night|dawn`, `?look=painted` (rejected candidate B, kept for comparison).

**i18n.** English and Spanish strings in `src/main.js` (`STR`), toggled by the EN/ES pill (kept per browser).
