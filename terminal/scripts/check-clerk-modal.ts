/**
 * pnpm check:clerk (C-099)
 * The Clerk windows in our look at seven widths: the sign-in modal (signed
 * out) and the account window (UserProfile, opened from the avatar, signed in).
 * Asserts: the card sits inside the viewport, square corners, no horizontal
 * page overflow, visible targets >= 44px, and on desktop (>= 1024px) the
 * account page is wide enough that no text is cut off. It exists because the
 * sign-in width once leaked onto the account window and squeezed its page to
 * ~200px (Justin's screenshot, 2026-09-29).
 *
 * Expects app/dist built with VITE_CLERK_PUBLISHABLE_KEY (skips cleanly if the
 * build has no Clerk). Signed in, one of:
 * - CLERK_QA_STATE=<Playwright storage state of a signed-in dev user>, or
 * - CLERK_SECRET_KEY=sk_test_... (development instance only): makes a
 *   throwaway user and organisation, signs in with a one-time ticket, and
 *   deletes both at the end. Prints ids only, never keys or tickets.
 * Without either, the account window is reported as skipped.
 * Router calls are blocked in the browser, so no D1 rows are written.
 * Screenshots go to CLERK_QA_OUT (default: <tmp>/fresh-terminal-clerk-qa).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';

const WIDTHS = [360, 390, 768, 1280, 1920, 2560, 3840];
const PORT = Number(process.env.CLERK_QA_PORT ?? 4174);
const BASE = `http://localhost:${PORT}`;
const MIN_TARGET = 44;
const OUT = resolve(process.env.CLERK_QA_OUT ?? resolve(tmpdir(), 'fresh-terminal-clerk-qa'));
const SECRET = process.env.CLERK_SECRET_KEY ?? '';
const BAPI = 'https://api.clerk.com/v1';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}

function heightFor(width: number): number {
  if (width <= 400) return 800;
  if (width <= 800) return 1024;
  return Math.round(width * 0.5625);
}

async function waitForServer(url: string, attempts = 60): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`preview server did not start at ${url}`);
}

async function bapi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BAPI}${path}`, {
    method,
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { errors?: { code?: string }[] };
  if (!response.ok) throw new Error(`Clerk ${method} ${path}: HTTP ${response.status} ${(json.errors ?? []).map((e) => e.code).join(',')}`);
  return json;
}

interface Throwaway {
  userId: string;
  orgId: string | null;
}

async function makeThrowaway(): Promise<Throwaway> {
  const run = `${Date.now()}`;
  let userId = '';
  for (const n of [11, 23, 37, 44, 58, 66, 79, 81, 94, 97]) {
    try {
      const user = await bapi<{ id: string }>('POST', '/users', {
        email_address: [`ft-clerkqa-${run}+clerk_test@example.com`],
        username: `ftclerkqa${run}`,
        first_name: 'Modal',
        last_name: 'Check',
        phone_number: [`+120155501${n}`],
        skip_password_requirement: true,
        skip_password_checks: true,
      });
      userId = user.id;
      break;
    } catch (error) {
      if (!String(error).includes('taken') && !String(error).includes('exists')) throw error;
    }
  }
  if (!userId) throw new Error('could not make a throwaway user');
  console.log(`throwaway user ${userId}`);
  // This instance asks every account to belong to an organisation before the session is active.
  let orgId: string | null = null;
  try {
    orgId = (await bapi<{ id: string }>('POST', '/organizations', { name: `ft clerk qa ${run}`, created_by: userId })).id;
    console.log(`throwaway organisation ${orgId}`);
  } catch (error) {
    console.log(`organisation: not made (${String(error).slice(0, 120)})`);
  }
  return { userId, orgId };
}

async function removeThrowaway(t: Throwaway): Promise<void> {
  if (t.orgId) {
    await bapi('DELETE', `/organizations/${t.orgId}`).then(
      () => console.log(`deleted organisation ${t.orgId}`),
      (error) => console.log(`organisation ${t.orgId}: ${String(error).slice(0, 120)}`),
    );
  }
  await bapi('DELETE', `/users/${t.userId}`).then(
    () => console.log(`deleted user ${t.userId}`),
    (error) => console.log(`user ${t.userId}: ${String(error).slice(0, 120)}`),
  );
}

/** Keep the check off our router: no /me, no /sync, so nothing lands in D1. */
async function blockRouter(context: BrowserContext): Promise<void> {
  await context.route(/(api\.freshterminal\.ai|workers\.dev)\//, (route) => route.abort());
  await context.route(`${BASE}/api/**`, (route) => route.abort());
}

interface Measure {
  card: { left: number; top: number; right: number; bottom: number; width: number; height: number; radius: string } | null;
  page: { width: number } | null;
  overflow: boolean;
  small: string[];
  clipped: string[];
}

async function measure(tab: Page): Promise<Measure> {
  // tsx keeps function names with a __name helper that the page does not have.
  await tab.evaluate('window.__name = (fn) => fn');
  return tab.evaluate((min) => {
    const box = document.querySelector('.cl-cardBox');
    const rect = box?.getBoundingClientRect();
    const pane = document.querySelector('.cl-cardBox .cl-pageScrollBox')?.getBoundingClientRect();
    const small: string[] = [];
    const clipped: string[] = [];
    const label = (element: Element) =>
      Array.from(element.classList).find((c) => c.startsWith('cl-') && !c.startsWith('cl-internal')) ?? element.tagName.toLowerCase();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('.cl-modalContent button, .cl-modalContent a[href], .cl-modalContent input, .cl-modalContent [role="button"]'))) {
      const r = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!r.width || !r.height || style.visibility === 'hidden' || element.getAttribute('type') === 'hidden') continue;
      // "Secured by Clerk" is Clerk's branding link, kept by decision (C-084), not one of our targets.
      if (element.matches('a[href*="clerk.com"], a[aria-label="Clerk logo"]')) continue;
      if (element.closest('iframe, .cl-captcha')) continue;
      if (r.width + 0.5 < min || r.height + 0.5 < min) small.push(`${label(element)} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('.cl-cardBox .cl-pageScrollBox *'))) {
      if (element.children.length || !element.textContent?.trim()) continue;
      const r = element.getBoundingClientRect();
      if (!r.width) continue;
      if (element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflow !== 'visible') {
        clipped.push(`${label(element)} "${element.textContent.trim().slice(0, 24)}"`);
      }
    }
    return {
      card: rect && box
        ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, radius: getComputedStyle(box).borderRadius }
        : null,
      page: pane ? { width: pane.width } : null,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      small,
      clipped,
    };
  }, MIN_TARGET);
}

function problems(m: Measure, width: number, height: number, kind: 'signin' | 'profile'): string[] {
  const out: string[] = [];
  if (!m.card) return ['no card'];
  if (m.card.left < -0.5 || m.card.right > width + 0.5) out.push(`card outside the viewport horizontally (${Math.round(m.card.left)}..${Math.round(m.card.right)} of ${width})`);
  if (kind === 'profile' && (m.card.top < -0.5 || m.card.bottom > height + 0.5)) out.push(`card outside the viewport vertically (${Math.round(m.card.top)}..${Math.round(m.card.bottom)} of ${height})`);
  if (m.card.radius !== '0px') out.push(`rounded card (${m.card.radius})`);
  if (m.overflow) out.push('page scrolls sideways');
  if (m.small.length) out.push(`small targets: ${m.small.join('; ')}`);
  if (kind === 'profile' && width >= 1024) {
    if (!m.page || m.page.width < 560) out.push(`account page too narrow (${Math.round(m.page?.width ?? 0)}px)`);
    if (m.clipped.length) out.push(`cut-off text: ${m.clipped.join('; ')}`);
  }
  return out;
}

async function signInWithTicket(browser: Browser, t: Throwaway): Promise<string> {
  const { token } = await bapi<{ token: string }>('POST', '/sign_in_tokens', { user_id: t.userId, expires_in_seconds: 600 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockRouter(context);
  const tab = await context.newPage();
  await tab.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await tab.waitForFunction(() => (window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded, null, { timeout: 30_000 });
  await tab.evaluate(
    async ({ ticket, orgId }) => {
      const clerk = (window as unknown as { Clerk: any }).Clerk;
      const attempt = await clerk.client.signIn.create({ strategy: 'ticket', ticket });
      await clerk.setActive({ session: attempt.createdSessionId, ...(orgId ? { organization: orgId } : {}) });
    },
    { ticket: token, orgId: t.orgId },
  );
  await tab.waitForSelector('[data-testid="account"]', { timeout: 30_000 });
  const path = resolve(OUT, 'signed-in-state.json');
  await context.storageState({ path });
  await context.close();
  return path;
}

async function main(): Promise<void> {
  if (!existsSync(resolve('app/dist/index.html'))) {
    console.error('check-clerk-modal: app/dist missing. Run `pnpm build:app` with VITE_CLERK_PUBLISHABLE_KEY first.');
    process.exit(1);
  }
  if (SECRET && !SECRET.startsWith('sk_test_')) {
    console.error('check-clerk-modal: CLERK_SECRET_KEY is not a development key; stopping.');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const { chromium } = await import('playwright');
  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  let failed = false;
  let throwaway: Throwaway | null = null;
  const report = (kind: string, width: number, issues: string[], note = '') => {
    if (issues.length) failed = true;
    console.log(`${issues.length ? 'FAIL' : 'ok  '} ${kind.padEnd(7)} ${String(width).padStart(4)}  ${issues.join(' | ') || note}`);
  };

  try {
    await waitForServer(`${BASE}/`);
    const browser = await chromium.launch();
    try {
      // Signed out: the sign-in modal.
      for (const width of WIDTHS) {
        const height = heightFor(width);
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        await blockRouter(context);
        const tab = await context.newPage();
        await tab.goto(`${BASE}/`, { waitUntil: 'networkidle' });
        const button = await tab.waitForSelector('[data-testid="sign-in"]', { timeout: 10_000 }).catch(() => null);
        if (!button) {
          console.log('skip    sign-in: this build has no Clerk key (VITE_CLERK_PUBLISHABLE_KEY)');
          await context.close();
          break;
        }
        await tab.waitForSelector('[data-testid="sign-in"]:not([disabled])', { timeout: 30_000 });
        await tab.click('[data-testid="sign-in"]');
        await tab.waitForSelector('.cl-cardBox .cl-formButtonPrimary', { timeout: 30_000 });
        await tab.waitForTimeout(500);
        const m = await measure(tab);
        await tab.screenshot({ path: resolve(OUT, `clerk-signin-${width}.png`) });
        report('sign-in', width, problems(m, width, height, 'signin'), `card ${Math.round(m.card?.width ?? 0)}px`);
        await context.close();
      }

      // Signed in: the account window from the avatar.
      let state = process.env.CLERK_QA_STATE ?? '';
      if (!state && SECRET) {
        throwaway = await makeThrowaway();
        state = await signInWithTicket(browser, throwaway);
      }
      if (!state) {
        console.log('skip    profile: set CLERK_QA_STATE or CLERK_SECRET_KEY (development) to check the account window');
      } else {
        for (const width of WIDTHS) {
          const height = heightFor(width);
          const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', storageState: state });
          await blockRouter(context);
          const tab = await context.newPage();
          await tab.goto(`${BASE}/`, { waitUntil: 'networkidle' });
          await tab.waitForSelector('[data-testid="account"]', { timeout: 30_000 });
          await tab.click('.cl-userButtonTrigger');
          await tab.click('.cl-userButtonPopoverActionButton__manageAccount');
          await tab.waitForSelector('.cl-profileSection__emailAddresses', { timeout: 30_000 });
          await tab.waitForTimeout(800);
          const m = await measure(tab);
          await tab.screenshot({ path: resolve(OUT, `clerk-profile-${width}.png`) });
          report('profile', width, problems(m, width, height, 'profile'), `card ${Math.round(m.card?.width ?? 0)}x${Math.round(m.card?.height ?? 0)}, page ${Math.round(m.page?.width ?? 0)}px`);
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    preview.kill('SIGTERM');
    if (throwaway) await removeThrowaway(throwaway);
  }
  console.log(`screenshots: ${OUT}`);
  console.log(failed ? 'Result: FAIL' : 'Result: PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(String(error).replaceAll(SECRET || '\u0000', '<secret>'));
  process.exit(1);
});
