import { beforeEach, describe, expect, it } from 'vitest';
import { applyCredit, clearAdminCache } from './admin';
import { reverseReferral, settleReferral } from './referrals';
import { signupHarness } from './testing/signup';

// C-107 (Justin, 2026-09-29): "We do need a generous referral/affiliate program tho".
beforeEach(() => clearAdminCache());

async function pair() {
  const h = signupHarness();
  await h.signUp('user_ref', 'ref@example.com', { device: 'fd1_ref', ip: '203.0.113.1' });
  const mine = await h.call('/me/referral', { user: 'user_ref', device: 'fd1_ref', ip: '203.0.113.1' });
  await h.signUp('user_friend', 'friend@example.com', { device: 'fd1_friend', ip: '198.51.100.20' });
  return { h, code: String(mine.body.code), link: String(mine.body.link) };
}

describe('referrals', () => {
  it('gives every account a link; the friend gets $5 extra ($10 in all) once; the referrer gets $5 after the friend spends their free $5', async () => {
    const { h, code, link } = await pair();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(link).toBe(`https://freshterminal.ai/?ref=${code}`);
    const claim = await h.call('/me/referral', { user: 'user_friend', device: 'fd1_friend', ip: '198.51.100.20', body: { code: code.toLowerCase() } });
    expect(claim.body).toEqual({ ok: true, bonus_micro: 5_000_000 });
    expect((await h.call('/credits', { user: 'user_friend' })).body.granted_micro).toBe(10_000_000);
    expect((await h.call('/me/referral', { user: 'user_friend', body: { code } })).body.code).toBe('already_referred');
    // Signing up is not enough: nothing for the referrer yet.
    let summary = (await h.call('/me/referral', { user: 'user_ref' })).body;
    expect(summary).toMatchObject({ friends: 1, pending: 1, rewarded: 0, earned_micro: 0, cash_out: 'not wired yet', rules: { friend_bonus_micro: 5_000_000, reward_micro: 5_000_000, share_bp: 5000, share_months: 12, monthly_cap: 50 } });
    // The friend spends their free $5: the referrer gets $5 as a ledger credit line.
    await h.db.prepare("UPDATE accounts SET spent_micro = 5000000 WHERE id = 'acct_user_friend'").run();
    await settleReferral(h.db, 'acct_user_friend', h.now());
    summary = (await h.call('/me/referral', { user: 'user_ref' })).body;
    expect(summary).toMatchObject({ rewarded: 1, pending: 0, earned_micro: 5_000_000 });
    expect((await h.call('/credits', { user: 'user_ref' })).body.granted_micro).toBe(10_000_000);
    const line = await h.db.prepare("SELECT kind, what, price_micro FROM ledger_entries WHERE account_id = 'acct_user_ref' AND what = 'credit.referral_reward'").first();
    expect(line).toEqual({ kind: 'credit', what: 'credit.referral_reward', price_micro: 5_000_000 });
  });

  it('rewards the referrer as soon as the friend buys credits, then pays 50% of our markup on paid usage for 12 months', async () => {
    const { h, code } = await pair();
    await h.call('/me/referral', { user: 'user_friend', device: 'fd1_friend', ip: '198.51.100.20', body: { code } });
    await applyCredit(h.db, { clerkUserId: 'user_friend', amountMicro: 10_000_000, source: 'topup', grantedBy: 'clerk-billing', note: 'refill', ref: 'clerk:pay_1' }, h.now());
    await settleReferral(h.db, 'acct_user_friend', h.now());
    expect((await h.call('/me/referral', { user: 'user_ref' })).body).toMatchObject({ rewarded: 1, earned_micro: 5_000_000 });
    // All free credit ($5 welcome + $5 bonus) is spent; a paid call with $0.20 of markup earns the referrer $0.10.
    await h.db.prepare("UPDATE accounts SET spent_micro = 10000000 WHERE id = 'acct_user_friend'").run();
    await settleReferral(h.db, 'acct_user_friend', h.now(), { markupMicro: 200_000, paidPart: 2_200_000, price: 2_200_000 });
    const summary = (await h.call('/me/referral', { user: 'user_ref' })).body;
    expect(summary.earned_micro).toBe(5_000_000 + 100_000);
    const share = await h.db.prepare("SELECT price_micro FROM ledger_entries WHERE account_id = 'acct_user_ref' AND what = 'credit.referral_share'").first();
    expect(share).toEqual({ price_micro: 100_000 });
    // After 12 months the share stops.
    h.advance(366 * 24 * 60 * 60 * 1000);
    await settleReferral(h.db, 'acct_user_friend', h.now(), { markupMicro: 200_000, paidPart: 2_200_000, price: 2_200_000 });
    expect((await h.call('/me/referral', { user: 'user_ref' })).body.earned_micro).toBe(5_100_000);
  });

  it('refuses self-referral (same device or email) and friends who are not first-time sign-ups, and records why', async () => {
    const { h, code } = await pair();
    // Same device as the referrer, new email.
    await h.signUp('user_alt', 'alt@example.com', { device: 'fd1_alt', ip: '198.51.100.30' });
    const sameDevice = await h.call('/me/referral', { user: 'user_alt', device: 'fd1_ref', ip: '198.51.100.30', body: { code } });
    expect(sameDevice.status).toBe(403);
    expect(sameDevice.body.code).toBe('self_referral');
    expect((await h.call('/me/referral', { user: 'user_ref', body: { code } })).body.code).toBe('self_referral');
    // A second account of an existing person got no welcome credit, so no referral bonus either.
    await h.signUp('user_again', 'friend+2@example.com', { device: 'fd1_again', ip: '198.51.100.31' });
    const again = await h.call('/me/referral', { user: 'user_again', device: 'fd1_again', ip: '198.51.100.31', body: { code } });
    expect(again.body.code).toBe('not_first_signup');
    expect((await h.call('/credits', { user: 'user_again' })).body.granted_micro).toBe(0);
    const reasons = (await h.db.prepare("SELECT reason FROM referrals WHERE state = 'refused' ORDER BY created_at").all<{ reason: string }>()).results.map((row) => row.reason);
    expect(reasons).toEqual(['self-referral: same device', 'self-referral: same account', 'not a first-time sign-up (welcome blocked)']);
    expect((await h.call('/me/referral', { user: 'user_friend', body: { code: 'NOPE2345' } })).status).toBe(404);
  });

  it('caps rewards at 50 a month per referrer and reverses a reward when the friend is refunded', async () => {
    const { h, code } = await pair();
    await h.call('/me/referral', { user: 'user_friend', device: 'fd1_friend', ip: '198.51.100.20', body: { code } });
    // 50 rewards already this month.
    for (let i = 0; i < 50; i += 1) {
      await h.db.prepare("INSERT INTO accounts (id, clerk_user_id, plan, created_at, updated_at) VALUES (?1, ?2, 'free', 1, 1)").bind(`acct_f${i}`, `f${i}`).run();
      await h.db.prepare("INSERT INTO referrals (id, referrer_account, friend_account, state, reward_micro, rewarded_at, created_at, updated_at) VALUES (?1, 'acct_user_ref', ?2, 'rewarded', 5000000, ?3, ?3, ?3)").bind(`ref_f${i}`, `acct_f${i}`, h.now()).run();
    }
    await h.db.prepare("UPDATE accounts SET spent_micro = 5000000 WHERE id = 'acct_user_friend'").run();
    await settleReferral(h.db, 'acct_user_friend', h.now());
    const capped = await h.db.prepare("SELECT state, reason FROM referrals WHERE friend_account = 'acct_user_friend'").first();
    expect(capped).toEqual({ state: 'capped', reason: 'monthly cap of 50 rewards reached' });
    // A rewarded referral whose friend is refunded: the $5 comes back off the referrer, as a charge line.
    const { h: h2, code: code2 } = await pair();
    await h2.call('/me/referral', { user: 'user_friend', device: 'fd1_friend', ip: '198.51.100.20', body: { code: code2 } });
    await applyCredit(h2.db, { clerkUserId: 'user_friend', amountMicro: 10_000_000, source: 'topup', grantedBy: 'stripe', note: 'refill', ref: 'cs_1' }, h2.now());
    await settleReferral(h2.db, 'acct_user_friend', h2.now());
    expect((await h2.call('/credits', { user: 'user_ref' })).body.granted_micro).toBe(10_000_000);
    expect(await reverseReferral(h2.db, 'acct_user_friend', h2.now(), 'friend payment refunded (Stripe)')).toBe(true);
    expect((await h2.call('/credits', { user: 'user_ref' })).body.granted_micro).toBe(5_000_000);
    const reversal = await h2.db.prepare("SELECT kind, price_micro FROM ledger_entries WHERE account_id = 'acct_user_ref' AND what = 'credit.referral_reversal'").first();
    expect(reversal).toEqual({ kind: 'charge', price_micro: 5_000_000 });
  });

  it('shows the hub referral totals only', async () => {
    const { h, code } = await pair();
    await h.call('/me/referral', { user: 'user_friend', device: 'fd1_friend', ip: '198.51.100.20', body: { code } });
    const overview = await h.call('/admin/overview', { user: 'user_admin' });
    expect(overview.body.referrals).toMatchObject({ claims: 1, pending: 1, rewarded: 0, bonus_micro: 5_000_000 });
    expect(JSON.stringify(overview.body.referrals)).not.toMatch(/user_|acct_/);
  });
});
