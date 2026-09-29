import { describe, expect, it } from 'vitest';
import {
  balanceMicro,
  chainEntry,
  headsAfter,
  usedMicro,
  verifyLedger,
  verifyOwnerChain,
  verifySharedChain,
} from './chain';
import {
  GENESIS_HASH,
  applyMarginBasisPoints,
  dollarsToMicro,
  formatMicro,
  type Entry,
  type EntryDraft,
} from './types';

function draft(overrides: Partial<EntryDraft> = {}): EntryDraft {
  return {
    box_id: 'box-1',
    owner_identity: 'owner-a',
    kind: 'charge',
    what: 'model.call',
    model: 'test/model',
    units: 1,
    unit_kind: 'call',
    cost_micro: 420,
    price_micro: 420,
    ref: 'gen-1',
    created_at: 1_700_000_000_000,
    ...overrides,
  };
}

function buildChain(count: number, onChain: boolean, owner = 'owner-a'): Entry[] {
  const entries: Entry[] = [];
  for (let index = 0; index < count; index += 1) {
    entries.push(
      chainEntry(draft({ owner_identity: owner, ref: `gen-${index}` }), {
        id: `e-${owner}-${index}`,
        onChain,
        heads: headsAfter(entries, owner),
      }),
    );
  }
  return entries;
}

describe('ledger chain', () => {
  it('links the first entry to the genesis hash', () => {
    const [first] = buildChain(1, false);
    expect(first?.prev_hash).toBe(GENESIS_HASH);
    expect(first?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first?.shared_hash).toBeNull();
  });

  it('verifies an untouched chain', () => {
    const entries = buildChain(5, true);
    expect(verifyOwnerChain(entries)).toEqual({ ok: true, count: 5, brokenAt: null, reason: null });
    expect(verifySharedChain(entries)).toEqual({ ok: true, count: 5, brokenAt: null, reason: null });
  });

  it('detects a tampered model id', () => {
    const entries = buildChain(2, false);
    (entries[0] as Entry).model = 'other/model';
    expect(verifyOwnerChain(entries)).toMatchObject({ ok: false, brokenAt: 0, reason: 'hash mismatch' });
  });

  it('detects a tampered amount', () => {
    const entries = buildChain(4, true);
    (entries[1] as Entry).price_micro = 1;
    const owner = verifyOwnerChain(entries);
    expect(owner.ok).toBe(false);
    expect(owner.brokenAt).toBe(1);
    expect(owner.reason).toBe('hash mismatch');
    expect(verifySharedChain(entries).ok).toBe(false);
  });

  it('detects a removed entry in the middle', () => {
    const entries = buildChain(4, false);
    entries.splice(2, 1);
    const result = verifyOwnerChain(entries);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toBe('prev_hash mismatch');
  });

  it('keeps owners on separate chains and only opted-in owners on the shared chain', () => {
    const a = buildChain(2, true, 'owner-a');
    const b: Entry[] = [];
    for (let index = 0; index < 2; index += 1) {
      b.push(
        chainEntry(draft({ owner_identity: 'owner-b' }), {
          id: `e-b-${index}`,
          onChain: false,
          heads: headsAfter([...a, ...b], 'owner-b'),
        }),
      );
    }
    const ledger = verifyLedger([...a, ...b]);
    expect(ledger.owners['owner-a']?.ok).toBe(true);
    expect(ledger.owners['owner-b']?.ok).toBe(true);
    expect(ledger.shared).toEqual({ ok: true, count: 2, brokenAt: null, reason: null });
  });

  it('computes balance and usage with integers', () => {
    const entries = buildChain(3, false);
    entries.push(
      chainEntry(draft({ kind: 'credit', what: 'promo', model: '', price_micro: 5_000, cost_micro: 0 }), {
        id: 'credit-1',
        onChain: false,
        heads: headsAfter(entries, 'owner-a'),
      }),
    );
    expect(usedMicro(entries)).toBe(1260);
    expect(balanceMicro(entries)).toBe(5_000 - 1260);
  });
});

describe('integer money', () => {
  it('converts dollars to micro and back to text without float drift', () => {
    expect(dollarsToMicro(0.0042)).toBe(4200);
    expect(formatMicro(4200)).toBe('$0.0042');
    expect(formatMicro(1_234_567)).toBe('$1.2345');
    expect(formatMicro(-500)).toBe('-$0.0005');
  });

  it('applies margins in basis points with rounding', () => {
    expect(applyMarginBasisPoints(1000, 0)).toBe(1000);
    expect(applyMarginBasisPoints(1000, 1000)).toBe(1100);
    expect(applyMarginBasisPoints(333, 250)).toBe(341);
    expect(() => applyMarginBasisPoints(10.5, 0)).toThrow(RangeError);
    expect(() => applyMarginBasisPoints(10, -1)).toThrow(RangeError);
  });
});
