import { beforeEach, describe, expect, it } from 'vitest';
import type { CreditsStatus } from '../../shared/src/credits/types';
import { clearAdminCache, newInviteCode, verifyStripeSignature } from './admin';
import { createApp, type RouterBindings } from './app';
import type { D1Database } from './d1';
import { fakeD1 } from './testing/fakeD1';

const USERS: Record<string, { email: string; verified: boolean }> = {
  user_admin: { email: 'owner@example.com', verified: true },
  user_mailadmin: { email: 'Boss@Example.com', verified: true },
  user_unverified: { email: 'boss@example.com', verified: false },
  user_friend: { email: 'friend@example.com', verified: true },
  user_other: { email: 'other@example.com', verified: true },
};

function clerkUser(id: string) {
  const user = USERS[id];
  if (!user) return null;
  return { id, primary_email_address_id: 'e1', email_addresses: [{ id: 'e1', email_address: user.email, verification: { status: user.verified ? 'verified' : 'unverified' } }] };
}

const clerkFetch: typeof fetch = async (input) => {
  const url = new URL(String(input));
  if (url.hostname !== 'api.clerk.com') return new Response('nope', { status: 500 });
  const byEmail = url.searchParams.get('email_address');
  if (url.pathname === '/v1/users' && byEmail) {
    const found = Object.keys(USERS).filter((id) => USERS[id]?.email.toLowerCase() === byEmail && USERS[id]?.verified);
    return Response.json(found.map(clerkUser));
  }
  const match = /^\/v1\/users\/([^/]+)$/.exec(url.pathname);
  const user = match ? clerkUser(decodeURIComponent(match[1] ?? '')) : null;
  return user ? Response.json(user) : new Response('{}', { status: 404 });
};

function harness(overrides: RouterBindings = {}) {
  const db: D1Database = fakeD1();
  let clock = Date.UTC(2026, 8, 29, 5, 0, 0);
  const app = createApp({
    bindings: () => ({ CLERK_SECRET_KEY: 'sk_test_x', DEVICE_SIGNING_KEY: 'k', ADMIN_USER_IDS: 'user_admin', ADMIN_EMAILS: 'boss@example.com', ...overrides }),
    resources: () => ({ DB: db }),
    verifier: async (token) => {
      if (token.startsWith('good-')) return { sub: token.slice(5) };
      throw new Error('bad token');
    },
    fetchImpl: clerkFetch,
    now: () => (clock += 1000),
  });
  const call = async (path: string, init: { method?: string; token?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {}) => {
    const headers = new Headers({ 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...(init.headers ?? {}) });
    if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
    const body = init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body));
    const response = await app.request(path, { method: init.method ?? (body === undefined ? 'GET' : 'POST'), headers, ...(body !== undefined ? { body } : {}) });
    const text = await response.text();
    return { status: response.status, body: (text.startsWith('{') ? JSON.parse(text) : { text }) as Record<string, any> };
  };
  return { call, db, advance: (ms: number) => (clock += ms) };
}

beforeEach(() => clearAdminCache());

describe('admin gate', () => {
  it('401 signed out, 403 for a non-admin, 200 by id or by verified email', async () => {
    const h = harness();
    expect((await h.call('/admin/whoami')).status).toBe(401);
    expect((await h.call('/admin/whoami', { token: 'bad' })).status).toBe(401);
    const denied = await h.call('/admin/whoami', { token: 'good-user_friend' });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('not_admin');
    expect((await h.call('/admin/whoami', { token: 'good-user_admin' })).body).toMatchObject({ admin: true, via: 'id' });
    expect((await h.call('/admin/whoami', { token: 'good-user_mailadmin' })).body).toMatchObject({ admin: true, via: 'email' });
    // The same address, not verified, is not an admin.
    expect((await h.call('/admin/whoami', { token: 'good-user_unverified' })).status).toBe(403);
    // A temporary smoke admin id works while it is set.
    expect((await harness({ ADMIN_USER_IDS_SMOKE: 'user_other' }).call('/admin/whoami', { token: 'good-user_other' })).status).toBe(200);
    // Every admin endpoint is behind the same gate.
    for (const path of ['/admin/overview', '/admin/grants', '/admin/invites', '/admin/ledger', '/admin/accounts']) {
      expect((await h.call(path, { token: 'good-user_friend' })).status).toBe(403);
      expect((await h.call(path)).status).toBe(401);
    }
    expect((await h.call('/admin/grant', { token: 'good-user_friend', body: { user_id: 'user_friend', amount_usd: 5, note: 'x' } })).status).toBe(403);
  });
});

describe('friend credits', () => {
  it('an admin grant by email lands on the account, the grants list and the ledger', async () => {
    const h = harness();
    const before = (await h.call('/credits', { token: 'good-user_friend' })).body as unknown as CreditsStatus;
    expect(before.granted_micro).toBe(5_000_000);
    const out = await h.call('/admin/grant', { token: 'good-user_admin', body: { email: 'friend@example.com', amount_usd: 7.5, note: 'thanks for testing' } });
    expect(out.status).toBe(200);
    expect(out.body.grant).toMatchObject({ clerk_user_id: 'user_friend', amount_micro: 7_500_000, source: 'admin', granted_by: 'user_admin', note: 'thanks for testing' });
    // $5 starter + $7.50: the threshold rises to it, so the whole gift is spendable.
    expect(out.body.account).toMatchObject({ grant_micro: 12_500_000, billing_threshold_micro: 12_500_000, credit_limit_micro: 12_500_000 });
    const after = (await h.call('/credits', { token: 'good-user_friend' })).body as unknown as CreditsStatus;
    expect(after.remaining_micro).toBe(12_500_000);
    expect(after.billing).toMatchObject({ state: 'free', threshold_micro: 12_500_000, provider: 'not-wired' });
    const grants = await h.call('/admin/grants', { token: 'good-user_admin' });
    expect(grants.body.grants).toHaveLength(1);
    const ledger = await h.call('/admin/ledger', { token: 'good-user_admin' });
    expect(ledger.body.entries[0]).toMatchObject({ account_id: 'acct_user_friend', kind: 'credit', what: 'credit.grant', price_micro: 7_500_000 });
    // A second grant chains onto the first server entry.
    await h.call('/admin/grant', { token: 'good-user_admin', body: { user_id: 'user_friend', amount_usd: 1, note: 'more' } });
    const rows = await h.db.prepare("SELECT prev_hash, hash FROM ledger_entries WHERE account_id = 'acct_user_friend' ORDER BY created_at").all<{ prev_hash: string; hash: string }>();
    expect(rows.results[1]?.prev_hash).toBe(rows.results[0]?.hash);
  });

  it('refuses bad grants: unknown email, too big, no note, both targets', async () => {
    const h = harness();
    expect((await h.call('/admin/grant', { token: 'good-user_admin', body: { email: 'nobody@example.com', amount_usd: 5, note: 'x' } })).status).toBe(404);
    expect((await h.call('/admin/grant', { token: 'good-user_admin', body: { user_id: 'user_friend', amount_usd: 500, note: 'x' } })).status).toBe(400);
    expect((await h.call('/admin/grant', { token: 'good-user_admin', body: { user_id: 'user_friend', amount_usd: 5, note: '' } })).status).toBe(400);
    expect((await h.call('/admin/grant', { token: 'good-user_admin', body: { user_id: 'user_friend', email: 'friend@example.com', amount_usd: 5, note: 'x' } })).status).toBe(400);
  });

  it('invite codes: worth $X for N uses, once per account', async () => {
    const h = harness();
    const made = await h.call('/admin/invites', { token: 'good-user_admin', body: { amount_usd: 3, uses: 2, note: 'friends batch' } });
    expect(made.status).toBe(200);
    const code = String(made.body.invite.code);
    expect(code).toMatch(/^FT-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await h.call('/credits/redeem', { body: { code } })).status).toBe(401);
    const first = await h.call('/credits/redeem', { token: 'good-user_friend', body: { code: code.toLowerCase() } });
    expect(first.status).toBe(200);
    expect(first.body.account).toMatchObject({ grant_micro: 8_000_000 });
    expect((await h.call('/credits/redeem', { token: 'good-user_friend', body: { code } })).body.code).toBe('invite_already_redeemed');
    expect((await h.call('/credits/redeem', { token: 'good-user_other', body: { code } })).status).toBe(200);
    const third = await h.call('/credits/redeem', { token: 'good-user_admin', body: { code } });
    expect(third.status).toBe(410);
    expect(third.body.code).toBe('invite_used_up');
    const grants = (await h.call('/admin/grants', { token: 'good-user_admin' })).body.grants as Array<Record<string, unknown>>;
    expect(grants.filter((grant) => grant.source === 'invite' && grant.granted_by === 'user_admin' && grant.note === 'friends batch')).toHaveLength(2);
    expect((await h.call('/credits/redeem', { token: 'good-user_friend', body: { code: 'FT-NOPE-NOPE' } })).status).toBe(404);
    // Switched off and expired codes do not redeem.
    const off = await h.call('/admin/invites', { token: 'good-user_admin', body: { amount_usd: 1, uses: 5, code: 'FT-OFFC-ODE2' } });
    await h.call('/admin/invites/disable', { token: 'good-user_admin', body: { code: off.body.invite.code } });
    expect((await h.call('/credits/redeem', { token: 'good-user_friend', body: { code: 'FT-OFFC-ODE2' } })).status).toBe(404);
    const soon = await h.call('/admin/invites', { token: 'good-user_admin', body: { amount_usd: 1, uses: 5, expires_days: 1 } });
    h.advance(2 * 24 * 60 * 60 * 1000);
    expect((await h.call('/credits/redeem', { token: 'good-user_friend', body: { code: soon.body.invite.code } })).status).toBe(410);
  });

  it('makes readable codes', () => {
    const codes = new Set(Array.from({ length: 50 }, () => newInviteCode()));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).not.toMatch(/[01OIL]/);
  });
});

describe('pass-through billing gate', () => {
  it('after the $5 threshold of free usage, paid calls answer 402 payment_required; your key is not metered', async () => {
    const h = harness();
    // A friend with $10 of credit and the default $5 threshold... the grant raises the threshold to $11,
    // so set the threshold back to $5 to test it on its own.
    await h.call('/admin/grant', { token: 'good-user_admin', body: { user_id: 'user_friend', amount_usd: 10, note: 'big gift' } });
    await h.call('/admin/account', { token: 'good-user_admin', body: { user_id: 'user_friend', billing_threshold_usd: 5 } });
    await h.db.prepare("UPDATE accounts SET spent_micro = 5000000 WHERE id = 'acct_user_friend'").run();
    const out = await h.call('/route', { token: 'good-user_friend', body: { boxId: 'b', text: 'hi', chips: [] } });
    expect(out.status).toBe(402);
    expect(out.body.code).toBe('payment_required');
    expect(out.body.error).toContain('not wired yet');
    expect(out.body.error).toContain('your key still works');
    expect(out.body.credits.billing).toMatchObject({ state: 'needs_payment', threshold_micro: 5_000_000, credit_limit_micro: 5_000_000 });
    // Just under the threshold still runs (the meter lets it through; no router key here, so 503 from the handler).
    await h.db.prepare("UPDATE accounts SET spent_micro = 4900000, billing_state = 'free' WHERE id = 'acct_user_friend'").run();
    expect((await h.call('/route', { token: 'good-user_friend', body: { boxId: 'b', text: 'hi', chips: [] } })).status).toBe(503);
    // A grant after the threshold clears needs_payment and is spendable.
    await h.db.prepare("UPDATE accounts SET spent_micro = 5000000 WHERE id = 'acct_user_friend'").run();
    expect((await h.call('/route', { token: 'good-user_friend', body: { boxId: 'b', text: 'hi', chips: [] } })).status).toBe(402);
    const regrant = await h.call('/admin/grant', { token: 'good-user_admin', body: { user_id: 'user_friend', amount_usd: 2, note: 'keep going' } });
    expect(regrant.body.account).toMatchObject({ billing_state: 'free', billing_threshold_micro: 17_000_000 });
    expect((await h.call('/route', { token: 'good-user_friend', body: { boxId: 'b', text: 'hi', chips: [] } })).status).toBe(503);
  });

  it('with a threshold above the grant, running out says credits exhausted (the grant binds first)', async () => {
    const h = harness();
    await h.call('/credits', { token: 'good-user_friend' });
    await h.call('/admin/account', { token: 'good-user_admin', body: { user_id: 'user_friend', billing_threshold_usd: 50 } });
    await h.db.prepare("UPDATE accounts SET spent_micro = 5000000 WHERE id = 'acct_user_friend'").run();
    const out = await h.call('/tag', { token: 'good-user_friend', body: { text: 'hello' } });
    expect(out.status).toBe(402);
    expect(out.body.code).toBe('account_credits_exhausted');
    expect(out.body.credits.billing.state).toBe('needs_payment');
  });

  it('the top-up hook is not wired without Stripe keys', async () => {
    const h = harness();
    expect((await h.call('/billing/checkout', { body: {} })).status).toBe(401);
    const out = await h.call('/billing/checkout', { token: 'good-user_friend', body: { amount_usd: 10 } });
    expect(out.status).toBe(501);
    expect(out.body.code).toBe('not_wired');
    expect((await h.call('/billing/stripe/webhook', { raw: '{}' })).status).toBe(501);
  });

  it('a signed Stripe checkout.session.completed credits once and marks the account active', async () => {
    const secret = 'whsec_test';
    const h = harness({ STRIPE_SECRET_KEY: 'sk_test_stripe', STRIPE_WEBHOOK_SECRET: secret });
    await h.call('/credits', { token: 'good-user_friend' });
    const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_status: 'paid', amount_total: 1000, metadata: { clerk_user_id: 'user_friend' } } } });
    const now = Date.UTC(2026, 8, 29, 5, 0, 0) / 1000;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${Math.floor(now)}.${event}`));
    const signature = `t=${Math.floor(now)},v1=${[...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    expect(await verifyStripeSignature(event, signature, secret, now * 1000)).toBe(true);
    expect(await verifyStripeSignature(event, signature, 'whsec_other', now * 1000)).toBe(false);
    expect(await verifyStripeSignature(event, signature, secret, now * 1000 + 3_600_000)).toBe(false);
    expect((await h.call('/billing/stripe/webhook', { raw: event, headers: { 'Stripe-Signature': 't=1,v1=00' } })).status).toBe(400);
    const ok = await h.call('/billing/stripe/webhook', { raw: event, headers: { 'Stripe-Signature': signature } });
    expect(ok.body).toMatchObject({ credited: true });
    const again = await h.call('/billing/stripe/webhook', { raw: event, headers: { 'Stripe-Signature': signature } });
    expect(again.body).toMatchObject({ credited: false, duplicate: true });
    const credits = (await h.call('/credits', { token: 'good-user_friend' })).body as unknown as CreditsStatus;
    expect(credits.granted_micro).toBe(15_000_000);
    expect(credits.billing).toMatchObject({ state: 'active', paid_micro: 10_000_000, provider: 'stripe' });
  });
});

describe('Clerk Billing refill plans (C-093)', () => {
  const secretBytes = new TextEncoder().encode('fresh-terminal-test-signing-key!');
  const secret = `whsec_${btoa(String.fromCharCode(...secretBytes))}`;
  async function signed(body: string) {
    const id = 'msg_test_1';
    const ts = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
    return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${btoa(String.fromCharCode(...mac))}` };
  }
  const paid = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: 'paymentAttempt.updated',
      object: 'event',
      data: { id: 'pa_1', status: 'paid', charge_type: 'checkout', payer: { user_id: 'user_friend' }, totals: { grand_total: { amount: 1000, currency: 'USD' } }, subscription_items: [{ plan: { slug: 'credit-10' } }], ...overrides },
    });

  it('is not wired without the signing secret, and says clerk once it is', async () => {
    expect((await harness().call('/billing/clerk/webhook', { raw: '{}' })).status).toBe(501);
    const h = harness({ BILLING_PROVIDER: 'clerk', CLERK_WEBHOOK_SIGNING_SECRET: secret });
    const credits = (await h.call('/credits', { token: 'good-user_friend' })).body as unknown as CreditsStatus;
    expect(credits.billing?.provider).toBe('clerk');
    expect((await h.call('/billing/checkout', { token: 'good-user_friend', body: {} })).body).toMatchObject({ provider: 'clerk', open: 'user-profile-billing' });
  });

  it('credits a paid charge on a credit plan once, and ignores the rest', async () => {
    const h = harness({ BILLING_PROVIDER: 'clerk', CLERK_WEBHOOK_SIGNING_SECRET: secret });
    await h.call('/credits', { token: 'good-user_friend' });
    expect((await h.call('/billing/clerk/webhook', { raw: paid(), headers: { 'svix-id': 'x', 'svix-timestamp': '1', 'svix-signature': 'v1,AAAA' } })).status).toBe(400);
    const body = paid();
    expect((await h.call('/billing/clerk/webhook', { raw: body, headers: await signed(body) })).body).toMatchObject({ credited: true });
    expect((await h.call('/billing/clerk/webhook', { raw: body, headers: await signed(body) })).body).toMatchObject({ duplicate: true });
    for (const other of [paid({ id: 'pa_2', status: 'failed' }), paid({ id: 'pa_3', subscription_items: [{ plan: { slug: 'pro' } }] })]) {
      expect((await h.call('/billing/clerk/webhook', { raw: other, headers: await signed(other) })).body).toMatchObject({ credited: false });
    }
    const credits = (await h.call('/credits', { token: 'good-user_friend' })).body as unknown as CreditsStatus;
    expect(credits.granted_micro).toBe(15_000_000);
    expect(credits.billing).toMatchObject({ state: 'active', paid_micro: 10_000_000 });
  });
});
