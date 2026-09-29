/**
 * The page-thumbnail pipeline shared by canvas:thumbs (master canvas cards) and
 * hub:thumbs (hub Work cards): serve app/dist with `vite preview`, open each page
 * in Playwright at 1280x800, wait, and save JPEGs. WebGL pages render with
 * SwiftShader. Requests to anything but the local preview are blocked, so a shot
 * never calls the live router or third parties.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Browser } from 'playwright';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';

export const THUMB_VIEWPORT = { width: 1280, height: 800 } as const;
const WEBGL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** Start `vite preview` on app/dist, run fn with its base URL, then stop it. */
export async function withPreview<T>(port: number, fn: (base: string) => Promise<T>): Promise<T> {
  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  const base = `http://localhost:${port}`;
  try {
    for (let i = 0; i < 60; i += 1) {
      try { if ((await fetch(`${base}/`)).ok) break; } catch { /* not up yet */ }
      await new Promise((done) => setTimeout(done, 250));
    }
    return await fn(base);
  } finally {
    preview.kill();
  }
}

export interface ShotOut { file: string; scale: number; quality?: number }

/** Screenshot one page into one or more files (scale 0.5 gives a 640x400 image of the 1280 layout). */
export async function shoot(base: string, path: string, outs: ShotOut[], options: { webgl?: boolean; localOnly?: boolean; waitFor?: string; hide?: string } = {}): Promise<void> {
  const { chromium } = await import('playwright');
  const browser: Browser = await chromium.launch({ args: options.webgl ? WEBGL_ARGS : [] });
  try {
    for (const out of outs) {
      const page = await browser.newPage({ viewport: THUMB_VIEWPORT, deviceScaleFactor: out.scale, colorScheme: 'dark' });
      if (options.localOnly) await page.route('**/*', (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
      await page.goto(`${base}${path}`, { waitUntil: 'load' });
      if (options.webgl) {
        await page.waitForFunction(() => document.body.classList.contains('ready') || !!(window as unknown as { koi?: { fishCount: number } }).koi?.fishCount, null, { timeout: 180000 }).catch(() => undefined);
        await page.waitForTimeout(3500);
      } else {
        if (options.hide) await page.addStyleTag({ content: `${options.hide} { display: none !important; }` });
        if (options.waitFor) await page.waitForSelector(options.waitFor, { timeout: 15000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        // A #hash in the path scrolls to that section once the content is in (it renders after load).
        const hash = new URL(path, base).hash.slice(1);
        if (hash) {
          await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' }), hash);
          await page.waitForTimeout(300);
        }
      }
      await page.screenshot({ path: out.file, type: 'jpeg', quality: out.quality ?? 80, timeout: 240000 });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
