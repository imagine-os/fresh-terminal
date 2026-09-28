/**
 * pnpm check:responsive
 * Builds nothing itself: expects app/dist (run `pnpm build:app` first) and
 * serves it with `vite preview`. Renders /, /box/demo and /canvas at seven widths and
 * asserts: no horizontal overflow, composer visible, every visible interactive
 * element is at least 44x44 CSS px. Screenshots land in docs/qa/.
 * Uses the preinstalled Chromium at PLAYWRIGHT_BROWSERS_PATH (default /opt/pw-browsers).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WIDTHS = [360, 390, 768, 1280, 1920, 2560, 3840];
const PAGES = [
  { name: 'landing', path: '/', composer: true, ready: '[data-testid="composer"]' },
  { name: 'box', path: '/box/demo', composer: true, ready: '[data-testid="composer"]' },
  { name: 'canvas', path: '/canvas', composer: false, ready: '[data-testid="canvas-surface"]' },
];
const PORT = 4173;
const MIN_TARGET = 44;

interface Result {
  page: string;
  width: number;
  overflow: boolean;
  composerVisible: boolean;
  smallTargets: string[];
  screenshot: string;
}

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}

const qaDir = resolve('docs/qa');
mkdirSync(qaDir, { recursive: true });

function heightFor(width: number): number {
  if (width <= 400) {
    return 800;
  }
  if (width <= 800) {
    return 1024;
  }
  return Math.round(width * 0.5625);
}

async function waitForServer(url: string, attempts = 40): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`preview server did not start at ${url}`);
}

async function main(): Promise<void> {
  if (!existsSync(resolve('app/dist/index.html'))) {
    console.error('check-responsive: app/dist missing. Run `pnpm build:app` first.');
    process.exit(1);
  }

  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (error) {
    console.error('check-responsive: playwright not importable:', error);
    process.exit(1);
  }

  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    detached: false,
  });

  const results: Result[] = [];
  let failed = false;

  try {
    await waitForServer(`http://localhost:${PORT}/`);
    const browser = await chromium.launch();
    try {
      for (const page of PAGES) {
        for (const width of WIDTHS) {
          const context = await browser.newContext({
            viewport: { width, height: heightFor(width) },
            reducedMotion: 'reduce',
          });
          const tab = await context.newPage();
          await tab.goto(`http://localhost:${PORT}${page.path}`, { waitUntil: 'networkidle' });
          await tab.waitForSelector(page.ready, { timeout: 10_000 });

          const overflow = await tab.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          );

          const composerVisible = !page.composer || (await tab.evaluate(() => {
            const element = document.querySelector('[data-testid="composer"]');
            if (!element) {
              return false;
            }
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
          }));

          const smallTargets = await tab.evaluate((min) => {
            const selector = 'button, a[href], input, textarea, select, [role="button"]';
            const offenders: string[] = [];
            for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              const visible =
                rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
              if (!visible) {
                continue;
              }
              if (rect.width + 0.5 < min || rect.height + 0.5 < min) {
                const label =
                  element.getAttribute('aria-label') ||
                  element.textContent?.trim().slice(0, 30) ||
                  element.tagName.toLowerCase();
                offenders.push(`${label} (${Math.round(rect.width)}x${Math.round(rect.height)})`);
              }
            }
            return offenders;
          }, MIN_TARGET);

          const screenshot = `${page.name}-${width}.png`;
          await tab.screenshot({ path: resolve(qaDir, screenshot), fullPage: false });
          await context.close();

          const result: Result = { page: page.name, width, overflow, composerVisible, smallTargets, screenshot };
          results.push(result);
          const ok = !overflow && composerVisible && smallTargets.length === 0;
          if (!ok) {
            failed = true;
          }
          console.log(
            `${ok ? 'ok  ' : 'FAIL'} ${page.name.padEnd(8)} ${String(width).padStart(4)}  overflow=${overflow} composer=${composerVisible} small=${smallTargets.length}${
              smallTargets.length ? ' [' + smallTargets.join('; ') + ']' : ''
            }`,
          );
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    preview.kill('SIGTERM');
  }

  const stamp = new Date().toISOString();
  writeFileSync(resolve(qaDir, 'responsive-latest.json'), `${JSON.stringify({ stamp, results }, null, 2)}\n`);
  const lines = [
    `# Responsive check (latest)`,
    ``,
    `Run: ${stamp}. Widths: ${WIDTHS.join(', ')}. Pages: ${PAGES.map((page) => page.path).join(', ')}.`,
    `Asserts: no horizontal overflow, composer visible, interactive targets >= ${MIN_TARGET}px.`,
    ``,
    `| page | width | overflow | composer | small targets | screenshot |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...results.map(
      (result) =>
        `| ${result.page} | ${result.width} | ${result.overflow ? 'yes' : 'no'} | ${result.composerVisible ? 'yes' : 'no'} | ${result.smallTargets.length} | ${result.screenshot} |`,
    ),
    ``,
    failed ? `Result: FAIL` : `Result: PASS`,
    ``,
  ];
  writeFileSync(resolve(qaDir, 'responsive-latest.md'), lines.join('\n'));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
