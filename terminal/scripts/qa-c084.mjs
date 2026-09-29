// pnpm build:app first, then: node scripts/qa-c084.mjs (from terminal/). The top-bar note and the voice key in the placeholder.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4184; const BASE = `http://localhost:${PORT}`;
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
  console.log('note:', await page.locator('[data-testid="topbar-note"]').innerText(), '| placeholder:', await page.locator('textarea').first().getAttribute('placeholder'), '| banner:', await page.locator('[data-testid="first-run"]').count());
  await page.screenshot({ path: 'docs/qa/c084-start-1440.png' });
  await browser.close();
} finally { preview.kill(); }
