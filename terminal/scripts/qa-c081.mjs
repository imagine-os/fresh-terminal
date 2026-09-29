// pnpm build:app first, then: node scripts/qa-c081.mjs (from terminal/). Mood tags, one Undo bar, an opened page.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4183; const BASE = `http://localhost:${PORT}`;
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
  await page.waitForTimeout(300);
  const input = page.locator('textarea').first();
  for (const line of ['make a page called Notes', 'make a page called Theme Gallery', 'show today']) {
    await input.click(); await input.fill(line); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    if (line.startsWith('make')) { await page.keyboard.press('Escape'); await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300); }
  }
  console.log('edit blocks:', await page.locator('[data-testid="edits-block"]').count(), 'compact:', await page.locator('[data-testid="edits-block"][data-compact="true"]').count());
  await input.click(); await input.fill("you're doing a bad job, but the tags are great and not bad at all"); await page.waitForTimeout(500);
  console.log('moods:', await page.locator('.chip-tray [data-kind="mood"]').count());
  await page.screenshot({ path: 'docs/qa/c081-mood-undo-1440.png' });
  await browser.close();
} finally { preview.kill(); }
