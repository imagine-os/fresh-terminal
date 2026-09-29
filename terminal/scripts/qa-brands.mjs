// pnpm build:app first, then: node scripts/qa-brands.mjs (from terminal/). Writes docs/qa/brands-*.png and freshstack-nested-1440.png.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4175; const BASE = `http://localhost:${PORT}`; // vite preview serves without the Pages prefix
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
async function up() { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/`)).ok) return; } catch {} await new Promise((d) => setTimeout(d, 250)); } throw new Error('preview not up'); }
try {
  await up();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}/pages/brands.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid figure').length > 10);
  console.log('count:', await page.locator('#count').textContent());
  await page.screenshot({ path: 'docs/qa/brands-1440.png' });
  await page.click('button[data-variant="wide"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/qa/brands-1440-wide.png' });
  await page.click('button[data-theme="light"]'); await page.click('button[data-variant="light"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/qa/brands-1440-lightpage.png' });
  await page.click('button[data-variant="stacked"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/qa/brands-1440-stacked-light.png' });
  await page.goto(`${BASE}/pages/freshstack.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card .nest');
  const nested = await page.locator('.card[data-nested="true"] h2').allTextContents();
  console.log('nested:', nested);
  const marks = await page.locator('.card header img.mark').count();
  console.log('marks:', marks);
  await page.screenshot({ path: 'docs/qa/freshstack-nested-1440.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/qa/freshstack-nested-390.png' });
  await browser.close();
} finally { preview.kill(); }
