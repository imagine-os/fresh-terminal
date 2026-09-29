# Sales pages: /about, /pricing, /faq

Written 2026-09-29 (C-095, Opus 5.5). Live: https://freshterminal.ai/about, https://freshterminal.ai/pricing, https://freshterminal.ai/faq. Pages copy: https://imagine-os.github.io/fresh-terminal/about (and /pricing, /faq).

## Files

- `app/public/about.html`, `pricing.html`, `faq.html`: English copy in the HTML; every translatable element has `data-i18n="key"`, attributes use `data-i18n-attr="attr:key;..."`.
- `app/public/sales/i18n-es.js`: Spanish, same keys. `sales.js`: the language toggle (shared with the app through `localStorage["fresh-terminal.prefs"].lang`, or `?lang=es`), the "not wired yet" toast, `PAYG_FEE` and `STORAGE` constants, `window.__actions`, `/faq#id` opens that answer. `sales.css`: the Void theme, tokens on `:root`, root font 17 px → 36 px with the viewport.
- `app/public/sales/img/`: WebP screenshots from real sessions (sources in decision 0025 and the QA folders).

## Rules

- Square corners, one green accent used sparingly, 44 px targets, visible focus, keyboard only works everywhere, reduced motion respected. No trackers, no external requests.
- Status tags use one attribute: `data-status="live|soon|not-wired|not-final"`.
- Unfinished buttons carry `data-not-wired`, a `data-tip` (tooltip on hover and keyboard focus) and a `data-toast` (on click or tap).
- Each page lists its actions in `#page-actions`; update it with every control change (see `reference/surfaces.md`).
- Share tags come from `shared/src/share.ts`; run `pnpm -C terminal share:sync` after changing it. Never edit the block by hand.

## Local preview

`pnpm -C terminal build:app && pnpm -C terminal preview`, then http://localhost:4173/about.
