# 0019 — every step is a saved event; replay first, branches and merges later

Date: 2026-09-29. Model: Opus 5.5 (Justin's session). Prompt: 0016. Canon: C-058, C-059.

## Decided

- **A session is a list of steps.** `shared/src/timeline` defines `Step {id, box_id, branch_id, parent_ids[], kind, ref, summary, at}` and `Branch {id, box_id, name, from_step_id, created_at}`. `parent_ids` is a list on purpose: a linear step has one parent, a branch point has two children, a merge has two parents. Only the `main` branch exists today; nothing in the shape changes when branches arrive.
- **Nothing is recorded twice.** Steps are derived from what the store already keeps: `session` rows, `line` rows (user, assistant, system), `edit` batches (with their ops and exact inverses) and the ledger's `undo:`/`redo:` entries. So every box that exists today already has a full replay, back to its first line.
- **The interface at any step is rebuilt, not stored.** `stateAt()` starts from the current UI state and walks the later steps backwards: an edit is reversed with its inverse, an undo by applying the batch again, a redo by the inverse. Because every edit carries its inverse (decision 0016), this is exact. If a step cannot be reversed the view says "shown approximately" instead of pretending.
- **Replay is read-only.** No prompt is sent and no op is applied while replaying. The composer is replaced by the scrubber. Single-key shortcuts that edit (theme cycle, undo) are off in replay; `P` and `Esc` return to live.
- **One file saves everything.** "Save this timeline" downloads `timeline.v0`: branches, steps, the box's lines and its edit batches. This is the shape the SpacetimeDB `step` and `branch` tables will take when the module is published, and the shape a future import reads.
- **Media later, same shape.** Audio, video, screen and pointer recordings become steps of new kinds (`audio`, `video`, `pointer`) whose `ref` points at a media row (Canon C-053: bytes in R2, one row in SpacetimeDB). The scrubber already positions marks by wall-clock time, so media aligns without a second timeline.
- **Tagline.** `landing.tagline` is now "Evolve as we grow." (Spanish: "Evolucionamos mientras crecemos."). It shows in the top bar on the landing page. `PRODUCT_TAGLINE_KEY` in `shared/src/brand.ts` was already the one place that names it.

## Surface

- Route `/box/:id/play?step=N` (`step` follows the scrubber so a position can be shared). Unknown id falls back to the most recent box like `/box/:id`.
- Action `play.open` (shortcut `P`) and `play.branch` (not wired). Top bar: replay button. Responsive check: `/box/demo/play` at all seven widths.
- Keys in replay: Space play/pause, ← → one step (Shift: ten), Home/End, Esc back to live. Speed 1×, 2×, 4×. Playback keeps the real gap between steps, squeezed to 250 ms–1.5 s.
- Marks on the lane: `>` user (accent), `·` assistant, `#` system, square for edit/undo/redo, ring for session opened.

## Not wired yet

- Branching and merging from a step (`playback.branch`): needs a store that can hold two live heads for a box, which the local store does not; planned with the SpacetimeDB publish (C-052).
- Audio and video steps (`playback.media`): after media storage (C-053) and LiveKit (C-051) exist.
- Replay across boxes and across people (presence), and a thumbnail strip on the lane.

## Tests

`shared/src/timeline/timeline.test.ts` (derive order and parents, exact state at each step through edit → undo → redo, export shape), `app/src/__tests__/playback.test.tsx` (a real LocalStore box: steps, menu and page at each step; the scrubber's range, label, buttons and keys). 157 tests after merging pass 5, typecheck, build and 28/28 responsive checks green.
