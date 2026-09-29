// pnpm build:app first, then: node scripts/qa-c079.mjs (from terminal/). Start screen, tray tiles, tags stacked, sidebar handle.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 4182; const BASE = `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
async function up() { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/`)).ok) return; } catch {} await new Promise((d) => setTimeout(d, 250)); } throw new Error('preview not up'); }
const TEXT = "Hi, my name is Justin, how are you? What can you do? Let's list some things, 1st is the worst, second is the best, 3rd is the one with the hairy chest. I have 3 companies, Hoy, Santa Maria Tenis Club, Between-Gigs, Aluzina, etc. Those are my clients.";
try {
  await up();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="composer"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/qa/c079-start-1440.png' });
  await page.click('[data-testid="tray-toggle"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/qa/c079-tray-1440.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const input = page.locator('textarea').first();
  await input.click(); await input.fill(TEXT); await page.waitForTimeout(600);
  console.log('stacks:', await page.locator('.chip-stack').count(), 'draft list:', await page.locator('[data-testid="draft-list"]').count(), 'persons:', await page.locator('.chip-tray [data-kind="person"]').count());
  await page.screenshot({ path: 'docs/qa/c079-tags-1440.png' });
  await input.fill(''); await page.keyboard.press('Alt+['); await page.waitForTimeout(400);
  console.log('resize handle:', await page.locator('[data-testid="left-resize"]').count());
  const handle = page.locator('[data-testid="left-resize"]');
  if (await handle.count()) { const box = await handle.boundingBox(); await page.mouse.move(box.x + 3, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 120, box.y + 300, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300); }
  await page.screenshot({ path: 'docs/qa/c079-sidebar-1440.png' });
  await page.keyboard.press('Alt+['); await page.waitForTimeout(300);
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  const toggle = page.locator('[data-testid="tray-toggle"]');
  await page.screenshot({ path: 'docs/qa/c079-start-390.png' });
  try { await toggle.click({ timeout: 3000 }); await page.waitForTimeout(300); } catch (error) { console.error('phone tray:', error.message.split('\n')[0]); }
  await page.screenshot({ path: 'docs/qa/c079-tray-390.png' });
  await browser.close();
} finally { preview.kill(); }
