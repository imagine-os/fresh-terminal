# 0013 — skins, materials and the refine loop (pass 5, queued)

Source: Justin, Slack, 2026-09-29. Recorded now; pass 5 does not start until pass 4 is live. Verbatim:

> If i ask you to skin something or use a material, then you can generate image, image search, find a library, write some custom code or whatever, Again, Jev can help decide the best path. Also, you can do a temporary path while having jev do some rounds of improvement

> simple, make 3 versions, choose best, make 3 upgrades, choose best, make 3 upgrade samples choose best, etc. any iteration of that type of thinking can be wow exponential for making things great. Of course set an end to the loop when appropraite.

## Plan (not built)

- A `skin.apply` op and a `material` record. Jev picks the path: `css_tokens`, `procedural_code`, `image_generate`, `image_search` (Openverse) or `library` (MIT or CC0 only).
- An instant "draft material" is the first result, so something changes right away.
- A shared `refine()` loop: best of 3 per round, scored 1–5 by a vision model plus Jev. It stops at a score of 4.5, after 2 rounds without improvement, at 5 rounds, at a 3¢ cap, or when the user presses Stop. One row per round in the UI with the winner outlined; the user can pick any variant. Loop parameters live in the route table; one ledger entry per round.
- Plan tasks: `skin-apply-op`, `draft-material`, `refine-loop`, `refine-ui`, `pond-ops` (pass 5).
