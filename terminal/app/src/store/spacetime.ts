import { NotWiredError } from '../lib/notWired';
import type { Store } from './types';

/**
 * SpacetimeDB-backed store. Not wired yet.
 *
 * When the module in terminal/module is published and bindings are generated
 * (`spacetime generate --lang typescript --out-dir ../app/src/module_bindings`),
 * this file will:
 *   import { DbConnection, tables } from '../module_bindings';
 *   DbConnection.builder().withUri(VITE_SPACETIMEDB_URI).withDatabaseName(VITE_SPACETIMEDB_NAME)
 *     .onConnect((conn) => conn.subscriptionBuilder().subscribe([tables.box, tables.line, ...]))
 * and map reducers (create_box, append_line, append_entry, ...) onto the Store
 * interface. Until then createSpacetimeStore throws so nothing pretends.
 */
export function spacetimeConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SPACETIMEDB_URI && import.meta.env.VITE_SPACETIMEDB_NAME);
}

export function createSpacetimeStore(): Store {
  throw new NotWiredError('SpacetimeDB store (module not published, bindings not generated)');
}
