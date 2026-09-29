import { generateKeyPairSync, createSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { authenticate, clerkVerifier, type TokenVerifier } from './auth';
import type { D1Database } from './d1';
import { fakeD1 } from './testing/fakeD1';
import type { SyncBox } from '../../shared/src/sync/types';

const fakeVerifier: TokenVerifier = async (token) => {
  if (token.startsWith('good-')) return { sub: token.slice(5), sid: 'sess_1' };
  throw new Error('bad token');
};

function box(id: string, updated_at: number, name = id): SyncBox {
  return { id, name, state_json: JSON.stringify({ nav: [] }), created_at: 1, updated_at, deleted_at: null };
}

function appWith(db: D1Database | undefined, bindings: Record<string, string> = { CLERK_SECRET_KEY: 'sk_test_x' }) {
  let clock = 1_000;
  return createApp({ bindings: () => bindings, resources: () => (db ? { DB: db } : {}), verifier: fakeVerifier, now: () => ++clock });
}

async function call(app: ReturnType<typeof createApp>, path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await app.request(path, { ...init, headers });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('sync endpoints (D1)', () => {
  it('reports auth and D1 on /health', async () => {
    const { body } = await call(appWith(fakeD1()), '/health');
    expect(body.auth).toEqual({ clerk: true, networkless: false });
    expect(body.store).toEqual({ d1: true });
  });

  it('keeps signed-out use working and refuses sync without a session', async () => {
    const app = appWith(fakeD1());
    expect((await call(app, '/me')).body).toEqual({ signedIn: false });
    expect((await call(app, '/sync/boxes')).status).toBe(401);
    expect((await call(app, '/sync/boxes', { token: 'nope' })).status).toBe(401);
  });

  it('says 503 when Clerk or D1 is missing', async () => {
    expect((await call(appWith(fakeD1(), {}), '/sync/boxes', { token: 'good-user_a' })).status).toBe(503);
    expect((await call(appWith(undefined), '/sync/boxes', { token: 'good-user_a' })).status).toBe(503);
  });

  it('creates the account on /me and syncs boxes last-writer-wins', async () => {
    const app = appWith(fakeD1());
    const me = await call(app, '/me', { token: 'good-user_a' });
    expect(me.body.signedIn).toBe(true);
    expect((me.body.account as { id: string; plan: string }).plan).toBe('free');

    const first = await call(app, '/sync/boxes', { method: 'PUT', token: 'good-user_a', body: JSON.stringify({ boxes: [box('box_1', 10), box('box_2', 10)] }) });
    expect(first.body.accepted).toEqual(['box_1', 'box_2']);

    // An older write loses and returns the server copy.
    const stale = await call(app, '/sync/boxes', { method: 'PUT', token: 'good-user_a', body: JSON.stringify({ boxes: [box('box_1', 5, 'old name')] }) });
    expect(stale.body.accepted).toEqual([]);
    expect((stale.body.conflicts as SyncBox[])[0]?.name).toBe('box_1');

    const newer = await call(app, '/sync/boxes', { method: 'PUT', token: 'good-user_a', body: JSON.stringify({ boxes: [box('box_1', 20, 'renamed')] }) });
    expect(newer.body.accepted).toEqual(['box_1']);

    const pulled = await call(app, '/sync/boxes?since=0', { token: 'good-user_a' });
    const names = (pulled.body.boxes as SyncBox[]).map((row) => `${row.id}:${row.name}`).sort();
    expect(names).toEqual(['box_1:renamed', 'box_2:box_2']);
    expect(((await call(app, '/sync/boxes?since=15', { token: 'good-user_a' })).body.boxes as SyncBox[]).map((row) => row.id)).toEqual(['box_1']);
  });

  it('never lets one account overwrite or read another account\'s box', async () => {
    const app = appWith(fakeD1());
    await call(app, '/sync/boxes', { method: 'PUT', token: 'good-user_a', body: JSON.stringify({ boxes: [box('box_x', 10)] }) });
    const theft = await call(app, '/sync/boxes', { method: 'PUT', token: 'good-user_b', body: JSON.stringify({ boxes: [box('box_x', 99, 'mine now')] }) });
    expect(theft.body.rejected).toEqual(['box_x']);
    expect((await call(app, '/sync/boxes', { token: 'good-user_b' })).body.boxes).toEqual([]);
    const owner = await call(app, '/sync/boxes', { token: 'good-user_a' });
    expect((owner.body.boxes as SyncBox[])[0]?.name).toBe('box_x');
  });

  it('mirrors ledger entries append-only', async () => {
    const app = appWith(fakeD1());
    const entry = {
      id: 'entry_1', box_id: 'box_1', owner_identity: 'anon_1', kind: 'charge', what: 'model.call', model: 'm', units: 1, unit_kind: 'call',
      cost_micro: 10, price_micro: 12, ref: 'gen', created_at: 5, prev_hash: '0'.repeat(64), hash: 'a'.repeat(64), shared_prev_hash: null, shared_hash: null,
    };
    const pushed = await call(app, '/sync/ledger', { method: 'POST', token: 'good-user_a', body: JSON.stringify({ entries: [entry] }) });
    expect(pushed.body.received).toBe(1);
    await call(app, '/sync/ledger', { method: 'POST', token: 'good-user_a', body: JSON.stringify({ entries: [{ ...entry, cost_micro: 999 }] }) });
    const listed = await call(app, '/sync/ledger', { token: 'good-user_a' });
    const entries = listed.body.entries as Array<{ id: string; cost_micro: number }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.cost_micro).toBe(10);
  });

  it('allows the Authorization header cross-origin from freshterminal.ai', async () => {
    const app = appWith(fakeD1(), { CLERK_SECRET_KEY: 'sk' });
    const response = await app.request('/sync/boxes', {
      method: 'OPTIONS',
      headers: { Origin: 'https://freshterminal.ai', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://freshterminal.ai');
    expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('authorization');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
  });
});

describe('Clerk networkless verification', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  function sign(claims: Record<string, unknown>): string {
    const head = b64({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' });
    const body = b64(claims);
    const signature = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url');
    return `${head}.${body}.${signature}`;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const claims = { sub: 'user_123', sid: 'sess_9', iss: 'https://relevant-flea-5813.clerk.accounts.dev', azp: 'https://freshterminal.ai', iat: nowSec - 5, nbf: nowSec - 10, exp: nowSec + 60 };

  it('accepts a token signed by the instance key from an allowed origin', async () => {
    const result = await authenticate(`Bearer ${sign(claims)}`, { CLERK_JWT_KEY: pem }, ['https://freshterminal.ai'], clerkVerifier);
    expect(result).toEqual({ state: 'signed-in', userId: 'user_123', sessionId: 'sess_9' });
  });

  it('rejects an expired token, a foreign origin and a wrong key', async () => {
    expect((await authenticate(`Bearer ${sign({ ...claims, exp: nowSec - 120 })}`, { CLERK_JWT_KEY: pem }, ['https://freshterminal.ai'])).state).toBe('invalid');
    expect((await authenticate(`Bearer ${sign({ ...claims, azp: 'https://evil.example' })}`, { CLERK_JWT_KEY: pem }, ['https://freshterminal.ai'])).state).toBe('invalid');
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect((await authenticate(`Bearer ${sign(claims)}`, { CLERK_JWT_KEY: other }, ['https://freshterminal.ai'])).state).toBe('invalid');
  });

  it('treats no header as anonymous', async () => {
    expect(await authenticate(undefined, { CLERK_JWT_KEY: pem }, [])).toEqual({ state: 'anonymous' });
  });
});
