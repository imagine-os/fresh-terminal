// pnpm build:app first, then: node scripts/qa-c096.mjs (from terminal/). The tighter tools menu.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4195; const BASE = `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
async function up() { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/`)).ok) return; } catch {} await new Promise((d) => setTimeout(d, 250)); } throw new Error('preview not up'); }
try {
  await up();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
  await page.hover('[data-testid="tray-toggle"]'); await page.waitForTimeout(400);
  const box = await page.locator('[data-testid="tray"]').boundingBox();
  console.log('tray size:', box && `${Math.round(box.width)}x${Math.round(box.height)}`, 'pairs:', await page.locator('.tray-tool.row[data-pair="true"]').count(), 'buy credits:', await page.locator('[data-testid="billing-topup"]').innerText());
  await page.screenshot({ path: 'docs/qa/c096-tray-1440.png', clip: { x: 1040, y: 0, width: 400, height: 620 } });
  await browser.close();
} finally { preview.kill(); }
