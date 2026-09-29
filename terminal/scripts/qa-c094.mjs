// Actions check (C-094). Local: pnpm build:app, then node scripts/qa-c094.mjs (from terminal/).
// Live: node scripts/qa-c094.mjs --base https://imagine-os.github.io/fresh-terminal --out <dir>
// A fresh browser types three real prompts (make a page, switch the theme, undo), opens /actions
// and screenshots every view at 390, 1280 and 3840. Prints rows, statuses, costs, arrows and the ledger.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const PORT = Number(process.env.QA_PORT ?? 43000 + Math.floor(Math.random() * 1000));
const live = arg('--base', null);
const BASE = (live ?? `http://localhost:${PORT}`).replace(/\/$/, '');
const OUT = resolve(arg('--out', 'docs/qa'));
const PREFIX = arg('--prefix', 'c094');
mkdirSync(OUT, { recursive: true });

const preview = live ? null : spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
async function up() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/`)).ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('preview not up');
}

const PROMPTS = ['make a page called Notes', 'switch to Glass Window', 'undo'];
const WIDTHS = [390, 1280, 3840];
const VIEWS = ['list', 'table', 'board', 'timeline'];
const height = (width) => (width <= 400 ? 844 : Math.round(width * 0.5625));

try {
  if (!live) await up();
  const launch = { args: process.env.QA_PROXY ? [`--proxy-server=${process.env.QA_PROXY}`] : [] };
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: 'dark', ignoreHTTPSErrors: false });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="composer"] textarea', { state: 'attached' });
  await page.waitForTimeout(500);
  for (const prompt of PROMPTS) {
    const input = page.locator('[data-testid="composer"] textarea').first();
    await input.click();
    await input.pressSequentially(prompt, { delay: 25 });
    await page.waitForTimeout(900);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-stage-after-prompts-1280.png`) });
  await page.goto(`${BASE}/actions`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="actions-view"]');
  await page.waitForTimeout(400);

  const report = { base: BASE, prompts: PROMPTS, errors, views: {}, overflow: {}, smallTargets: {} };
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: height(width) });
    for (const view of VIEWS) {
      await page.click(`[data-testid="actions-view-${view}"]`);
      await page.waitForTimeout(350);
      const shot = `${PREFIX}-actions-${view}-${width}.png`;
      await page.screenshot({ path: resolve(OUT, shot), fullPage: false });
      report.overflow[`${view}-${width}`] = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      report.smallTargets[`${view}-${width}`] = await page.evaluate(() => {
        const out = [];
        for (const element of document.querySelectorAll('.actions button, .actions input, .actions select, .actions [role="separator"]')) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && (rect.width + 0.5 < 44 || rect.height + 0.5 < 44)) out.push(`${element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 20)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
        }
        return out;
      });
      if (width === 1280) {
        report.views[view] = await page.evaluate(() => ({
          rows: document.querySelectorAll('.act-row, .act-table tbody tr, .act-card, .act-tl-row').length,
          arrows: document.querySelectorAll('[data-arrow]').length,
          text: (document.querySelector('.act-table, .act-board, .act-list, .act-timeline')?.innerText ?? '').slice(0, 1600),
        }));
      }
    }
  }
  // Keyboard: the label column resizes with the arrow keys and is remembered after a reload.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.click('[data-testid="actions-view-timeline"]');
  const before = await page.getAttribute('[data-testid="actions-resize"]', 'aria-valuenow');
  await page.focus('[data-testid="actions-resize"]');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('[data-testid="actions-view-timeline"]');
  report.labelWidth = { before, afterTwoArrowsAndReload: await page.getAttribute('[data-testid="actions-resize"]', 'aria-valuenow') };
  // The ledger as the browser holds it: what the three prompts cost.
  report.ledger = await page.evaluate(() => {
    try {
      const store = JSON.parse(localStorage.getItem('fresh-terminal.store.v0') ?? '{}');
      return (store.entries ?? []).map((entry) => ({ kind: entry.kind, what: entry.what, model: entry.model, cost_micro: entry.cost_micro, price_micro: entry.price_micro, box: entry.box_id ? 'stage' : '(none)' }));
    } catch (error) {
      return String(error);
    }
  });
  report.errors = errors;
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
} finally {
  preview?.kill();
}
