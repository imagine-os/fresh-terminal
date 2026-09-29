/**
 * node scripts/og-card.mjs
 * Renders docs/brand/og-card.html to app/public/brand/og-1200x630.png (the share
 * card in shared/src/share.ts). Uses the preinstalled Chromium.
 */
import { chromium } from 'playwright';
import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../docs/brand/og-card.html');
const out = resolve(here, '../app/public/brand/og-1200x630.png');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(source).href, { waitUntil: 'load' });
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log(`og-card: wrote ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
