// pnpm build:app first, then: node scripts/qa-c086.mjs (from terminal/). Top bar, tray on hover, Actions views, phone.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4186; const BASE = `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
async function up() { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/`)).ok) return; } catch {} await new Promise((d) => setTimeout(d, 250)); } throw new Error('preview not up'); }
try {
  await up();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="composer"]'); await page.waitForTimeout(300);
  await page.hover('[data-testid="tray-toggle"]'); await page.waitForTimeout(400);
  console.log('tray open on hover:', await page.locator('[data-testid="tray"]').count(), 'rows:', await page.locator('.tray-tool.row').count());
  await page.screenshot({ path: 'docs/qa/c086-tray-1440.png' });
  await page.mouse.move(400, 400); await page.waitForTimeout(400);
  const input = page.locator('textarea').first();
  for (const line of ['make a page called Notes', 'show today', 'list my stages']) { await input.click(); await input.fill(line); await page.keyboard.press('Enter'); await page.waitForTimeout(600); if (line.startsWith('make')) { await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); } }
  await page.click('[data-testid="balance-used"]'); await page.waitForTimeout(200);
  console.log('balance after one click:', await page.locator('[data-testid="balance-used"]').innerText());
  await page.click('[data-testid="balance-used"]'); await page.click('[data-testid="balance-used"]');
  await page.goto(`${BASE}/actions`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  console.log('actions rows:', await page.locator('.act-row').count());
  await page.screenshot({ path: 'docs/qa/c086-actions-list-1440.png' });
  await page.click('[data-testid="actions-view-board"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: 'docs/qa/c086-actions-board-1440.png' });
  await page.click('[data-testid="actions-view-timeline"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: 'docs/qa/c086-actions-timeline-1440.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/qa/c086-start-390.png' });
  await browser.close();
} finally { preview.kill(); }
