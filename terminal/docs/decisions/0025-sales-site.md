# 0025 — the sales site: /about, /pricing, /faq, and share cards

Date: 2026-09-29. Model: Opus 5.5 (all of it: research, copy, design, build, checks). Prompts: Canon 82 (the brief, ts 1790657743.245569), 83 (pricing and privacy notes, ts 1790658094.470499), 84 (share thumbnail, ts 1790658220.851259). Canon C-091.

## What Omarchy's site does that makes it feel simple (read 2026-09-29, https://omarchy.org; information only, nothing copied)

- One idea per section, in short plain sentences, with a mono headline.
- Two calls to action at the top ("get it", "see it"), repeated lower down.
- A narrow reading column, lots of black space, almost no decoration.
- A small top nav (a handful of words) and a theme switcher.

Where we go further: bigger type that keeps growing up to a 4K TV, real screenshots for every claim, one honest pricing page, every unfinished thing labelled, both languages, and no trackers.

## Best-of-3

| Part | Variants | Pick | Why |
| --- | --- | --- | --- |
| Hero | A: copy left, screenshot right. B: headline, sentence, buttons, then one wide screenshot. C: headline left, copy and buttons right, screenshot below | **B** | A squeezed the headline into five lines and shrank the screenshot; C split the reading order at 1280. B reads top to bottom at every width. A second round (tighter top space) gave no clear gain, so it stopped. |
| Pricing | A: four plan cards. B: a comparison table. C: one row per plan | **A** (round 2: four columns from 1100 px, two on tablets, one on phones) | B scrolls sideways on a phone; C does not compare. A's first round wrapped one card at 1280; fixed in round 2; no further gain. |

Screenshots of every variant: scratchpad `sales/bo3/` (not committed).

## Pricing as built

| Plan | Price | What you get | State |
| --- | --- | --- | --- |
| Free | $0 | No sign-up, free usage to try (about 40 prompts), saved in this browser | live (25¢ per browser, C-074) |
| Starter kit | $5 on us | Sign in with GitHub, Google or email; cloud save for stages | live (C-089). The router still caps free usage at $1/day per account: open question 20 |
| Pay as you go | model cost + fee | After the starter kit. The fee is one constant (`PAYG_FEE` in `app/public/sales/sales.js`), shown as 5%, labelled "not final" | **not wired yet**: "Add payment" shows a tooltip and a toast (billing provider still being chosen, C-086) |
| Your key | $0 for models | Your OpenRouter key, kept in your browser, calls go straight to OpenRouter, never blocked. Storage 100 MB free, then about $0.05/GB-month (`STORAGE` in `sales.js`), "not final" | live (key); storage pricing not billed |
| Teams and self-host | — | "Tell me when" | coming soon; the button is **not wired yet** (tooltip + toast) |

## Honesty rules applied

- Live claims are only what the app does today (C-091 list). Coming soon: realtime multiplayer, live sync across devices, voice talk-back, connectors, migration, share-my-data, access only when granted, encryption with your own key, teams and self-host. The offline queue (C-090) is live and is said so.
- Privacy copy says what reaches us: signed out, nothing but the request that the router passes to the model provider (through OpenRouter; the router keeps the cost line); signed in, stages (menus, pages, looks) in D1, not the conversation lines.

## Share cards

`shared/src/share.ts` holds the copy, card path and theme colour; `pnpm share:sync` writes the tags into the raw HTML of `/`, `/about`, `/pricing`, `/faq` (absolute freshterminal.ai URLs, so no Worker rewrite is needed); `scripts/share-meta.test.ts` fails on drift and checks the PNG (1200×630, under 1 MB).

## Cost

Static files only: no new services, no new secrets, no running cost. Images add about 0.7 MB (WebP screenshots) and 35 KB (card). **Sure.**
