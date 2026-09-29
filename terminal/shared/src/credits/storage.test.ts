import { describe, expect, it } from 'vitest';
import { STORAGE_PRICING, storageStatus } from './storage';

describe('storage pricing (C-091, not final)', () => {
  it('is free to 100 MB, then about $0.05 per GB-month', () => {
    expect(STORAGE_PRICING).toMatchObject({ freeBytes: 100_000_000, microPerGbMonth: 50_000, final: false, enforced: false });
    expect(storageStatus(50_000_000, 1).estimate_micro_per_month).toBe(0);
    expect(storageStatus(1_100_000_000, 1)).toMatchObject({ over_bytes: 1_000_000_000, estimate_micro_per_month: 50_000 });
  });
});
