import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { authenticate } from './auth';
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
  async function me(c: Context): Promise<{ ok: true; userId: string; db: D1Database } | { ok: false; response: Response }> {
    const auth = await authenticate(c.req.header('Authorization'), options.bindings(c.env), options.authorizedParties(c.env), options.verifier);
    if (auth.state !== 'signed-in') return { ok: false, response: c.json({ error: 'Sign in to change your privacy settings.', code: 'sign_in_required' }, 401) };
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
}
