import type { Context, Hono } from 'hono';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { z } from 'zod';
import { authenticate, type AuthResult, type TokenVerifier } from './auth';
import { referralTotals, reverseReferral, settleReferral } from './referrals';
import { accountForRequest, applyStarter, billingProvider, creditLimitMicro, headlineMarginBp, sha256Hex, starterMicro, type CreditsBindings, type CreditsResources } from './credits';
import { accountIdFor, ensureAccount, type D1Database } from './d1';
import { canSeeContent } from './privacy';

/**
 * Friend credits, the admin API and the payment hook (2026-09-29, C-086..C-088).
 *
 * - Admin = a Clerk user whose id is in ADMIN_USER_IDS (Worker var) or whose
 *   verified email is in ADMIN_EMAILS (Worker secret, read through the Clerk
 *   Backend API with CLERK_SECRET_KEY and cached for five minutes).
 *   ADMIN_USER_IDS_SMOKE is a temporary extra id, set and removed by the
 *   hub-smoke workflow for its throwaway admin.
 * - POST /admin/grant adds credit to one account; POST /admin/invites makes a
 *   code worth $X for N uses that a signed-in friend redeems at
 *   POST /credits/redeem. Every credit is a credit_grants row (who granted it,
 *   the note) and a `credit` entry on the account's ledger mirror.
 * - A credit raises the account's grant, and its billing threshold when the
 *   grant would pass it, so a gift is always spendable.
 * - POST /billing/checkout is the "Top up / add payment" hook: 501 not_wired
 *   until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set; then a Stripe
 *   Checkout Session (one-time payment, card saved for later). The webhook
 *   credits the payment once and marks the account active. Not tested against
 *   live Stripe yet.
 */

export interface AdminBindings extends CreditsBindings {
  ADMIN_USER_IDS?: string;
  ADMIN_USER_IDS_SMOKE?: string;
  ADMIN_EMAILS?: string;
  /** Largest single grant or invite value, in dollars (default 100). */
  ADMIN_GRANT_MAX_USD?: string;
  /** Where Stripe Checkout sends people back (default https://freshterminal.ai). */
  SITE_URL?: string;
  ALLOWED_ORIGINS?: string;
}

export interface AdminOptions {
  bindings: (env: unknown) => AdminBindings;
  resources: (env: unknown) => CreditsResources;
  authorizedParties: (env: unknown) => string[];
  verifier?: TokenVerifier;
  fetchImpl?: typeof fetch;
  now: () => number;
}

const MICRO = 1_000_000;
export const TOPUP_AMOUNTS_USD = [5, 10, 20, 50] as const;

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function usdToMicro(usd: number): number {
  return Math.round(usd * MICRO);
}

// ---------- Clerk Backend API ----------

interface ClerkEmail {
  id?: string;
  email_address?: string;
  verification?: { status?: string } | null;
}
interface ClerkUser {
  id: string;
  email_addresses?: ClerkEmail[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  username?: string | null;
}

async function clerkGet<T>(path: string, secret: string, fetchImpl: typeof fetch): Promise<T | null> {
  const response = await fetchImpl(`https://api.clerk.com/v1${path}`, { headers: { Authorization: `Bearer ${secret}` } });
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as T | null;
}

export function verifiedEmails(user: ClerkUser | null): string[] {
  return (user?.email_addresses ?? [])
    .filter((email) => email.verification?.status === 'verified' && email.email_address)
    .map((email) => String(email.email_address).toLowerCase());
}

function primaryEmail(user: ClerkUser | null): string | null {
  const emails = user?.email_addresses ?? [];
  const primary = emails.find((email) => email.id && email.id === user?.primary_email_address_id) ?? emails[0];
  return primary?.email_address ?? null;
}

const emailCache = new Map<string, { emails: string[]; at: number }>();
const EMAIL_TTL = 5 * 60 * 1000;

export type AdminCheck = { admin: true; via: 'id' | 'email' } | { admin: false; reason: string };

export async function checkAdmin(userId: string, bindings: AdminBindings, now: number, fetchImpl: typeof fetch = fetch): Promise<AdminCheck> {
  const ids = [...list(bindings.ADMIN_USER_IDS), ...list(bindings.ADMIN_USER_IDS_SMOKE)];
  if (ids.includes(userId)) return { admin: true, via: 'id' };
  const wanted = list(bindings.ADMIN_EMAILS).map((email) => email.toLowerCase());
  if (wanted.length === 0) return { admin: false, reason: 'not in ADMIN_USER_IDS' };
  if (!bindings.CLERK_SECRET_KEY) return { admin: false, reason: 'ADMIN_EMAILS needs CLERK_SECRET_KEY on the router' };
  let cached = emailCache.get(userId);
  if (!cached || now - cached.at > EMAIL_TTL) {
    const user = await clerkGet<ClerkUser>(`/users/${encodeURIComponent(userId)}`, bindings.CLERK_SECRET_KEY, fetchImpl).catch(() => null);
    cached = { emails: verifiedEmails(user), at: now };
    emailCache.set(userId, cached);
  }
  return cached.emails.some((email) => wanted.includes(email)) ? { admin: true, via: 'email' } : { admin: false, reason: 'not an admin' };
}

/** Test hook: forget cached Clerk email lookups. */
export function clearAdminCache(): void {
  emailCache.clear();
}

// ---------- credits ----------

export type CreditSource = 'admin' | 'invite' | 'topup' | 'referral_bonus' | 'referral_reward' | 'referral_share' | 'referral_reversal';

export interface CreditInput {
  clerkUserId: string;
  amountMicro: number;
  source: CreditSource;
  grantedBy: string;
  note: string;
  inviteCode?: string;
  ref?: string;
}

export interface GrantRow {
  id: string;
  account_id: string;
  clerk_user_id: string;
  amount_micro: number;
  source: CreditSource;
  invite_code: string | null;
  granted_by: string;
  note: string;
  ref: string;
  created_at: number;
}

const WHAT: Record<CreditSource, string> = {
  admin: 'credit.grant',
  invite: 'credit.invite',
  topup: 'credit.topup',
  // C-107: referrals.
  referral_bonus: 'credit.referral_bonus',
  referral_reward: 'credit.referral_reward',
  referral_share: 'credit.referral_share',
  referral_reversal: 'credit.referral_reversal',
};

/** Adds credit to an account: credit_grants row + accounts update + a `credit` entry on its ledger mirror, in one batch. */
export async function applyCredit(db: D1Database, input: CreditInput, now: number): Promise<GrantRow> {
  await ensureAccount(db, input.clerkUserId, now);
  const accountId = accountIdFor(input.clerkUserId);
  const id = `grant_${crypto.randomUUID()}`;
  // Server-side credits form their own hash chain per account (ids srv_*), next to the browser's chain.
  const last = await db
    .prepare("SELECT hash FROM ledger_entries WHERE account_id = ?1 AND id LIKE 'srv_%' ORDER BY created_at DESC, id DESC LIMIT 1")
    .bind(accountId)
    .first<{ hash: string }>();
  const prevHash = last?.hash ?? '0'.repeat(64);
  const entry = {
    id: `srv_${id}`,
    box_id: '',
    // A negative amount (a reversed referral reward) is a charge line of the same size: ledger amounts stay positive.
    kind: input.amountMicro < 0 ? 'charge' : 'credit',
    what: WHAT[input.source],
    model: '',
    units: 1,
    unit_kind: 'op',
    cost_micro: 0,
    price_micro: Math.abs(input.amountMicro),
    ref: id,
    created_at: now,
  };
  const hash = await sha256Hex(`${prevHash}|${JSON.stringify(entry)}`);
  const topup = input.source === 'topup';
  await db.batch([
    db
      .prepare(
        `INSERT INTO credit_grants (id, account_id, clerk_user_id, amount_micro, source, invite_code, granted_by, note, ref, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
      )
      .bind(id, accountId, input.clerkUserId, input.amountMicro, input.source, input.inviteCode ?? null, input.grantedBy, input.note, input.ref ?? '', now),
    db
      .prepare(
        `UPDATE accounts SET
           grant_micro = MAX(0, grant_micro + ?1),
           billing_threshold_micro = MAX(billing_threshold_micro, grant_micro + ?1),
           paid_micro = paid_micro + ?2,
           billing_state = CASE WHEN ?3 = 1 THEN 'active' WHEN billing_state = 'needs_payment' THEN 'free' ELSE billing_state END,
           updated_at = ?4
         WHERE id = ?5`,
      )
      .bind(input.amountMicro, topup ? input.amountMicro : 0, topup ? 1 : 0, now, accountId),
    db
      .prepare(
        `INSERT INTO ledger_entries (account_id, id, box_id, kind, what, model, units, unit_kind, cost_micro, price_micro, ref, prev_hash, hash, shared_prev_hash, shared_hash, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL, NULL, ?14, ?14)`,
      )
      .bind(accountId, entry.id, '', entry.kind, entry.what, '', 1, 'op', 0, entry.price_micro, id, prevHash, hash, now),
  ]);
  return {
    id,
    account_id: accountId,
    clerk_user_id: input.clerkUserId,
    amount_micro: input.amountMicro,
    source: input.source,
    invite_code: input.inviteCode ?? null,
    granted_by: input.grantedBy,
    note: input.note,
    ref: input.ref ?? '',
    created_at: now,
  };
}

// ---------- invite codes ----------

/** No 0/O, 1/I/L: easy to read out loud and type. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  return `FT-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export type RedeemResult =
  | { ok: true; grant: GrantRow }
  | { ok: false; status: 404 | 409 | 410; code: 'invite_unknown' | 'invite_already_redeemed' | 'invite_used_up' | 'invite_expired'; error: string };

export async function redeemInvite(db: D1Database, rawCode: string, clerkUserId: string, now: number): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);
  const invite = await db
    .prepare('SELECT code, amount_micro, max_uses, uses, created_by, note, expires_at, disabled FROM invite_codes WHERE code = ?1')
    .bind(code)
    .first<{ code: string; amount_micro: number; max_uses: number; uses: number; created_by: string; note: string; expires_at: number | null; disabled: number }>();
  if (!invite || Number(invite.disabled) === 1) return { ok: false, status: 404, code: 'invite_unknown', error: 'That code does not exist or was switched off.' };
  if (invite.expires_at !== null && invite.expires_at !== undefined && Number(invite.expires_at) < now) {
    return { ok: false, status: 410, code: 'invite_expired', error: 'That code has expired.' };
  }
  await ensureAccount(db, clerkUserId, now);
  const accountId = accountIdFor(clerkUserId);
  const claimed = await db
    .prepare("INSERT OR IGNORE INTO invite_redemptions (code, account_id, grant_id, created_at, updated_at) VALUES (?1, ?2, 'pending', ?3, ?3)")
    .bind(code, accountId, now)
    .run();
  if ((claimed.meta?.changes ?? 1) === 0) return { ok: false, status: 409, code: 'invite_already_redeemed', error: 'You already used this code.' };
  const counted = await db
    .prepare('UPDATE invite_codes SET uses = uses + 1, updated_at = ?1 WHERE code = ?2 AND uses < max_uses AND disabled = 0')
    .bind(now, code)
    .run();
  if ((counted.meta?.changes ?? 1) === 0) {
    await db.prepare('DELETE FROM invite_redemptions WHERE code = ?1 AND account_id = ?2').bind(code, accountId).run();
    return { ok: false, status: 410, code: 'invite_used_up', error: 'That code has been used up.' };
  }
  const grant = await applyCredit(
    db,
    { clerkUserId, amountMicro: Number(invite.amount_micro), source: 'invite', grantedBy: invite.created_by, note: invite.note || `invite ${code}`, inviteCode: code },
    now,
  );
  await db.prepare('UPDATE invite_redemptions SET grant_id = ?1, updated_at = ?2 WHERE code = ?3 AND account_id = ?4').bind(grant.id, now, code, accountId).run();
  return { ok: true, grant };
}

// ---------- Stripe (not wired until the keys exist) ----------

/** Verifies a Stripe-Signature header (t=..., v1=...) over the raw body, within five minutes. */
export async function verifyStripeSignature(rawBody: string, header: string | undefined | null, secret: string, nowMs: number, toleranceSeconds = 300): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((part) => part.trim().split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    let diff = 0;
    for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    return diff === 0;
  });
}

// ---------- routes ----------

const grantSchema = z
  .object({
    email: z.string().email().max(320).optional(),
    user_id: z.string().regex(/^user_[A-Za-z0-9]+$/).optional(),
    amount_usd: z.number().positive(),
    note: z.string().trim().min(1).max(300),
  })
  .refine((body) => Boolean(body.email) !== Boolean(body.user_id), { message: 'Send email or user_id (one of them)' });

const inviteSchema = z.object({
  amount_usd: z.number().positive(),
  uses: z.number().int().min(1).max(1000),
  note: z.string().trim().max(300).default(''),
  expires_days: z.number().int().min(1).max(365).optional(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{6,32}$/)
    .optional(),
});

const accountSchema = z
  .object({
    email: z.string().email().max(320).optional(),
    user_id: z.string().regex(/^user_[A-Za-z0-9]+$/).optional(),
    billing_threshold_usd: z.number().min(0).max(10_000).optional(),
    billing_state: z.enum(['free', 'needs_payment', 'active']).optional(),
  })
  .refine((body) => Boolean(body.email) !== Boolean(body.user_id), { message: 'Send email or user_id (one of them)' });

type Json = Record<string, unknown>;

export function mountAdminRoutes(app: Hono<any>, options: AdminOptions): void {
  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  async function who(c: Context): Promise<AuthResult> {
    const bindings = options.bindings(c.env);
    return authenticate(c.req.header('Authorization'), bindings, options.authorizedParties(c.env), options.verifier);
  }

  type Gate = { ok: true; userId: string; db: D1Database; bindings: AdminBindings; via: 'id' | 'email' } | { ok: false; response: Response };

  async function requireAdmin(c: Context): Promise<Gate> {
    const auth = await who(c);
    if (auth.state === 'anonymous') return { ok: false, response: c.json({ error: 'Sign in as an admin to see this.', code: 'sign_in_required' }, 401) };
    if (auth.state === 'invalid') return { ok: false, response: c.json({ error: 'Session token rejected', code: 'sign_in_required', reason: auth.reason }, 401) };
    if (auth.state === 'not-configured') return { ok: false, response: c.json({ error: 'Clerk is not configured on this router', code: 'not_configured' }, 503) };
    const bindings = options.bindings(c.env);
    const check = await checkAdmin(auth.userId, bindings, options.now(), fetchImpl);
    if (!check.admin) return { ok: false, response: c.json({ error: 'This account is not an admin.', code: 'not_admin' }, 403) };
    const db = options.resources(c.env).DB;
    if (!db) return { ok: false, response: c.json({ error: 'No D1 database is bound to this router (binding DB)', code: 'not_configured' }, 503) };
    return { ok: true, userId: auth.userId, db, bindings, via: check.via };
  }

  async function resolveUser(bindings: AdminBindings, body: { email?: string | undefined; user_id?: string | undefined }): Promise<{ ok: true; userId: string; email: string | null } | { ok: false; status: 404 | 503; error: string }> {
    if (body.user_id) {
      if (!bindings.CLERK_SECRET_KEY) return { ok: true, userId: body.user_id, email: null };
      const user = await clerkGet<ClerkUser>(`/users/${encodeURIComponent(body.user_id)}`, bindings.CLERK_SECRET_KEY, fetchImpl).catch(() => null);
      if (!user) return { ok: false, status: 404, error: `No Clerk user ${body.user_id}` };
      return { ok: true, userId: user.id, email: primaryEmail(user) };
    }
    if (!bindings.CLERK_SECRET_KEY) return { ok: false, status: 503, error: 'Looking people up by email needs CLERK_SECRET_KEY on the router' };
    const email = String(body.email).toLowerCase();
    const users = await clerkGet<ClerkUser[]>(`/users?email_address=${encodeURIComponent(email)}&limit=2`, bindings.CLERK_SECRET_KEY, fetchImpl).catch(() => null);
    const user = users?.[0];
    if (!user) return { ok: false, status: 404, error: `Nobody has signed up with ${email} yet. Send them an invite code instead.` };
    return { ok: true, userId: user.id, email };
  }

  function maxGrantMicro(bindings: AdminBindings): number {
    const parsed = Number(bindings.ADMIN_GRANT_MAX_USD);
    return usdToMicro(Number.isFinite(parsed) && parsed > 0 ? parsed : 100);
  }

  app.get('/admin/whoami', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    return c.json({ admin: true, userId: gate.userId, via: gate.via });
  });

  app.get('/admin/overview', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    const { db, bindings } = gate;
    const accounts = await db
      .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(spent_micro),0) AS spent, COALESCE(SUM(cost_micro),0) AS cost, SUM(CASE WHEN billing_state = 'needs_payment' THEN 1 ELSE 0 END) AS needs_payment, SUM(CASE WHEN billing_state = 'active' THEN 1 ELSE 0 END) AS active FROM accounts")
      .first<Json>();
    const grants = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount_micro),0) AS total FROM credit_grants').first<Json>();
    const invites = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN disabled = 0 AND uses < max_uses THEN 1 ELSE 0 END),0) AS open FROM invite_codes').first<Json>();
    const devices = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(spent_micro),0) AS spent, COALESCE(SUM(cost_micro),0) AS cost FROM anon_devices').first<Json>();
    const privacy = await db.prepare('SELECT COALESCE(SUM(share_data),0) AS sharing, COALESCE(SUM(stored_bytes),0) AS stored_bytes FROM accounts').first<Json>();
    // Pay what you want (C-105): the average markup across accounts, a total only (no per-account rows).
    const markupRow = await db
      .prepare('SELECT COUNT(*) AS n, COALESCE(AVG(COALESCE(markup_bp, ?1)), ?1) AS average_bp, SUM(CASE WHEN markup_bp IS NOT NULL THEN 1 ELSE 0 END) AS chosen FROM accounts')
      .bind(headlineMarginBp())
      .first<Json>();
    const markup = { accounts: Number(markupRow?.n ?? 0), average_bp: Math.round(Number(markupRow?.average_bp ?? headlineMarginBp())), chosen: Number(markupRow?.chosen ?? 0), default_bp: headlineMarginBp() };
    // C-106 and C-107: welcome credits by state (and why blocked), and referral totals. Counts only.
    const { results: welcomeRows } = await db.prepare('SELECT starter_state AS state, starter_reason AS reason, COUNT(*) AS n FROM accounts GROUP BY starter_state, starter_reason').all<{ state: string; reason: string | null; n: number }>();
    const welcome: Record<string, number> = {};
    const blockedReasons: Record<string, number> = {};
    for (const row of welcomeRows) {
      welcome[row.state] = (welcome[row.state] ?? 0) + Number(row.n);
      if (row.state === 'blocked' && row.reason) blockedReasons[row.reason] = (blockedReasons[row.reason] ?? 0) + Number(row.n);
    }
    const referrals = await referralTotals(db);
    return c.json({
      accounts,
      grants,
      invites,
      devices,
      privacy,
      markup,
      welcome: { ...welcome, blocked_reasons: blockedReasons },
      referrals,
      billing: { provider: billingProvider(bindings), default_threshold_micro: 5_000_000, starter_micro: starterMicro(bindings), topup_amounts_usd: TOPUP_AMOUNTS_USD },
      admins: { ids: list(bindings.ADMIN_USER_IDS).length, emails: list(bindings.ADMIN_EMAILS).length, you_via: gate.via },
      max_grant_micro: maxGrantMicro(bindings),
    });
  });

  app.post('/admin/grant', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    const parsed = grantSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Send {email or user_id, amount_usd, note}', issues: parsed.error.issues.slice(0, 5) }, 400);
    const amountMicro = usdToMicro(parsed.data.amount_usd);
    if (amountMicro > maxGrantMicro(gate.bindings)) return c.json({ error: `One grant is at most $${maxGrantMicro(gate.bindings) / MICRO}` }, 400);
    const target = await resolveUser(gate.bindings, parsed.data);
    if (!target.ok) return c.json({ error: target.error }, target.status);
    const grant = await applyCredit(gate.db, { clerkUserId: target.userId, amountMicro, source: 'admin', grantedBy: gate.userId, note: parsed.data.note }, options.now());
    await applyStarter(gate.db, accountIdFor(target.userId), starterMicro(gate.bindings), options.now());
    const account = await accountView(gate.db, target.userId);
    return c.json({ grant, account, email: target.email });
  });

  app.get('/admin/grants', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? '50') || 50));
    const { results } = await gate.db.prepare('SELECT * FROM credit_grants ORDER BY created_at DESC LIMIT ?1').bind(limit).all<GrantRow>();
    return c.json({ grants: results });
  });

  app.post('/admin/invites', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Send {amount_usd, uses, note?, expires_days?, code?}', issues: parsed.error.issues.slice(0, 5) }, 400);
    const amountMicro = usdToMicro(parsed.data.amount_usd);
    if (amountMicro > maxGrantMicro(gate.bindings)) return c.json({ error: `One code is worth at most $${maxGrantMicro(gate.bindings) / MICRO}` }, 400);
    const now = options.now();
    const code = parsed.data.code ? normalizeCode(parsed.data.code) : newInviteCode();
    const expires = parsed.data.expires_days ? now + parsed.data.expires_days * 24 * 60 * 60 * 1000 : null;
    const inserted = await gate.db
      .prepare('INSERT OR IGNORE INTO invite_codes (code, amount_micro, max_uses, uses, created_by, note, expires_at, disabled, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, 0, ?7, ?7)')
      .bind(code, amountMicro, parsed.data.uses, gate.userId, parsed.data.note, expires, now)
      .run();
    if ((inserted.meta?.changes ?? 1) === 0) return c.json({ error: `Code ${code} already exists` }, 409);
    return c.json({ invite: { code, amount_micro: amountMicro, max_uses: parsed.data.uses, uses: 0, created_by: gate.userId, note: parsed.data.note, expires_at: expires, disabled: 0, created_at: now } });
  });

  app.get('/admin/invites', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    const { results } = await gate.db.prepare('SELECT * FROM invite_codes ORDER BY created_at DESC LIMIT 200').all<Json>();
    return c.json({ invites: results });
  });

  app.post('/admin/invites/disable', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    const body = (await c.req.json().catch(() => ({}))) as { code?: string };
    if (!body.code) return c.json({ error: 'Send {code}' }, 400);
    const result = await gate.db.prepare('UPDATE invite_codes SET disabled = 1, updated_at = ?1 WHERE code = ?2').bind(options.now(), normalizeCode(body.code)).run();
    return c.json({ disabled: (result.meta?.changes ?? 0) > 0 });
  });

  app.post('/admin/account', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    const parsed = accountSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Send {email or user_id, billing_threshold_usd?, billing_state?}', issues: parsed.error.issues.slice(0, 5) }, 400);
    const target = await resolveUser(gate.bindings, parsed.data);
    if (!target.ok) return c.json({ error: target.error }, target.status);
    const now = options.now();
    await ensureAccount(gate.db, target.userId, now);
    const id = accountIdFor(target.userId);
    // Starter kit first (C-089), so a threshold set here is not lifted again by it.
    await applyStarter(gate.db, id, starterMicro(gate.bindings), now);
    if (parsed.data.billing_threshold_usd !== undefined) {
      await gate.db.prepare('UPDATE accounts SET billing_threshold_micro = ?1, updated_at = ?2 WHERE id = ?3').bind(usdToMicro(parsed.data.billing_threshold_usd), now, id).run();
    }
    if (parsed.data.billing_state !== undefined) {
      await gate.db.prepare('UPDATE accounts SET billing_state = ?1, updated_at = ?2 WHERE id = ?3').bind(parsed.data.billing_state, now, id).run();
    }
    return c.json({ account: await accountView(gate.db, target.userId), email: target.email });
  });

  // Numbers only (C-091): counts, money, bytes and the privacy flag. Never stage content or prompts.
  app.get('/admin/accounts', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    const { results } = await gate.db
      .prepare(
        `SELECT a.id, a.clerk_user_id, a.grant_micro, a.spent_micro, a.cost_micro, a.billing_threshold_micro, a.billing_state, a.paid_micro, a.share_data, a.stored_bytes, a.created_at, a.updated_at,
                (SELECT COUNT(*) FROM boxes b WHERE b.account_id = a.id AND b.deleted_at IS NULL) AS stages,
                (SELECT COUNT(*) FROM ledger_entries l WHERE l.account_id = a.id) AS ledger_entries
         FROM accounts a ORDER BY a.updated_at DESC LIMIT 100`,
      )
      .all<Json>();
    return c.json({ accounts: results });
  });

  // Credit lines are ours (grants, codes, top-ups) and always shown. Anything else is shown line by line only for
  // accounts that share their data or granted access (scope ledger); every other account is one aggregate row.
  app.get('/admin/ledger', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? '50') || 50));
    const now = options.now();
    const { results } = await gate.db
      .prepare('SELECT account_id, id, box_id, kind, what, model, cost_micro, price_micro, ref, created_at FROM ledger_entries ORDER BY created_at DESC LIMIT ?1')
      .bind(limit)
      .all<{ account_id: string; id: string; kind: string; cost_micro: number; price_micro: number; created_at: number } & Json>();
    const visible = new Map<string, boolean>();
    const entries: Json[] = [];
    const privateTotals = new Map<string, { account_id: string; entries: number; cost_micro: number; price_micro: number; last_at: number }>();
    for (const entry of results) {
      let open = entry.kind === 'credit' && String(entry.id).startsWith('srv_');
      if (!open) {
        if (!visible.has(entry.account_id)) visible.set(entry.account_id, (await canSeeContent(gate.db, entry.account_id, gate.userId, 'ledger', now)).ok);
        open = visible.get(entry.account_id) === true;
      }
      if (open) {
        entries.push(entry);
        continue;
      }
      const total = privateTotals.get(entry.account_id) ?? { account_id: entry.account_id, entries: 0, cost_micro: 0, price_micro: 0, last_at: 0 };
      total.entries += 1;
      total.cost_micro += Number(entry.cost_micro);
      total.price_micro += Number(entry.price_micro);
      total.last_at = Math.max(total.last_at, Number(entry.created_at));
      privateTotals.set(entry.account_id, total);
    }
    return c.json({ entries, private_totals: [...privateTotals.values()], note: 'Accounts that have not shared their data appear as totals only.' });
  });

  // An account's stage content: only when the person shares their data or granted access (C-091).
  app.get('/admin/account-content', async (c) => {
    const gate = await requireAdmin(c);
    if (!gate.ok) return gate.response;
    const userId = c.req.query('user_id') ?? '';
    if (!/^user_[A-Za-z0-9]+$/.test(userId)) return c.json({ error: 'Send ?user_id=user_...' }, 400);
    const accountId = accountIdFor(userId);
    const access = await canSeeContent(gate.db, accountId, gate.userId, 'stages', options.now());
    if (!access.ok) {
      const counts = await gate.db.prepare('SELECT COUNT(*) AS stages FROM boxes WHERE account_id = ?1 AND deleted_at IS NULL').bind(accountId).first<Json>();
      return c.json({ error: 'This account has not shared its data or granted you access. Only totals are available.', code: 'private', counts }, 403);
    }
    const { results } = await gate.db.prepare('SELECT id, name, state_json, updated_at FROM boxes WHERE account_id = ?1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 100').bind(accountId).all<Json>();
    return c.json({ access: access.why, stages: results });
  });

  // ----- signed-in, not admin -----

  app.post('/credits/redeem', async (c) => {
    const auth = await who(c);
    if (auth.state !== 'signed-in') return c.json({ error: 'Sign in to use an invite code.', code: 'sign_in_required' }, 401);
    const resources = options.resources(c.env);
    const db = resources.DB;
    if (!db) return c.json({ error: 'Credits need the D1 binding' }, 503);
    if (resources.RL_IP) {
      const ip = c.req.header('CF-Connecting-IP') ?? '0.0.0.0';
      if (!(await resources.RL_IP.limit({ key: `redeem:${ip}` })).success) return c.json({ error: 'Too many tries. Wait a minute.', code: 'rate_limited' }, 429);
    }
    const body = (await c.req.json().catch(() => ({}))) as { code?: unknown };
    if (typeof body.code !== 'string' || body.code.trim().length < 6 || body.code.length > 40) return c.json({ error: 'Send {code}', code: 'invite_unknown' }, 400);
    // C-106: settle this person's welcome credit first (their own request carries their device and network).
    await accountForRequest(c, options as never, db, auth.userId);
    const result = await redeemInvite(db, body.code, auth.userId, options.now());
    if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);
    return c.json({ ok: true, amount_micro: result.grant.amount_micro, account: await accountView(db, auth.userId) });
  });

  app.post('/billing/checkout', async (c) => {
    const auth = await who(c);
    if (auth.state !== 'signed-in') return c.json({ error: 'Sign in to add a payment method.', code: 'sign_in_required' }, 401);
    const bindings = options.bindings(c.env);
    // Clerk Billing (C-093): checkout happens in Clerk's own components (the Billing tab of the profile); the app opens it.
    if (billingProvider(bindings) === 'clerk') return c.json({ provider: 'clerk', open: 'user-profile-billing' });
    if (billingProvider(bindings) !== 'stripe' || !bindings.STRIPE_SECRET_KEY) {
      return c.json({ error: 'Top up / add payment is not wired yet. Your key still works.', code: 'not_wired' }, 501);
    }
    const body = (await c.req.json().catch(() => ({}))) as { amount_usd?: number };
    const amount = TOPUP_AMOUNTS_USD.find((value) => value === body.amount_usd) ?? 10;
    const site = (bindings.SITE_URL ?? 'https://freshterminal.ai').replace(/\/$/, '');
    const form = new URLSearchParams({
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(amount * 100),
      'line_items[0][price_data][product_data][name]': `Fresh Terminal usage credit ($${amount})`,
      client_reference_id: auth.userId,
      'metadata[clerk_user_id]': auth.userId,
      'payment_intent_data[metadata][clerk_user_id]': auth.userId,
      'metadata[amount_usd]': String(amount),
      customer_creation: 'always',
      // Saves the card so pass-through billing can charge usage later (not wired yet: auto top-up).
      'payment_intent_data[setup_future_usage]': 'off_session',
      success_url: `${site}/?billing=done`,
      cancel_url: `${site}/?billing=cancelled`,
    });
    const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bindings.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const session = (await response.json().catch(() => ({}))) as { url?: string; id?: string; error?: { message?: string } };
    if (!response.ok || !session.url) return c.json({ error: session.error?.message ?? 'Stripe did not create a checkout session', code: 'provider_error' }, 502);
    return c.json({ url: session.url, id: session.id });
  });

  // Clerk Billing refill plans (C-093). A paid charge (checkout or monthly renewal) on a plan whose slug starts with
  // CLERK_CREDIT_PLAN_PREFIX ("credit") credits its amount to the payer's ledger, once per payment attempt.
  // Signature: Svix, checked by @clerk/backend's verifyWebhook. Not tested against live Clerk Billing yet.
  app.post('/billing/clerk/webhook', async (c) => {
    const bindings = options.bindings(c.env);
    const db = options.resources(c.env).DB;
    if (!bindings.CLERK_WEBHOOK_SIGNING_SECRET || !db) return c.json({ error: 'not wired yet', code: 'not_wired' }, 501);
    let event: { type?: string; data?: ClerkPaymentAttempt };
    try {
      event = (await verifyWebhook(c.req.raw, { signingSecret: bindings.CLERK_WEBHOOK_SIGNING_SECRET })) as unknown as { type?: string; data?: ClerkPaymentAttempt };
    } catch {
      return c.json({ error: 'bad signature' }, 400);
    }
    // C-107: a refunded Clerk payment reverses the payer's referral (event shape not tested against live Clerk yet).
    if (event.type === 'paymentAttempt.updated' && event.data?.status === 'refunded' && event.data.payer?.user_id) {
      const reversed = await reverseReferral(db, accountIdFor(event.data.payer.user_id), options.now(), 'friend payment refunded (Clerk)');
      return c.json({ received: true, credited: false, referral_reversed: reversed });
    }
    const credit = clerkCreditFor(event, bindings.CLERK_CREDIT_PLAN_PREFIX ?? 'credit');
    if (!credit) return c.json({ received: true, credited: false });
    const seen = await db.prepare('SELECT id FROM credit_grants WHERE ref = ?1').bind(credit.ref).first();
    if (seen) return c.json({ received: true, credited: false, duplicate: true });
    await applyCredit(db, { clerkUserId: credit.userId, amountMicro: credit.amountMicro, source: 'topup', grantedBy: 'clerk-billing', note: `Clerk Billing ${credit.plan} (${credit.chargeType})`, ref: credit.ref }, options.now());
    // C-107: buying credits qualifies a referred friend, so their referrer gets the $5 reward.
    await settleReferral(db, accountIdFor(credit.userId), options.now());
    return c.json({ received: true, credited: true });
  });

  app.post('/billing/stripe/webhook', async (c) => {
    const bindings = options.bindings(c.env);
    const db = options.resources(c.env).DB;
    if (!bindings.STRIPE_WEBHOOK_SECRET || !db) return c.json({ error: 'not wired yet', code: 'not_wired' }, 501);
    const raw = await c.req.text();
    if (!(await verifyStripeSignature(raw, c.req.header('Stripe-Signature'), bindings.STRIPE_WEBHOOK_SECRET, options.now()))) {
      return c.json({ error: 'bad signature' }, 400);
    }
    const event = JSON.parse(raw) as { type?: string; data?: { object?: { id?: string; payment_status?: string; amount_total?: number; client_reference_id?: string; metadata?: Record<string, string> } } };
    const session = event.data?.object;
    // C-107: a refunded charge reverses the payer's referral (the charge carries clerk_user_id from payment_intent_data).
    if (event.type === 'charge.refunded' && session?.metadata?.clerk_user_id) {
      const reversed = await reverseReferral(db, accountIdFor(session.metadata.clerk_user_id), options.now(), 'friend payment refunded (Stripe)');
      return c.json({ received: true, credited: false, referral_reversed: reversed });
    }
    if (event.type !== 'checkout.session.completed' || session?.payment_status !== 'paid') return c.json({ received: true, credited: false });
    const userId = session.metadata?.clerk_user_id ?? session.client_reference_id;
    const cents = Number(session.amount_total ?? 0);
    if (!userId || !session.id || !(cents > 0)) return c.json({ received: true, credited: false });
    const seen = await db.prepare('SELECT id FROM credit_grants WHERE ref = ?1').bind(session.id).first();
    if (seen) return c.json({ received: true, credited: false, duplicate: true });
    await applyCredit(db, { clerkUserId: userId, amountMicro: cents * 10_000, source: 'topup', grantedBy: 'stripe', note: 'Stripe Checkout top-up', ref: session.id }, options.now());
    await settleReferral(db, accountIdFor(userId), options.now());
    return c.json({ received: true, credited: true });
  });
}

export interface ClerkPaymentAttempt {
  id?: string;
  payment_id?: string;
  status?: string;
  charge_type?: string;
  payer?: { user_id?: string };
  totals?: { grand_total?: { amount?: number; currency?: string } };
  subscription_items?: Array<{ plan?: { slug?: string } }>;
}

/** A paid Clerk Billing charge on a credit plan → what to credit, or null. Amounts are cents (USD only in Clerk Billing). */
export function clerkCreditFor(event: { type?: string; data?: ClerkPaymentAttempt }, prefix: string): { userId: string; amountMicro: number; ref: string; plan: string; chargeType: string } | null {
  const data = event.data;
  if (event.type !== 'paymentAttempt.updated' || !data || data.status !== 'paid') return null;
  const userId = data.payer?.user_id;
  const cents = Number(data.totals?.grand_total?.amount ?? 0);
  const currency = (data.totals?.grand_total?.currency ?? 'USD').toUpperCase();
  const plan = (data.subscription_items ?? []).map((item) => item.plan?.slug ?? '').find((slug) => slug.startsWith(prefix));
  const ref = data.id ?? data.payment_id;
  if (!userId || !plan || !ref || !(cents > 0) || currency !== 'USD') return null;
  return { userId, amountMicro: cents * 10_000, ref: `clerk:${ref}`, plan, chargeType: data.charge_type ?? 'checkout' };
}

export async function accountView(db: D1Database, clerkUserId: string): Promise<Json | null> {
  const row = await db
    .prepare('SELECT id, clerk_user_id, grant_micro, spent_micro, billing_threshold_micro, billing_state, paid_micro FROM accounts WHERE clerk_user_id = ?1')
    .bind(clerkUserId)
    .first<{ id: string; clerk_user_id: string; grant_micro: number; spent_micro: number; billing_threshold_micro: number; billing_state: string; paid_micro: number }>();
  if (!row) return null;
  const limit = creditLimitMicro({ grant_micro: Number(row.grant_micro), billing_threshold_micro: Number(row.billing_threshold_micro) });
  return { ...row, credit_limit_micro: limit, remaining_micro: Math.max(0, limit - Number(row.spent_micro)) };
}
