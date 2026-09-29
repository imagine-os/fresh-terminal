import type { StorageStatus } from './storage';

/**
 * Free credits, as the router reports them (2026-09-29). Money is integer
 * micro-dollars. The router enforces every number here; the browser only
 * displays them.
 */
export interface CreditsStatus {
  signed_in: boolean;
  /**
   * What people see for this mode. Anonymous devices: "free usage" (Justin, 2026-09-29); signed-in
   * accounts: "starter kit", shown as "of $5 starter kit" (C-089). Bring-your-own stays "your key".
   */
  label: string;
  /** Who pays for this browser's calls: a signed-in account, an anonymous device, or nobody yet. */
  mode: 'account' | 'device' | 'none';
  granted_micro: number;
  /** Same as granted_micro (USD micro-dollars), for the "of $5 starter kit" line (C-089). */
  granted: number;
  spent_micro: number;
  remaining_micro: number;
  /** Soft "sign in to keep going" prompts still available before sign-in is required (anonymous only). */
  soft_prompts_left: number;
  /** The next paid call needs sign-in (anonymous credits and prompts used up, or the daily anonymous cap hit). */
  sign_in_required: boolean;
  /** This device was issued past the per-IP / per-network limit and has no starter grant. */
  limited: boolean;
  /** Today's cap is reached (UTC): the global signed-out cap, or for accounts their own or the all-accounts cap. */
  daily_cap_reached: boolean;
  /** Bot check before the first paid call (on POST /credits/device). */
  turnstile: 'on' | 'not-wired';
  /** Public Turnstile site key when the check is on. */
  turnstile_sitekey?: string;
  /** Signed-in accounts only: the pass-through billing gate (C-086). */
  billing?: AccountBilling;
  /** Signed-in accounts only (GET /credits): what the account stores with us (C-091; measured, not billed yet). */
  storage?: StorageStatus;
  /** Signed-in accounts only: the person chose to share their data with Fresh Terminal (C-090; off by default). */
  share_data?: boolean;
}

/**
 * Pass-through billing for a signed-in account (2026-09-29, C-086). Free usage
 * runs up to the credit limit, min(granted, threshold); past it the account
 * needs a payment method and pays for usage at cost plus our fee. Grants,
 * invite codes and paid top-ups raise both numbers by the same amount.
 */
export type BillingState = 'free' | 'needs_payment' | 'active';

export interface AccountBilling {
  state: BillingState;
  /** Lifetime free usage before a payment method is needed ($5 by default). */
  threshold_micro: number;
  /** min(granted_micro, threshold_micro): what this account can spend before paying. */
  credit_limit_micro: number;
  /** What a payment provider has charged this account in total. */
  paid_micro: number;
  /** "not-wired" until a payment provider is connected on the router: Stripe Checkout top-ups, or Clerk Billing refill plans (C-092). */
  provider: 'stripe' | 'clerk' | 'not-wired';
}

/** Error codes a paid endpoint answers with (HTTP 401/402/403/413/429). */
export type CreditsErrorCode =
  | 'device_required'
  | 'sign_in_required'
  | 'daily_cap'
  | 'account_credits_exhausted'
  /** A signed-in account hit its daily free usage, or all accounts together hit theirs. */
  | 'account_daily_cap'
  /** Lifetime free usage reached the account's billing threshold: add a payment method (or use your key). */
  | 'payment_required'
  | 'rate_limited'
  | 'too_large'
  | 'model_needs_sign_in'
  | 'turnstile_failed';

export interface CreditsError {
  error: string;
  code: CreditsErrorCode;
  credits?: CreditsStatus;
}

/** Response header set when a soft prompt was used to let this call through: "1/2", "2/2". */
export const SOFT_PROMPT_HEADER = 'X-FT-Soft-Prompt';
/** Request header carrying the signed anonymous device id. */
export const DEVICE_HEADER = 'X-FT-Device';
