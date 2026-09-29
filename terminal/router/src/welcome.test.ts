import { beforeEach, describe, expect, it } from 'vitest';
import { isDisposableEmail, normalizeEmail } from '../../shared/src/credits/disposable';
import { clearAdminCache } from './admin';
import { signupHarness } from './testing/signup';
import { WELCOME_DISPOSABLE_MESSAGE, WELCOME_NETWORK_MESSAGE, WELCOME_PENDING_MESSAGE, WELCOME_USED_MESSAGE } from './welcome';

// C-106 (Justin, 2026-09-29): "if they want $5 free they have to sign in for the 1st time. its only for first time signups".
beforeEach(() => clearAdminCache());

describe('email normalising', () => {
  it('drops +tags everywhere, dots for Gmail, and reads googlemail as gmail', () => {
    expect(normalizeEmail('J.Ane+promo@Gmail.com')).toBe('jane@gmail.com');
    expect(normalizeEmail('jane@googlemail.com')).toBe('jane@gmail.com');
    expect(normalizeEmail('john.smith+x@company.com')).toBe('john.smith@company.com');
    expect(isDisposableEmail('x@mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@eu.mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@gmail.com')).toBe(false);
  });
});

describe('the $5 welcome credit, once per person', () => {
  it('goes to a first-time sign-up with a verified email, and not to an alias of it', async () => {
    const h = signupHarness();
    const first = await h.signUp('user_jane', 'jane@gmail.com', { device: 'fd1_a' });
    expect(first.body).toMatchObject({ granted_micro: 5_000_000, remaining_micro: 5_000_000, welcome: { state: 'granted', message: null } });
    const alias = await h.signUp('user_jane2', 'J.a.n.e+again@gmail.com', { device: 'fd1_b', ip: '203.0.113.50' });
    expect(alias.body).toMatchObject({ granted_micro: 0, welcome: { state: 'blocked', message: WELCOME_USED_MESSAGE } });
    // The reason is kept internally, never shown.
    const row = await h.db.prepare("SELECT starter_state, starter_reason FROM accounts WHERE id = 'acct_user_jane2'").first<{ starter_state: string; starter_reason: string }>();
    expect(row).toEqual({ starter_state: 'blocked', starter_reason: 'email alias of an earlier sign-up' });
    expect(JSON.stringify(alias.body)).not.toContain('alias');
    // A blocked sign-up still has an account, and a paid call says why honestly.
    const out = await h.call('/route', { user: 'user_jane2', body: { boxId: 'b', text: 'hi', chips: [] } });
    expect(out.status).toBe(402);
    expect(out.body.error).toContain(WELCOME_USED_MESSAGE);
    expect(out.body.error).toContain('your key still works');
    // Asking again does not change the decision.
    expect((await h.call('/credits', { user: 'user_jane2' })).body.granted_micro).toBe(0);
  });

  it('is blocked for a device that already got it, for disposable domains, and past 5 a day from one network', async () => {
    const h = signupHarness();
    await h.signUp('user_a', 'a@example.com', { device: 'fd1_same' });
    const again = await h.signUp('user_b', 'b@example.com', { device: 'fd1_same', ip: '203.0.113.60' });
    expect(again.body.welcome).toEqual({ state: 'blocked', message: WELCOME_USED_MESSAGE });
    const throwaway = await h.signUp('user_c', 'c@yopmail.com', { device: 'fd1_c', ip: '203.0.113.61' });
    expect(throwaway.body.welcome).toEqual({ state: 'blocked', message: WELCOME_DISPOSABLE_MESSAGE });
    // Five from one /24 in a day; the sixth is refused, and the next day another one is fine.
    const net = signupHarness();
    for (let i = 0; i < 5; i += 1) expect((await net.signUp(`user_n${i}`, `n${i}@example.com`, { device: `fd1_n${i}`, ip: `192.0.2.${10 + i}` })).body.welcome.state).toBe('granted');
    const sixth = await net.signUp('user_n5', 'n5@example.com', { device: 'fd1_n5', ip: '192.0.2.99' });
    expect(sixth.body.welcome).toEqual({ state: 'blocked', message: WELCOME_NETWORK_MESSAGE });
    expect((await net.signUp('user_other_net', 'o@example.com', { device: 'fd1_o', ip: '192.0.3.1' })).body.welcome.state).toBe('granted');
    net.advance(24 * 60 * 60 * 1000);
    expect((await net.signUp('user_n6', 'n6@example.com', { device: 'fd1_n6', ip: '192.0.2.44' })).body.welcome.state).toBe('granted');
    expect(WELCOME_NETWORK_MESSAGE).toMatch(/network/);
  });

  it('waits for a verified email, and accounts from before the rule keep their credit', async () => {
    const h = signupHarness();
    const waiting = await h.signUp('user_w', 'w@example.com', { device: 'fd1_w', verified: false });
    expect(waiting.body).toMatchObject({ granted_micro: 0, welcome: { state: 'pending', message: WELCOME_PENDING_MESSAGE } });
    h.verify('user_w');
    expect((await h.call('/credits', { user: 'user_w', device: 'fd1_w' })).body).toMatchObject({ granted_micro: 5_000_000, welcome: { state: 'granted' } });
    // A legacy account (made before C-106) is not re-decided and keeps its $5.
    await h.db.prepare("INSERT INTO accounts (id, clerk_user_id, plan, grant_micro, starter_micro, starter_state, created_at, updated_at) VALUES ('acct_user_old', 'user_old', 'free', 5000000, 5000000, 'legacy', 1, 1)").run();
    expect((await h.call('/credits', { user: 'user_old' })).body).toMatchObject({ granted_micro: 5_000_000, welcome: { state: 'legacy' } });
  });

  it('shows the hub counts by state and why, never who', async () => {
    const h = signupHarness();
    await h.signUp('user_x', 'x@example.com', { device: 'fd1_x' });
    await h.signUp('user_y', 'x+y@example.com', { device: 'fd1_y', ip: '203.0.113.70' });
    const overview = await h.call('/admin/overview', { user: 'user_admin' });
    expect(overview.body.welcome).toMatchObject({ granted: 1, blocked: 1, blocked_reasons: { 'email alias of an earlier sign-up': 1 } });
    expect(JSON.stringify(overview.body.welcome)).not.toContain('user_');
  });
});
