---
name: logos-and-icons
description: Find, verify, store and (when nothing good exists) generate logos and icons for Fresh Terminal pages, cards, chips and the FreshStack. Use whenever a brand mark, product logo, app icon, favicon, or glyph is needed, or when a page shows a placeholder where a mark should be. Covers sourcing from official channels, licence checks, light/dark variants, sizing, the asset registry, and the quality bar ("snappiest library on the internet").
---

# Logos and icons

The goal: any mark in Fresh Terminal is the real one, sharp at every size, correct in light and dark, licensed, and recorded. When the real one cannot be used, we make a better original and say so.

## 1. Decide what kind of mark this is

| Kind | Examples | Source order |
| --- | --- | --- |
| Third-party brand logo | Cloudflare, GitHub, LiveKit, OpenRouter | official brand page → official repo → Simple Icons (SVG, CC0) → stop |
| Product icon we own | Fresh Terminal, Playset, a box, a card | `terminal/app/public/brand/` → generate |
| UI glyph | search, key, mic, undo | Lucide (ISC) → Phosphor (MIT) → generate |
| Thumbnail / poster art | a theme preview, a page card | screenshot the real thing at the right size → generate |

Never draw a third-party logo by hand and never ask a model to "generate the X logo". Third-party marks are copied from the owner, or not used.

## 2. Source, in this order, and stop at the first hit

1. **Official brand or press page.** Search `<brand> brand assets`, `<brand> press kit`, `<brand> logo svg`. Take the SVG. Note the page URL and its usage terms.
2. **Official GitHub org.** Many vendors keep `brand/` or `assets/` folders. Take the SVG, note the repo URL and licence.
3. **Simple Icons** (`https://simpleicons.org`, CC0 for the collection; each brand's own trademark rules still apply). Use `https://cdn.simpleicons.org/<slug>` to fetch, then vendor the file. Good for monochrome marks.
4. **Stop.** If none of these has it, use a text mark (the name in the house font) and open a follow-up. Do not scrape random image results.

For UI glyphs: Lucide first (`https://lucide.dev`, ISC), Phosphor second (MIT). Both ship SVG with `currentColor`, which is what our themes need.

## 3. Verify before storing

- **Right mark.** Compare against the vendor's own site header. Wrong-colour, outdated, or fan-made versions are common on the web.
- **Licence and terms.** Record them. Brand marks are always "used to identify the vendor, no endorsement implied". If the terms forbid our use (some do for commercial pages), fall back to the text mark.
- **Format.** SVG only for logos and glyphs. PNG only for raster thumbnails and poster art (2x, WebP if over 200 KB).
- **Colour.** Provide `currentColor` monochrome for glyphs and chips. For brand logos keep the official colour version and make a monochrome version only if the vendor's terms allow recolouring; otherwise use the official light/dark pair.
- **Sizes.** Check at 16, 24, 48 and 128 px on a dark and a light background. If the mark fills at 16 px, make a simplified small-size variant or use the text mark below 24 px.
- **Clean the SVG.** Run it through SVGO (`npx svgo file.svg`), strip `width`/`height` in favour of `viewBox`, remove embedded rasters and scripts.

## 4. Store and register

- Files: `terminal/app/public/brand/<vendor>/<vendor>.svg` (the colour source), and the generated set `-mono`, `-light`, `-dark`, `-wide`, `-stacked` (§4b). Glyphs: `terminal/app/public/glyphs/<name>.svg`.
- Registry: append one line per asset to `terminal/docs/brand/registry.md` (create it if missing):

  `| <vendor or glyph> | <file> | <source URL> | <licence / terms> | <date checked> | <notes: mono ok? min size?> |`

- Never commit an asset that is not in the registry. Never commit a mark whose terms you have not read.

## 4b. Configurations: every mark ships as a set

Justin, 2026-09-29 02:44 UTC: "we're going to need the Logo system to do lightmode and dark mode and transparent and more as well as each of the configurations of that logo like wide, icon only, etc." One gathered colour file produces the whole set, deterministically, with `node scripts/brand-variants.mjs` (run from `terminal/`). Never edit a variant by hand; fix the source and re-run.

| File | What it is | Use it for |
| --- | --- | --- |
| `<slug>.svg` | the vendor's icon-only mark in its official colour, transparent | tiles, cards, anywhere the brand colour is wanted |
| `<slug>-mono.svg` | same shape, `currentColor` | chips, menus, any UI that sets the colour (dark and light for free) |
| `<slug>-light.svg` | same shape, fixed near-black `#15181d` | light backgrounds where `currentColor` is unavailable: `<img>`, email, canvases |
| `<slug>-dark.svg` | same shape, fixed near-white `#e8eaed` | dark backgrounds, same cases |
| `<slug>-wide.svg` | **our lockup**: icon + name side by side in the house font, `currentColor` | headers, FreshStack card titles, lists |
| `<slug>-stacked.svg` | **our lockup**: icon above name, `currentColor` | tiles, launchers, small cards |

Rules for the set:

- Icon-only is the base configuration; every other file is derived from it.
- `-wide` and `-stacked` are ours. They are not the vendor's wordmark and must never be presented as one. When the vendor's official wordmark is gathered later it lands as `<slug>-wordmark.svg` with its own registry line and terms.
- All files are transparent SVG. A white official mark is flagged `needs_dark_tile` in the manifest so pages put a dark tile behind it on light backgrounds.
- The manifest `app/public/brand/index.json` (slug, names, colour, files, source, terms, date) is the machine-readable registry for chips and cards; `docs/brand/registry.md` stays the human one. Both are written from the same source.

Later layers, each a cost question and none automated yet (2026-09-29):

1. **Raster export** (PNG at 32/64/128/256/512 and WebP) for Slack, OG images and places that cannot take SVG. Free: render the SVG with the same Playwright we use for screenshots. Turn on only where an integration needs a raster.
2. **Vectorizing** a logo that only exists as a raster. Free first: `potrace` / `vtracer` for flat marks. Paid when quality matters: Vectorizer.AI or Adobe's API, around a few cents per image; record the cost in the ledger like any model call and keep the raster source in the registry line.
3. **3D and motion** versions (extruded mark, turntable, a Rive-style state machine) for the koi pond, launchers and poster art. Generated per the best-of-3 loop (C-031) from our own marks only; third-party marks stay flat.
4. **Wordmarks and full brand kits** gathered from official brand pages, the same source order as §2.

## 4c. Say what it costs and how sure you are

Rule C-071 (Justin, 2026-09-29 03:10): any proposal to gather, generate or upgrade marks states the money (model calls and vendor fees separately), the time, and how sure we are in plain words with a rough percentage. Put it where the decision is made: on the page (see the estimate block on `pages/brands.html`) or in the reply. When the work runs, its real cost goes on the ledger and the estimate is checked against it.

## 5. Generate only when nothing good exists

Applies to our own product icons, thumbnails, poster art, and doodle hints. Not to third-party logos.

- Write the brief first: what it must read as at 16 px, one idea, our palette (tokens in `shared/src/themes`), flat, no gradients unless the theme is glass.
- Make three, pick one, make three upgrades of the pick, pick one. Stop when two rounds change nothing visible (the refine loop, decision C-031).
- Output SVG when the shape is simple enough to hand-trace; raster otherwise, with a 2x export.
- Label generated art as ours in the registry (`source: generated, brief: ...`). Never present generated art as a screenshot or as a vendor's mark.

## 6. Quality bar, checked before the commit

- Renders sharp at 16/24/48/128 px, dark and light, no blur, no clipping.
- Each mark has exactly one job on the page; no decorative repeats.
- Page weight: a brand row of 13 SVGs stays under 60 KB total.
- Alt text names the vendor ("Cloudflare logo"), never "image" or "icon".
- The registry line exists and is complete.

## 7. Where this is used first

- `pages/freshstack.html`: one mark per piece in the card header, `-mono`, 22 px (live 2026-09-29).
- Chips: brand chips (Hoy, Cloudflare) show the mark at 16 px when one is registered.
- Canvas cards: thumbnails are screenshots of the real page at card size, regenerated by `pnpm check:responsive`.
