import { createApp } from '../app';
import { signDevice } from '../credits';
import type { D1Database } from '../d1';
import { fakeD1 } from './fakeD1';

/**
 * Test-only: a router with D1, a Clerk Backend API stand-in (emails per user id, verified or not)
 * and helpers to sign up from a given device and IP (C-106, C-107).
 */
export function signupHarness(bindings: Record<string, string> = {}) {
  const db: D1Database = fakeD1();
  let clock = Date.UTC(2026, 8, 29, 8, 0, 0);
  const emails = new Map<string, { email: string; verified: boolean }>();
  const clerk: typeof fetch = async (input) => {
    const match = /^https:\/\/api\.clerk\.com\/v1\/users\/([^/]+)$/.exec(String(input));
    const user = match ? emails.get(decodeURIComponent(match[1] ?? '')) : undefined;
    if (!match || !user) return new Response('{}', { status: 404 });
    return Response.json({ id: match[1], primary_email_address_id: 'e1', email_addresses: [{ id: 'e1', email_address: user.email, verification: { status: user.verified ? 'verified' : 'unverified' } }] });
  };
  const env = { CLERK_SECRET_KEY: 'sk_test_x', CLERK_JWT_KEY: 'x', DEVICE_SIGNING_KEY: 'k', ADMIN_USER_IDS: 'user_admin', SITE_URL: 'https://freshterminal.ai', ...bindings };
  const app = createApp({
    bindings: () => env,
    resources: () => ({ DB: db }),
    verifier: async (token) => {
      if (token.startsWith('good-')) return { sub: token.slice(5) };
      throw new Error('bad token');
    },
    fetchImpl: clerk,
    now: () => (clock += 1000),
  });
  // Test names ("fd1_a") map to real device ids (fd1_<uuid>), the same one each time.
  const devices = new Map<string, string>();
  const deviceId = (name: string) => {
    if (!devices.has(name)) devices.set(name, `fd1_${crypto.randomUUID()}`);
    return devices.get(name) as string;
  };
  const call = async (path: string, init: { method?: string; user?: string; body?: unknown; device?: string; ip?: string } = {}) => {
    const headers = new Headers({ 'Content-Type': 'application/json', 'CF-Connecting-IP': init.ip ?? '198.51.100.7' });
    if (init.user) headers.set('Authorization', `Bearer good-${init.user}`);
    if (init.device) headers.set('X-FT-Device', await signDevice(deviceId(init.device), env.DEVICE_SIGNING_KEY));
    const response = await app.request(path, { method: init.method ?? (init.body === undefined ? 'GET' : 'POST'), headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, any> };
  };
  /** A person signs in for the first time: Clerk knows their email; the app asks GET /credits. */
  const signUp = async (user: string, email: string, options: { device?: string; ip?: string; verified?: boolean } = {}) => {
    emails.set(user, { email, verified: options.verified ?? true });
    return call('/credits', { user, ...(options.device ? { device: options.device } : {}), ...(options.ip ? { ip: options.ip } : {}) });
  };
  const verify = (user: string) => {
    const known = emails.get(user);
    if (known) known.verified = true;
  };
  return { db, call, signUp, verify, deviceId, advance: (ms: number) => (clock += ms), now: () => clock };
}
