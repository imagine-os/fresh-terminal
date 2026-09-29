import type { Context, MiddlewareHandler } from 'hono';
import { DEVICE_HEADER, SOFT_PROMPT_HEADER, type CreditsError, type CreditsErrorCode, type CreditsStatus } from '../../shared/src/credits/types';
import { authenticate, type AuthBindings, type TokenVerifier } from './auth';
import { accountIdFor, ensureAccount, type D1Database } from './d1';

/**
 * Free credits, enforced here and nowhere else (2026-09-29).
 *
 * - Every anonymous browser gets a device id from POST /credits/device, signed
 *   with DEVICE_SIGNING_KEY (HMAC-SHA256) and stored in D1 with a salted hash of
 *   its IP and network (/24 for IPv4, /48 for IPv6). Past a few new devices per
 *   IP or network per day, new devices get no starter grant.
 * - Paid calls (/route, /tag, /skin/*, /realtime/session) are metered: the
 *   caller is a signed-in account (Clerk session) or a signed device. Price is
 *   charged against the grant after the call, from the call's own ledger entry.
 * - When an anonymous grant runs out, the next call goes through with a small
 *   extra "chance" and a soft prompt (response header X-FT-Soft-Prompt: n/2).
 *   After the last chance, paid calls answer 402 sign_in_required.
 * - A global cap on anonymous provider cost per UTC day, per-IP and per-network
 *   rate limits (Workers Rate Limiting bindings), and a request-size cap and
 *   default-models-only rule for anonymous calls bound the worst case.
 * - Own-key (BYOK) calls go from the browser straight to OpenRouter and never
 *   reach these endpoints, so they are never blocked.
 * Without a D1 binding (local Node dev, most tests) metering is off.
 */

export interface CreditsBindings extends AuthBindings {
  DEVICE_SIGNING_KEY?: string;
  ANON_GRANT_MICRO?: string;
  ANON_CHANCE_MICRO?: string;
  ANON_CHANCES?: string;
  ANON_DAILY_COST_CAP_MICRO?: string;
  ACCOUNT_GRANT_MICRO?: string;
  MIN_BALANCE_MICRO?: string;
  DEVICES_PER_IP_DAY?: string;
  DEVICES_PER_NET_DAY?: string;
  ANON_MAX_BODY_BYTES?: string;
}

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface CreditsResources {
  DB?: D1Database;
  RL_IP?: RateLimiter;
  RL_NET?: RateLimiter;
}

export const CREDIT_DEFAULTS = {
  /** 25¢ of price per anonymous device. */
  anonGrantMicro: 250_000,
  /** Each soft prompt lets the person keep going with 5¢ more. */
  chanceMicro: 50_000,
  /** Two soft prompts, then sign-in is required. */
  chances: 2,
  /** $2 of provider cost per UTC day across all anonymous devices. */
  anonDailyCostCapMicro: 2_000_000,
  /** $1 of price per signed-in account (Stripe is not wired yet). */
  accountGrantMicro: 1_000_000,
  /** A call needs at least 1¢ left to start. */
  minBalanceMicro: 10_000,
  devicesPerIpDay: 3,
  devicesPerNetDay: 10,
  /** Anonymous request bodies are capped at 60 KB (bounds the input cost of one call). */
  anonMaxBodyBytes: 60_000,
} as const;

export type CreditConfig = { -readonly [K in keyof typeof CREDIT_DEFAULTS]: number };

export function creditConfig(bindings: CreditsBindings): CreditConfig {
  const pick = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return value !== undefined && value !== '' && Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
  };
  return {
    anonGrantMicro: pick(bindings.ANON_GRANT_MICRO, CREDIT_DEFAULTS.anonGrantMicro),
    chanceMicro: pick(bindings.ANON_CHANCE_MICRO, CREDIT_DEFAULTS.chanceMicro),
    chances: pick(bindings.ANON_CHANCES, CREDIT_DEFAULTS.chances),
    anonDailyCostCapMicro: pick(bindings.ANON_DAILY_COST_CAP_MICRO, CREDIT_DEFAULTS.anonDailyCostCapMicro),
    accountGrantMicro: pick(bindings.ACCOUNT_GRANT_MICRO, CREDIT_DEFAULTS.accountGrantMicro),
    minBalanceMicro: pick(bindings.MIN_BALANCE_MICRO, CREDIT_DEFAULTS.minBalanceMicro),
    devicesPerIpDay: pick(bindings.DEVICES_PER_IP_DAY, CREDIT_DEFAULTS.devicesPerIpDay),
    devicesPerNetDay: pick(bindings.DEVICES_PER_NET_DAY, CREDIT_DEFAULTS.devicesPerNetDay),
    anonMaxBodyBytes: pick(bindings.ANON_MAX_BODY_BYTES, CREDIT_DEFAULTS.anonMaxBodyBytes),
  };
}

// ---------- signing and hashing ----------

const encoder = new TextEncoder();
/** Used only where no DEVICE_SIGNING_KEY is set (local dev, tests). /health reports it. */
const DEV_ONLY_KEY = 'fresh-terminal-dev-only-device-key';

function b64url(bytes: ArrayBuffer): string {
  let text = '';
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function signDevice(id: string, key: string | undefined): Promise<string> {
  return `${id}.${await hmac(key || DEV_ONLY_KEY, `device:${id}`)}`;
}

/** Returns the device id when the signature is ours, else null. Constant-time enough: we compare HMACs we computed. */
export async function verifyDevice(token: string | null | undefined, key: string | undefined): Promise<string | null> {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  if (!/^fd1_[0-9a-f-]{36}$/.test(id)) return null;
  const expected = await signDevice(id, key);
  if (expected.length !== token.length) return null;
  let diff = 0;
  for (let index = 0; index < token.length; index += 1) diff |= expected.charCodeAt(index) ^ token.charCodeAt(index);
  return diff === 0 ? id : null;
}

export function clientIp(header: (name: string) => string | undefined): string {
  return (header('CF-Connecting-IP') ?? header('X-Forwarded-For')?.split(',')[0] ?? '0.0.0.0').trim() || '0.0.0.0';
}

/** /24 for IPv4, /48 for IPv6. */
export function networkOf(ip: string): string {
  if (ip.includes(':')) {
    const [head = ''] = ip.split('::');
    const parts = head.split(':').filter(Boolean);
    while (parts.length < 3) parts.push('0');
    return `${parts.slice(0, 3).join(':')}::/48`;
  }
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : ip;
}

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// ---------- rows ----------

interface DeviceRow {
  id: string;
  grant_micro: number;
  spent_micro: number;
  cost_micro: number;
  chances_used: number;
  limited: number;
}

interface AccountCreditRow {
  id: string;
  grant_micro: number;
  spent_micro: number;
}

export type Payer =
  | { kind: 'account'; id: string; row: AccountCreditRow }
  | { kind: 'device'; id: string; row: DeviceRow }
  | { kind: 'none' }
  | { kind: 'invalid'; reason: string };

const payers = new WeakMap<Request, Payer>();

/** The payer the meter resolved for this request (only set when metering is on). */
export function payerFor(request: Request): Payer | undefined {
  return payers.get(request);
}

async function dailyAnonCost(db: D1Database, now: number): Promise<number> {
  const row = await db.prepare("SELECT cost_micro FROM spend_daily WHERE day = ?1 AND scope = 'anon'").bind(utcDay(now)).first<{ cost_micro: number }>();
  return Number(row?.cost_micro ?? 0);
}

async function accountCredits(db: D1Database, clerkUserId: string, now: number, config: CreditConfig): Promise<AccountCreditRow> {
  await ensureAccount(db, clerkUserId, now);
  const id = accountIdFor(clerkUserId);
  // Accounts created before this migration carry the column default; apply the configured grant once.
  const row = await db.prepare('SELECT id, grant_micro, spent_micro FROM accounts WHERE id = ?1').bind(id).first<AccountCreditRow>();
  return { id, grant_micro: Number(row?.grant_micro ?? config.accountGrantMicro), spent_micro: Number(row?.spent_micro ?? 0) };
}

export interface MeterOptions {
  bindings: (env: unknown) => CreditsBindings & { ALLOWED_ORIGINS?: string };
  resources: (env: unknown) => CreditsResources;
  authorizedParties: (env: unknown) => string[];
  verifier?: TokenVerifier;
  now: () => number;
}

async function resolvePayer(c: Context, options: MeterOptions, db: D1Database, config: CreditConfig): Promise<Payer> {
  const bindings = options.bindings(c.env);
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    const auth = await authenticate(authHeader, bindings, options.authorizedParties(c.env), options.verifier);
    if (auth.state === 'signed-in') {
      const row = await accountCredits(db, auth.userId, options.now(), config);
      return { kind: 'account', id: row.id, row };
    }
    if (auth.state === 'invalid') return { kind: 'invalid', reason: auth.reason };
    // not-configured: fall through to the device
  }
  const id = await verifyDevice(c.req.header(DEVICE_HEADER), bindings.DEVICE_SIGNING_KEY);
  if (!id) return { kind: 'none' };
  const row = await db.prepare('SELECT id, grant_micro, spent_micro, cost_micro, chances_used, limited FROM anon_devices WHERE id = ?1').bind(id).first<DeviceRow>();
  return row ? { kind: 'device', id, row } : { kind: 'none' };
}

export function statusFor(payer: Payer, config: CreditConfig, dailyCapReached: boolean): CreditsStatus {
  const base = { turnstile: 'not-wired' as const, daily_cap_reached: dailyCapReached, label: payer.kind === 'account' ? 'free usage · signed in' : 'free usage' };
  if (payer.kind === 'account') {
    const remaining = Math.max(0, payer.row.grant_micro - payer.row.spent_micro);
    return { ...base, daily_cap_reached: false, signed_in: true, mode: 'account', granted_micro: payer.row.grant_micro, spent_micro: payer.row.spent_micro, remaining_micro: remaining, soft_prompts_left: 0, sign_in_required: false, limited: false };
  }
  if (payer.kind === 'device') {
    const remaining = Math.max(0, payer.row.grant_micro - payer.row.spent_micro);
    const left = Math.max(0, config.chances - payer.row.chances_used);
    const out = remaining < config.minBalanceMicro && left === 0;
    return { ...base, signed_in: false, mode: 'device', granted_micro: payer.row.grant_micro, spent_micro: payer.row.spent_micro, remaining_micro: remaining, soft_prompts_left: left, sign_in_required: out || dailyCapReached, limited: payer.row.limited === 1 };
  }
  return { ...base, signed_in: false, mode: 'none', granted_micro: 0, spent_micro: 0, remaining_micro: 0, soft_prompts_left: config.chances, sign_in_required: false, limited: false };
}

function deny(c: Context, status: 401 | 402 | 403 | 413 | 429, code: CreditsErrorCode, error: string, credits?: CreditsStatus) {
  const body: CreditsError = { error, code, ...(credits ? { credits } : {}) };
  return c.json(body, status);
}

/** Pulls {cost, price} out of a paid endpoint's JSON answer. */
export function costsFromJson(body: unknown): { cost: number; price: number } {
  let cost = 0;
  let price = 0;
  if (body && typeof body === 'object') {
    const record = body as { cost_micro?: unknown; price_micro?: unknown; entries?: unknown; entry?: unknown };
    const entries = Array.isArray(record.entries) ? record.entries : record.entry && typeof record.entry === 'object' ? [record.entry] : [];
    for (const entry of entries) {
      if (entry && typeof entry === 'object') {
        const e = entry as { cost_micro?: unknown; price_micro?: unknown };
        cost += Number(e.cost_micro) || 0;
        price += Number(e.price_micro ?? e.cost_micro) || 0;
      }
    }
    if (entries.length === 0 && typeof record.cost_micro === 'number') {
      cost = record.cost_micro;
      price = typeof record.price_micro === 'number' ? record.price_micro : record.cost_micro;
    }
  }
  return { cost: Math.max(0, Math.round(cost)), price: Math.max(0, Math.round(price)) };
}

/** Watches an SSE stream for the `done` event and reports its entry's cost when the stream ends. */
export function meterStream(body: ReadableStream<Uint8Array>, onCost: (costs: { cost: number; price: number }) => void): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = '';
  let found: { cost: number; price: number } = { cost: 0, price: 0 };
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        buffer += decoder.decode(chunk, { stream: true });
        let split = buffer.indexOf('\n\n');
        while (split !== -1) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          split = buffer.indexOf('\n\n');
          if (/^event:\s*done\s*$/m.test(block)) {
            const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
            try {
              found = costsFromJson(JSON.parse(data));
            } catch {
              // an unparsable done event charges nothing
            }
          }
        }
      },
      flush() {
        onCost(found);
      },
    }),
  );
}

async function record(db: D1Database, payer: Payer, costs: { cost: number; price: number }, now: number): Promise<void> {
  if (payer.kind !== 'account' && payer.kind !== 'device') return;
  const table = payer.kind === 'account' ? 'accounts' : 'anon_devices';
  const scope = payer.kind === 'account' ? 'account' : 'anon';
  await db.batch([
    db.prepare(`UPDATE ${table} SET spent_micro = spent_micro + ?1, cost_micro = cost_micro + ?2, updated_at = ?3 WHERE id = ?4`).bind(costs.price, costs.cost, now, payer.id),
    db
      .prepare(
        `INSERT INTO spend_daily (day, scope, cost_micro, price_micro, calls, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5)
         ON CONFLICT(day, scope) DO UPDATE SET cost_micro = cost_micro + excluded.cost_micro, price_micro = price_micro + excluded.price_micro, calls = calls + 1, updated_at = excluded.updated_at`,
      )
      .bind(utcDay(now), scope, costs.cost, costs.price, now),
  ]);
}

function later(c: Context, work: Promise<void>): void {
  let ctx: { waitUntil(promise: Promise<unknown>): void } | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = undefined;
  }
  const guarded = work.catch(() => undefined);
  if (ctx) ctx.waitUntil(guarded);
}

/** Middleware for the paid endpoints. */
export function meter(options: MeterOptions): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    const resources = options.resources(c.env);
    const db = resources.DB;
    if (!db) return next();
    const bindings = options.bindings(c.env);
    const config = creditConfig(bindings);
    const ip = clientIp((name) => c.req.header(name));
    const net = networkOf(ip);
    if (resources.RL_IP && !(await resources.RL_IP.limit({ key: `ip:${ip}` })).success) {
      return deny(c, 429, 'rate_limited', 'Too many requests from this address. Wait a minute.');
    }
    if (resources.RL_NET && !(await resources.RL_NET.limit({ key: `net:${net}` })).success) {
      return deny(c, 429, 'rate_limited', 'Too many requests from this network. Wait a minute.');
    }
    const payer = await resolvePayer(c, options, db, config);
    const now = options.now();
    if (payer.kind === 'invalid') return deny(c, 401, 'sign_in_required', `Session token rejected: ${payer.reason}`);
    if (payer.kind === 'none') return deny(c, 401, 'device_required', 'This browser has no device id yet. The app gets one from POST /credits/device.');

    if (payer.kind === 'account') {
      if (payer.row.grant_micro - payer.row.spent_micro < config.minBalanceMicro) {
        return deny(c, 402, 'account_credits_exhausted', 'Your free account credits are used up. Paying for more is not wired yet; your key (K, your own OpenRouter key) still works.', statusFor(payer, config, false));
      }
    } else {
      const length = Number(c.req.header('Content-Length') ?? '0');
      if (length > config.anonMaxBodyBytes) {
        return deny(c, 413, 'too_large', 'That request is too large to run signed out. Sign in to keep going.');
      }
      const dailyCapReached = (await dailyAnonCost(db, now)) >= config.anonDailyCostCapMicro;
      if (dailyCapReached) {
        return deny(c, 402, 'daily_cap', 'Free use for signed-out visitors is full for today. Sign in to keep going, or use your key (K).', statusFor(payer, config, true));
      }
      if (payer.row.grant_micro - payer.row.spent_micro < config.minBalanceMicro) {
        if (payer.row.chances_used >= config.chances) {
          return deny(c, 402, 'sign_in_required', 'Your free credits are used up. Sign in to keep going, or use your key (K).', statusFor(payer, config, false));
        }
        // Soft prompt: let this call through with a small chance, once per prompt.
        const used = payer.row.chances_used + 1;
        const topUp = payer.row.spent_micro - payer.row.grant_micro + config.minBalanceMicro + config.chanceMicro;
        const result = await db
          .prepare('UPDATE anon_devices SET grant_micro = grant_micro + ?1, chances_used = ?2, updated_at = ?3 WHERE id = ?4 AND chances_used = ?5')
          .bind(Math.max(config.chanceMicro, topUp), used, now, payer.id, payer.row.chances_used)
          .run();
        if ((result.meta?.changes ?? 1) === 0) {
          return deny(c, 402, 'sign_in_required', 'Your free credits are used up. Sign in to keep going.', statusFor(payer, config, false));
        }
        c.header(SOFT_PROMPT_HEADER, `${used}/${config.chances}`);
      }
    }

    payers.set(c.req.raw, payer);
    await next();
    const response = c.res;
    if (!response.ok || !response.body) return;
    const type = response.headers.get('Content-Type') ?? '';
    if (type.includes('text/event-stream')) {
      let settle: () => void = () => undefined;
      const done = new Promise<void>((resolve) => (settle = resolve));
      const body = meterStream(response.body, (costs) => {
        void record(db, payer, costs, options.now()).finally(settle);
      });
      later(c, done);
      c.res = new Response(body, response);
      return;
    }
    if (type.includes('application/json')) {
      const costs = costsFromJson(await response.clone().json().catch(() => null));
      if (costs.cost > 0 || costs.price > 0) {
        const work = record(db, payer, costs, options.now());
        later(c, work);
        await work;
      }
    }
  };
}

/** GET /credits and POST /credits/device. */
export function mountCreditRoutes(app: { get: (path: string, handler: (c: Context) => Promise<Response>) => unknown; post: (path: string, handler: (c: Context) => Promise<Response>) => unknown }, options: MeterOptions): void {
  app.get('/credits', async (c) => {
    const db = options.resources(c.env).DB;
    const bindings = options.bindings(c.env);
    const config = creditConfig(bindings);
    if (!db) return c.json({ error: 'Credits need the D1 binding; metering is off here', code: 'device_required' }, 503);
    const payer = await resolvePayer(c, options, db, config);
    if (payer.kind === 'invalid') return c.json({ error: payer.reason, code: 'sign_in_required' }, 401);
    const cap = payer.kind === 'device' ? (await dailyAnonCost(db, options.now())) >= config.anonDailyCostCapMicro : false;
    return c.json(statusFor(payer, config, cap));
  });

  app.post('/credits/device', async (c) => {
    const db = options.resources(c.env).DB;
    const bindings = options.bindings(c.env);
    const config = creditConfig(bindings);
    if (!db) return c.json({ error: 'Credits need the D1 binding; metering is off here' }, 503);
    const resources = options.resources(c.env);
    const ip = clientIp((name) => c.req.header(name));
    const net = networkOf(ip);
    if (resources.RL_IP && !(await resources.RL_IP.limit({ key: `ip:${ip}` })).success) {
      return deny(c, 429, 'rate_limited', 'Too many requests from this address. Wait a minute.');
    }
    // An existing valid device is returned as is (no second grant).
    const existing = await verifyDevice(c.req.header(DEVICE_HEADER), bindings.DEVICE_SIGNING_KEY);
    if (existing) {
      const row = await db.prepare('SELECT id, grant_micro, spent_micro, cost_micro, chances_used, limited FROM anon_devices WHERE id = ?1').bind(existing).first<DeviceRow>();
      if (row) return c.json({ device: c.req.header(DEVICE_HEADER), credits: statusFor({ kind: 'device', id: existing, row }, config, false) });
    }
    const now = options.now();
    const since = now - 24 * 60 * 60 * 1000;
    const ipHash = await sha256Hex(`ft-ip-v1|${ip}`);
    const netHash = await sha256Hex(`ft-net-v1|${net}`);
    const perIp = await db.prepare('SELECT COUNT(*) AS n FROM anon_devices WHERE ip_hash = ?1 AND created_at > ?2').bind(ipHash, since).first<{ n: number }>();
    const perNet = await db.prepare('SELECT COUNT(*) AS n FROM anon_devices WHERE net_hash = ?1 AND created_at > ?2').bind(netHash, since).first<{ n: number }>();
    const limited = Number(perIp?.n ?? 0) >= config.devicesPerIpDay || Number(perNet?.n ?? 0) >= config.devicesPerNetDay;
    const id = `fd1_${crypto.randomUUID()}`;
    const grant = limited ? 0 : config.anonGrantMicro;
    // A limited device starts with its chances used, so it goes straight to "sign in to keep going".
    const chancesUsed = limited ? config.chances : 0;
    await db
      .prepare('INSERT INTO anon_devices (id, ip_hash, net_hash, grant_micro, spent_micro, cost_micro, chances_used, limited, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6, ?7, ?7)')
      .bind(id, ipHash, netHash, grant, chancesUsed, limited ? 1 : 0, now)
      .run();
    const row: DeviceRow = { id, grant_micro: grant, spent_micro: 0, cost_micro: 0, chances_used: chancesUsed, limited: limited ? 1 : 0 };
    return c.json({ device: await signDevice(id, bindings.DEVICE_SIGNING_KEY), credits: statusFor({ kind: 'device', id, row }, config, false) });
  });
}
