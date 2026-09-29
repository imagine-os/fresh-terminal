import { entrySchema, type Entry } from '@shared/ledger';
import { SYNC_LIMITS, type PullBoxesResult, type PushBoxesResult, type SyncBox } from '@shared/sync';
import { readJson, writeJson } from '../lib/storage';

/**
 * Cloud sync for signed-in people (2026-09-29): boxes and a ledger mirror in
 * Cloudflare D1 through the router's /sync endpoints. Signed out, nothing here
 * runs and everything stays in localStorage.
 *
 * Last writer wins per box on updated_at. A box changed here since the last
 * sync is pushed with a fresh updated_at, so local edits win over older
 * server copies; an unchanged box adopts a newer server copy. Ids and
 * updated_at are kept so realtime / multiplayer can replace this later.
 */
export interface SyncSource {
  syncBoxes(): SyncBox[];
  importSyncBoxes(rows: SyncBox[]): number;
  entries(): Entry[];
}

export type SyncStatus =
  | { state: 'off' }
  | { state: 'syncing' }
  | { state: 'ok'; at: number; boxes: number; conflicts: number }
  | { state: 'error'; message: string };

interface Memory {
  lastPull: number;
  /** Per box: fingerprint and updated_at of what the server holds. */
  pushed: Record<string, { hash: string; updated_at: number }>;
  lastEntryId: string | null;
}

/** FNV-1a, enough to notice that a box changed since the last push. */
export function fingerprint(box: Pick<SyncBox, 'name' | 'state_json'>): string {
  const text = `${box.name}\u0000${box.state_json}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length.toString(36)}.${(hash >>> 0).toString(36)}`;
}

export interface CloudSyncOptions {
  routerUrl: string;
  userId: string;
  getToken: () => Promise<string | null>;
  source: SyncSource;
  fetchImpl?: typeof fetch;
  now?: () => number;
  onStatus?: (status: SyncStatus) => void;
}

export class CloudSync {
  private readonly key: string;
  private memory: Memory;
  private running: Promise<void> | null = null;
  private again = false;
  /** Server updated_at of boxes whose local edit is kept over a newer server copy (push must beat it). */
  private readonly floor = new Map<string, number>();

  constructor(private readonly options: CloudSyncOptions) {
    this.key = `fresh-terminal.sync.v1.${options.userId}`;
    this.memory = readJson<Memory>(this.key, { lastPull: 0, pushed: {}, lastEntryId: null });
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.options.getToken();
    if (!token) throw new Error('Signed out');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await (this.options.fetchImpl ?? fetch)(`${this.options.routerUrl}${path}`, { ...init, headers });
    const body = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body;
  }

  private save(): void {
    writeJson(this.key, this.memory);
  }

  /** Pull, then push. Calls made while one is running are folded into one more run. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.once();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async once(): Promise<void> {
    this.options.onStatus?.({ state: 'syncing' });
    try {
      const conflicts = (await this.pull()) + (await this.pushBoxes());
      await this.pushEntries();
      this.save();
      this.options.onStatus?.({ state: 'ok', at: this.now(), boxes: Object.keys(this.memory.pushed).length, conflicts });
    } catch (error) {
      this.options.onStatus?.({ state: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  private localById(): Map<string, SyncBox> {
    return new Map(this.options.source.syncBoxes().map((box) => [box.id, box]));
  }

  private async pull(): Promise<number> {
    const result = await this.request<PullBoxesResult>(`/sync/boxes?since=${this.memory.lastPull}`);
    const local = this.localById();
    const adopt: SyncBox[] = [];
    let kept = 0;
    for (const remote of result.boxes) {
      const here = local.get(remote.id);
      const seen = this.memory.pushed[remote.id];
      const changedHere = here !== undefined && (seen === undefined || fingerprint(here) !== seen.hash);
      if (changedHere) {
        kept += 1; // local edit wins; pushBoxes sends it with an updated_at above the server's
        this.floor.set(remote.id, Math.max(this.floor.get(remote.id) ?? 0, remote.updated_at));
        continue;
      }
      if (seen === undefined || remote.updated_at > seen.updated_at) {
        adopt.push(remote);
        this.memory.pushed[remote.id] = { hash: fingerprint(remote), updated_at: remote.updated_at };
      }
    }
    if (adopt.length > 0) this.options.source.importSyncBoxes(adopt);
    this.memory.lastPull = Math.max(this.memory.lastPull, result.server_time - 1);
    return kept;
  }

  private async pushBoxes(): Promise<number> {
    const changed: SyncBox[] = [];
    for (const box of this.options.source.syncBoxes()) {
      const seen = this.memory.pushed[box.id];
      const hash = fingerprint(box);
      if (seen && seen.hash === hash) continue;
      const updated_at = Math.max(this.now(), (seen?.updated_at ?? 0) + 1, (this.floor.get(box.id) ?? 0) + 1, box.updated_at);
      changed.push({ ...box, updated_at });
    }
    let conflicts = 0;
    for (let start = 0; start < changed.length; start += SYNC_LIMITS.boxesPerPush) {
      const batch = changed.slice(start, start + SYNC_LIMITS.boxesPerPush);
      const result = await this.request<PushBoxesResult>('/sync/boxes', { method: 'PUT', body: JSON.stringify({ boxes: batch }) });
      const byId = new Map(batch.map((box) => [box.id, box]));
      for (const id of result.accepted) {
        this.floor.delete(id);
        const box = byId.get(id);
        if (box) this.memory.pushed[id] = { hash: fingerprint(box), updated_at: box.updated_at };
      }
      if (result.conflicts.length > 0) {
        this.options.source.importSyncBoxes(result.conflicts);
        for (const row of result.conflicts) this.memory.pushed[row.id] = { hash: fingerprint(row), updated_at: row.updated_at };
      }
      conflicts += result.conflicts.length + result.rejected.length;
    }
    return conflicts;
  }

  private async pushEntries(): Promise<void> {
    const entries = this.options.source.entries();
    const from = this.memory.lastEntryId === null ? 0 : entries.findIndex((entry) => entry.id === this.memory.lastEntryId) + 1;
    // Entries from older builds that no longer parse stay local rather than failing the whole push.
    const pending = entries.slice(from).filter((entry) => entrySchema.safeParse(entry).success);
    for (let start = 0; start < pending.length; start += SYNC_LIMITS.entriesPerPush) {
      const batch = pending.slice(start, start + SYNC_LIMITS.entriesPerPush);
      await this.request('/sync/ledger', { method: 'POST', body: JSON.stringify({ entries: batch }) });
      this.memory.lastEntryId = batch[batch.length - 1]?.id ?? this.memory.lastEntryId;
    }
  }
}
