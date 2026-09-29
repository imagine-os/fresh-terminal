# Page: Actions (`/actions`)

**Purpose.** The person's own activity, not our project plan. Justin, 2026-09-29 04:53 UTC: "The plan is for the users activity not for our project plan. our project plan can go elsewhere. Maybe just called it Actions instead of plan." ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790657599470899?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)). Built in C-090 (Fable 5.1, Justin's session); ledger, filters, arrows and tests in C-094 (Opus 5.5).

**Where.** Tray → Actions, the stage menu's seeded "Actions" item, or `/actions`. Spanish: "Acciones". Our build plan is not here: it is `docs/plan/` ([plan/README.md](../plan/README.md), [plan/plan.json](../plan/plan.json)), the hub's Plan section, and the dev-mode viewer at `/plan`.

**Rows.** Every line sent, every reply, every note and every edit is one row (`app/src/actions-view/rows.ts`, `actionRows()`):

| Kind | Status | Follows |
| --- | --- | --- |
| you said (a prompt) | sent | — |
| reply | answered, or failed when the reply carries an error block | the line that asked |
| note (system line) | noted | the line before it |
| edit (an op batch) | applied or undone | the newest line sent before it in the same stage |

**Model and cost (C-094).** From the ledger. A reply names the entry it wrote (`meta.ledger_ids`, set by `BoxView` since C-094); older replies and other charges are matched by the turn they were written in (from the line sent until the next line in that stage); a tagger charge (`chips.tag`) belongs to the next line sent, because it runs while that line is typed. The turn's total sits on its first reply; every row of the turn carries the turn's models (for the model filter). With nothing in the ledger, the reply header's `cost_micro` and `model` are used. Local commands show "no model" and `$0.0000`.

**Controls.** One row: the view (List, Table, Board, Timeline), a word filter (every word must match the text, the model, or the kind and status in the reader's language), status, stage ("All stages" or one; starts on the stage you came from), model ("no model" for local turns), and sort (newest, oldest, by status, cost highest first). On a phone the row scrolls sideways instead of stacking.

**Views.** List; Table (when, kind, what, stage, status, model, cost); Board (one column per status that has rows); Timeline (bars by time, "follows #n" labels and arrows from each row to the row it follows; the label column drags wider or narrower, or takes ←/→, Shift for bigger steps, Home/End; the width is remembered per browser in `fresh-terminal.actions.labelWidth` and never takes more than 60% of a narrow screen).

**Typed undo (C-094).** "undo", "undo that", "undo the last change", "deshacer" (and "redo", "rehacer") run locally like Ctrl+Z on this stage and leave a note that follows the line.

**Empty.** "Your actions show up here as you type." / "Tus acciones aparecen aquí mientras escribes." With filters that match nothing: "Nothing matches these filters."

**Actions** (`ACTIONS_PAGE_ACTIONS` in `app/src/actions/registry.ts`): `actions.open`, `actions.view`, `actions.filter.text`, `actions.filter.status`, `actions.filter.stage`, `actions.filter.model`, `actions.sort`, `actions.resize`; `edit.undo.typed` in the starters list.

**Quality.** Square corners, theme tokens (Void by default), 360–3840 px with no page overflow, every control at least 44 px (the resize handle is a 44 px grab area around a 2 px line), keyboard reachable. Checked by `pnpm check:responsive` (page `actions`) and `node scripts/qa-c094.mjs` (three real prompts, every view at 390, 1280 and 3840; `--base <url>` runs it against the live site).

**Tests.** `app/src/actions-view/rows.test.ts` (rows, statuses, follows per stage, ledger model and cost, filter, sort, facets), `app/src/terminal/localCommands.test.ts` (typed undo and redo).

**Not yet.** Rows are per line, not one row per prompt with queued/running states; "after X" written in a prompt is not read as a dependency yet; an undo is linked to the line that typed it, not drawn to the edit it undid. Justin: "we'll make this smarter as we go."
