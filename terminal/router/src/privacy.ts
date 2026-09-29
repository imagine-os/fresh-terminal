import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { MARKUP_MAX_BP, MARKUP_MIN_BP, MARKUP_PRESETS_BP, isMarkupBp } from '../../shared/src/credits/types';
import { authenticate } from './auth';
import { DEVICE_HEADER } from '../../shared/src/credits/types';
import { accountForRequest, accountMarkupBp, headlineMarginBp, verifyDevice } from './credits';
import { claimReferral, normalizeReferralCode, referralSummary } from './referrals';
import type { AdminOptions } from './admin';
import { accountIdFor, ensureAccount, type D1Database } from './d1';

/**
 * Privacy by default (2026-09-29, C-091). Justin: "they need to be able to have
 * that checked off by default and know their data is private from us unless chosen
 * to share. Unless we add them personally as a client, then we shouldnt have acess
 * to their data unless they grant it to us."
 *
 * - accounts.share_data is 0 by default. Only the person changes it (PUT /me/privacy).
 * - access_grants: the person grants a grantee (a Clerk user id, or "fresh-terminal"
 *   for the whole team) a scope (stages | ledger | all), optionally until a date,
 *   and can revoke it. This is the "add as a client" case.
 * - canSeeContent() is the only door to another account's content from the admin
 *   side. Without share_data or a live grant, admin endpoints return aggregate
 *   numbers only (counts, cost), never stage content, prompts or ledger lines.
 *
 * Honest limits (Canon C-091): the router still sees prompts in transit to call the
 * models (not in "your key" mode, which goes browser to OpenRouter), and whoever
 * holds the Cloudflare account can read D1 directly. This is a policy the code
 * keeps, not encryption.
 */
export type Scope = 'stages' | 'ledger' | 'all';
export const TEAM_GRANTEE = 'fresh-terminal';

export async function canSeeContent(db: D1Database, accountId: string, viewer: string, scope: Exclude<Scope, 'all'>, now: number): Promise<{ ok: boolean; why: 'shared' | 'grant' | 'private' }> {
  const row = await db.prepare('SELECT share_data FROM accounts WHERE id = ?1').bind(accountId).first<{ share_data: number }>();
  if (Number(row?.share_data ?? 0) === 1) return { ok: true, why: 'shared' };
  const grant = await db
    .prepare(
      `SELECT id FROM access_grants
       WHERE account_id = ?1 AND grantee IN (?2, ?3) AND scope IN (?4, 'all')
         AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?5)
       LIMIT 1`,
    )
    .bind(accountId, viewer, TEAM_GRANTEE, scope, now)
    .first();
  return grant ? { ok: true, why: 'grant' } : { ok: false, why: 'private' };
}

const grantSchema = z.object({
  grantee: z.string().trim().regex(/^(user_[A-Za-z0-9]+|fresh-terminal)$/),
  scope: z.enum(['stages', 'ledger', 'all']),
  expires_days: z.number().int().min(1).max(365).optional(),
});

export function mountPrivacyRoutes(app: Hono<any>, options: AdminOptions): void {
  async function me(c: Context, signIn = 'Sign in to change your privacy settings.'): Promise<{ ok: true; userId: string; db: D1Database } | { ok: false; response: Response }> {
    const auth = await authenticate(c.req.header('Authorization'), options.bindings(c.env), options.authorizedParties(c.env), options.verifier);
    if (auth.state !== 'signed-in') return { ok: false, response: c.json({ error: signIn, code: 'sign_in_required' }, 401) };
    const db = options.resources(c.env).DB;
    if (!db) return { ok: false, response: c.json({ error: 'No D1 database is bound to this router' }, 503) };
    await ensureAccount(db, auth.userId, options.now());
    return { ok: true, userId: auth.userId, db };
  }

  async function view(db: D1Database, accountId: string, now: number) {
    const row = await db.prepare('SELECT share_data FROM accounts WHERE id = ?1').bind(accountId).first<{ share_data: number }>();
    const { results } = await db
      .prepare('SELECT id, grantee, scope, granted_at, expires_at, revoked_at FROM access_grants WHERE account_id = ?1 ORDER BY granted_at DESC LIMIT 50')
      .bind(accountId)
      .all<{ id: string; grantee: string; scope: string; granted_at: number; expires_at: number | null; revoked_at: number | null }>();
    return {
      share_data: Number(row?.share_data ?? 0) === 1,
      label: 'Share my data with Fresh Terminal to improve it (off by default)',
      grants: results.map((grant) => ({ ...grant, active: grant.revoked_at === null && (grant.expires_at === null || Number(grant.expires_at) > now) })),
    };
  }

  app.get('/me/privacy', async (c) => {
    const who = await me(c);
    if (!who.ok) return who.response;
    return c.json(await view(who.db, accountIdFor(who.userId), options.now()));
  });

  app.put('/me/privacy', async (c) => {
    const who = await me(c);
    if (!who.ok) return who.response;
    const body = (await c.req.json().catch(() => ({}))) as { share_data?: unknown };
    if (typeof body.share_data !== 'boolean') return c.json({ error: 'Send {share_data: true|false}' }, 400);
    const now = options.now();
    await who.db.prepare('UPDATE accounts SET share_data = ?1, updated_at = ?2 WHERE id = ?3').bind(body.share_data ? 1 : 0, now, accountIdFor(who.userId)).run();
    return c.json(await view(who.db, accountIdFor(who.userId), now));
  });

  app.post('/me/access-grants', async (c) => {
    const who = await me(c);
    if (!who.ok) return who.response;
    const parsed = grantSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Send {grantee: user_... or "fresh-terminal", scope: stages|ledger|all, expires_days?}' }, 400);
    const now = options.now();
    const id = `ag_${crypto.randomUUID()}`;
    const expires = parsed.data.expires_days ? now + parsed.data.expires_days * 24 * 60 * 60 * 1000 : null;
    await who.db
      .prepare('INSERT INTO access_grants (id, account_id, grantee, scope, granted_at, expires_at, revoked_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?5)')
      .bind(id, accountIdFor(who.userId), parsed.data.grantee, parsed.data.scope, now, expires)
      .run();
    return c.json(await view(who.db, accountIdFor(who.userId), now));
  });

  app.post('/me/access-grants/revoke', async (c) => {
    const who = await me(c);
    if (!who.ok) return who.response;
    const body = (await c.req.json().catch(() => ({}))) as { id?: unknown };
    if (typeof body.id !== 'string') return c.json({ error: 'Send {id}' }, 400);
    const now = options.now();
    // Only your own grants: the account id is part of the condition.
    await who.db.prepare('UPDATE access_grants SET revoked_at = ?1, updated_at = ?1 WHERE id = ?2 AND account_id = ?3 AND revoked_at IS NULL').bind(now, body.id, accountIdFor(who.userId)).run();
    return c.json(await view(who.db, accountIdFor(who.userId), now));
  });

  // Pay what you want (C-105): the account's own markup on spend past the starter kit.
  async function markupView(db: D1Database, accountId: string) {
    const row = await db.prepare('SELECT markup_bp FROM accounts WHERE id = ?1').bind(accountId).first<{ markup_bp: number | null }>();
    const chosen = isMarkupBp(Number(row?.markup_bp)) ? Number(row?.markup_bp) : null;
    const fallback = headlineMarginBp();
    return {
      markup_bp: accountMarkupBp({ markup_bp: chosen }, fallback),
      default_bp: fallback,
      min_bp: MARKUP_MIN_BP,
      max_bp: MARKUP_MAX_BP,
      presets_bp: MARKUP_PRESETS_BP,
      chosen: chosen !== null,
      label: 'Model cost + your markup. 10% by default; set it higher to support us.',
    };
  }

  app.get('/me/markup', async (c) => {
    const who = await me(c, 'Sign in to set your markup.');
    if (!who.ok) return who.response;
    return c.json(await markupView(who.db, accountIdFor(who.userId)));
  });

  app.put('/me/markup', async (c) => {
    const who = await me(c, 'Sign in to set your markup.');
    if (!who.ok) return who.response;
    const body = (await c.req.json().catch(() => ({}))) as { markup_bp?: unknown };
    // null goes back to the default; anything else must be a whole number of basis points in range.
    if (body.markup_bp !== null && !isMarkupBp(body.markup_bp)) {
      return c.json({ error: `Send {markup_bp: a whole number from ${MARKUP_MIN_BP} (5%) to ${MARKUP_MAX_BP} (100%)}, or null for the default`, code: 'invalid_markup' }, 400);
    }
    await who.db.prepare('UPDATE accounts SET markup_bp = ?1, updated_at = ?2 WHERE id = ?3').bind(body.markup_bp, options.now(), accountIdFor(who.userId)).run();
    return c.json(await markupView(who.db, accountIdFor(who.userId)));
  });

  // Referrals (C-107): your link and what it earned; a friend claims a code after signing up.
  app.get('/me/referral', async (c) => {
    const who = await me(c, 'Sign in to see your referral link.');
    if (!who.ok) return who.response;
    const site = (options.bindings(c.env) as { SITE_URL?: string }).SITE_URL ?? 'https://freshterminal.ai';
    const row = await accountForRequest(c, options as never, who.db, who.userId);
    return c.json({ ...(await referralSummary(who.db, accountIdFor(who.userId), site, options.now())), welcome: row.welcome ?? null });
  });

  app.post('/me/referral', async (c) => {
    const who = await me(c, 'Sign in to use a referral code.');
    if (!who.ok) return who.response;
    const body = (await c.req.json().catch(() => ({}))) as { code?: unknown };
    if (typeof body.code !== 'string' || normalizeReferralCode(body.code).length < 6 || body.code.length > 40) return c.json({ error: 'Send {code}', code: 'referral_unknown' }, 400);
    // Settle the welcome credit first: the $5 extra is for first-time sign-ups only (C-106).
    await accountForRequest(c, options as never, who.db, who.userId);
    const bindings = options.bindings(c.env) as { DEVICE_SIGNING_KEY?: string };
    const deviceId = await verifyDevice(c.req.header(DEVICE_HEADER), bindings.DEVICE_SIGNING_KEY);
    const result = await claimReferral(who.db, { friendAccountId: accountIdFor(who.userId), code: body.code, deviceId, now: options.now() });
    if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);
    return c.json({ ok: true, bonus_micro: result.bonus_micro });
  });
}
