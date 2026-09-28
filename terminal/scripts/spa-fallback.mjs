// GitHub Pages serves 404.html for unknown paths; copying index.html there makes /box/:id work.
import { copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../app/dist');
const index = resolve(dist, 'index.html');

if (!existsSync(index)) {
  console.error('spa-fallback: app/dist/index.html not found; run the app build first');
  process.exit(1);
}
copyFileSync(index, resolve(dist, '404.html'));
writeFileSync(resolve(dist, '.nojekyll'), '');
console.log('spa-fallback: wrote 404.html and .nojekyll');
