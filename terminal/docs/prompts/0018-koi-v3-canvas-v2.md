# 0018 — koi pond v3 (top-down, then tilt up) and canvas v2

Source: Justin, Slack, 2026-09-29. Canon prompts 60 and 61. Verbatim:

### Canvas — 02:45:16 UTC ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790649916347129?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), ts 1790649916.347129)

> The canvas you made is awful

### Koi pond — 02:45:55 UTC ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790649955559429?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), ts 1790649955.559429)

> koi pond 2 came out terrible. And it was supposed to start facing down, then reveal that it can tilt up.   For me this is the difference between staring at the top of a desk or table top vs looking foward into the distance

Context carried from the earlier briefs (prompts 0008 and 0014): a super realistic koi pond terminal, a library is allowed, a tilting camera, a bridge, sky, lily pads of any shape that hold content, stone paths, free lightweight assets with licences; a master canvas where every page is a card, pages are 1 mm paper and images 10 mm, an Excalidraw-like feel, zoom, every page laid out. Relayed by the coordinator during the work: square corners to start, less redundant text (no product name in captions), "tags" not "chips", "free usage" not "our key", "stage" not "box" in what people read.

## Reply summary

- **Koi pond v3** at `pages/koi.html` (v2 moved to `pages/koi-v2.html`, v1 stays at `pages/koi-v1.html`, both labelled "archived version"). It opens looking straight down at the water like a table top, with three content cards on giant lily pads you can read as a desk, then about 1.5 s later (or on the first scroll, drag, arrow key or the Forward button) tilts up to eye level across the pond to a vermilion bridge, the far bank and a photographed Chinese garden with sky. Reduced motion: no automatic tilt; the Top-down / Forward switch jumps. Photographic assets are CC0 from Poly Haven; three.js is MIT. Decision 0022, Canon C-082.
- **Canvas v2** at `/canvas` (v1 kept at `/canvas?v=1`, labelled archived): paper sheets with real screenshots of every page, grouped into hand-drawn sections (Terminal, Worlds, Docs, Archive), a dot grid that moves with pan and zoom, minimap, fit, 100%, trackpad/mouse/touch/keyboard pan-zoom, a live preview of the selected page, and titles that stay legible when zoomed out and across a room at 3840. Decision 0022, Canon C-083.
- Both were chosen by a best-of-3: screenshots of three looks each, judged against the brief; the rejected looks stay reachable for comparison (`pages/koi.html?look=painted`, `/canvas?look=paper`, `/canvas?look=drafting`). Details, before/after screenshots and honest shortcomings: changelog 0012.
