// pnpm build:app first, then: node scripts/qa-tight.mjs (from terminal/). Writes docs/qa/start-centered-1440.png, start-centered-390.png, start-after-first-line-1440.png.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4181; const BASE = `http://localhost:${PORT}`;
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
  await page.click('[data-testid="first-run-dismiss"]'); await page.waitForTimeout(300);
  console.log('inline composer:', await page.locator('#composer-inline [data-testid="composer"]').count(), 'bottom hidden:', await page.locator('.region-bottom[data-behaviour="hidden"]').count());
  await page.screenshot({ path: 'docs/qa/start-centered-1440.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/qa/start-centered-390.png' });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
  const input = page.locator('textarea').first();
  await input.click(); await input.fill('show today'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  console.log('after first line, bottom composer:', await page.locator('#composer-slot [data-testid="composer"]').count());
  await page.screenshot({ path: 'docs/qa/start-after-first-line-1440.png' });
  await page.click('[data-testid="tray-toggle"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/qa/tray-links-1440.png' });
  await browser.close();
} finally { preview.kill(); }
