import { z } from 'zod';

/**
 * Ledger v0. All money is an integer count of micro-dollars (1/1,000,000 USD).
 * Never a float. Balance is computed from entries, never stored as truth.
 */

export const MICRO_PER_DOLLAR = 1_000_000;
/** One "credit" in the billing dialect is one cent. */
export const CREDIT_MICRO = 10_000;

/** edit = a change to the interface (price 0); it is on the chain so the activity feed is verifiable. */
export const ENTRY_KINDS = ['charge', 'credit', 'settle', 'edit'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const UNIT_KINDS = ['token_in', 'token_out', 'byte', 'call', 'second', 'op'] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

const integer = z.number().int().finite();
const nonNegativeInteger = integer.min(0);
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

/** What a producer (router, app) proposes before it is chained. */
export const entryDraftSchema = z.object({
  box_id: z.string(),
  owner_identity: z.string(),
  kind: z.enum(ENTRY_KINDS),
  what: z.string().min(1),
  /** Served model id for model calls ('' otherwise). */
  model: z.string(),
  units: nonNegativeInteger,
  unit_kind: z.enum(UNIT_KINDS),
  cost_micro: nonNegativeInteger,
  price_micro: nonNegativeInteger,
  ref: z.string(),
  created_at: integer,
});
export type EntryDraft = z.infer<typeof entryDraftSchema>;

/** A chained, stored entry. */
export const entrySchema = entryDraftSchema.extend({
  id: z.string(),
  prev_hash: hex64,
  hash: hex64,
  /** Present only when the owner opted onto the shared chain. */
  shared_prev_hash: hex64.nullable(),
  shared_hash: hex64.nullable(),
});
export type Entry = z.infer<typeof entrySchema>;

export const GENESIS_HASH = '0'.repeat(64);

export function assertMicro(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer of micro-dollars, got ${value}`);
  }
  return value;
}

export function dollarsToMicro(dollars: number): number {
  return Math.round(dollars * MICRO_PER_DOLLAR);
}

export function formatMicro(micro: number, fractionDigits = 4): string {
  const sign = micro < 0 ? '-' : '';
  const abs = Math.abs(micro);
  const dollars = Math.floor(abs / MICRO_PER_DOLLAR);
  const remainder = abs % MICRO_PER_DOLLAR;
  const fraction = remainder.toString().padStart(6, '0').slice(0, fractionDigits);
  return `${sign}$${dollars}.${fraction}`;
}

/** Applies a margin in basis points (1/100 of a percent) with integer math. */
export function applyMarginBasisPoints(costMicro: number, basisPoints: number): number {
  assertMicro(costMicro, 'cost');
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new RangeError(`basis points must be a non-negative integer, got ${basisPoints}`);
  }
  return costMicro + Math.round((costMicro * basisPoints) / 10_000);
}
