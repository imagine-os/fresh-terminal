import { formatMicro } from '@shared/ledger';
import { routerFetch } from '../lib/routerFetch';
import { forgetReferral, storedReferral } from '../lib/arrival';
import { refreshCredits } from './useCredits';

/**
 * The "Buy credits" hook and invite codes (2026-09-29, C-086, C-087, C-093; renamed from
 * "Top up" by C-103). Credits first: with Clerk Billing on, it opens the Billing tab of
 * Clerk's profile window, where auto-renewing refill plans live; the Stripe Checkout
 * fallback asks the router for a page. Until either is configured the router answers
 * 501 not_wired and this says so. Invite codes land as credit on the signed-in account.
 */
export type TopUpResult = { kind: 'redirect'; url: string } | { kind: 'clerk' } | { kind: 'not-wired' } | { kind: 'sign-in' } | { kind: 'error'; message: string };

export async function startTopUp(amountUsd = 10): Promise<TopUpResult> {
  try {
    const response = await routerFetch('/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount_usd: amountUsd }) });
    const body = (await response.json().catch(() => ({}))) as { url?: string; code?: string; error?: string; provider?: string };
    if (response.status === 401) return { kind: 'sign-in' };
    if (response.status === 501 || body.code === 'not_wired') return { kind: 'not-wired' };
    // Clerk Billing (C-093): the refill plans live in the Billing tab of Clerk's profile window.
    if (response.ok && body.provider === 'clerk') return { kind: 'clerk' };
    if (response.ok && body.url && /^https:\/\/checkout\.stripe\.com\//.test(body.url)) return { kind: 'redirect', url: body.url };
    return { kind: 'error', message: body.error ?? `HTTP ${response.status}` };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

export type RedeemResult = { ok: true; amount: string } | { ok: false; message: string; signIn?: boolean };

export async function redeemInviteCode(code: string): Promise<RedeemResult> {
  try {
    const response = await routerFetch('/credits/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const body = (await response.json().catch(() => ({}))) as { amount_micro?: number; error?: string };
    if (response.status === 401) return { ok: false, message: body.error ?? 'Sign in first.', signIn: true };
    if (!response.ok) return { ok: false, message: body.error ?? `HTTP ${response.status}` };
    void refreshCredits();
    return { ok: true, amount: formatMicro(Number(body.amount_micro ?? 0), 2) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export type ReferralClaim = { ok: true; bonus: string } | { ok: false; message: string } | null;

/** After sign-in: claim the ?ref= code this browser kept (C-107), once. null when there is none. */
export async function claimStoredReferral(): Promise<ReferralClaim> {
  const code = storedReferral();
  if (!code) return null;
  const result = await claimReferralCode(code);
  if (result.ok || !('retry' in result && result.retry)) forgetReferral();
  return result.ok ? { ok: true, bonus: result.bonus } : { ok: false, message: result.message };
}

/** Claims a friend's referral code for this (new) account. */
export async function claimReferralCode(code: string): Promise<{ ok: true; bonus: string } | { ok: false; message: string; retry?: boolean }> {
  try {
    const response = await routerFetch('/me/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const body = (await response.json().catch(() => ({}))) as { bonus_micro?: number; error?: string };
    if (response.status === 401) return { ok: false, message: body.error ?? 'Sign in first.', retry: true };
    if (!response.ok) return { ok: false, message: body.error ?? `HTTP ${response.status}`, retry: response.status >= 500 };
    void refreshCredits();
    return { ok: true, bonus: formatMicro(Number(body.bonus_micro ?? 0), 2) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error), retry: true };
  }
}

/** An admin invite code looks like FT-XXXX-XXXX; anything else is taken as a friend's referral code. */
export function isInviteCode(code: string): boolean {
  return /^FT-[A-Z2-9]{4}-[A-Z2-9]{4}$/i.test(code.trim());
}

