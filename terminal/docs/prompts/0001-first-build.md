# 0001 — first build

Source: Justin Massion, Slack #developer, 2026-09-28 18:00 CDT. Verbatim:

> imagine-os/fresh-terminal/ please make the terminal system we described. Make it Brilliantly clean and infinintely expandable for users who arrive at the website. I assume one Open router key is all we need? And,
>
> Use Spacetime DB Website as a inspiration for our new website for this amazingly clean simple product.  Let's be smart in that there is only 1 folder and 1 instruction in the start of the repo. And, any user starts a new box (folder)
>
> Game 1st is part of why i like it. MMOs demand the most realtime, and manages worlds and economies. Likely better than saas

Design-thread context folded into decisions: the prompt box is the command surface and routes intents to models via a table; the canvas renders a live document model; a chips editor; an adaptive terminal start; a five-region shell; a plain-language dialect; SpacetimeDB for the live layer; Company OS Postgres remains the future system of record for business data (not part of this repo).

## Reply summary (what shipped)

One OpenRouter key is all the router needs; it lives server-side in `terminal/router/.env` (or a Worker secret) and never reaches the browser. Shipped in this pass: the repo shape (README + `terminal/`), a working terminal on `/` and `/box/:id` with boxes per anonymous visitor, live chips, suggestions, streaming replies, a five-region shell driven by the layout dialect, dev mode with a PM viewer, EN/ES, an integer-money hash-linked ledger with pass-through billing, three themes, GitHub Pages hosting, and a SpacetimeDB module that type-checks but is not yet published (the app runs on a local store until then). See `changelog/0001.md`. Model: Fable 5.1.
