# Page: box (`/box/:id`)

**Purpose.** One box: transcript above, composer below. Same terminal as the landing without the headline/how-it-works/footer.

**Regions.** As landing. Top bar shows `/ <box name>` instead of the tagline.

**Actions** (`BOX_ACTIONS`): everything on landing plus `box.open` (sidebar entries).

**States.** Unknown id (another browser's box, typo): falls back to the visitor's most recent box and repairs the URL with `replaceState`. New box (N): a system line "New box. Type to begin." Empty: doodles (without the new-box hint once more than one box exists). Streaming and failure states as landing.

**Data.** Lines (`kind`, `text`, `chips_json`) and a session are written to the store on open/send; presence is touched on open; one ledger `charge` entry is chained per successful model call.

**i18n keys.** `box.*`, `topbar.*`, `sidebar.*`, `composer.*`, `suggest.*`, `doodle.*`, `system.*`, `dev.*` (dev panel), `notWired*`.
