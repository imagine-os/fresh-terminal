/**
 * pnpm -C terminal canvas:thumbs [--only id,id]
 * Screenshots every card on the master canvas into app/public/canvas/thumbs/<id>.jpg.
 * Expects app/dist (run `pnpm build:app` first); serves it with `vite preview`.
 * WebGL pages (the koi ponds) render with SwiftShader, so they take a while.
 * The shooting itself lives in scripts/thumbs.ts, shared with hub:thumbs.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shoot, withPreview } from './thumbs';

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
  await withPreview(PORT, async (base) => {
    for (const card of cards) {
      if (only && !only.has(card.id)) continue;
      const path = SOURCE[card.id] ?? (card.href.startsWith('route:') ? card.href.slice(6) : card.href.startsWith('pages/') ? `/${card.href}` : null);
      if (path === null) { console.log(`skip ${card.id} (${card.href})`); continue; }
      await shoot(base, path, [{ file: resolve(OUT, `${card.id}.jpg`), scale: 1 }], { webgl: WEBGL.has(card.id) });
      console.log(`thumb ${card.id} <- ${path}`);
    }
  });
}
main().catch((error) => { console.error(error); process.exit(1); });
