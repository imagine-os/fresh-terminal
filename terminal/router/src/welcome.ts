/**
 * The $5 welcome credit, once per person (C-106, Justin 2026-09-29: "This is a leadmagnet. if
 * they want $5 free they have to sign in for the 1st time. its only for first time signups").
 *
 * A new account starts "pending" with no credit. On its first GET /credits or paid call the
 * router decides, once: the email must be verified in Clerk, not a disposable domain, and not an
 * alias (normalised: +tag and Gmail dots removed) of an email that already got it; the signed
 * browser device (X-FT-Device, HMAC) must not have got it on another account; and at most
 * WELCOME_PER_NET_DAILY (default 5) welcome credits go to one /24 (or /48) network a UTC day.
 * A blocked sign-up keeps its account and sees an honest line; the reason is kept internally.
 * Accounts from before this rule are "legacy" and keep what they had.
 */
import { isDisposableEmail, normalizeEmail } from '../../shared/src/credits/disposable';
import type { D1Database } from './d1';

export type WelcomeState = 'legacy' | 'pending' | 'granted' | 'blocked';

export const WELCOME_USED_MESSAGE = 'This device or email already used the $5 welcome credit.';
export const WELCOME_DISPOSABLE_MESSAGE = 'Disposable email addresses do not get the $5 welcome credit.';
export const WELCOME_NETWORK_MESSAGE = 'Too many new accounts from this network today, so the $5 welcome credit was not added.';
export const WELCOME_PENDING_MESSAGE = 'The $5 welcome credit is added once your email is verified.';
export const WELCOME_PER_NET_DAILY_DEFAULT = 5;

export interface WelcomeBindings {
  CLERK_SECRET_KEY?: string;
  WELCOME_PER_NET_DAILY?: string;
}

export interface WelcomeContext {
  accountId: string;
  clerkUserId: string;
  /** Verified device id from X-FT-Device, or null when the request carried none. */
  deviceId: string | null;
  /** /24 or /48 of the caller (credits.ts networkOf). */
  net: string;
  day: string;
  now: number;
  starterMicro: number;
  bindings: WelcomeBindings;
  fetchImpl: typeof fetch;
}

export type WelcomeDecision = { state: WelcomeState; reason: string | null; message: string | null };

/** The line a person sees for a blocked or pending welcome credit (the reason code stays internal). */
export function welcomeMessage(state: WelcomeState, reason: string | null): string | null {
  if (state === 'pending') return WELCOME_PENDING_MESSAGE;
  if (state !== 'blocked') return null;
  if (reason === 'disposable email domain') return WELCOME_DISPOSABLE_MESSAGE;
  if (reason === 'network daily limit') return WELCOME_NETWORK_MESSAGE;
  return WELCOME_USED_MESSAGE;
}

function perNetDaily(bindings: WelcomeBindings): number {
  const n = Number(bindings.WELCOME_PER_NET_DAILY);
  return bindings.WELCOME_PER_NET_DAILY !== undefined && bindings.WELCOME_PER_NET_DAILY !== '' && Number.isInteger(n) && n >= 0 ? n : WELCOME_PER_NET_DAILY_DEFAULT;
}

interface ClerkEmail {
  id?: string;
  email_address?: string;
  verification?: { status?: string } | null;
}

/** The verified email Clerk holds for this user (primary first), or null. */
async function verifiedEmail(userId: string, secret: string, fetchImpl: typeof fetch): Promise<string | null | undefined> {
  const response = await fetchImpl(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${secret}` } }).catch(() => null);
  if (!response || !response.ok) return undefined;
  const user = (await response.json().catch(() => null)) as { email_addresses?: ClerkEmail[]; primary_email_address_id?: string | null } | null;
  if (!user) return undefined;
  const verified = (user.email_addresses ?? []).filter((email) => email.verification?.status === 'verified' && email.email_address);
  const primary = verified.find((email) => email.id && email.id === user.primary_email_address_id) ?? verified[0];
  return primary?.email_address ?? null;
}

async function block(db: D1Database, ctx: WelcomeContext, reason: string, emailNorm: string | null): Promise<WelcomeDecision> {
  await db
    .prepare("UPDATE accounts SET starter_state = 'blocked', starter_reason = ?1, email_norm = COALESCE(?2, email_norm), updated_at = ?3 WHERE id = ?4 AND starter_state = 'pending'")
    .bind(reason, emailNorm, ctx.now, ctx.accountId)
    .run();
  return { state: 'blocked', reason, message: welcomeMessage('blocked', reason) };
}

async function stayPending(db: D1Database, ctx: WelcomeContext, reason: string): Promise<WelcomeDecision> {
  await db.prepare("UPDATE accounts SET starter_reason = ?1 WHERE id = ?2 AND starter_state = 'pending'").bind(reason, ctx.accountId).run();
  return { state: 'pending', reason, message: WELCOME_PENDING_MESSAGE };
}

/** Decides a pending account's welcome credit once; any other state is returned as it is. */
export async function decideWelcome(db: D1Database, ctx: WelcomeContext): Promise<WelcomeDecision> {
  const row = await db.prepare('SELECT starter_state, starter_reason FROM accounts WHERE id = ?1').bind(ctx.accountId).first<{ starter_state: WelcomeState; starter_reason: string | null }>();
  const state = (row?.starter_state ?? 'legacy') as WelcomeState;
  if (state !== 'pending') return { state, reason: row?.starter_reason ?? null, message: welcomeMessage(state, row?.starter_reason ?? null) };

  if (!ctx.bindings.CLERK_SECRET_KEY) return stayPending(db, ctx, 'email check unavailable (no CLERK_SECRET_KEY)');
  const email = await verifiedEmail(ctx.clerkUserId, ctx.bindings.CLERK_SECRET_KEY, ctx.fetchImpl);
  if (email === undefined) return stayPending(db, ctx, 'email check unavailable (Clerk lookup failed)');
  if (email === null) return stayPending(db, ctx, 'email not verified');
  const norm = normalizeEmail(email);
  if (isDisposableEmail(norm)) return block(db, ctx, 'disposable email domain', norm);

  const emailClaim = await db.prepare('SELECT account_id FROM welcome_claims WHERE key = ?1').bind(`email:${norm}`).first<{ account_id: string }>();
  if (emailClaim && emailClaim.account_id !== ctx.accountId) return block(db, ctx, email.trim().toLowerCase() === norm ? 'email already used' : 'email alias of an earlier sign-up', norm);
  if (ctx.deviceId) {
    const deviceClaim = await db.prepare('SELECT account_id FROM welcome_claims WHERE key = ?1').bind(`device:${ctx.deviceId}`).first<{ account_id: string }>();
    if (deviceClaim && deviceClaim.account_id !== ctx.accountId) return block(db, ctx, 'device already used', norm);
  }
  const net = await db.prepare('SELECT n FROM welcome_net_daily WHERE day = ?1 AND net = ?2').bind(ctx.day, ctx.net).first<{ n: number }>();
  if (Number(net?.n ?? 0) >= perNetDaily(ctx.bindings)) return block(db, ctx, 'network daily limit', norm);

  // Claim the email (and device) first: a parallel sign-up with the same email loses the race here.
  const claimed = await db.prepare('INSERT OR IGNORE INTO welcome_claims (key, account_id, created_at) VALUES (?1, ?2, ?3)').bind(`email:${norm}`, ctx.accountId, ctx.now).run();
  if ((claimed.meta?.changes ?? 1) === 0) {
    const again = await db.prepare('SELECT account_id FROM welcome_claims WHERE key = ?1').bind(`email:${norm}`).first<{ account_id: string }>();
    if (again && again.account_id !== ctx.accountId) return block(db, ctx, 'email already used', norm);
  }
  if (ctx.deviceId) await db.prepare('INSERT OR IGNORE INTO welcome_claims (key, account_id, created_at) VALUES (?1, ?2, ?3)').bind(`device:${ctx.deviceId}`, ctx.accountId, ctx.now).run();
  await db.batch([
    db
      .prepare(
        `UPDATE accounts SET
           grant_micro = grant_micro + ?1,
           billing_threshold_micro = MAX(billing_threshold_micro, grant_micro + ?1),
           starter_micro = ?1,
           starter_state = 'granted',
           starter_reason = NULL,
           email_norm = ?2,
           updated_at = ?3
         WHERE id = ?4 AND starter_state = 'pending'`,
      )
      .bind(ctx.starterMicro, norm, ctx.now, ctx.accountId),
    db
      .prepare('INSERT INTO welcome_net_daily (day, net, n) VALUES (?1, ?2, 1) ON CONFLICT(day, net) DO UPDATE SET n = n + 1')
      .bind(ctx.day, ctx.net),
  ]);
  return { state: 'granted', reason: null, message: null };
}
