/**
 * Referrals (C-107, Justin 2026-09-29: "We do need a generous referral/affiliate program tho").
 *
 * Every account has a link, freshterminal.ai/?ref=CODE. A friend who signs up through it and is a
 * first-time sign-up (their $5 welcome credit was granted, C-106; within 7 days of sign-up) gets
 * $5 extra. The referrer gets $5 once the friend has spent their free $5 or bought any credits,
 * whichever comes first (so fake sign-ups pay nothing), then 50% of our markup on the friend's paid
 * usage for 12 months, as credit. At most 50 rewards per referrer per UTC month. No self-referral
 * (same account, email or device; the same payment method is checked once payments are wired).
 * A refunded payment by the friend reverses the referrer's reward. Cash-out to money: not wired yet.
 * Every credit is a credit line on the ledger (credit.referral_*), like admin grants.
 */
import {
  REFERRAL_BONUS_MICRO,
  REFERRAL_CLAIM_DAYS,
  REFERRAL_MONTHLY_CAP,
  REFERRAL_QUALIFY_SPEND_MICRO,
  REFERRAL_REWARD_MICRO,
  REFERRAL_SHARE_BP,
  REFERRAL_SHARE_DAYS,
} from '../../shared/src/credits/types';
import { applyCredit } from './admin';
import type { D1Database } from './d1';

const DAY = 24 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Shares are paid out as a credit line once they reach 1¢. */
const SHARE_PAYOUT_MIN_MICRO = 10_000;

export function newReferralCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < 8; i += 1) out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return out;
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The account's referral code, made on first ask. */
export async function referralCodeFor(db: D1Database, accountId: string): Promise<string> {
  const row = await db.prepare('SELECT referral_code FROM accounts WHERE id = ?1').bind(accountId).first<{ referral_code: string | null }>();
  if (row?.referral_code) return row.referral_code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newReferralCode();
    try {
      await db.prepare('UPDATE accounts SET referral_code = ?1 WHERE id = ?2 AND referral_code IS NULL').bind(code, accountId).run();
    } catch {
      continue; // taken by someone else (unique index): try another
    }
    const again = await db.prepare('SELECT referral_code FROM accounts WHERE id = ?1').bind(accountId).first<{ referral_code: string | null }>();
    if (again?.referral_code) return again.referral_code;
  }
  throw new Error('could not make a referral code');
}

interface Account {
  id: string;
  clerk_user_id: string;
  created_at: number;
  starter_state: string;
  email_norm: string | null;
  referred_by: string | null;
  spent_micro: number;
  paid_micro: number;
  grant_micro: number;
}

async function account(db: D1Database, where: 'id' | 'referral_code', value: string): Promise<Account | null> {
  return db
    .prepare(`SELECT id, clerk_user_id, created_at, starter_state, email_norm, referred_by, spent_micro, paid_micro, grant_micro FROM accounts WHERE ${where} = ?1`)
    .bind(value)
    .first<Account>();
}

async function refuse(db: D1Database, referrer: string, friend: string, reason: string, now: number): Promise<void> {
  await db
    .prepare("INSERT INTO referrals (id, referrer_account, friend_account, state, reason, created_at, updated_at) VALUES (?1, ?2, ?3, 'refused', ?4, ?5, ?5)")
    .bind(`ref_${crypto.randomUUID()}`, referrer, friend, reason, now)
    .run();
}

export type ClaimResult =
  | { ok: true; bonus_micro: number }
  | { ok: false; status: 403 | 404 | 409; code: 'referral_unknown' | 'already_referred' | 'self_referral' | 'not_first_signup'; error: string };

/** The friend (signed in, welcome credit already decided) claims a referral code. */
export async function claimReferral(db: D1Database, input: { friendAccountId: string; code: string; deviceId: string | null; now: number }): Promise<ClaimResult> {
  const friend = await account(db, 'id', input.friendAccountId);
  const referrer = await account(db, 'referral_code', normalizeReferralCode(input.code));
  if (!friend || !referrer) return { ok: false, status: 404, code: 'referral_unknown', error: 'That referral link is not known.' };
  if (friend.referred_by) return { ok: false, status: 409, code: 'already_referred', error: 'This account already came through a referral.' };
  // No self-referral: the same account, the same (normalised) email, or a device the referrer's welcome credit used.
  let self: string | null = null;
  if (referrer.id === friend.id) self = 'same account';
  else if (friend.email_norm && referrer.email_norm && friend.email_norm === referrer.email_norm) self = 'same email';
  else if (input.deviceId) {
    const device = await db.prepare('SELECT account_id FROM welcome_claims WHERE key = ?1').bind(`device:${input.deviceId}`).first<{ account_id: string }>();
    if (device?.account_id === referrer.id) self = 'same device';
  }
  if (self) {
    await refuse(db, referrer.id, friend.id, `self-referral: ${self}`, input.now);
    return { ok: false, status: 403, code: 'self_referral', error: 'You cannot refer yourself.' };
  }
  if (friend.starter_state !== 'granted' || input.now - Number(friend.created_at) > REFERRAL_CLAIM_DAYS * DAY) {
    await refuse(db, referrer.id, friend.id, friend.starter_state !== 'granted' ? `not a first-time sign-up (welcome ${friend.starter_state})` : 'claimed more than 7 days after sign-up', input.now);
    return { ok: false, status: 403, code: 'not_first_signup', error: 'Referral credit is for first-time sign-ups only.' };
  }
  const id = `ref_${crypto.randomUUID()}`;
  try {
    await db
      .prepare("INSERT INTO referrals (id, referrer_account, friend_account, state, bonus_micro, created_at, updated_at) VALUES (?1, ?2, ?3, 'pending', ?4, ?5, ?5)")
      .bind(id, referrer.id, friend.id, REFERRAL_BONUS_MICRO, input.now)
      .run();
  } catch {
    return { ok: false, status: 409, code: 'already_referred', error: 'This account already came through a referral.' };
  }
  await db.prepare('UPDATE accounts SET referred_by = ?1, updated_at = ?2 WHERE id = ?3').bind(referrer.id, input.now, friend.id).run();
  await applyCredit(db, { clerkUserId: friend.clerk_user_id, amountMicro: REFERRAL_BONUS_MICRO, source: 'referral_bonus', grantedBy: referrer.clerk_user_id, note: 'referral: $5 extra for signing up through a friend', ref: `${id}:bonus` }, input.now);
  return { ok: true, bonus_micro: REFERRAL_BONUS_MICRO };
}

function monthStart(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/**
 * After the friend spends or pays: reward the referrer once the friend has spent their free $5 or
 * bought credits (capped at 50 a month per referrer), and accrue 50% of our markup on the friend's
 * paid usage for 12 months. `call` is this call's markup and how much of its price was paid money.
 */
export async function settleReferral(db: D1Database, friendAccountId: string, now: number, call: { markupMicro: number; paidPart: number; price: number } | null = null): Promise<void> {
  const referral = await db
    .prepare("SELECT id, referrer_account, state, share_until FROM referrals WHERE friend_account = ?1 AND state IN ('pending', 'rewarded') LIMIT 1")
    .bind(friendAccountId)
    .first<{ id: string; referrer_account: string; state: string; share_until: number | null }>();
  if (!referral) return;
  if (referral.state === 'pending') {
    const friend = await account(db, 'id', friendAccountId);
    if (!friend || !(Number(friend.spent_micro) >= REFERRAL_QUALIFY_SPEND_MICRO || Number(friend.paid_micro) > 0)) return;
    const referrer = await account(db, 'id', referral.referrer_account);
    if (!referrer) return;
    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM referrals WHERE referrer_account = ?1 AND state = 'rewarded' AND rewarded_at >= ?2")
      .bind(referrer.id, monthStart(now))
      .first<{ n: number }>();
    if (Number(count?.n ?? 0) >= REFERRAL_MONTHLY_CAP) {
      await db.prepare("UPDATE referrals SET state = 'capped', reason = 'monthly cap of 50 rewards reached', updated_at = ?1 WHERE id = ?2 AND state = 'pending'").bind(now, referral.id).run();
      return;
    }
    const moved = await db
      .prepare("UPDATE referrals SET state = 'rewarded', reward_micro = ?1, rewarded_at = ?2, share_until = ?3, updated_at = ?2 WHERE id = ?4 AND state = 'pending'")
      .bind(REFERRAL_REWARD_MICRO, now, now + REFERRAL_SHARE_DAYS * DAY, referral.id)
      .run();
    if ((moved.meta?.changes ?? 1) === 0) return;
    await applyCredit(db, { clerkUserId: referrer.clerk_user_id, amountMicro: REFERRAL_REWARD_MICRO, source: 'referral_reward', grantedBy: 'referrals', note: 'referral: your friend started using Fresh Terminal', ref: `${referral.id}:reward` }, now);
    return;
  }
  if (call && call.markupMicro > 0 && call.paidPart > 0 && call.price > 0 && referral.share_until !== null && now < Number(referral.share_until)) {
    const share = Math.floor((call.markupMicro * (call.paidPart / call.price) * REFERRAL_SHARE_BP) / 10_000);
    if (share > 0) await db.prepare('UPDATE referrals SET share_accrued_micro = share_accrued_micro + ?1, updated_at = ?2 WHERE id = ?3').bind(share, now, referral.id).run();
  }
}

/** Pays the referrer's accrued markup shares as one credit line once they reach 1¢. */
export async function payoutShares(db: D1Database, referrerAccountId: string, now: number): Promise<void> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(share_accrued_micro - share_paid_micro), 0) AS due FROM referrals WHERE referrer_account = ?1 AND state = 'rewarded'")
    .bind(referrerAccountId)
    .first<{ due: number }>();
  const due = Number(row?.due ?? 0);
  if (due < SHARE_PAYOUT_MIN_MICRO) return;
  const referrer = await account(db, 'id', referrerAccountId);
  if (!referrer) return;
  await db.prepare("UPDATE referrals SET share_paid_micro = share_accrued_micro, updated_at = ?1 WHERE referrer_account = ?2 AND state = 'rewarded'").bind(now, referrerAccountId).run();
  await applyCredit(db, { clerkUserId: referrer.clerk_user_id, amountMicro: due, source: 'referral_share', grantedBy: 'referrals', note: 'referral: 50% of our markup on your friends’ paid usage', ref: `share:${referrerAccountId}:${now}` }, now);
}

/** A refunded payment by the friend: take back the referrer's reward and paid shares, and stop the share. */
export async function reverseReferral(db: D1Database, friendAccountId: string, now: number, reason: string): Promise<boolean> {
  const referral = await db
    .prepare("SELECT id, referrer_account, state, reward_micro, share_paid_micro FROM referrals WHERE friend_account = ?1 AND state IN ('pending', 'rewarded') LIMIT 1")
    .bind(friendAccountId)
    .first<{ id: string; referrer_account: string; state: string; reward_micro: number; share_paid_micro: number }>();
  if (!referral) return false;
  await db.prepare("UPDATE referrals SET state = 'reversed', reason = ?1, updated_at = ?2 WHERE id = ?3").bind(reason, now, referral.id).run();
  const back = referral.state === 'rewarded' ? Number(referral.reward_micro) + Number(referral.share_paid_micro) : 0;
  if (back > 0) {
    const referrer = await account(db, 'id', referral.referrer_account);
    if (referrer) await applyCredit(db, { clerkUserId: referrer.clerk_user_id, amountMicro: -back, source: 'referral_reversal', grantedBy: 'referrals', note: `referral reversed: ${reason}`, ref: `${referral.id}:reversal` }, now);
  }
  return true;
}

/** What Settings → Invite shows the referrer. */
export async function referralSummary(db: D1Database, accountId: string, siteUrl: string, now: number) {
  await payoutShares(db, accountId, now);
  const code = await referralCodeFor(db, accountId);
  const totals = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN state != 'refused' THEN 1 ELSE 0 END) AS friends,
         SUM(CASE WHEN state = 'rewarded' THEN 1 ELSE 0 END) AS rewarded,
         SUM(CASE WHEN state = 'pending' THEN 1 ELSE 0 END) AS pending,
         COALESCE(SUM(CASE WHEN state = 'rewarded' THEN reward_micro + share_paid_micro ELSE 0 END), 0) AS earned,
         COALESCE(SUM(CASE WHEN state = 'rewarded' THEN share_accrued_micro - share_paid_micro ELSE 0 END), 0) AS share_due
       FROM referrals WHERE referrer_account = ?1`,
    )
    .bind(accountId)
    .first<{ friends: number | null; rewarded: number | null; pending: number | null; earned: number; share_due: number }>();
  return {
    code,
    link: `${siteUrl.replace(/\/$/, '')}/?ref=${code}`,
    friends: Number(totals?.friends ?? 0),
    rewarded: Number(totals?.rewarded ?? 0),
    pending: Number(totals?.pending ?? 0),
    earned_micro: Number(totals?.earned ?? 0),
    share_due_micro: Number(totals?.share_due ?? 0),
    rules: {
      friend_bonus_micro: REFERRAL_BONUS_MICRO,
      reward_micro: REFERRAL_REWARD_MICRO,
      reward_after: 'your friend spends their free $5 or buys credits, whichever comes first',
      share_bp: REFERRAL_SHARE_BP,
      share_months: 12,
      monthly_cap: REFERRAL_MONTHLY_CAP,
      first_time_only: true,
    },
    cash_out: 'not wired yet' as const,
  };
}

/** Totals for the hub (C-107): counts and sums only, never who referred whom. */
export async function referralTotals(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS claims,
         SUM(CASE WHEN state = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN state = 'rewarded' THEN 1 ELSE 0 END) AS rewarded,
         SUM(CASE WHEN state = 'capped' THEN 1 ELSE 0 END) AS capped,
         SUM(CASE WHEN state = 'refused' THEN 1 ELSE 0 END) AS refused,
         SUM(CASE WHEN state = 'reversed' THEN 1 ELSE 0 END) AS reversed,
         COALESCE(SUM(CASE WHEN state != 'refused' THEN bonus_micro ELSE 0 END), 0) AS bonus_micro,
         COALESCE(SUM(CASE WHEN state = 'rewarded' THEN reward_micro ELSE 0 END), 0) AS reward_micro,
         COALESCE(SUM(share_paid_micro), 0) AS share_paid_micro
       FROM referrals`,
    )
    .first<Record<string, number | null>>();
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(row ?? {})) out[key] = Number(value ?? 0);
  return out;
}
