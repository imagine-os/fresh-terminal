// pnpm build:app first, then: node scripts/qa-tray.mjs (from terminal/). Writes docs/qa/tray-*.png, draft-page-*.png, brands-estimate-1440.png.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4178; const BASE = `http://localhost:${PORT}`;
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
  const input = page.locator('textarea').first();
  await input.click();
  await input.fill('hid everything but the money counter behind a tools icon in the top bar. make sure i can drag tools back. by the way, i cant seem to move the cursor backward.\nalso i want a timer for each reply, in smaller letters.');
  await page.waitForTimeout(500);
  console.log('draft page:', await page.locator('[data-testid="draft-page"]').count(), 'paragraphs:', await page.locator('[data-testid="draft-paragraph"]').count());
  await page.screenshot({ path: 'docs/qa/draft-page-1440.png' });
  await page.click('[data-testid="tray-toggle"]');
  await page.waitForSelector('[data-testid="tray"]');
  await page.screenshot({ path: 'docs/qa/tray-open-1440.png' });
  await page.click('[data-testid="pin-box.new"]');
  await page.click('[data-testid="pin-play.open"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('pinned on bar:', await page.locator('[data-testid="topbar-pins"] [data-tool]').count());
  await page.screenshot({ path: 'docs/qa/tray-pinned-1440.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/qa/draft-page-390.png' });
  // Pages keep the pad
  await page.setViewportSize({ width: 1440, height: 900 });
  await input.fill('make a page called Notes');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  console.log('url after page:', page.url(), 'composer present:', await page.locator('[data-testid="composer"]').count());
  await page.screenshot({ path: 'docs/qa/page-with-pad-1440.png' });
  await page.goto(`${BASE}/pages/brands.html`, { waitUntil: 'networkidle' });
  await page.locator('#estimate').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/qa/brands-estimate-1440.png' });
  await browser.close();
} finally { preview.kill(); }
