/**
 * pnpm -C terminal share:sync
 * Writes the share tags (shared/src/share.ts) into the app's index.html and the
 * sales pages. Only the block between the share markers changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHARE_PAGES, withShareTags } from '../shared/src/share.ts';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../app');
for (const page of SHARE_PAGES) {
  const file = resolve(app, page.file);
  const before = readFileSync(file, 'utf8');
  const after = withShareTags(before, page.path);
  if (after !== before) writeFileSync(file, after);
  console.log(`share-sync: ${page.file} ${after === before ? 'up to date' : 'updated'}`);
}
