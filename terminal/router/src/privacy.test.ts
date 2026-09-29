import { beforeEach, describe, expect, it } from 'vitest';
import type { CreditsStatus } from '../../shared/src/credits/types';
import { clearAdminCache } from './admin';
import { createApp } from './app';
import { fakeD1 } from './testing/fakeD1';

function harness() {
  const db = fakeD1();
  let clock = Date.UTC(2026, 8, 29, 6, 0, 0);
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
    const text = await response.text();
    return { status: response.status, text, body: (text.startsWith('{') ? JSON.parse(text) : {}) as Record<string, any> };
  };
  const secret = 'my secret stage about Hoy invoices';
  const seed = async (user: string) => {
    const now = Date.UTC(2026, 8, 29, 6, 0, 0);
    await call('/sync/boxes', { method: 'PUT', token: `good-${user}`, body: { boxes: [{ id: `box-${user}`, name: 'Private plans', state_json: JSON.stringify({ note: secret }), created_at: now, updated_at: now, deleted_at: null }] } });
    await call('/sync/ledger', {
      token: `good-${user}`,
      body: { entries: [{ id: `e-${user}`, box_id: `box-${user}`, owner_identity: 'x', kind: 'charge', what: 'model.call', model: 'm/secret-model', units: 1, unit_kind: 'call', cost_micro: 900, price_micro: 1000, ref: 'gen-secret', created_at: now, prev_hash: '0'.repeat(64), hash: 'a'.repeat(64), shared_prev_hash: null, shared_hash: null }] },
    });
  };
  return { call, seed, secret, advance: (ms: number) => (clock += ms) };
}

beforeEach(() => clearAdminCache());

describe('privacy by default (C-090)', () => {
  it('share_data is off by default; the admin sees numbers, never stage content or ledger lines', async () => {
    const h = harness();
    await h.seed('user_friend');
    const privacy = await h.call('/me/privacy', { token: 'good-user_friend' });
    expect(privacy.body).toMatchObject({ share_data: false, label: 'Share my data with Fresh Terminal to improve it (off by default)' });
    const content = await h.call('/admin/account-content?user_id=user_friend', { token: 'good-user_admin' });
    expect(content.status).toBe(403);
    expect(content.body.code).toBe('private');
    expect(content.text).not.toContain(h.secret);
    const ledger = await h.call('/admin/ledger', { token: 'good-user_admin' });
    expect(ledger.body.entries).toHaveLength(0);
    expect(ledger.body.private_totals).toEqual([expect.objectContaining({ account_id: 'acct_user_friend', entries: 1, price_micro: 1000 })]);
    expect(ledger.text).not.toContain('secret-model');
    expect(ledger.text).not.toContain('gen-secret');
    const accounts = await h.call('/admin/accounts', { token: 'good-user_admin' });
    expect(accounts.text).not.toContain(h.secret);
    expect(accounts.body.accounts[0]).toMatchObject({ share_data: 0, stages: 1, ledger_entries: 1 });
    // Only admins, and only numbers: a non-admin gets nothing.
    expect((await h.call('/admin/account-content?user_id=user_friend', { token: 'good-user_other' })).status).toBe(403);
  });

  it('the person can share, and can take it back', async () => {
    const h = harness();
    await h.seed('user_friend');
    expect((await h.call('/me/privacy', { method: 'PUT', token: 'good-user_friend', body: { share_data: true } })).body.share_data).toBe(true);
    const content = await h.call('/admin/account-content?user_id=user_friend', { token: 'good-user_admin' });
    expect(content.status).toBe(200);
    expect(content.body.access).toBe('shared');
    expect(content.text).toContain(h.secret);
    expect((await h.call('/admin/ledger', { token: 'good-user_admin' })).body.entries).toHaveLength(1);
    await h.call('/me/privacy', { method: 'PUT', token: 'good-user_friend', body: { share_data: false } });
    expect((await h.call('/admin/account-content?user_id=user_friend', { token: 'good-user_admin' })).status).toBe(403);
    // Nobody else can flip it for them: the admin API has no share_data switch, and /me/privacy is per session.
    await h.call('/me/privacy', { method: 'PUT', token: 'good-user_admin', body: { share_data: true } });
    expect((await h.call('/admin/account-content?user_id=user_friend', { token: 'good-user_admin' })).status).toBe(403);
  });

  it('access grants: "add as a client" opens one scope to one grantee until revoked or expired', async () => {
    const h = harness();
    await h.seed('user_client');
    // Granted to someone else: still private for this admin.
    await h.call('/me/access-grants', { token: 'good-user_client', body: { grantee: 'user_someone', scope: 'all' } });
    expect((await h.call('/admin/account-content?user_id=user_client', { token: 'good-user_admin' })).status).toBe(403);
    // Ledger scope only: stages stay private.
    await h.call('/me/access-grants', { token: 'good-user_client', body: { grantee: 'user_admin', scope: 'ledger' } });
    expect((await h.call('/admin/account-content?user_id=user_client', { token: 'good-user_admin' })).status).toBe(403);
    expect((await h.call('/admin/ledger', { token: 'good-user_admin' })).body.entries).toHaveLength(1);
    // Stages for 1 day.
    const granted = await h.call('/me/access-grants', { token: 'good-user_client', body: { grantee: 'user_admin', scope: 'stages', expires_days: 1 } });
    const content = await h.call('/admin/account-content?user_id=user_client', { token: 'good-user_admin' });
    expect(content.status).toBe(200);
    expect(content.body.access).toBe('grant');
    h.advance(2 * 24 * 60 * 60 * 1000);
    expect((await h.call('/admin/account-content?user_id=user_client', { token: 'good-user_admin' })).status).toBe(403);
    // The team grantee, then revoke.
    const team = await h.call('/me/access-grants', { token: 'good-user_client', body: { grantee: 'fresh-terminal', scope: 'all' } });
    expect((await h.call('/admin/account-content?user_id=user_client', { token: 'good-user_admin' })).status).toBe(200);
    const teamGrant = (team.body.grants as Array<{ id: string; grantee: string }>).find((grant) => grant.grantee === 'fresh-terminal');
    // Someone else cannot revoke it; the person can.
    await h.call('/me/access-grants/revoke', { token: 'good-user_admin', body: { id: teamGrant?.id } });
    expect((await h.call('/admin/account-content?user_id=user_client', { token: 'good-user_admin' })).status).toBe(200);
    await h.call('/me/access-grants/revoke', { token: 'good-user_client', body: { id: teamGrant?.id } });
    expect((await h.call('/admin/account-content?user_id=user_client', { token: 'good-user_admin' })).status).toBe(403);
    expect(granted.body.grants.length).toBeGreaterThan(0);
    expect((await h.call('/me/access-grants', { token: 'good-user_client', body: { grantee: 'anyone', scope: 'all' } })).status).toBe(400);
  });

  it('/credits shows the storage allowance and what the account stores (measured, not billed)', async () => {
    const h = harness();
    await h.seed('user_friend');
    const credits = (await h.call('/credits', { token: 'good-user_friend' })).body as unknown as CreditsStatus;
    expect(credits.share_data).toBe(false);
    expect(credits.storage).toMatchObject({ free_bytes: 100_000_000, over_bytes: 0, micro_per_gb_month: 50_000, final: false, enforced: false, estimate_micro_per_month: 0 });
    expect(credits.storage?.used_bytes).toBeGreaterThan(100);
  });
});
