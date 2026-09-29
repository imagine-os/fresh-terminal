import type { AccountInfo, PushBoxesResult, SyncBox, SyncEntry } from '../../shared/src/sync/types';

/**
 * The slice of Cloudflare's D1 API the router uses, typed locally so the
 * router does not pull in @cloudflare/workers-types (which fights the DOM lib).
 */
export interface D1Result<T> {
  results: T[];
  success: boolean;
  meta?: { changes?: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<Array<D1Result<unknown>>>;
}

export function accountIdFor(clerkUserId: string): string {
  return `acct_${clerkUserId}`;
}

export async function ensureAccount(db: D1Database, clerkUserId: string, now: number): Promise<AccountInfo> {
  const id = accountIdFor(clerkUserId);
  await db
    .prepare(
      // C-106: a new account starts with no credit; its $5 welcome credit is decided once (router/src/welcome.ts).
      `INSERT INTO accounts (id, clerk_user_id, plan, grant_micro, starter_state, created_at, updated_at) VALUES (?1, ?2, 'free', 0, 'pending', ?3, ?3)
       ON CONFLICT(clerk_user_id) DO UPDATE SET updated_at = excluded.updated_at`,
    )
    .bind(id, clerkUserId, now)
    .run();
  const row = await db.prepare('SELECT id, clerk_user_id, plan, created_at, updated_at FROM accounts WHERE clerk_user_id = ?1').bind(clerkUserId).first<AccountInfo>();
  if (!row) throw new Error('account upsert failed');
  return row;
}

interface BoxRow extends SyncBox {
  account_id: string;
}

function toSyncBox(row: BoxRow): SyncBox {
  return {
    id: row.id,
    name: row.name,
    state_json: row.state_json,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    deleted_at: row.deleted_at === null || row.deleted_at === undefined ? null : Number(row.deleted_at),
  };
}

export async function listBoxes(db: D1Database, accountId: string, since: number): Promise<SyncBox[]> {
  const { results } = await db
    .prepare('SELECT * FROM boxes WHERE account_id = ?1 AND updated_at > ?2 ORDER BY updated_at ASC LIMIT 500')
    .bind(accountId, since)
    .all<BoxRow>();
  return results.map(toSyncBox);
}

/** Last writer wins per box; a box id owned by another account is never overwritten. */
export async function pushBoxes(db: D1Database, accountId: string, boxes: SyncBox[], now: number): Promise<PushBoxesResult> {
  if (boxes.length === 0) return { accepted: [], conflicts: [], rejected: [], server_time: now };
  await db.batch(
    boxes.map((box) =>
      db
        .prepare(
          `INSERT INTO boxes (id, account_id, name, state_json, created_at, updated_at, deleted_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, state_json = excluded.state_json,
             updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
           WHERE boxes.account_id = excluded.account_id AND excluded.updated_at > boxes.updated_at`,
        )
        .bind(box.id, accountId, box.name, box.state_json, box.created_at, box.updated_at, box.deleted_at),
    ),
  );
  const ids = boxes.map((box) => box.id);
  const placeholders = ids.map((_, index) => `?${index + 1}`).join(',');
  const { results } = await db.prepare(`SELECT * FROM boxes WHERE id IN (${placeholders})`).bind(...ids).all<BoxRow>();
  const byId = new Map(results.map((row) => [row.id, row]));
  const accepted: string[] = [];
  const conflicts: SyncBox[] = [];
  const rejected: string[] = [];
  for (const box of boxes) {
    const row = byId.get(box.id);
    if (row && row.account_id === accountId && Number(row.updated_at) === box.updated_at && row.state_json === box.state_json) {
      accepted.push(box.id);
    } else if (row && row.account_id === accountId) {
      conflicts.push(toSyncBox(row));
    } else {
      // Someone else's id: never overwritten, never leaked.
      rejected.push(box.id);
    }
  }
  return { accepted, conflicts, rejected, server_time: now };
}

/** Append-only mirror: an entry id that already exists is left untouched. */
export async function pushEntries(db: D1Database, accountId: string, entries: SyncEntry[], now: number): Promise<number> {
  if (entries.length === 0) return 0;
  const results = await db.batch(
    entries.map((entry) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO ledger_entries
           (account_id, id, box_id, kind, what, model, units, unit_kind, cost_micro, price_micro, ref, prev_hash, hash, shared_prev_hash, shared_hash, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
        )
        .bind(
          accountId,
          entry.id,
          entry.box_id,
          entry.kind,
          entry.what,
          entry.model,
          entry.units,
          entry.unit_kind,
          entry.cost_micro,
          entry.price_micro,
          entry.ref,
          entry.prev_hash,
          entry.hash,
          entry.shared_prev_hash,
          entry.shared_hash,
          entry.created_at,
          now,
        ),
    ),
  );
  return results.length;
}

export async function listEntries(db: D1Database, accountId: string, since: number): Promise<Array<SyncEntry & { updated_at: number }>> {
  const { results } = await db
    .prepare('SELECT * FROM ledger_entries WHERE account_id = ?1 AND updated_at > ?2 ORDER BY created_at ASC LIMIT 1000')
    .bind(accountId, since)
    .all<SyncEntry & { updated_at: number; account_id?: string }>();
  return results.map(({ account_id: _account, ...entry }) => entry);
}
