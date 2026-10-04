import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { CreditsStatus } from '../../shared/src/credits/types';
import { createApp } from './app';
import { clearAdminCache } from './admin';
import { accountMarkupBp, headlineMarginBp, markupFor, meter, mountCreditRoutes, priceForRequest, type MeterOptions, type Payer } from './credits';
import type { D1Database } from './d1';
import { loadRules } from './rules';
import { fakeD1 } from './testing/fakeD1';

// C-103 (Justin, 2026-09-29): credits first, 10% markup past the $5 starter kit; your key at cost.
const account = (spent: number): Payer => ({ kind: 'account', id: 'acct_a', row: { id: 'acct_a', grant_micro: 15_000_000, spent_micro: spent, billing_threshold_micro: 15_000_000, billing_state: 'active', paid_micro: 10_000_000 } });

describe('markup (C-103)', () => {
  it('is 10% on every rule in the route table', () => {
    expect(loadRules().rules.every((rule) => rule.margin_bp === 1000)).toBe(true);
    expect(headlineMarginBp()).toBe(1000);
  });

  it('runs the starter kit at cost, marks up what comes after, and splits the call that crosses the line', () => {
    expect(markupFor(account(0), 10_000, 1000, 5_000_000)).toMatchObject({ price_micro: 10_000, at_cost_micro: 10_000, marked_micro: 0, markup_micro: 0 });
    expect(markupFor(account(6_000_000), 10_000, 1000, 5_000_000)).toMatchObject({ price_micro: 11_000, at_cost_micro: 0, marked_micro: 10_000, markup_micro: 1_000 });
    // $4.999 spent, a 3,000 call: 1,000 at cost, 2,000 + 10%.
    expect(markupFor(account(4_999_000), 3_000, 1000, 5_000_000)).toMatchObject({ price_micro: 3_200, at_cost_micro: 1_000, marked_micro: 2_000, markup_micro: 200 });
  });

  it('leaves the signed-out trial at cost, and margin 0 is pass-through', () => {
    const device: Payer = { kind: 'device', id: 'd', row: { id: 'd', grant_micro: 250_000, spent_micro: 0, cost_micro: 0, chances_used: 0, limited: 0 } as never };
    expect(markupFor(device, 10_000, 1000, 5_000_000).price_micro).toBe(10_000);
    expect(markupFor(account(9_000_000), 10_000, 0, 5_000_000).price_micro).toBe(10_000);
    // No meter (local dev without D1): the table's margin on all of it.
    expect(markupFor(undefined, 10_000, 1000, 5_000_000).price_micro).toBe(11_000);
  });

  it('meters a signed-in account at cost inside the starter kit and at cost + 10% after it, and says so on /credits', async () => {
    const db: D1Database = fakeD1();
    let clock = Date.UTC(2026, 8, 29, 6, 0, 0);
    const bindings = { CLERK_SECRET_KEY: 'sk_test_x', DEVICE_SIGNING_KEY: 'k' };
    const options: MeterOptions = {
      bindings: () => bindings,
      resources: () => ({ DB: db }),
      // A billing unit test must not contact Clerk with its synthetic key.
      fetchImpl: async (input) => {
        expect(String(input)).toBe('https://api.clerk.com/v1/users/user_m');
        return new Response(JSON.stringify({ primary_email_address_id: 'email_m', email_addresses: [{ id: 'email_m', email_address: 'markup-test@example.com', verification: { status: 'verified' } }] }), { status: 200 });
      },
      authorizedParties: () => ['https://freshterminal.ai'],
      verifier: async (token) => ({ sub: token.replace('good-', '') }),
      now: () => (clock += 1000),
    };
    const app = new Hono();
    app.use('/paid/*', meter(options));
    // A paid endpoint priced like /route: the entry's price comes from priceForRequest.
    app.post('/paid/call', (c) => {
      const cost = Number(c.req.query('cost'));
      const markup = priceForRequest(c.req.raw, bindings, cost, 1000);
      return c.json({ entry: { cost_micro: cost, price_micro: markup.price_micro } });
    });
    mountCreditRoutes(app as never, options);
    const call = (path: string, method = 'POST') => app.request(path, { method, headers: { Authorization: 'Bearer good-user_m', 'CF-Connecting-IP': '203.0.113.9' } });
    const status = async () => (await (await call('/credits', 'GET')).json()) as CreditsStatus;

    expect((await status()).markup).toEqual({ margin_bp: 1000, default_bp: 1000, min_bp: 500, max_bp: 10_000, chosen: false, applies: 'after the starter kit', at_cost_left_micro: 5_000_000, your_key_bp: 0 });
    await db.prepare("UPDATE accounts SET grant_micro = 15000000, billing_threshold_micro = 15000000, billing_state = 'active' WHERE id = 'acct_user_m'").run();
    const first = (await (await call('/paid/call?cost=4000000')).json()) as { entry: { price_micro: number } };
    expect(first.entry.price_micro).toBe(4_000_000);
    const crossing = (await (await call('/paid/call?cost=2000000')).json()) as { entry: { price_micro: number } };
    expect(crossing.entry.price_micro).toBe(1_000_000 + 1_100_000);
    const after = (await (await call('/paid/call?cost=1000000')).json()) as { entry: { price_micro: number } };
    expect(after.entry.price_micro).toBe(1_100_000);
    const end = await status();
    expect(end.spent_micro).toBe(4_000_000 + 2_100_000 + 1_100_000);
    expect(end.markup?.at_cost_left_micro).toBe(0);
  });

  it('reports the markup on /health', async () => {
    const app = createApp({ bindings: () => ({}) });
    const health = (await (await app.request('/health')).json()) as { credits: { markup: Record<string, unknown> } };
    expect(health.credits.markup).toMatchObject({ margin_bp: 1000, applies: 'after the starter kit', starter_micro: 5_000_000, signed_out_trial: 'at cost', your_key_bp: 0 });
  });
});

describe('pay what you want (C-105)', () => {
  function harness() {
    const db = fakeD1();
    let clock = Date.UTC(2026, 8, 29, 7, 0, 0);
    const app = createApp({
      bindings: () => ({ DEVICE_SIGNING_KEY: 'k', CLERK_JWT_KEY: 'x', ADMIN_USER_IDS: 'user_admin' }),
      resources: () => ({ DB: db }),
      verifier: async (token) => {
        if (token.startsWith('good-')) return { sub: token.slice(5) };
        throw new Error('bad token');
      },
      now: () => (clock += 1000),
    });
    const call = async (path: string, init: { method?: string; token?: string; body?: unknown } = {}) => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
      const response = await app.request(path, { method: init.method ?? (init.body === undefined ? 'GET' : 'POST'), headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
      return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, any> };
    };
    return { call, db };
  }

  it('defaults to 10%, takes 5% to 100% in whole basis points, refuses the rest, and null goes back to the default', async () => {
    clearAdminCache();
    const h = harness();
    expect((await h.call('/me/markup')).status).toBe(401);
    const first = await h.call('/me/markup', { token: 'good-user_p' });
    expect(first.body).toMatchObject({ markup_bp: 1000, default_bp: 1000, min_bp: 500, max_bp: 10_000, presets_bp: [500, 1000, 1500, 2500], chosen: false, label: 'Model cost + your markup. 10% by default; set it higher to support us.' });
    for (const bad of [499, 10_001, 1500.5, '2500', -1]) {
      const out = await h.call('/me/markup', { method: 'PUT', token: 'good-user_p', body: { markup_bp: bad } });
      expect(out.status, String(bad)).toBe(400);
      expect(out.body.code).toBe('invalid_markup');
    }
    expect((await h.call('/me/markup', { method: 'PUT', token: 'good-user_p', body: { markup_bp: 2500 } })).body).toMatchObject({ markup_bp: 2500, chosen: true });
    expect((await h.call('/me/markup', { method: 'PUT', token: 'good-user_p', body: { markup_bp: 500 } })).body.markup_bp).toBe(500);
    expect((await h.call('/me/markup', { method: 'PUT', token: 'good-user_p', body: { markup_bp: 10_000 } })).body.markup_bp).toBe(10_000);
    expect((await h.call('/me/markup', { method: 'PUT', token: 'good-user_p', body: { markup_bp: null } })).body).toMatchObject({ markup_bp: 1000, chosen: false });
    // /credits reports the choice for the counter tooltip.
    await h.call('/me/markup', { method: 'PUT', token: 'good-user_p', body: { markup_bp: 1500 } });
    const credits = (await h.call('/credits', { token: 'good-user_p' })).body as CreditsStatus;
    expect(credits.markup).toMatchObject({ margin_bp: 1500, default_bp: 1000, chosen: true });
  });

  it("charges the account's own markup past the starter kit (never inside it), and a stored value out of range is clamped", () => {
    const row = (spent: number, markup_bp: number | null): Payer => ({ kind: 'account', id: 'acct_p', row: { id: 'acct_p', grant_micro: 20_000_000, spent_micro: spent, billing_threshold_micro: 20_000_000, billing_state: 'active', paid_micro: 15_000_000, markup_bp } });
    expect(markupFor(row(6_000_000, 2500), 10_000, 1000, 5_000_000)).toMatchObject({ price_micro: 12_500, margin_bp: 2500, markup_micro: 2_500 });
    expect(markupFor(row(0, 2500), 10_000, 1000, 5_000_000)).toMatchObject({ price_micro: 10_000, markup_micro: 0 });
    expect(markupFor(row(6_000_000, null), 10_000, 1000, 5_000_000).price_micro).toBe(11_000);
    expect(accountMarkupBp({ markup_bp: 100 }, 1000)).toBe(500);
    expect(accountMarkupBp({ markup_bp: 50_000 }, 1000)).toBe(10_000);
    // The signed-out trial stays at cost whatever the table says.
    const device: Payer = { kind: 'device', id: 'd', row: { id: 'd', grant_micro: 250_000, spent_micro: 0, cost_micro: 0, chances_used: 0, limited: 0 } as never };
    expect(markupFor(device, 10_000, 2500, 5_000_000).price_micro).toBe(10_000);
  });

  it('shows the hub the average markup across accounts as a total only', async () => {
    clearAdminCache();
    const h = harness();
    await h.call('/me/markup', { method: 'PUT', token: 'good-user_a', body: { markup_bp: 2500 } });
    await h.call('/me/markup', { method: 'PUT', token: 'good-user_b', body: { markup_bp: 1500 } });
    await h.call('/me/markup', { token: 'good-user_c' });
    expect((await h.call('/admin/overview', { token: 'good-user_c' })).status).toBe(403);
    const overview = await h.call('/admin/overview', { token: 'good-user_admin' });
    // a 2500, b 1500, c the default 1000: (2500 + 1500 + 1000) / 3, rounded.
    expect(overview.body.markup).toEqual({ accounts: 3, average_bp: 1667, chosen: 2, default_bp: 1000 });
    expect(JSON.stringify(overview.body)).not.toContain('user_a');
  });
});


describe('sign-in messages say what each endpoint does', () => {
  it('asks to sign in to set a markup, see a referral link, use a referral code, or change privacy', async () => {
    const app = createApp({ bindings: () => ({ CLERK_JWT_KEY: 'x' }), resources: () => ({ DB: fakeD1() }) });
    const ask = async (method: string, path: string) => {
      const response = await app.request(path, { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: '{}' }) });
      return { status: response.status, error: ((await response.json()) as { error: string }).error };
    };
    expect(await ask('GET', '/me/markup')).toEqual({ status: 401, error: 'Sign in to set your markup.' });
    expect(await ask('PUT', '/me/markup')).toEqual({ status: 401, error: 'Sign in to set your markup.' });
    expect(await ask('GET', '/me/referral')).toEqual({ status: 401, error: 'Sign in to see your referral link.' });
    expect(await ask('POST', '/me/referral')).toEqual({ status: 401, error: 'Sign in to use a referral code.' });
    expect(await ask('GET', '/me/privacy')).toEqual({ status: 401, error: 'Sign in to change your privacy settings.' });
  });
});
