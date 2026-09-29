/**
 * Free credits, as the router reports them (2026-09-29). Money is integer
 * micro-dollars. The router enforces every number here; the browser only
 * displays them.
 */
export interface CreditsStatus {
  signed_in: boolean;
  /** What people see for this mode (Justin, 2026-09-29: "free usage"; bring-your-own stays "your key"). */
  label: string;
  /** Who pays for this browser's calls: a signed-in account, an anonymous device, or nobody yet. */
  mode: 'account' | 'device' | 'none';
  granted_micro: number;
  spent_micro: number;
  remaining_micro: number;
  /** Soft "sign in to keep going" prompts still available before sign-in is required (anonymous only). */
  soft_prompts_left: number;
  /** The next paid call needs sign-in (anonymous credits and prompts used up, or the daily anonymous cap hit). */
  sign_in_required: boolean;
  /** This device was issued past the per-IP / per-network limit and has no starter grant. */
  limited: boolean;
  /** The global daily cap on anonymous spend is reached for today (UTC). */
  daily_cap_reached: boolean;
  /** Bot check before the first paid call. */
  turnstile: 'on' | 'not-wired';
}

/** Error codes a paid endpoint answers with (HTTP 401/402/403/413/429). */
export type CreditsErrorCode =
  | 'device_required'
  | 'sign_in_required'
  | 'daily_cap'
  | 'account_credits_exhausted'
  | 'rate_limited'
  | 'too_large'
  | 'model_needs_sign_in';

export interface CreditsError {
  error: string;
  code: CreditsErrorCode;
  credits?: CreditsStatus;
}

/** Response header set when a soft prompt was used to let this call through: "1/2", "2/2". */
export const SOFT_PROMPT_HEADER = 'X-FT-Soft-Prompt';
/** Request header carrying the signed anonymous device id. */
export const DEVICE_HEADER = 'X-FT-Device';
