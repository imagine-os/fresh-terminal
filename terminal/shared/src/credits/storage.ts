/**
 * Storage pricing (2026-09-29, C-092). One constant, so the router, the app, the
 * hub and the sales site all say the same thing. NOT FINAL: Justin has not set a
 * price; enforcement is not wired until billing exists (today it is measured only).
 *
 * Your key: $0 for models, but what an account stores with us above the free
 * allowance is billed. Bytes are decimal (1 MB = 1,000,000 bytes, 1 GB = 10^9),
 * the way Cloudflare bills D1 and R2.
 */
export const STORAGE_PRICING = {
  /** Free storage per signed-in account: 100 MB. */
  freeBytes: 100_000_000,
  /** Above it: about $0.05 per GB-month, in USD micro-dollars. */
  microPerGbMonth: 50_000,
  /** Not a final price. */
  final: false,
  /** Enforcement: not wired until billing exists; the router only measures. */
  enforced: false,
} as const;

export interface StorageStatus {
  used_bytes: number;
  free_bytes: number;
  over_bytes: number;
  micro_per_gb_month: number;
  /** What the part above the allowance would cost a month at today's (not final) price. */
  estimate_micro_per_month: number;
  measured_at: number;
  final: boolean;
  enforced: boolean;
  label: string;
}

export function storageStatus(usedBytes: number, measuredAt: number): StorageStatus {
  const over = Math.max(0, usedBytes - STORAGE_PRICING.freeBytes);
  return {
    used_bytes: usedBytes,
    free_bytes: STORAGE_PRICING.freeBytes,
    over_bytes: over,
    micro_per_gb_month: STORAGE_PRICING.microPerGbMonth,
    estimate_micro_per_month: Math.ceil((over * STORAGE_PRICING.microPerGbMonth) / 1_000_000_000),
    measured_at: measuredAt,
    final: STORAGE_PRICING.final,
    enforced: STORAGE_PRICING.enforced,
    label: 'storage (100 MB free; price not final; not billed yet)',
  };
}
