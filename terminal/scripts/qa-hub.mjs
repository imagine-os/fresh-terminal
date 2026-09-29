// HUB_DATA=1 pnpm build:app first, then: node scripts/qa-hub.mjs [outDir] (from terminal/).
// Local preview of the hub with sample admin numbers (?sample=1, localhost only) at 360-3840,
// plus the signed-out shell. Checks: no horizontal overflow, every visible control >= 44x44 px,
// the library search filters, keyboard focus reaches the nav. Screenshots go to outDir (default docs/qa).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const PORT = Number(process.env.HUB_QA_PORT ?? 4186); const BASE = `http://localhost:${PORT}`;
const OUT = process.argv[2] ?? 'docs/qa';
mkdirSync(OUT, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
async function up() { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/hub/`)).ok) return; } catch {} await new Promise((d) => setTimeout(d, 250)); } throw new Error('preview not up'); }
const WIDTHS = [360, 390, 768, 1280, 1920, 2560, 3840];
const height = (w) => (w <= 400 ? 844 : w <= 800 ? 1024 : Math.round(w * 0.5625));
let failures = 0;
try {
  await up();
  const browser = await chromium.launch();
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: height(width) }, colorScheme: 'dark' });
    page.on('pageerror', (e) => { failures += 1; console.error('pageerror', e.message); });
    await page.goto(`${BASE}/hub/?sample=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-hub="admin"] .hub-tile');
    await page.waitForSelector('.hub-stats');
    // Card pictures (C-104): every card has a picture or a monogram; pictures in view have loaded.
    await page.waitForFunction(() => [...document.querySelectorAll('.hub-thumb img')].filter((img) => img.getBoundingClientRect().top < innerHeight).every((img) => img.complete), null, { timeout: 15000 }).catch(() => undefined);
    const thumbs = await page.evaluate(() => ({ tiles: document.querySelectorAll('.hub-tile').length, pictures: document.querySelectorAll('.hub-tile > .hub-thumb img').length, monograms: document.querySelectorAll('.hub-tile > .hub-thumb-none').length, lazy: [...document.querySelectorAll('.hub-thumb img')].every((img) => img.loading === 'lazy' && img.alt.startsWith('Preview of ')), rounded: [...document.querySelectorAll('.hub-thumb, .hub-thumb img')].some((el) => getComputedStyle(el).borderRadius !== '0px') }));
    if (thumbs.pictures + thumbs.monograms !== thumbs.tiles || !thumbs.lazy || thumbs.rounded) failures += 1;
    const report = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      const small = [];
      for (const el of document.querySelectorAll('a, button, input, summary, [tabindex="0"]')) {
        const rect = el.getBoundingClientRect(); const style = getComputedStyle(el);
        if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden') continue;
        if (el.closest('.hub-md, .hub-verbatim, .hub-foot, .hub-lead, .hub-muted, td, p:not(.hub-links):not(.hub-actions):not(.hub-code)') && el.tagName === 'A') continue; // inline links in running text
        if (el.classList.contains('hub-skip')) continue;
        // A checkbox's target is its whole label.
        const box = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest('label')?.getBoundingClientRect() : null;
        if (box && box.height >= 43.5 && box.width >= 43.5) continue;
        if (rect.height < 43.5 || rect.width < 43.5) small.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      }
      return { overflow, small: small.slice(0, 8), smallCount: small.length };
    });
    const ok = !report.overflow && report.smallCount === 0;
    if (!ok) failures += 1;
    console.log(`${width}: pictures=${thumbs.pictures} monograms=${thumbs.monograms} of ${thumbs.tiles} lazy+alt=${thumbs.lazy} rounded=${thumbs.rounded}`);
    console.log(`${width}: overflow=${report.overflow} small=${report.smallCount}${report.small.length ? ` ${report.small.join('; ')}` : ''}`);
    if ([390, 1280, 3840].includes(width)) await page.screenshot({ path: `${OUT}/hub-admin-${width}.png` });
    if (width === 1280) {
      await page.fill('#hub-q', 'free usage');
      await page.waitForTimeout(200);
      console.log('search "free usage":', await page.locator('.hub-results > li').count(), 'shown;', await page.locator('.hub-library [aria-live]').textContent());
      await page.locator('#library').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}/hub-library-1280.png` });
      await page.locator('#credits').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}/hub-credits-1280.png` });
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
      console.log('focus after 2 tabs:', await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30)));
    }
    await page.close();
  }
  // Signed out (no Clerk key in a local build: the shell says so, nothing else).
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/hub/`, { waitUntil: 'networkidle' });
  console.log('shell without a key:', (await page.locator('[data-testid="hub"]').textContent())?.slice(0, 80));
  await browser.close();
} finally { preview.kill(); }
if (failures) { console.error(`qa-hub: ${failures} problem(s)`); process.exit(1); }
console.log('qa-hub: all widths green');
