# Page: box (`/box/:id`)

**Purpose.** One box: transcript above, composer below. Same terminal as the landing without the headline/how-it-works/footer.

**Regions.** As landing. Top bar shows `/ <box name>` instead of the tagline.

**Actions** (`BOX_ACTIONS`): everything on landing plus `box.open` (sidebar entries).

**States.** Unknown id (another browser's box, typo): falls back to the visitor's most recent box and repairs the URL with `replaceState`. New box (N): a system line "New box. Type to begin." Empty: doodles (without the new-box hint once more than one box exists). Streaming and failure states as landing.

**Data.** Lines (`kind`, `text`, `chips_json`) and a session are written to the store on open/send; presence is touched on open; one ledger `charge` entry is chained per successful model call.

**i18n keys.** `box.*`, `topbar.*`, `sidebar.*`, `composer.*`, `suggest.*`, `doodle.*`, `system.*`, `dev.*` (dev panel), `notWired*`.

**Pass 4 (2026-09-29).** The sidebar shows the box's menu tree (`nav-tree`, rows 44 px, arrow keys move, Right/Left expand and collapse) above the box list. Every prompt can edit the interface: the router's ops are applied through `store.applyOps` and the reply shows a header line, typed blocks, a diff, and "Edited: … · Undo". Chips appear in a tray under the composer; click (or focus + Enter) opens the chip popover. Ctrl/Cmd+Z undoes the last edit when focus is outside a field or the composer is empty. Pages the box creates open at `/page/:id` (`page-view`). New i18n keys: `chips.*`, `chipKind.*`, `nav.*`, `edits.*`, `reply.local`, `page.missing`. New actions: `plan.open`, `edit.undo`, `edit.redo`, `nav.open`, `chip.edit`.

**Replay** (2026-09-29, decision 0019). `P`, the replay button, or `/box/:id/play?step=N` opens the same box read-only: the transcript as it stood at the chosen step (current line marked), the menu, layout and theme as they were, and the scrubber in place of the composer (lane marks per step, range, start/back/play/forward/end, speed, save as JSON, "Branch from here" not wired yet, back to live). Space, ←/→, Home/End and Esc work; edits and sends are off.
