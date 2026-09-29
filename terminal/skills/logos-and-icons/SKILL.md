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

- Files: `terminal/app/public/brand/<vendor>/<vendor>.svg`, plus `-mono.svg`, `-light.svg`, `-dark.svg` as needed. Glyphs: `terminal/app/public/glyphs/<name>.svg`.
- Registry: append one line per asset to `terminal/docs/brand/registry.md` (create it if missing):

  `| <vendor or glyph> | <file> | <source URL> | <licence / terms> | <date checked> | <notes: mono ok? min size?> |`

- Never commit an asset that is not in the registry. Never commit a mark whose terms you have not read.

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

- `pages/freshstack.html`: one mark per piece in the card header, monochrome, `currentColor`, 24 px.
- Chips: brand chips (Hoy, Cloudflare) show the mark at 16 px when one is registered.
- Canvas cards: thumbnails are screenshots of the real page at card size, regenerated by `pnpm check:responsive`.
