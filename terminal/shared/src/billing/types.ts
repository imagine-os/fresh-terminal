import { z } from 'zod';

/**
 * Billing dialect v0. Plain words with fixed meanings:
 *   charge, credit, balance, price, cost, margin, settle, pass-through, on chain.
 *
 * Text form:
 *   Model calls: pass-through plus 0%.
 *   Storage: 1 credit per MB per month.
 *   Actions: 2 credits per call.
 *   Settle: monthly.
 *   On chain: opt-in.
 */

export const BILLING_SUBJECTS = ['modelCalls', 'storage', 'actions'] as const;
export type BillingSubject = (typeof BILLING_SUBJECTS)[number];

export const BILLING_UNITS = ['token', 'call', 'MB', 'GB', 'byte'] as const;
export type BillingUnit = (typeof BILLING_UNITS)[number];

export const BILLING_PERIODS = ['once', 'day', 'month', 'year'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const SETTLE_WORDS = ['manual', 'daily', 'monthly'] as const;
export type SettleWord = (typeof SETTLE_WORDS)[number];

export const ON_CHAIN_WORDS = ['off', 'opt-in', 'on'] as const;
export type OnChainWord = (typeof ON_CHAIN_WORDS)[number];

export const passThroughRuleSchema = z.object({
  mode: z.literal('passThrough'),
  /** Margin in basis points (1% = 100). Integer. */
  marginBasisPoints: z.number().int().min(0),
});

export const fixedRuleSchema = z.object({
  mode: z.literal('fixed'),
  /** Price per unit per period in micro-dollars. Integer. */
  priceMicro: z.number().int().min(0),
  unit: z.enum(BILLING_UNITS),
  period: z.enum(BILLING_PERIODS),
});

export const freeRuleSchema = z.object({ mode: z.literal('free') });

export const pricingRuleSchema = z.discriminatedUnion('mode', [
  passThroughRuleSchema,
  fixedRuleSchema,
  freeRuleSchema,
]);
export type PricingRule = z.infer<typeof pricingRuleSchema>;

export const billingSpecSchema = z.object({
  version: z.literal(0),
  rules: z.object({
    modelCalls: pricingRuleSchema,
    storage: pricingRuleSchema,
    actions: pricingRuleSchema,
  }),
  settle: z.enum(SETTLE_WORDS),
  onChain: z.enum(ON_CHAIN_WORDS),
});
export type BillingSpec = z.infer<typeof billingSpecSchema>;

export const defaultBillingText = [
  'Model calls: pass-through plus 0%.',
  'Storage: free.',
  'Actions: free.',
  'Settle: manual.',
  'On chain: opt-in.',
].join('\n');
