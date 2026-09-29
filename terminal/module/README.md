# Fresh Terminal SpacetimeDB module

TypeScript server module written against `spacetimedb@2.10.1` (`spacetimedb/server`).

Status: type-checks locally (`pnpm typecheck` at `terminal/`) and bundles with `spacetime build`. Published to Maincloud as `fresh-terminal` by `.github/workflows/spacetime-publish.yml` on every push that touches this folder (first successful publish 2026-09-29 05:39 UTC, run 4). Bindings land in `app/src/module_bindings/`. The app runs on a local in-memory/localStorage store until this is published and bindings are generated.

## Tables

| table | columns |
| --- | --- |
| `box` | id, owner_identity, name, created_at, updated_at |
| `session` | id, box_id, created_at |
| `line` | id, box_id, kind (`user` / `assistant` / `system`), text, chips_json, created_at |
| `presence` | identity (pk), box_id, last_seen |
| `route_rule` | id, intent (unique), model, permission, updated_at |
| `nav_item` (pass 4) | id, box_id, parent_id (`''` = top), label, icon, target_json, order, created_at, updated_at |
| `page` (pass 4) | id, box_id, title, blocks_json, created_at, updated_at |
| `box_ui` (pass 4) | box_id (pk), dialect_text, theme_id, style_json, updated_at |
| `glossary_term` (pass 4) | id, box_id, text, type (chip kind), note, case_sensitive, created_at |
| `edit_batch` (pass 4) | id, box_id, owner_identity, ops_json, inverse_json, summary, source, state (`applied` / `undone`), created_at, flipped_at |

`line` also carries `component`, `reveal` and (pass 4) `blocks_json`, the structured reply. Ledger `entry.kind` accepts `edit` and `unit_kind` accepts `op`.

## Reducers

`create_box`, `open_session`, `append_line`, `touch_presence`, `upsert_route_rule`, `set_on_chain`, `append_entry`, `upsert_theme`, `upsert_card`, `move_card`.

Pass 4 (the interface is data; every write checks that the sender owns the box): `upsert_nav_item`, `remove_nav_item`, `upsert_page`, `remove_page`, `set_box_ui`, `upsert_glossary_term`, `remove_glossary_term`, `record_edit_batch`, `set_edit_state`. The op engine (`shared/src/ops`) runs in the client and router; these reducers store its per-record results and the batch (ops + inverse) so undo works on any device.

## Publish (commands from the SpacetimeDB CLI reference, not yet run here)

```sh
# install the CLI (see spacetimedb.com/install), then log in
spacetime login

# local dev host + publish + regenerate bindings on change
cd terminal/module
spacetime dev

# or publish explicitly (spacetime.json in this folder names the database; the CLI 2.10 config accepts
# `database`, `module_path`, `server`… — not the `databases` array we first wrote)
spacetime publish --server maincloud fresh-terminal --module-path .

# generate TypeScript client bindings into the app
spacetime generate --lang typescript --out-dir ../app/src/module_bindings --module-path .
```

Then set `VITE_SPACETIMEDB_URI` and `VITE_SPACETIMEDB_NAME` for the app and switch the store to `SpacetimeStore` (see `app/src/store/`). The generated `module_bindings/` folder is git-ignored until the module is published.

## Notes verified from the docs dump (2026-09-28)

- Modules import `{ table, t, schema } from 'spacetimedb/server'`; reducer names come from the export name.
- Reducers mutate tables only; they cannot make HTTP calls. Procedures can via `ctx.http.fetch` and can open a transaction with `ctx.withTx`.
- Client SDK is the same `spacetimedb` package; React hooks live under `spacetimedb/react` (`SpacetimeDBProvider`, `useTable`).
