# Page: Product Hunt strategy (`/pages/producthunt.html`)

Written 2026-09-29 by Opus 5.5. Asked by Justin at 03:14 UTC ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790651680495959?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)). Canon C-076. Status: proposed.

**Purpose.** The plan for launching Fresh Terminal on Product Hunt, in one page Justin can decide from: the call, what the research says (with sources and a verified/unverified mark), three pitches with a pick, the gallery shot list, a readiness checklist tied to what is live, a timeline ordered by dependencies (no dates), the community plan, a draft of the maker's first comment, FAQ, metrics, risks, costs with certainty, and what we need from Justin.

**Live.** https://imagine-os.github.io/fresh-terminal/pages/producthunt.html (also https://freshterminal.ai/pages/producthunt). `noindex`.

**The call (2026-09-29).** Launch Fresh Terminal first, not FreshStack. Product Hunt's featuring guidelines (2026-03-10) don't feature templates or boilerplates, and one root domain gets one launch per six months. FreshStack is the story inside the maker's comment and on GitHub. Five blockers before scheduling: Clerk production, free credits with a per-browser cap (shipped, C-074), a launch-day spend limit (the $2/day cap needs a launch value), the first-run screen, and a licence on the repo. Realtime multiplayer is saved for the second launch.

**Pick.** Tagline option A: "The terminal that rebuilds itself when you ask" (46/60 characters).

**Data.** The lists are arrays in the page source: `FINDINGS`, `EXAMPLES`, `PITCHES`, `SHOTS`, `CHECKLIST`, `PHASES`, `FAQS`, `METRICS`, `RISKS`, `COSTS`. A checklist item has one `status` word (`live`, `progress`, `notwired`, `justin`) and an optional `blocker: true`. The tally counts them. To change a status, change the word.

**Actions** (declared in `<script id="page-actions">`): `ph.jump` (section links), `ph.checklist.filter` (All / Blockers / Live / Not done; remembered per browser), `ph.comment.copy` (copies the first-comment draft).

**Checks.** 360 to 3840 wide with no horizontal scroll and 44 px targets; light and dark from the system or `ft-lib-theme`. Tables turn into stacked rows on phones.

**Not done.** Spanish fill for this page (English only). The statuses are a snapshot from 2026-09-29 03:55 UTC; update them as blockers turn green.
