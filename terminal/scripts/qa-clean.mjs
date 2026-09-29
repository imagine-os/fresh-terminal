// pnpm build:app first, then: node scripts/qa-clean.mjs (from terminal/). Writes docs/qa/clean-start-1440.png, clean-start-390.png, sidebar-settings-1440.png, tray-clean-1440.png.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4180; const BASE = `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
async function up() { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/`)).ok) return; } catch {} await new Promise((d) => setTimeout(d, 250)); } throw new Error('preview not up'); }
try {
  await up();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="composer"]');
  await page.click('[data-testid="first-run-dismiss"]');
  await page.waitForTimeout(300);
  console.log('sidebar visible:', await page.locator('.region-left[data-behaviour="hidden"]').count() === 0, 'starters:', await page.locator('.suggestion').count());
  await page.screenshot({ path: 'docs/qa/clean-start-1440.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/qa/clean-start-390.png' });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
  // Alt+P inside the composer opens replay
  await page.locator('textarea').first().click();
  await page.keyboard.press('Alt+p'); await page.waitForTimeout(400);
  console.log('alt+p replay:', await page.locator('[data-testid="scrubber"]').count(), 'url:', page.url());
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.click('[data-testid="boxes-toggle"]'); await page.waitForTimeout(300);
  await page.click('[data-testid="sidebar-settings"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/qa/sidebar-settings-1440.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('[data-testid="tray-toggle"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/qa/tray-clean-1440.png' });
  await browser.close();
} finally { preview.kill(); }
