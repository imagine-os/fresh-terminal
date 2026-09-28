# Fresh Terminal SpacetimeDB module

TypeScript server module written against `spacetimedb@2.10.1` (`spacetimedb/server`).

Status: type-checks locally (`pnpm typecheck` at `terminal/`). **Not yet published or verified against a running SpacetimeDB host.** The app runs on a local in-memory/localStorage store until this is published and bindings are generated.

## Tables

| table | columns |
| --- | --- |
| `box` | id, owner_identity, name, created_at, updated_at |
| `session` | id, box_id, created_at |
| `line` | id, box_id, kind (`user` / `assistant` / `system`), text, chips_json, created_at |
| `presence` | identity (pk), box_id, last_seen |
| `route_rule` | id, intent (unique), model, permission, updated_at |

## Reducers

`create_box`, `open_session`, `append_line`, `touch_presence`, `upsert_route_rule`.

## Publish (commands from the SpacetimeDB CLI reference, not yet run here)

```sh
# install the CLI (see spacetimedb.com/install), then log in
spacetime login

# local dev host + publish + regenerate bindings on change
cd terminal/module
spacetime dev

# or publish explicitly (spacetime.json in this folder names the database)
spacetime publish fresh-terminal --module-path .

# generate TypeScript client bindings into the app
spacetime generate --lang typescript --out-dir ../app/src/module_bindings --module-path .
```

Then set `VITE_SPACETIMEDB_URI` and `VITE_SPACETIMEDB_NAME` for the app and switch the store to `SpacetimeStore` (see `app/src/store/`). The generated `module_bindings/` folder is git-ignored until the module is published.

## Notes verified from the docs dump (2026-09-28)

- Modules import `{ table, t, schema } from 'spacetimedb/server'`; reducer names come from the export name.
- Reducers mutate tables only; they cannot make HTTP calls. Procedures can via `ctx.http.fetch` and can open a transaction with `ctx.withTx`.
- Client SDK is the same `spacetimedb` package; React hooks live under `spacetimedb/react` (`SpacetimeDBProvider`, `useTable`).
