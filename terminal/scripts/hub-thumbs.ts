/**
 * pnpm -C terminal hub:thumbs [--out dir] [--only id,id]
 * A preview thumbnail for every hub Work card (app/hub/items.json), shot from the
 * built site (run `pnpm build:app` first) with the canvas pipeline (scripts/thumbs.ts).
 * Writes <id>-640.jpg and <id>-1280.jpg into app/public/previews (committed, so
 * every build has them) or --out. site-deploy runs it into app/dist/previews on
 * each deploy so the hub shows the pages as they are now.
 *
 * Per item, `preview` says what to shoot: a site path, "canvas:<card id>" to reuse
 * a master-canvas thumbnail (the WebGL koi pond is too slow to shoot on every
 * deploy), or false for no picture (the card shows its monogram). Without
 * `preview` a site-relative href is shot as is. Only the local preview is loaded;
 * the hub itself is shot in sample mode (made-up numbers) showing only the Work list
 * and the credits panel, because these pictures are public files.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HubItem } from '../shared/src/hub/types';
import { shoot, withPreview } from './thumbs';

const PORT = 4194;
const HUB_PRIVATE_SECTIONS = '#library, #canon, #wiki, #plan, #secrets, .hub-foot';
const arg = (name: string): string | undefined => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const OUT = resolve(arg('--out') ?? 'app/public/previews');
const only = arg('--only') ? new Set(arg('--only')!.split(',')) : null;

/** What to shoot for an item, or null for none. Exported for the tests. */
export function previewSource(item: Pick<HubItem, 'href' | 'preview'>): { kind: 'page'; path: string } | { kind: 'canvas'; id: string } | null {
  if (item.preview === false) return null;
  const source = item.preview ?? item.href;
  if (source.startsWith('canvas:')) return { kind: 'canvas', id: source.slice(7) };
  if (source.startsWith('/')) return { kind: 'page', path: source };
  return null;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const items = (JSON.parse(readFileSync(resolve('app/hub/items.json'), 'utf8')) as { items: HubItem[] }).items;
  let made = 0;
  await withPreview(PORT, async (base) => {
    for (const item of items) {
      if (only && !only.has(item.id)) continue;
      const source = previewSource(item);
      if (!source) { console.log(`hub-thumbs: ${item.id} has no preview (monogram)`); continue; }
      const files = { small: resolve(OUT, `${item.id}-640.jpg`), large: resolve(OUT, `${item.id}-1280.jpg`) };
      try {
        if (source.kind === 'canvas') {
          const from = resolve('app/public/canvas/thumbs', `${source.id}.jpg`);
          if (!existsSync(from)) { console.log(`hub-thumbs: ${item.id}: canvas thumb ${source.id} missing`); continue; }
          copyFileSync(from, files.large);
          copyFileSync(from, files.small);
        } else {
          // The hub is shot in sample mode with only the Work list and the credits panel (made-up numbers):
          // these pictures are public files, so the library, Canon, wiki, plan and secrets sections never appear in them.
          const hub = source.path.startsWith('/hub');
          await shoot(base, source.path, [{ file: files.small, scale: 0.5, quality: 78 }, { file: files.large, scale: 1, quality: 72 }], {
            localOnly: true,
            waitFor: hub ? (source.path.includes('#credits') ? '.hub-stats' : '.hub-tile') : undefined,
            hide: hub ? HUB_PRIVATE_SECTIONS : undefined,
          });
        }
        made += 1;
        console.log(`hub-thumbs: ${item.id} <- ${source.kind === 'canvas' ? `canvas:${source.id}` : source.path}`);
      } catch (error) {
        // A failed shot keeps the last committed picture (or the monogram); it never fails the deploy.
        console.log(`hub-thumbs: ${item.id} failed: ${(error as Error).message.split('\n')[0]}`);
      }
    }
  });
  console.log(`hub-thumbs: ${made} previews into ${OUT}`);
}

if (process.argv[1]?.endsWith('hub-thumbs.ts')) main().catch((error) => { console.error(error); process.exit(1); });
