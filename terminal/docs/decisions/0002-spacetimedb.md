# 0002 — SpacetimeDB

## Verified (2026-09-28)

Sources: the npm registry (`spacetimedb@2.10.1`, its README and source), `spacetimedb.com/docs/llms-full.txt` and `spacetimedb.com/docs/cli-reference`. The per-page docs URLs guessed first (`/docs/modules/typescript/...`, `/docs/sdks/typescript`) returned 404.

- Server modules and the client SDK are one npm package: `spacetimedb`. Modules import `{ table, t, schema, SenderError } from 'spacetimedb/server'`; the deprecated `@clockworklabs/spacetimedb-sdk` just re-exports it.
- Table syntax: `table({ name, public, indexes }, { col: t.u64().primaryKey().autoInc(), ... })`. Column builders include `t.identity()`, `t.timestamp()`, `t.option(...)`, `.unique()`, `.index('btree')`.
- Schema and reducers: `const spacetimedb = schema({ box, line, ... }); export default spacetimedb; export const create_box = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => { ctx.db.box.insert({...}) })`. Reducer names come from the export name. `ctx.sender`, `ctx.timestamp`, `ctx.db.<table>.<index>.find/filter/update/delete`, `.iter()`.
- Lifecycle: `spacetimedb.init`, `spacetimedb.clientConnected`, `spacetimedb.clientDisconnected`.
- Outbound HTTP: reducers cannot. Procedures can (`spacetimedb.procedure(params, returnType, (ctx) => ctx.http.fetch(url))`) and open a transaction with `ctx.withTx`. The host's `module-http` setting can disable it.
- Client: `DbConnection.builder().withUri().withDatabaseName().onConnect((conn) => conn.subscriptionBuilder().subscribe(tables.x)).build()`. React: `import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react'`.
- CLI: `spacetime init --lang typescript`, `spacetime dev` (local host + publish + regenerate), `spacetime publish <db> --module-path .`, `spacetime generate --lang typescript --out-dir <dir> --module-path <dir>`; `spacetime.json` can hold the database name and generate targets.

## Not verified

- The module has not been published to any SpacetimeDB host and bindings have not been generated: the `spacetime` CLI is not installed in the build environment and no host was available. The module type-checks against the real package types, which is the strongest check available offline.
- Whether hashing (sha256) is available inside a reducer; the ledger hashes are computed by the caller for now.

## Consequence

The app runs fully on `LocalStore` (in memory, mirrored to localStorage, per browser). `SpacetimeStore` is a stub that throws "not wired yet". The seam is `app/src/store/types.ts`. Company OS Postgres stays the future system of record for business data and is not part of this repo.
