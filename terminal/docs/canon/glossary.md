# Glossary

The house words and what they mean. Written 2026-09-29. When a meaning changed, the old one is marked superseded.

| Word | Meaning | Since |
| --- | --- | --- |
| **Box** | Your own space in the terminal: one conversation, its history, who's in it and what it cost. Every visitor gets one on first visit, no sign-up. Justin also called it a "folder". Address: `/box/<id>`. | 2026-09-28 |
| **Canvas** (master canvas) | The big zoomable board at `/canvas` where every page, doc, image and box sits as a card. Justin arranges it. Not the same as the stage. | 2026-09-28 |
| **Card** | One item on the canvas: a page, doc, image or box. It has a position, size and thickness. Paper cards are 1 mm thick by default, images 10 mm, drawn as a real edge. | 2026-09-28 |
| **Chip** | A word or phrase in the prompt box turned into a small typed symbol: an action, person, place, date, list or thing. You can click it to change its type, fix it or add a note. Unclear words become a question chip. | 2026-09-28; clickable chips 2026-09-29 (in progress) |
| **Dialect** | Our own plain-language vocabulary. Each word has one fixed meaning, and you write in plain sentences, like "Left sidebar: rail on laptop, hidden on phone." Unknown words are flagged, never guessed. There is a layout dialect, a billing dialect and a theme dialect. | 2026-09-28 (v0) |
| **Wire dialect** | The planned compact, typed format for messages between agents and the screen. Never used for code or warnings. Proposed, not built. | 2026-09-28 |
| **Glossary term** | A word a box has learned a meaning for. Example: "Hoy" is a brand in one box, while "hoy a las 3" still means "today at 3". When a word could be either, the chip shows both. Each box keeps its own glossary. | 2026-09-29 (in progress) |
| **Shell regions** | The five parts of every screen: top bar, bottom bar, left sidebar, right sidebar, and the stage (the middle). | 2026-09-28 |
| **Behaviours** | How a region shows at a given size: hidden, collapsed, rail (a thin strip of icons), full, floating. | 2026-09-28 |
| **Size classes** | Names for how much room there is: phone, tablet, laptop, desk, wall. Measured by the space the shell actually has, not by screen pixels. | 2026-09-28 |
| **Fit words** | How things sit: fills, hugs, wraps, stacks, sits beside, pins top, pins bottom. | 2026-09-28 |
| **Spacing / type scale** | Spacing: tight, cozy, roomy, airy. Text sizes: whisper, body, heading, headline, billboard. | 2026-09-28 |
| **Materials** | What a surface looks like it's made of: flat, paper, glass, metal, glow. They adapt to size like everything else. Richer materials (3D shaders) come later. | 2026-09-28 |
| **Theme** | A saved look: backdrop, bezel (the frame, like old monitor plastic), text style, cursor, motion and what it reacts to. Written in the theme dialect. Three are built: Void (default), Blank Page, Glass Window. | 2026-09-28 |
| **Skin** | Asking to restyle something ("make this brass"). You get a quick draft right away; then Jev picks how to make it real (code, generated image, image search or a library) and runs the refine loop. | 2026-09-29 (planned, pass 5) |
| **Refine loop** (best-of-3) | Make three versions, Jev scores them, keep the best, make three better versions of it, repeat. Stops at a target score, after two rounds with no gain, after five rounds, or at a cost cap. You can overrule any pick. | 2026-09-29 (planned, pass 5) |
| **Terminal library** | The browsable collection of terminal looks at `/pages/library.html`: 17 entries, including Koi Pond. Replaced the themes page. | 2026-09-28 |
| **Koi pond** | A realistic, reactive pond terminal. v2 (a tiltable 3D scene with a bridge, sky, lily pads of any shape that can hold cards, and stone paths) is at `/pages/koi.html` from the pass 4 push; v1 moved to `/pages/koi-v1.html`. | 2026-09-28; v2 2026-09-29 (pass 4 push) |
| **Starter** | A sample first prompt, like "Draw a shadcn dashboard". Starters are saved records that feed the suggestion strip and define the verbs the product knows. | 2026-09-28 |
| **Draw / reveal** | Anything drawn paints in like an old CRT beam: horizontal sweep, radial, diagonal, or typewriter for text. | 2026-09-28 |
| **Router** | The one small server piece. It holds the keys, decides where each prompt goes, streams the reply and records the cost. Runs as a Cloudflare Worker (a small program on Cloudflare's network). | 2026-09-28; live 2026-09-29 |
| **Tier** | A kind of model job in the route table: **fast** and **careful** answer you (both Haiku 4.5 today), **jev** makes decisions, **tagger** makes chips (Gemini 2.5 Flash-Lite). | 2026-09-28 |
| **Route table** | The list that maps intent → tier → model → permission. | 2026-09-28 |
| **Jev** | TypeSafe AI's decision model, on OpenRouter as `typesafe/jev-1.13`. It only returns decisions: pick one option, yes/no, or a score. We use it to route prompts, check permission and judge results. It can't write text. (Superseded: "Jev isn't on OpenRouter", 2026-09-28 23:46.) | 2026-09-28 23:52 |
| **OpenRouter** | One service and one key that reach many AI models. | 2026-09-28 |
| **Ledger** | The list of every charge and credit. Each entry records who, what, how many, what it cost us and what it costs you. Money is whole micro-dollars. | 2026-09-28 |
| **Micro-dollar** | One millionth of a dollar. All money is stored as whole micro-dollars so tiny charges add up exactly. | 2026-09-28 |
| **Pass-through** | You pay what the AI call cost us, plus a margin set in the route table. Default margin: 0%. | 2026-09-28 |
| **On-chain** | Each ledger entry carries a fingerprint (hash) of the one before, so any change breaks the chain and one button can check it. Users who agree to be "on chain" also link their entries into one shared chain. No tokens, wallets or mining. | 2026-09-28 |
| **Two ways to pay** | Use our key (pass-through) or bring your own OpenRouter key, which never leaves your browser. Press `K`. | 2026-09-28 |
| **Pass** | One round of building that ends in a push and a green check. Passes 1–3 are live; 4 is in progress; 5 is next. | 2026-09-28 |
| **Not wired yet** | The label on anything visible that doesn't work yet (tooltip and a short message). Nothing pretends to work. | 2026-09-28 |
| **Dev mode** | Press `D`: a side panel with the dialect editor, size readout, plan viewer, ledger and the not-wired list. | 2026-09-28 |
| **System of record** | The one true copy of business data: Company OS Postgres. | 2026-09-28 |
| **Live layer** | What's on screen and changing: pages, presence, drafts. Planned for SpacetimeDB (a database built for online games). | 2026-09-28 |
| **Company OS** | The multi-tenant backend Anu built (`Playset-LLC/company-os`). | 2026-09-28 |
| **Playset OS** | Justin's name for the whole multi-tenant platform being rebuilt. | 2026-09-28 |
| **Canon** | This record: what is true now, and how it got there. Justin's "creator memory". | 2026-09-29 |
| **Integration ladder** | The order Fresh Terminal tries to reach another service: API, then CLI, then MCP, then WebMCP, then a browser. Jev picks the rung. | 2026-09-29 (proposed, C-055) |
| **Recipe** | Saved know-how for a task: a first run's trace turned into steps that replay, checked by Jev, until it runs as plain code with no model calls. | 2026-09-29 (proposed, C-056) |
| **Shape / binding** | The two halves of a recipe. The shape (steps and calls, no values) can be shared; the binding (tenant, keys, ids, personal data) stays private. | 2026-09-29 (proposed, C-056) |
| **Wiki** | The docs folder `terminal/docs`, read by people and agents: one start-here index, `llms.txt`, and a rendered copy at `/wiki/` on the site. Updated every pass. | 2026-09-29 (C-057) |
