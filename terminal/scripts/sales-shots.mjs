/**
 * pnpm -C terminal sales:shots          (after pnpm build:app)
 * pnpm -C terminal sales:shots --check  (CI: render every scene into a temp folder, fail if one breaks)
 *
 * Drives the built app (vite preview) with Playwright into fixed scenes and
 * writes the screenshots the sales pages use (app/public/sales/img/<scene>.jpg),
 * a manifest (app/public/sales/img/shots.json: file, width, height, alt) and the
 * width/height/alt of every <img data-shot="..."> in about.html, pricing.html
 * and faq.html. Sample content only: no keys, no accounts, and every request
 * that leaves localhost is blocked, so the router is never called.
 * Sales site, 2026-09-29 (Canon: the screenshots pass).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const check = process.argv.includes('--check');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const PORT = Number(process.env.SHOTS_PORT ?? 4600 + Math.floor(Math.random() * 300));
const BASE = `http://localhost:${PORT}`;
const OUT = check ? mkdtempSync(join(tmpdir(), 'sales-shots-')) : resolve(root, 'app/public/sales/img');
const PAGES = ['app/public/about.html', 'app/public/pricing.html', 'app/public/faq.html'];
const DESK = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function typeInto(page, text, send) {
  const input = page.locator('[data-testid="composer"] textarea').first();
  await input.click();
  await input.pressSequentially(text, { delay: 12 });
  await page.waitForTimeout(700);
  if (send) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
  }
}
async function must(page, selector, what) {
  const found = await page.locator(selector).first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  if (!found) throw new Error(`scene broke: ${what} (${selector} not visible)`);
}
async function stageWithWork(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await must(page, '[data-testid="composer"]', 'the prompt');
  await typeInto(page, 'make a page called Trip plan', true);
  await typeInto(page, 'show today', true);
  const undo = await page.getByText('Undo', { exact: true }).first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  if (!undo) throw new Error('scene broke: the Undo bar after "make a page called Trip plan"');
}

/** Each scene: file name, viewport, alt text (English; Spanish is in sales/i18n-es.js), and the steps. */
const SCENES = [
  {
    name: 'start', viewport: DESK,
    alt: 'The Fresh Terminal start screen: “A terminal that adapts to you. We grow together.” above one centered prompt, with the words of a sentence lighting up as tags.',
    run: async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await must(page, '[data-testid="composer"]', 'the prompt');
      await typeInto(page, 'Remind Ana about the Lisbon trip on Friday at 3pm', false);
      await must(page, '[data-testid="chip-tray"] *, .chip', 'tags in the prompt');
    },
  },
  {
    name: 'typed', viewport: { width: 900, height: 600 }, scale: 2, clip: '[data-testid="composer"]',
    alt: 'The prompt with “make a page called Projects” typed: “make” is tagged as an action and “Projects” as a page.',
    run: async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await must(page, '[data-testid="composer"]', 'the prompt');
      await typeInto(page, 'make a page called Projects', false);
      await page.waitForTimeout(600);
      await must(page, '[data-testid="composer"] .chip', 'tags on make and Projects');
    },
  },
  {
    name: 'edit', viewport: DESK,
    alt: 'A stage after two prompts: it made the page “Trip plan” and put it in the menu, says what changed with one Undo, and shows a light perspective grid behind the stage; the next prompt is lighting up with tags.',
    run: async (page) => {
      await stageWithWork(page);
      await typeInto(page, 'Remind Ana about the Lisbon trip on Friday at 3pm', false);
    },
  },
  {
    name: 'rename', viewport: DESK,
    alt: 'Renaming a stage by clicking its name in the top bar: the name is an input with “Lisbon trip” typed in.',
    run: async (page) => {
      await stageWithWork(page);
      await page.click('[data-testid="stage-name"]');
      await page.waitForTimeout(200);
      const input = page.locator('.inline-name-input').first();
      await input.fill('Lisbon trip');
      await must(page, '.inline-name-input', 'the rename input');
    },
  },
  {
    name: 'tools', viewport: DESK,
    alt: 'The one-row top bar with the tools menu open: New stage, Actions, Replay (experimental), Language, Export and Import, Buy credits, Invite code, Settings and Terminal-talk (experimental).',
    run: async (page) => {
      await stageWithWork(page);
      await page.hover('[data-testid="tray-toggle"]');
      await must(page, '[data-testid="billing-topup"]', 'Buy credits in the tools menu');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'actions', viewport: DESK,
    alt: 'Actions as a timeline: every prompt, reply and edit on this stage as a row with its status, model and cost, and arrows to what each one follows.',
    run: async (page) => {
      await stageWithWork(page);
      await typeInto(page, 'switch to Glass Window', true);
      await typeInto(page, 'undo', true);
      await page.goto(`${BASE}/actions`, { waitUntil: 'networkidle' });
      await must(page, '[data-testid="actions-view"]', 'the Actions view');
      await page.click('[data-testid="actions-view-timeline"]');
      await must(page, '[data-testid="actions-timeline"]', 'the timeline');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'actions-board', viewport: DESK,
    alt: 'Actions as a board, one column per status.',
    run: async (page) => {
      await stageWithWork(page);
      await page.goto(`${BASE}/actions`, { waitUntil: 'networkidle' });
      await must(page, '[data-testid="actions-view"]', 'the Actions view');
      await page.click('[data-testid="actions-view-board"]');
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'offline', viewport: DESK,
    alt: 'A prompt typed with no connection waits on the stage, marked as queued, with Send now and Discard.',
    run: async (page, context) => {
      await stageWithWork(page);
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await typeInto(page, 'Draft a packing list for four days in Lisbon', true);
      await must(page, '[data-testid="queued-prompt"]', 'the offline queue');
    },
  },
  {
    name: 'library', viewport: DESK,
    alt: 'A skinned terminal from the library, Paper and Typewriter: today’s date, a theme switched and undone, and the next prompt with tags.',
    run: async (page) => {
      await page.goto(`${BASE}/box/new?theme=blank-page&skin=paper&from=paper-and-typewriter`, { waitUntil: 'networkidle' });
      await must(page, '[data-testid="composer"]', 'the prompt');
      await page.waitForTimeout(800);
      await typeInto(page, 'show today', true);
      await typeInto(page, 'switch to Glass Window', true);
      await typeInto(page, 'undo', true);
      await typeInto(page, 'Add the Lisbon trip to my list for Friday', false);
    },
  },
  {
    name: 'replay', viewport: DESK,
    alt: 'Replay (experimental): the stage rebuilt at one step of the session, with a scrubber to move through every step.',
    run: async (page) => {
      await stageWithWork(page);
      await typeInto(page, 'switch to Glass Window', true);
      const id = await page.evaluate(() => {
        const store = JSON.parse(localStorage.getItem('fresh-terminal.store.v0') ?? '{}');
        return (store.boxes ?? [])[0]?.id ?? null;
      });
      if (!id) throw new Error('scene broke: no stage id in the local store');
      await page.goto(`${BASE}/box/${encodeURIComponent(id)}/play?step=4`, { waitUntil: 'networkidle' });
      await must(page, '[data-testid="scrubber"]', 'the replay scrubber');
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'phone', viewport: PHONE, scale: 2,
    alt: 'Fresh Terminal on a phone: the stage with a new page and one Undo, and the prompt at the bottom with tags.',
    run: async (page) => {
      await stageWithWork(page);
      await typeInto(page, 'Call Ana on Friday at 3pm', false);
    },
  },
];

function patchPages(manifest) {
  for (const file of PAGES) {
    const path = resolve(root, file);
    let html = readFileSync(path, 'utf8');
    html = html.replace(/<img\b[^>]*\bdata-shot="([a-z0-9-]+)"[^>]*>/g, (tag, name) => {
      const shot = manifest.shots[name];
      if (!shot) throw new Error(`${file}: data-shot="${name}" has no scene`);
      const set = (text, attr, value) => (new RegExp(`\\b${attr}="[^"]*"`).test(text) ? text.replace(new RegExp(`\\b${attr}="[^"]*"`), `${attr}="${value}"`) : text.replace('<img', `<img ${attr}="${value}"`));
      let next = set(tag, 'src', `sales/img/${shot.file}`);
      next = set(next, 'width', String(shot.width));
      next = set(next, 'height', String(shot.height));
      next = set(next, 'alt', shot.alt.replace(/"/g, '&quot;'));
      return next;
    });
    writeFileSync(path, html);
  }
}

const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'app/vite.config.ts', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
let failed = 0;
try {
  if (!existsSync(resolve(root, 'app/dist/index.html'))) throw new Error('app/dist missing: run pnpm build:app first');
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/`)).ok) break; } catch {} await new Promise((done) => setTimeout(done, 250)); }
  const browser = await chromium.launch();
  const manifest = { $comment: 'Written by scripts/sales-shots.mjs. Do not edit by hand.', generated: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? null, shots: {} };
  mkdirSync(OUT, { recursive: true });
  for (const scene of SCENES) {
    const scale = scene.scale ?? 1.5;
    const context = await browser.newContext({ viewport: scene.viewport, deviceScaleFactor: scale, colorScheme: 'dark', reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC' });
    await context.route('**/*', (route) => (new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort()));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await scene.run(page, context);
      const file = `${scene.name}.jpg`;
      let size = { width: scene.viewport.width, height: scene.viewport.height };
      if (scene.clip) {
        const box = await page.locator(scene.clip).first().boundingBox();
        if (!box) throw new Error(`scene broke: ${scene.clip} has no box`);
        const pad = 8;
        const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(scene.viewport.width, box.width + pad * 2), height: box.height + pad * 2 };
        await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 88, clip });
        size = { width: clip.width, height: clip.height };
      } else {
        await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 82 });
      }
      manifest.shots[scene.name] = { file, width: Math.round(size.width * scale), height: Math.round(size.height * scale), alt: scene.alt, bytes: statSync(join(OUT, file)).size };
      console.log(`ok   ${scene.name.padEnd(14)} ${manifest.shots[scene.name].width}x${manifest.shots[scene.name].height} ${Math.round(manifest.shots[scene.name].bytes / 1024)} KB${errors.length ? `  page errors: ${errors.join(' | ')}` : ''}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL ${scene.name.padEnd(14)} ${error.message}`);
      await page.screenshot({ path: join(OUT, `${scene.name}-FAILED.png`) }).catch(() => {});
    }
    await context.close();
  }
  await browser.close();
  writeFileSync(join(OUT, 'shots.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (!check && failed === 0) patchPages(manifest);
  console.log(`sales-shots: ${SCENES.length - failed} of ${SCENES.length} scenes${check ? ` (check only, in ${OUT})` : ', written to app/public/sales/img and the pages'}`);
} finally {
  preview.kill();
}
if (failed) process.exit(1);
