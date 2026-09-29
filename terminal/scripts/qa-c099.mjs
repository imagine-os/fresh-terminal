// Tags page check (C-099). Local: pnpm build:app, then node scripts/qa-c099.mjs (from terminal/).
// Live: node scripts/qa-c099.mjs --base https://imagine-os.github.io/fresh-terminal --out <dir>
// A fresh browser types tag-rich prompts (people, dates, lists, brands, places, moods), opens /tags
// and screenshots every view at 390 and 1280. Prints tag count, graph nodes/links, overflow and small targets.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const PORT = 4179;
const live = args.includes('--base');
const BASE = arg('--base', `http://localhost:${PORT}`);
const OUT = resolve(arg('--out', 'docs/qa'));
const PREFIX = arg('--prefix', 'c099');
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

const PROMPTS = [
  "I'm Justin, call me tomorrow at 3pm about the Cloudflare invoice for $120",
  'shopping list: apples, pears and oat milk',
  'remind Justin on Friday at 9am to review the Cloudflare plan and the Stripe plan',
  'I am happy with the Cloudflare setup, see https://freshterminal.ai',
  'make a page called Notes with 3 sections',
  'add apples and pears to Notes tomorrow',
];
const WIDTHS = [390, 1280];
const VIEWS = ['graph', 'table', 'list', 'board', 'timeline'];
const height = (width) => (width <= 400 ? 844 : Math.round(width * 0.5625));

try {
  if (!live) await up();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="composer"] textarea', { state: 'attached' });
  await page.waitForTimeout(500);
  for (const prompt of PROMPTS) {
    const input = page.locator('[data-testid="composer"] textarea').first();
    await input.click();
    await input.pressSequentially(prompt, { delay: 15 });
    await page.waitForTimeout(1300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
  }
  await page.goto(`${BASE}/tags`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="tags-view"]');
  await page.waitForTimeout(400);

  const report = { base: BASE, prompts: PROMPTS, errors, overflow: {}, smallTargets: {}, graph: {} };
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: height(width) });
    for (const view of VIEWS) {
      await page.click(`[data-testid="tags-view-${view}"]`);
      await page.waitForTimeout(350);
      await page.screenshot({ path: resolve(OUT, `${PREFIX}-tags-${view}-${width}.png`), fullPage: false });
      report.overflow[`${view}-${width}`] = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      report.smallTargets[`${view}-${width}`] = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.tags button, .tags select, .tags input, .tags a'))
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40))
          .map(({ el, r }) => `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} ${Math.round(r.width)}×${Math.round(r.height)}`)
          .slice(0, 8),
      );
      if (view === 'graph') {
        report.graph[width] = await page.evaluate(() => ({ nodes: document.querySelectorAll('[data-testid="tag-node"]').length, links: document.querySelectorAll('.tag-link').length }));
      }
    }
  }
  // Graph interaction: hover dims the rest, click narrows the filter, the legend narrows by kind.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.click('[data-testid="tags-view-graph"]');
  await page.waitForTimeout(300);
  const firstNode = page.locator('[data-testid="tag-node"]').first();
  await firstNode.hover();
  await page.waitForTimeout(200);
  report.dimmedOnHover = await page.evaluate(() => document.querySelectorAll('.tag-node[data-dim="true"]').length);
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-tags-graph-hover-1280.png`) });
  await firstNode.click();
  await page.waitForTimeout(300);
  report.filterAfterClick = await page.inputValue('[data-testid="tags-filter"]');
  report.nodesAfterClick = await page.locator('[data-testid="tag-node"]').count();
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-tags-graph-picked-1280.png`) });
  await page.click('[data-testid="tags-graph-layout"]');
  await page.selectOption('[data-testid="tags-graph-layout"]', 'kind');
  await firstNode.click().catch(() => {});
  await page.fill('[data-testid="tags-filter"]', '');
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-tags-graph-bykind-1280.png`) });
  report.tagCount = await page.locator('.tags-table tbody tr, [data-testid="tag-node"]').count();
  writeFileSync(resolve(OUT, `${PREFIX}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
} finally {
  preview?.kill();
}
