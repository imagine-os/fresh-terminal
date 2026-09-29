import { z } from 'zod';
import { entrySchema } from '../ledger/types';

/**
 * Cloud sync wire format (router <-> app), 2026-09-29.
 * Signed-in people's boxes and ledger mirror live in Cloudflare D1; signed-out
 * people stay in localStorage only. Every record keeps its id and updated_at so
 * realtime / multiplayer can replace last-writer-wins later without a rename.
 */

export const SYNC_LIMITS = { boxesPerPush: 100, entriesPerPush: 500, stateBytes: 512 * 1024 } as const;

export const syncBoxSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  /** JSON of { nav, pages, boxUi, glossary } for this box. */
  state_json: z.string().max(SYNC_LIMITS.stateBytes),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  deleted_at: z.number().int().nullable().default(null),
});
export type SyncBox = z.infer<typeof syncBoxSchema>;

export const pushBoxesSchema = z.object({ boxes: z.array(syncBoxSchema).max(SYNC_LIMITS.boxesPerPush) });

export const syncEntrySchema = entrySchema;
export type SyncEntry = z.infer<typeof syncEntrySchema>;

export const pushEntriesSchema = z.object({ entries: z.array(syncEntrySchema).max(SYNC_LIMITS.entriesPerPush) });

export interface PushBoxesResult {
  /** Ids the server now holds at the pushed version. */
  accepted: string[];
  /** Server rows that were newer and were kept; the app adopts them. */
  conflicts: SyncBox[];
  /** Ids that belong to another account; the app should re-mint them. */
  rejected: string[];
  server_time: number;
}

export interface PullBoxesResult {
  boxes: SyncBox[];
  server_time: number;
}

export interface AccountInfo {
  id: string;
  clerk_user_id: string;
  plan: string;
  created_at: number;
  updated_at: number;
}

/** Last writer wins on updated_at; ties keep the server copy. */
export function remoteWins(local: Pick<SyncBox, 'updated_at'> | undefined, remote: Pick<SyncBox, 'updated_at'>): boolean {
  return local === undefined || remote.updated_at > local.updated_at;
}
