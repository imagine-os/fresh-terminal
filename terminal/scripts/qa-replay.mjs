// pnpm build:app first, then: node scripts/qa-replay.mjs (from terminal/). Writes docs/qa/replay-*.png.
// Screenshots of the replay view: seeds a box through the real UI (local commands only, no router), then presses P.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4174;
const BASE = `http://localhost:${PORT}/fresh-terminal`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) return; } catch {}
    await new Promise((d) => setTimeout(d, 250));
  }
  throw new Error('preview not up');
}
try {
  await waitUp();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="composer"]');
  const send = async (text) => {
    const input = page.locator('textarea').first();
    await input.click();
    await input.fill(text);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
  };
  await send('make a page called Notes');
  await page.waitForTimeout(400);
  await page.goBack().catch(() => {});
  await page.waitForTimeout(400);
  // Return to the box view if the page opened.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="composer"]');
  await send('switch to Glass Window');
  await send('list my boxes');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  await send('show today');
  // Open the replay with P.
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 700, y: 300 } });
  await page.keyboard.press('p');
  await page.waitForSelector('[data-testid="scrubber"]');
  await page.waitForTimeout(600);
  const label = await page.locator('[data-testid="scrubber-label"]').textContent();
  console.log('label at end:', label);
  await page.screenshot({ path: 'docs/qa/replay-1440-end.png' });
  // Scrub back to the middle step.
  const range = page.locator('[data-testid="scrubber-range"]');
  const max = Number(await range.getAttribute('max'));
  const mid = Math.floor(max / 2);
  await range.focus();
  for (let i = max; i > mid; i--) await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);
  console.log('label mid:', await page.locator('[data-testid="scrubber-label"]').textContent());
  console.log('url:', page.url());
  await page.screenshot({ path: 'docs/qa/replay-1440-mid.png' });
  await page.keyboard.press('Home');
  await page.waitForTimeout(400);
  console.log('label start:', await page.locator('[data-testid="scrubber-label"]').textContent());
  await page.screenshot({ path: 'docs/qa/replay-1440-start.png' });
  // Phone width
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/qa/replay-390.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log('phone overflow:', overflow);
  await browser.close();
} finally {
  preview.kill();
}
