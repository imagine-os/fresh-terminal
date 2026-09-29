/**
 * Share previews for every public page, rebuilt on every build (so on every
 * publish). Runs after the app and wiki builds (package.json build:app):
 *
 * - finds every public HTML page in app/dist: the app root, /about, /pricing,
 *   /faq, pages/*.html, the wiki, and the app routes in SPA_SHARE_PAGES
 *   (written as dist/<name>.html copies of index.html);
 * - takes the title and description from the page's own <title> and
 *   <meta name="description"> (fallbacks: its h1 and first paragraph);
 * - draws a 1200×630 card for it (templated SVG → PNG with resvg and the
 *   vendored DejaVu Sans Mono) into dist/og/<slug>.png;
 * - writes og:*, twitter:*, theme-color and a canonical URL into the page head;
 * - gives the hub (behind sign-in) a generic noindex card that shows nothing;
 * - fails the build when any public page ends up without its tags or image.
 * A new page gets a preview with no manual step. Justin, 2026-09-29 (Canon: share previews).
 */
import { Resvg } from '@resvg/resvg-js';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHARE, SPA_SHARE_PAGES } from '../shared/src/share.ts';
import { cardSvg, missingTags, readMeta, shareBlock, slugFor, withShareBlock, type SharePage } from './share-pages-lib.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../app/dist');
const fonts = [resolve(here, 'fonts/DejaVuSansMono.ttf'), resolve(here, 'fonts/DejaVuSansMono-Bold.ttf')];
const GENERIC = 'Part of Fresh Terminal, a terminal that adapts to you.';

if (!existsSync(join(dist, 'index.html'))) {
  console.error('share-pages: app/dist/index.html not found; run the app build first');
  process.exit(1);
}

function htmlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return htmlFiles(full);
    return name.endsWith('.html') ? [full] : [];
  });
}

const titleLines = (text: string) => [text];
/** freshterminal.ai serves /pages/koi.html at /pages/koi (the asset store redirects), so that is the canonical address. */
const cleanPath = (path: string) => path.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
const jobs: Array<{ file: string; page: SharePage; html: string }> = [];
const add = (file: string, page: Omit<SharePage, 'image'>, html = readFileSync(file, 'utf8')) => jobs.push({ file, html, page: { ...page, image: `/og/${slugFor(page.path)}.png` } });

// The app root and /about carry the brand card and the share copy from shared/src/share.ts.
const brandCard = { kicker: null, lines: ['A terminal that', 'adapts to you.'], accentLast: true, body: null, prompt: true, fixed: true };
add(join(dist, 'index.html'), { path: '/', title: SHARE.title, description: SHARE.description, card: brandCard, private: false });
if (existsSync(join(dist, 'about.html'))) add(join(dist, 'about.html'), { path: '/about', title: SHARE.title, description: SHARE.description, card: brandCard, private: false });

// Sales pages, then every static page: their own title and description.
for (const [name, kicker] of [['pricing', 'Pricing'], ['faq', 'FAQ']] as const) {
  const file = join(dist, `${name}.html`);
  if (!existsSync(file)) continue;
  const html = readFileSync(file, 'utf8');
  const meta = readMeta(html);
  add(file, { path: `/${name}`, title: meta.title ?? SHARE.title, description: meta.description ?? SHARE.description, card: { kicker, lines: titleLines(meta.h1 ?? meta.title ?? name), accentLast: false, body: meta.description, prompt: false }, private: false }, html);
}
for (const file of htmlFiles(join(dist, 'pages'))) {
  const html = readFileSync(file, 'utf8');
  const meta = readMeta(html);
  const path = cleanPath(`/${relative(dist, file).split('\\').join('/')}`);
  const title = meta.title ?? meta.h1 ?? path;
  const description = meta.description ?? meta.firstParagraph ?? GENERIC;
  add(file, { path, title: title.includes('Fresh Terminal') ? title : `${title} · Fresh Terminal`, description, card: { kicker: 'Page', lines: titleLines(meta.h1 ?? title), accentLast: false, body: description, prompt: false }, private: false }, html);
}
for (const file of htmlFiles(join(dist, 'wiki'))) {
  const html = readFileSync(file, 'utf8');
  const meta = readMeta(html);
  const path = cleanPath(`/${relative(dist, file).split('\\').join('/')}`);
  const short = (meta.title ?? meta.h1 ?? 'Docs').replace(/\s*·\s*Fresh Terminal wiki$/, '');
  const weak = !meta.description || /^Fresh Terminal docs wiki:/.test(meta.description);
  const description = weak ? meta.firstParagraph ?? `Fresh Terminal docs: ${short}.` : meta.description!;
  add(file, { path, title: `${short} · Fresh Terminal docs`, description, card: { kicker: 'Docs', lines: titleLines(short), accentLast: false, body: description, prompt: false }, private: false }, html);
}

// App routes that are pages of their own: a copy of index.html per route.
const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8');
for (const route of SPA_SHARE_PAGES) {
  add(join(dist, `${route.name}.html`), { path: route.path, title: route.title, description: route.description, card: { kicker: route.name, lines: titleLines(route.line), accentLast: false, body: route.description, prompt: false }, private: false }, indexHtml);
}

// Behind sign-in: a generic card that reveals nothing, and noindex.
if (existsSync(join(dist, 'hub/index.html'))) {
  add(join(dist, 'hub/index.html'), { path: '/hub', title: 'Fresh Terminal', description: 'A private page. Sign in to see it.', card: { kicker: 'Private', lines: ['A private page'], accentLast: false, body: 'Sign in to see it.', prompt: false }, private: true });
}

mkdirSync(join(dist, 'og'), { recursive: true });
const problems: string[] = [];
let bytes = 0;
for (const job of jobs) {
  const png = new Resvg(cardSvg(job.page), { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans Mono' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  const out = join(dist, job.page.image.slice(1));
  writeFileSync(out, png);
  bytes += png.length;
  const html = withShareBlock(job.html, shareBlock(job.page));
  writeFileSync(job.file, html);
  const missing = missingTags(html);
  if (missing.length) problems.push(`${job.page.path}: missing ${missing.join(', ')}`);
  if (png.length > 1_000_000) problems.push(`${job.page.path}: card over 1 MB`);
}

// The check: every public HTML file in dist must now carry the tags and a card that exists.
const skip = new Set([join(dist, '404.html')]);
for (const file of htmlFiles(dist)) {
  if (skip.has(file)) continue;
  const html = readFileSync(file, 'utf8');
  const missing = missingTags(html);
  if (missing.length) problems.push(`${relative(dist, file)}: missing ${missing.join(', ')}`);
  const image = /<meta property="og:image" content="https:\/\/freshterminal\.ai(\/[^"]+)"/.exec(html)?.[1];
  if (image && !existsSync(join(dist, image.slice(1))) && !existsSync(resolve(here, '../app/public', image.slice(1)))) problems.push(`${relative(dist, file)}: image ${image} is not in the build`);
}
if (problems.length) {
  console.error(`share-pages: ${problems.length} page(s) without a share preview:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`share-pages: ${jobs.length} pages with share previews, ${jobs.length} cards (${Math.round(bytes / 1024)} KB) in app/dist/og`);
