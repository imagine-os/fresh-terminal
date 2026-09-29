# Share previews (every public page, every publish)

Rule (Justin, 2026-09-29, Canon C-102): "by default any page needs share preview that updates each publish".

## How it works

- `scripts/share-pages.ts` runs inside `pnpm -C terminal build:app`, after the app and wiki builds, so every deploy (site-deploy, Pages) regenerates every preview.
- Pages covered: `/` and `/about` (brand card, copy in `shared/src/share.ts`), `/pricing`, `/faq`, every `app/public/pages/*.html`, every wiki page, and the app routes listed in `SPA_SHARE_PAGES` (`/canvas`, `/actions`, `/tags`; the build writes `dist/<name>.html` so each has its own head).
- Copy: the page's own `<title>` and `<meta name="description">`; fallbacks: its `<h1>` and first paragraph. Give a new page a good title and description and it gets a good preview.
- Card: a templated 1200×630 PNG per page at `/og/<slug>.png` (brand mark, a kicker, the title, a line or two, the address), SVG rendered with resvg and `scripts/fonts/DejaVuSansMono*.ttf` (Bitstream Vera licence, `scripts/fonts/DejaVu-LICENSE.txt`).
- Tags: og:type, og:site_name, og:title, og:description, og:url, og:image (+ type, size, alt), twitter:card `summary_large_image`, twitter:title/description/image, theme-color and `<link rel="canonical">`, all absolute on https://freshterminal.ai. Older tags in the file are replaced.
- Private pages: `/hub` gets "A private page. Sign in to see it." and `noindex, nofollow`. Anything new behind sign-in must be added there, never given a content card.
- Check: the step fails the build when any public HTML page in `app/dist` lacks the tags or its image, so CI and every deploy enforce it. Tests: `scripts/share-pages.test.ts`.

## For a new page

Nothing to do beyond a real `<title>` and `<meta name="description">`. For a new app route that should be shareable, add it to `SPA_SHARE_PAGES` in `shared/src/share.ts`.
