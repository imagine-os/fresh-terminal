import { formatMicro } from '@shared/ledger';
import { routerFetch } from '../lib/routerFetch';
import { refreshCredits } from './useCredits';

/**
 * The "Top up / add payment" hook and invite codes (2026-09-29, C-086, C-087).
 * Top up asks the router for a Stripe Checkout page; until STRIPE_SECRET_KEY
 * and STRIPE_WEBHOOK_SECRET are set there, it answers 501 not_wired and this
 * says so. Invite codes land as credit on the signed-in account.
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
