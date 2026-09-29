# The Canon: start here

The Canon is the memory for Fresh Terminal and the Playset OS rebuild. It says what is true now and how it got there, so an old rule is never mistaken for a current one. Justin asked for "the creator memory, or whatever is a better word for it" on 2026-09-29; this is it.

Written 2026-09-29 (Opus 5.5) from the #developer Slack thread that started 2026-09-28 22:28 UTC, Justin's channel posts from that half hour, the channel's memory notes and the fresh-terminal repo docs.

## The vision in one paragraph

Justin wants a plain screen with a blinking cursor that anyone can walk up to and use. You land, you type or talk, and your words turn into clear symbols as you go. The box works out what you mean and routes it to the right AI, then changes the product in front of you, including its own menus, pages and looks. It should "feel like everything is real time", edited "directly onto the product" with no waiting on GitHub, built by many agents at once, and described in "our own dialect" that "Even 10 Year old and 80 Year olds can understand". Behind it runs one multi-tenant system, Playset OS on the Company OS backend, built game-first because "MMOs demand the most realtime". The rule for every choice: "the brilliance is simplicity."

## Pages

| Page | What's in it |
| --- | --- |
| [vision.md](vision.md) | What we're building and why: the product, the platform, the principles, in Justin's words |
| [decisions.md](decisions.md) | Every decision with id, date, reason and status, including the ones that were reversed, and the proposals still waiting on Justin |
| [prompts.md](prompts.md) | All 92 of Justin's messages, word for word, in order, with what happened after each |
| [glossary.md](glossary.md) | The house words: box, canvas, card, chip, dialect, Jev, ledger, refine loop and more |
| [state.md](state.md) | What's live (with links and commits), what isn't wired yet, what's in progress |
| [open-questions.md](open-questions.md) | What's still undecided: name, imports, Company OS, Stripe, voice keys, when Fresh Terminal replaces Slack |
| [people-and-access.md](people-and-access.md) | Who's who, which repos each route can reach, secret names, the leaked-key note |

## Rules for keeping it true

Justin, 2026-09-29 02:11 UTC: "are you keeping and updating your documentation wiki? please do as a rule. very human and ai readable" ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790647881668439?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)). Decision C-057.

- The Canon and the docs wiki are updated in the same commit as every pass, by whoever ships that pass (plan task `canon-current`).
- Plain dated lines, one fact per line, readable by people and agents alike. No separate AI copy; `terminal/docs/llms.txt` is only an index.
- Superseded lines are kept and marked, never deleted.
- Each page links to the Slack message that caused it.
- Proposals are labelled `proposed` until Justin decides.

- Every fact carries a date. Times are UTC; Justin's local time is CDT (UTC−5).
- When something changes, don't delete the old line. Mark it superseded and point to the new one.
- When two sources disagree, the newer one wins.
- No key values, ever. Secrets are listed by name only.
- The repo's numbered files (`terminal/docs/prompts`, `decisions`, `changelog`) stay append-only. The Canon summarizes across them and links to them.

## Other sources

- The docs wiki (start here for everything else): https://github.com/imagine-os/fresh-terminal/blob/main/terminal/docs/README.md, rendered at https://imagine-os.github.io/fresh-terminal/wiki/

- Repo docs: https://github.com/imagine-os/fresh-terminal/tree/main/terminal/docs
- Live site: https://imagine-os.github.io/fresh-terminal/
- Source thread: https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790634517611669
