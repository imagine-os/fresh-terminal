// pnpm build:app first, then: node scripts/qa-c091.mjs (from terminal/). Rename in place + the perspective grid.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4191; const BASE = `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
async function up() { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/`)).ok) return; } catch {} await new Promise((d) => setTimeout(d, 250)); } throw new Error('preview not up'); }
try {
  await up();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/qa/c091-grid-1440.png' });
  const input = page.locator('textarea').first(); await input.click(); await input.fill('show today'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  await page.keyboard.press('Alt+['); await page.waitForTimeout(300); await page.click('.box-link'); await page.waitForTimeout(400);
  await page.click('[data-testid="stage-name"]'); await page.waitForTimeout(150);
  await page.fill('[data-testid="stage-name-input"]', 'Travel notes'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  console.log('renamed to:', await page.locator('[data-testid="stage-name"]').innerText());
  await page.screenshot({ path: 'docs/qa/c091-rename-1440.png' });
  await browser.close();
} finally { preview.kill(); }
