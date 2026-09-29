/**
 * Builds the hub's data (2026-09-29, C-088) into app/dist/hub/data/*.json from
 * the docs, after the app and wiki builds. The site Worker serves these files
 * only to signed-in admins (site/src/worker.ts); the hub page itself is a shell
 * with no content in it.
 *
 * Data is written only with HUB_DATA=1 (site-deploy sets it). The GitHub Pages
 * build has no gate in front of it, so it gets the shell and no data.
 * HUB_SECRETS (JSON {"NAME": true|false}) and HUB_WORKER_SECRETS (comma names)
 * come from the deploy step and hold names and booleans only, never values.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCanonDecisions, parsePrompts, parseRecord, parseWikiIndex, secretStates, type HubItem } from './hub-data.ts';

const here = dirname(fileURLToPath(import.meta.url));
const docs = resolve(here, '../docs');
const dist = resolve(here, '../app/dist');
const out = resolve(dist, 'hub/data');

if (!existsSync(resolve(dist, 'hub/index.html'))) {
  console.error('build-hub: app/dist/hub/index.html not found; run the app build first');
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
if (process.env.HUB_DATA !== '1') {
  console.log('build-hub: HUB_DATA is not 1, so no hub data in this build (the shell only)');
  process.exit(0);
}
mkdirSync(out, { recursive: true });

const read = (path: string) => readFileSync(resolve(docs, path), 'utf8');
const write = (name: string, value: unknown) => writeFileSync(resolve(out, name), JSON.stringify(value));

const prompts = parsePrompts(read('canon/prompts.md'));
const canon = parseCanonDecisions(read('canon/decisions.md'));
const records = [
  ...readdirSync(resolve(docs, 'decisions'))
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => parseRecord('decision', `decisions/${name}`, read(`decisions/${name}`))),
  ...readdirSync(resolve(docs, 'changelog'))
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => parseRecord('changelog', `changelog/${name}`, read(`changelog/${name}`))),
];
const items = JSON.parse(readFileSync(resolve(here, '../app/hub/items.json'), 'utf8')) as { items: HubItem[] };
const plan = JSON.parse(read('plan/plan.json')) as { tasks: unknown[] };

let found: Record<string, boolean> | null = null;
try {
  found = process.env.HUB_SECRETS ? (JSON.parse(process.env.HUB_SECRETS) as Record<string, boolean>) : null;
} catch {
  found = null;
}
const workerSecrets = (process.env.HUB_WORKER_SECRETS ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => /^[A-Z0-9_]+$/.test(name));

// Card pictures (C-104): hub:thumbs writes app/public/previews (committed) and, on deploy, app/dist/previews.
const previewDirs = [resolve(here, '../app/dist/previews'), resolve(here, '../app/public/previews')];
for (const item of items.items) {
  item.thumb = previewDirs.some((dir) => existsSync(resolve(dir, `${item.id}-640.jpg`))) ? `/previews/${item.id}` : null;
}
write('items.json', items);
write('library.json', { prompts, canon, records });
write('wiki.json', { pages: parseWikiIndex(read('README.md')) });
write('plan.json', plan);
write('secrets.json', { checked_at: found ? new Date().toISOString() : null, secrets: secretStates(found), worker_secrets: workerSecrets });
write('manifest.json', { built_at: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? null, counts: { prompts: prompts.length, canon: canon.length, records: records.length, items: items.items.length } });
console.log(`build-hub: ${prompts.length} prompts, ${canon.length} Canon entries, ${records.length} records, ${items.items.length} items into app/dist/hub/data`);
