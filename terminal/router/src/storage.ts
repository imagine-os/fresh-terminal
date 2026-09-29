import { storageStatus, type StorageStatus } from '../../shared/src/credits/storage';
import type { D1Database } from './d1';

/**
 * Storage metering (2026-09-29, C-091): the bytes an account keeps in D1, its
 * stages and its ledger mirror. Measured on every sync write and on GET /credits,
 * stored on the account row. Billing above the free allowance is not wired; this
 * only measures. Byte counts are of the stored values (UTF-8), which is close to,
 * not exactly, what D1 bills.
 */
export async function measureStorage(db: D1Database, accountId: string, now: number): Promise<StorageStatus> {
  const stages = await db
    .prepare('SELECT COALESCE(SUM(LENGTH(CAST(id AS BLOB)) + LENGTH(CAST(name AS BLOB)) + LENGTH(CAST(state_json AS BLOB)) + 24), 0) AS b FROM boxes WHERE account_id = ?1 AND deleted_at IS NULL')
    .bind(accountId)
    .first<{ b: number }>();
  const ledger = await db
    .prepare(
      `SELECT COALESCE(SUM(LENGTH(CAST(id AS BLOB)) + LENGTH(CAST(box_id AS BLOB)) + LENGTH(CAST(kind AS BLOB)) + LENGTH(CAST(what AS BLOB))
         + LENGTH(CAST(model AS BLOB)) + LENGTH(CAST(unit_kind AS BLOB)) + LENGTH(CAST(ref AS BLOB)) + 128 + 48), 0) AS b
       FROM ledger_entries WHERE account_id = ?1`,
    )
    .bind(accountId)
    .first<{ b: number }>();
  const used = Number(stages?.b ?? 0) + Number(ledger?.b ?? 0);
  await db.prepare('UPDATE accounts SET stored_bytes = ?1, stored_at = ?2 WHERE id = ?3').bind(used, now, accountId).run();
  return storageStatus(used, now);
}
