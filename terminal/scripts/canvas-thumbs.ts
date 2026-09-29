/**
 * pnpm -C terminal canvas:thumbs [--only id,id]
 * Screenshots every card on the master canvas into app/public/canvas/thumbs/<id>.jpg.
 * Expects app/dist (run `pnpm build:app` first); serves it with `vite preview`.
 * WebGL pages (the koi ponds) render with SwiftShader, so they take a while.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const PORT = 4193;
const OUT = resolve('app/public/canvas/thumbs');
mkdirSync(OUT, { recursive: true });

// where to point the camera for each card; external docs use their rendered wiki page
const SOURCE: Record<string, string> = {
  landing: '/',
  'first-box': '/box/demo',
  'plan-pm-viewer': '/plan',
  'docs-start-here': '/wiki/index.html',
  canon: '/wiki/canon/README.html',
  'koi-pond': '/pages/koi.html?view=forward&q=high',
  'koi-pond-v2': '/pages/koi-v2.html?tilt=40',
  'canvas-v1': '/canvas?v=1',
};
const WEBGL = new Set(['koi-pond', 'koi-pond-v2', 'koi-pond-v1']);

async function main(): Promise<void> {
  const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1]?.split(',')) : null;
  const cards = (JSON.parse(readFileSync(resolve('docs/canvas/cards.json'), 'utf8')) as { cards: { id: string; href: string }[] }).cards;
  const { chromium } = await import('playwright');
  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i += 1) {
      try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not up yet */ }
      await new Promise((done) => setTimeout(done, 250));
    }
    for (const card of cards) {
      if (only && !only.has(card.id)) continue;
      const path = SOURCE[card.id] ?? (card.href.startsWith('route:') ? card.href.slice(6) : card.href.startsWith('pages/') ? `/${card.href}` : null);
      if (path === null) { console.log(`skip ${card.id} (${card.href})`); continue; }
      const webgl = WEBGL.has(card.id);
      const browser = await chromium.launch({ args: webgl ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [] });
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'load' });
      if (webgl) {
        await page.waitForFunction(() => document.body.classList.contains('ready') || !!(window as unknown as { koi?: { fishCount: number } }).koi?.fishCount, null, { timeout: 180000 }).catch(() => undefined);
        await page.waitForTimeout(3500);
      } else {
        await page.waitForTimeout(1200);
      }
      await page.screenshot({ path: resolve(OUT, `${card.id}.jpg`), type: 'jpeg', quality: 80, timeout: 240000 });
      console.log(`thumb ${card.id} <- ${path}`);
      await browser.close();
    }
  } finally {
    preview.kill();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
