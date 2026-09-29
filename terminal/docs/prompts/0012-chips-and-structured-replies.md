# 0012 — chips you can click, and replies like a super-CLI

Source: Justin, Slack, 2026-09-29. Verbatim:

> i need you to do a better job making things into chips for me. and i should be able to click a chip to give it a type and more context. Of note, there a brands like Hoy, which also means today in spanish, so sometimes we're writing with the word today, and sometimes we're writing with the brand/company as the word. also, your response should be way better structured, like a super-cli

## Reply summary

The model tagger is on by default (Gemini 2.5 Flash-Lite, strict JSON schema) and merges with the local tagger; chips now have 16 kinds (action, date, time, person, org/brand, place, object, variable, list, number, money, url, page, nav, theme, entity). "Hoy" gets both readings: a possessive or capitalised mid-sentence "Hoy" leans brand, "hoy a las 3" leans date. When two readings are close the chip is drawn dashed with a "?", and the router asks Jev to settle it. Clicking a chip (or focus + Enter) opens a popover to change its type, edit its value (date and time pickers, record pickers for pages, menu items and themes), add a note, and tick "Always treat 'Hoy' as brand in this box", which writes a `glossary_term` that every tagger and router call receives. Chips reach the router as structured data and the model trusts types the user set. Replies are typed blocks under a header line (intent · model · time · cost): summary, kv, table, steps (✓ ✱ ○), list, code, diff, edits with Undo, next (clickable commands), note, error; plain text is the fallback. Decision 0017, changelog 0004.
