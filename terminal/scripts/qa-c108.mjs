// Demo check (C-108). Local: pnpm build:app, then node scripts/qa-c108.mjs (from terminal/).
// Live: node scripts/qa-c108.mjs --base https://imagine-os.github.io/fresh-terminal --out <dir>
// Opens /demo/harness and screenshots the graph (default, all labels, by kind, heavy links), table, board and
// timeline at 1280, the graph at 390 and 3840, and /demo/nope. Prints node and link counts and overflow.
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
const PORT = 4181;
const live = args.includes('--base');
const BASE = arg('--base', `http://localhost:${PORT}`);
const OUT = resolve(arg('--out', 'docs/qa'));
const PREFIX = arg('--prefix', 'c108');
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

try {
  if (!live) await up();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const report = { base: BASE, errors, overflow: {} };
  const started = Date.now();
  await page.goto(`${BASE}/demo/harness`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="tags-graph"]');
  report.firstPaintMs = Date.now() - started;
  await page.waitForTimeout(500);
  const counts = async () => ({ nodes: await page.locator('[data-testid="tag-node"]').count(), links: await page.locator('.tag-link').count(), labels: await page.locator('.tag-node-label').count() });
  report.graphDefault = await counts();
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-demo-graph-1280.png`) });
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-demo-graph-1280-full.png`), fullPage: true });
  await page.selectOption('[data-testid="tags-graph-labels"]', 'all');
  await page.waitForTimeout(400);
  report.graphAllLabels = await counts();
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-demo-graph-labels-1280.png`) });
  await page.selectOption('[data-testid="tags-graph-labels"]', 'top');
  await page.selectOption('[data-testid="tags-graph-layout"]', 'kind');
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-demo-graph-bykind-1280.png`) });
  await page.selectOption('[data-testid="tags-graph-layout"]', 'links');
  await page.selectOption('[data-testid="tags-graph-links"]', '3');
  await page.waitForTimeout(400);
  report.graphHeavy = await counts();
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-demo-graph-heavy-1280.png`) });
  await page.selectOption('[data-testid="tags-graph-links"]', '1');
  // Hover the busiest node, then pick a stage.
  const busiest = page.locator('[data-testid="tag-node"]').first();
  await busiest.hover();
  await page.waitForTimeout(250);
  report.dimmedOnHover = await page.locator('.tag-node[data-dim="true"]').count();
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-demo-graph-hover-1280.png`) });
  await page.mouse.move(5, 5);
  const stageSelect = page.locator('[data-testid="tags-stage"]');
  const options = await stageSelect.locator('option').allTextContents();
  report.stages = options;
  await stageSelect.selectOption({ label: 'Family' });
  await page.waitForTimeout(400);
  report.familyNodes = await page.locator('[data-testid="tag-node"]').count();
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-demo-graph-family-1280.png`) });
  await stageSelect.selectOption('all');
  for (const view of ['table', 'board', 'timeline']) {
    await page.click(`[data-testid="tags-view-${view}"]`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, `${PREFIX}-demo-${view}-1280.png`) });
    report.overflow[`${view}-1280`] = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  }
  await page.click('[data-testid="tags-view-graph"]');
  for (const width of [390, 3840]) {
    await page.setViewportSize({ width, height: width <= 400 ? 844 : 2160 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, `${PREFIX}-demo-graph-${width}.png`) });
    report.overflow[`graph-${width}`] = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/demo/nope`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="demo-view"]');
  report.unknownDemoText = (await page.locator('.actions-empty').textContent())?.trim();
  await page.screenshot({ path: resolve(OUT, `${PREFIX}-demo-unknown-1280.png`) });
  writeFileSync(resolve(OUT, `${PREFIX}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
} finally {
  preview?.kill();
}
