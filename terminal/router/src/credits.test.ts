import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { describe, expect, it } from 'vitest';
import type { CreditsStatus } from '../../shared/src/credits/types';
import { createApp } from './app';
import { costsFromJson, meter, mountCreditRoutes, networkOf, signDevice, verifyDevice, type MeterOptions, type RateLimiter } from './credits';
import type { D1Database } from './d1';
import { fakeD1 } from './testing/fakeD1';

const KEY = 'test-signing-key';

function harness(overrides: Record<string, string> = {}, limiter?: RateLimiter) {
  const db: D1Database = fakeD1();
  let clock = Date.UTC(2026, 8, 29, 3, 0, 0);
  const options: MeterOptions = {
    bindings: () => ({ DEVICE_SIGNING_KEY: KEY, CLERK_SECRET_KEY: 'sk_test_x', ...overrides }),
    resources: () => ({ DB: db, ...(limiter ? { RL_IP: limiter, RL_NET: limiter } : {}) }),
    authorizedParties: () => ['https://freshterminal.ai'],
    verifier: async (token) => {
      if (token.startsWith('good-')) return { sub: token.slice(5) };
      throw new Error('bad token');
    },
    now: () => (clock += 1000),
  };
  const app = new Hono();
  app.use('/paid/*', meter(options));
  // A paid JSON endpoint that costs what the query says, and an SSE one.
  app.post('/paid/json', (c) => c.json({ ok: true, cost_micro: Number(c.req.query('cost') ?? '0') }));
  app.post('/paid/sse', (c) =>
    streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: 'hi' }) });
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ ok: true, entry: { cost_micro: 1000, price_micro: 1200 } }) });
    }),
  );
  mountCreditRoutes(app as never, options);
  const call = async (path: string, init: { method?: string; device?: string; token?: string; ip?: string; body?: string } = {}) => {
    const headers = new Headers({ 'CF-Connecting-IP': init.ip ?? '203.0.113.7' });
    if (init.device) headers.set('X-FT-Device', init.device);
    if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
    if (init.body) headers.set('Content-Length', String(init.body.length));
    const response = await app.request(path, { method: init.method ?? 'POST', headers, ...(init.body ? { body: init.body } : {}) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text.startsWith('{') ? (JSON.parse(text) as Record<string, unknown>) : { text } };
  };
  const newDevice = async (ip?: string) => {
    const result = await call('/credits/device', ip ? { ip } : {});
    return { token: String(result.body.device), credits: result.body.credits as CreditsStatus };
  };
  return { call, newDevice, db };
}

describe('device ids', () => {
  it('signs and verifies, and rejects forgeries', async () => {
    const token = await signDevice('fd1_00000000-0000-4000-8000-000000000000', KEY);
    expect(await verifyDevice(token, KEY)).toBe('fd1_00000000-0000-4000-8000-000000000000');
    expect(await verifyDevice(token, 'other-key')).toBeNull();
    expect(await verifyDevice(`${token.slice(0, -2)}xx`, KEY)).toBeNull();
    expect(await verifyDevice('fd1_made-up.abc', KEY)).toBeNull();
  });

  it('groups addresses by /24 and /48', () => {
    expect(networkOf('203.0.113.7')).toBe('203.0.113.0/24');
    expect(networkOf('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3::/48');
  });
});

describe('anonymous credits', () => {
  it('grants 25¢, charges price after each call, then two soft prompts, then sign-in', async () => {
    const h = harness();
    const { token, credits } = await h.newDevice();
    expect(credits).toMatchObject({ mode: 'device', granted_micro: 250_000, remaining_micro: 250_000, soft_prompts_left: 2, sign_in_required: false, turnstile: 'not-wired' });

    expect((await h.call('/paid/json?cost=100000', { device: token })).status).toBe(200);
    expect(((await h.call('/credits', { method: 'GET', device: token })).body as unknown as CreditsStatus).remaining_micro).toBe(150_000);
    // SSE: charged from the done event's entry price.
    const sse = await h.call('/paid/sse', { device: token });
    expect(sse.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(((await h.call('/credits', { method: 'GET', device: token })).body as unknown as CreditsStatus).spent_micro).toBe(101_200);

    await h.call('/paid/json?cost=148800', { device: token }); // exactly used up
    const first = await h.call('/paid/json?cost=60000', { device: token });
    expect(first.status).toBe(200);
    expect(first.headers.get('X-FT-Soft-Prompt')).toBe('1/2');
    const second = await h.call('/paid/json?cost=60000', { device: token });
    expect(second.headers.get('X-FT-Soft-Prompt')).toBe('2/2');
    const third = await h.call('/paid/json?cost=1', { device: token });
    expect(third.status).toBe(402);
    expect(third.body.code).toBe('sign_in_required');
    expect(((await h.call('/credits', { method: 'GET', device: token })).body as unknown as CreditsStatus).sign_in_required).toBe(true);
  });

  it('refuses calls without a signed device and never gives a second grant to the same device', async () => {
    const h = harness();
    expect((await h.call('/paid/json')).body.code).toBe('device_required');
    expect((await h.call('/paid/json', { device: 'fd1_00000000-0000-4000-8000-000000000000.forged' })).body.code).toBe('device_required');
    const { token } = await h.newDevice();
    await h.call('/paid/json?cost=200000', { device: token });
    const again = await h.call('/credits/device', { device: token });
    expect(again.body.device).toBe(token);
    expect((again.body.credits as CreditsStatus).remaining_micro).toBe(50_000);
  });

  it('gives no grant past 3 new devices per IP or 10 per /24 in a day', async () => {
    const h = harness();
    for (let index = 0; index < 3; index += 1) expect((await h.newDevice('198.51.100.1')).credits.granted_micro).toBe(250_000);
    const fourth = await h.newDevice('198.51.100.1');
    expect(fourth.credits).toMatchObject({ granted_micro: 0, limited: true, soft_prompts_left: 0, sign_in_required: true });
    expect((await h.call('/paid/json', { device: fourth.token })).body.code).toBe('sign_in_required');
    for (let index = 2; index <= 8; index += 1) await h.newDevice(`198.51.100.${index}`);
    expect((await h.newDevice('198.51.100.99')).credits.limited).toBe(true);
    expect((await h.newDevice('192.0.2.1')).credits.limited).toBe(false);
  });

  it('stops all anonymous calls at the global daily cost cap', async () => {
    const h = harness({ ANON_DAILY_COST_CAP_MICRO: '150000' });
    const a = await h.newDevice('192.0.2.10');
    const b = await h.newDevice('192.0.2.20');
    await h.call('/paid/json?cost=100000', { device: a.token });
    await h.call('/paid/json?cost=60000', { device: b.token });
    const blocked = await h.call('/paid/json?cost=1', { device: a.token });
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('daily_cap');
  });

  it('caps anonymous request size and applies rate limits', async () => {
    const h = harness();
    const { token } = await h.newDevice();
    expect((await h.call('/paid/json', { device: token, body: 'x'.repeat(70_000) })).status).toBe(413);
    let calls = 0;
    const limiter: RateLimiter = { limit: async () => ({ success: (calls += 1) <= 2 }) };
    const limited = harness({}, limiter);
    const device = await limited.newDevice();
    expect((await limited.call('/paid/json', { device: device.token })).status).toBe(429);
  });
});

describe('signed-in credits', () => {
  it('uses the account grant ($1) and answers 402 when it is used up', async () => {
    const h = harness();
    const status = (await h.call('/credits', { method: 'GET', token: 'good-user_1' })).body as unknown as CreditsStatus;
    expect(status).toMatchObject({ signed_in: true, mode: 'account', granted_micro: 1_000_000 });
    await h.call('/paid/json?cost=995000', { token: 'good-user_1' });
    const out = await h.call('/paid/json?cost=1', { token: 'good-user_1' });
    expect(out.status).toBe(402);
    expect(out.body.code).toBe('account_credits_exhausted');
    expect((await h.call('/paid/json', { token: 'bad' })).status).toBe(401);
  });
});

describe('cost extraction', () => {
  it('reads entries, a single entry, or cost_micro', () => {
    expect(costsFromJson({ entries: [{ cost_micro: 10, price_micro: 12 }, { cost_micro: 5, price_micro: 6 }] })).toEqual({ cost: 15, price: 18 });
    expect(costsFromJson({ entry: { cost_micro: 7, price_micro: 9 } })).toEqual({ cost: 7, price: 9 });
    expect(costsFromJson({ cost_micro: 4 })).toEqual({ cost: 4, price: 4 });
    expect(costsFromJson(null)).toEqual({ cost: 0, price: 0 });
  });
});

describe('router with credits', () => {
  it('meters /route: 401 without a device, 403 when an anonymous caller picks a model, CORS exposes the soft-prompt header', async () => {
    const db = fakeD1();
    const app = createApp({ bindings: () => ({ DEVICE_SIGNING_KEY: KEY, OPENROUTER_API_KEY: 'k' }), resources: () => ({ DB: db }) });
    const body = JSON.stringify({ boxId: 'b', text: 'hi', chips: [] });
    const none = await app.request('/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(none.status).toBe(401);
    const device = (await (await app.request('/credits/device', { method: 'POST' })).json()) as { device: string };
    const picked = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-FT-Device': device.device },
      body: JSON.stringify({ boxId: 'b', text: 'hi', chips: [], model: 'anthropic/claude-sonnet-5.5' }),
    });
    expect(picked.status).toBe(403);
    const health = (await (await app.request('/health')).json()) as { credits: { metered: boolean; anonGrantMicro: number } };
    expect(health.credits.metered).toBe(true);
    expect(health.credits.anonGrantMicro).toBe(250_000);
    const preflight = await app.request('/route', { method: 'OPTIONS', headers: { Origin: 'https://freshterminal.ai', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-ft-device' } });
    expect(preflight.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('x-ft-device');
  });
});

describe('turnstile', () => {
  it('asks for a passing invisible Turnstile token before a new device', async () => {
    const db = fakeD1();
    const verified: string[] = [];
    const app = createApp({
      bindings: () => ({ DEVICE_SIGNING_KEY: KEY, TURNSTILE_SECRET: 'ts-secret', TURNSTILE_SITEKEY: '0x4AAAA-site' }),
      resources: () => ({ DB: db }),
      fetchImpl: async (url, init) => {
        const form = init?.body as FormData;
        verified.push(String(url));
        return new Response(JSON.stringify({ success: form.get('response') === 'good-token' }));
      },
    });
    const status = (await (await app.request('/credits')).json()) as CreditsStatus;
    expect(status).toMatchObject({ mode: 'none', turnstile: 'on', turnstile_sitekey: '0x4AAAA-site' });
    const bad = await app.request('/credits/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnstile: 'bad' }) });
    expect(bad.status).toBe(403);
    const good = await app.request('/credits/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnstile: 'good-token' }) });
    expect(good.status).toBe(200);
    expect(verified[0]).toContain('challenges.cloudflare.com/turnstile/v0/siteverify');
  });
});
