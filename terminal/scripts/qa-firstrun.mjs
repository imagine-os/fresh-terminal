// pnpm build:app first, then: node scripts/qa-firstrun.mjs (from terminal/). Writes docs/qa/first-run-1440.png, hide-bar-1440.png, local-meta-1440.png.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4179; const BASE = `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
async function up() { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/`)).ok) return; } catch {} await new Promise((d) => setTimeout(d, 250)); } throw new Error('preview not up'); }
try {
  await up();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="first-run"]');
  await page.screenshot({ path: 'docs/qa/first-run-1440.png' });
  const input = page.locator('textarea').first();
  await input.click(); await input.fill('show today'); await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  console.log('meta headers:', await page.locator('[data-testid="reply-header"]').count());
  await page.screenshot({ path: 'docs/qa/local-meta-1440.png' });
  await page.locator('body').click({ position: { x: 700, y: 200 } });
  await page.keyboard.press('h');
  await page.waitForTimeout(400);
  console.log('show-bar chip:', await page.locator('[data-testid="show-bar"]').count(), 'topbar hidden:', await page.locator('.region-top[data-behaviour="hidden"]').count());
  await page.screenshot({ path: 'docs/qa/hide-bar-1440.png' });
  await browser.close();
} finally { preview.kill(); }
