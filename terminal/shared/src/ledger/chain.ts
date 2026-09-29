import { sha256Hex } from './sha256';
import { GENESIS_HASH, entrySchema, type Entry, type EntryDraft } from './types';

/**
 * The simplest blockchain: append-only, hash-linked, verifiable.
 * No tokens, no wallets, no consensus. Each entry's hash covers its content and
 * the previous hash, so any edit anywhere breaks every hash after it.
 *
 * Per-owner chain always. Shared (global) chain links only for owners who
 * opted in with "on chain".
 */

const HASHED_FIELDS = [
  'id',
  'box_id',
  'owner_identity',
  'kind',
  'what',
  'model',
  'units',
  'unit_kind',
  'cost_micro',
  'price_micro',
  'ref',
  'created_at',
] as const;

type HashedFields = Pick<Entry, (typeof HASHED_FIELDS)[number]>;

/** Canonical JSON: fixed key order, no whitespace. */
export function canonicalEntryJson(entry: HashedFields): string {
  const ordered: Record<string, unknown> = {};
  for (const key of HASHED_FIELDS) {
    ordered[key] = entry[key];
  }
  return JSON.stringify(ordered);
}

export function hashEntry(entry: HashedFields, prevHash: string): string {
  return sha256Hex(prevHash + canonicalEntryJson(entry));
}

export interface ChainHeads {
  ownerHead: string;
  sharedHead: string;
}

export interface ChainOptions {
  id: string;
  onChain: boolean;
  heads: ChainHeads;
}

/** Builds a fully chained entry from a draft. Pure; does not store anything. */
export function chainEntry(draft: EntryDraft, options: ChainOptions): Entry {
  const hashed: HashedFields = { id: options.id, ...draft };
  const hash = hashEntry(hashed, options.heads.ownerHead);
  const sharedPrev = options.onChain ? options.heads.sharedHead : null;
  const sharedHash = options.onChain ? hashEntry(hashed, options.heads.sharedHead) : null;
  return entrySchema.parse({
    ...hashed,
    prev_hash: options.heads.ownerHead,
    hash,
    shared_prev_hash: sharedPrev,
    shared_hash: sharedHash,
  });
}

export interface VerifyResult {
  ok: boolean;
  count: number;
  brokenAt: number | null;
  reason: string | null;
}

function verifySequence(
  entries: Entry[],
  pick: (entry: Entry) => { prev: string | null; hash: string | null },
): VerifyResult {
  let expectedPrev = GENESIS_HASH;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] as Entry;
    const { prev, hash } = pick(entry);
    if (prev === null || hash === null) {
      return { ok: false, count: entries.length, brokenAt: index, reason: 'missing link' };
    }
    if (prev !== expectedPrev) {
      return { ok: false, count: entries.length, brokenAt: index, reason: 'prev_hash mismatch' };
    }
    const recomputed = hashEntry(entry, prev);
    if (recomputed !== hash) {
      return { ok: false, count: entries.length, brokenAt: index, reason: 'hash mismatch' };
    }
    expectedPrev = hash;
  }
  return { ok: true, count: entries.length, brokenAt: null, reason: null };
}

/** Verifies one owner's chain. Entries must be in append order. */
export function verifyOwnerChain(entries: Entry[]): VerifyResult {
  return verifySequence(entries, (entry) => ({ prev: entry.prev_hash, hash: entry.hash }));
}

/** Verifies the shared chain: only entries that carry shared links, in order. */
export function verifySharedChain(entries: Entry[]): VerifyResult {
  const linked = entries.filter((entry) => entry.shared_hash !== null);
  return verifySequence(linked, (entry) => ({
    prev: entry.shared_prev_hash,
    hash: entry.shared_hash,
  }));
}

/** Verifies every owner's chain plus the shared chain in one pass. */
export function verifyLedger(entries: Entry[]): { owners: Record<string, VerifyResult>; shared: VerifyResult } {
  const byOwner = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = byOwner.get(entry.owner_identity) ?? [];
    list.push(entry);
    byOwner.set(entry.owner_identity, list);
  }
  const owners: Record<string, VerifyResult> = {};
  for (const [owner, list] of byOwner) {
    owners[owner] = verifyOwnerChain(list);
  }
  return { owners, shared: verifySharedChain(entries) };
}

/** Balance = credits + settlements - charges, in micro-dollars. */
export function balanceMicro(entries: Entry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.kind === 'charge') {
      total -= entry.price_micro;
    } else if (entry.kind === 'credit' || entry.kind === 'settle') {
      total += entry.price_micro;
    }
  }
  return total;
}

/** Total charged so far ("$x used"). */
export function usedMicro(entries: Entry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.kind === 'charge') {
      total += entry.price_micro;
    }
  }
  return total;
}

export function headsAfter(entries: Entry[], owner: string): ChainHeads {
  let ownerHead = GENESIS_HASH;
  let sharedHead = GENESIS_HASH;
  for (const entry of entries) {
    if (entry.owner_identity === owner) {
      ownerHead = entry.hash;
    }
    if (entry.shared_hash !== null) {
      sharedHead = entry.shared_hash;
    }
  }
  return { ownerHead, sharedHead };
}
