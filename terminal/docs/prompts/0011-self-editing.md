# 0011 — the terminal must be able to edit itself

Source: Justin, Slack, 2026-09-29 (pass 4 review). Verbatim:

> Fail: if it can't edit itself than its not good enough

## Reply summary

Pass 4 makes everything the interface shows into data in the box's store: the sidebar menu (a nested `nav_item` tree), pages built from blocks, the shell layout sentence, the theme, style token overrides, starters, canvas cards and the chip glossary. The only way any of it changes is an op (`shared/src/ops`): zod-validated, atomic, with an inverse, so every edit is undoable (Ctrl/Cmd+Z, or the Undo button on the "Edited: … · Undo" line) and ledgered as kind `edit`. `POST /route` now does tool calling: the app sends a snapshot of the box, the model calls one tool per op plus `respond`, the router dry-runs the ops against the snapshot and gives the model one retry when any are invalid, then streams an `ops` event the app applies with the CRT reveal. The system prompt tells the model never to send the user to edit files. Jev gains an `edit_ui` choice; low-confidence edits and big boxes start on Claude Sonnet 5.5. The own-key browser path runs the same turn with the same tools. Decision 0016, changelog 0004.
