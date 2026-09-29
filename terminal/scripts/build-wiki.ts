/**
 * Builds the docs wiki into the site: every Markdown page under docs/ is
 * rendered to app/dist/wiki/<path>.html, and the Markdown itself is copied
 * next to it (people read the HTML, agents can read the .md). llms.txt goes
 * to /wiki/llms.txt and to the site root. Runs after the app build.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, renderMarkdown } from './wiki-render.ts';

const here = dirname(fileURLToPath(import.meta.url));
const docs = resolve(here, '../docs');
const dist = resolve(here, '../app/dist');
const out = resolve(dist, 'wiki');
const REPO = 'https://github.com/imagine-os/fresh-terminal';
const COPIED = new Set(['.md', '.json', '.txt']);

if (!existsSync(dist)) {
  console.error('build-wiki: app/dist not found; run the app build first');
  process.exit(1);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = resolve(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(docs).map((file) => relative(docs, file).split(sep).join('/'));
const pages = files.filter((file) => file.endsWith('.md'));

/** Relative links inside docs stay on the wiki; everything else goes to GitHub. */
function rewriter(page: string) {
  return (href: string): string => {
    if (/^[a-z]+:/i.test(href) || href.startsWith('#') || href.startsWith('/')) return href;
    const [path = '', anchor] = href.split('#');
    const hash = anchor ? `#${anchor}` : '';
    const target = posix.normalize(posix.join(posix.dirname(page), path));
    if (target.startsWith('..')) {
      const repoPath = posix.normalize(posix.join('terminal/docs', posix.dirname(page), path));
      return `${REPO}/blob/main/${repoPath}${hash}`;
    }
    let local = target.endsWith('/') || path === '' ? `${target.replace(/\/$/, '')}/README.md` : target;
    if (path === '') local = page;
    const extension = posix.extname(local);
    if (extension === '.md') return `${posix.relative(posix.dirname(page), local.replace(/\.md$/, '.html')) || posix.basename(local.replace(/\.md$/, '.html'))}${hash}`;
    if (COPIED.has(extension)) return href;
    return `${REPO}/blob/main/terminal/docs/${local}${hash}`;
  };
}

const CSS = `
:root{--bg:#0b0d12;--surface:#12151d;--fg:#e8ebf2;--muted:#9aa3b5;--border:#262b38;--accent:#7cf0c4;--link:#8ecbff;--code:#171b25;--focus:#7cf0c4}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#fbfbfa;--surface:#ffffff;--fg:#16181d;--muted:#555c6b;--border:#dfe2e8;--accent:#0b8f66;--link:#1a5fb4;--code:#f2f3f5;--focus:#0b8f66}}
:root[data-theme="dark"]{--bg:#0b0d12;--surface:#12151d;--fg:#e8ebf2;--muted:#9aa3b5;--border:#262b38;--accent:#7cf0c4;--link:#8ecbff;--code:#171b25;--focus:#7cf0c4}
:root[data-theme="light"]{--bg:#fbfbfa;--surface:#ffffff;--fg:#16181d;--muted:#555c6b;--border:#dfe2e8;--accent:#0b8f66;--link:#1a5fb4;--code:#f2f3f5;--focus:#0b8f66}
*{box-sizing:border-box}
html{font-size:clamp(16px,0.85rem + 0.35vw,26px);-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:1rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--link);text-underline-offset:.15em}
a:focus-visible,button:focus-visible,.table-wrap:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:4px}
.bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:.25rem .5rem;align-items:center;padding:.4rem 16px;background:var(--surface);border-bottom:1px solid var(--border)}
.bar a,.bar button{display:inline-flex;align-items:center;min-height:44px;padding:0 .7rem;border-radius:.6rem;text-decoration:none;color:var(--fg);font:inherit;font-size:.9rem;background:none;border:1px solid transparent;cursor:pointer}
.bar a:hover,.bar button:hover{border-color:var(--border)}
.bar .home{font-weight:700;color:var(--accent)}
.bar .spacer{flex:1}
main{max-width:min(100%,50rem);margin:0 auto;padding:1.5rem 16px 4rem}
h1{font-size:2rem;line-height:1.2;margin:.5rem 0 1rem}
h2{font-size:1.4rem;margin:2rem 0 .6rem;padding-top:.5rem;border-top:1px solid var(--border)}
h3{font-size:1.15rem;margin:1.5rem 0 .4rem}
h4,h5,h6{font-size:1rem;margin:1.2rem 0 .3rem}
.anchor{float:left;margin-left:-1.1em;padding-right:.2em;color:var(--muted);text-decoration:none;opacity:0}
h1:hover .anchor,h2:hover .anchor,h3:hover .anchor,h4:hover .anchor{opacity:1}
p,li{max-width:72ch;overflow-wrap:anywhere}
ul,ol{padding-left:1.4rem}
li{margin:.2rem 0}
blockquote{margin:1rem 0;padding:.4rem 1rem;border-left:3px solid var(--accent);background:var(--surface);border-radius:0 .5rem .5rem 0}
code{font:.9em/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--code);padding:.1em .35em;border-radius:.3em;overflow-wrap:anywhere}
pre{overflow-x:auto;background:var(--code);padding:.8rem 1rem;border-radius:.6rem;border:1px solid var(--border)}
pre code{background:none;padding:0}
.table-wrap{overflow-x:auto;margin:1rem 0;border:1px solid var(--border);border-radius:.6rem}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{text-align:left;vertical-align:top;padding:.5rem .7rem;border-bottom:1px solid var(--border)}
th{background:var(--surface)}
td:last-child{white-space:nowrap}
tr:last-child td{border-bottom:0}
hr{border:0;border-top:1px solid var(--border);margin:2rem 0}
.meta{color:var(--muted);font-size:.85rem;margin-top:3rem;border-top:1px solid var(--border);padding-top:1rem}
@media (max-width:600px){h1{font-size:1.6rem}.bar a,.bar button{padding:0 .5rem}}
`;

function page(file: string, markdown: string): string {
  const rendered = renderMarkdown(markdown, { rewriteLink: rewriter(file) });
  const depth = file.split('/').length - 1;
  const up = depth === 0 ? '' : '../'.repeat(depth);
  const title = rendered.title || file;
  const raw = posix.basename(file);
  const source = `${REPO}/blob/main/terminal/docs/${file}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Fresh Terminal wiki</title>
<meta name="description" content="Fresh Terminal docs wiki: ${escapeHtml(title)}">
<link rel="alternate" type="text/markdown" href="${escapeHtml(raw)}">
<style>${CSS}</style>
<script>try{var t=localStorage.getItem('ft-wiki-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<nav class="bar" aria-label="Wiki">
<a class="home" href="${up}index.html">Fresh Terminal wiki</a>
<a href="${up}canon/README.html">Canon</a>
<a href="${up}canon/state.html">State</a>
<a href="${up}canon/decisions.html">Decisions</a>
<a href="${up}llms.txt">llms.txt</a>
<span class="spacer"></span>
<a href="${escapeHtml(raw)}">Markdown</a>
<a href="${escapeHtml(source)}" rel="noreferrer">GitHub</a>
<a href="${up}../">App</a>
<button type="button" id="theme" aria-label="Switch light or dark">Theme</button>
</nav>
<main>
${rendered.html}
<p class="meta">Source: <a href="${escapeHtml(source)}" rel="noreferrer">terminal/docs/${escapeHtml(file)}</a>. This page is rendered from Markdown on every deploy; the Markdown is the source of truth.</p>
</main>
<script>document.getElementById('theme').addEventListener('click',function(){var r=document.documentElement;var dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;r.dataset.theme=dark?'light':'dark';try{localStorage.setItem('ft-wiki-theme',r.dataset.theme)}catch(e){}});</script>
</body>
</html>
`;
}

let count = 0;
for (const file of files) {
  const source = resolve(docs, file);
  const extension = posix.extname(file);
  if (!COPIED.has(extension)) continue;
  const target = resolve(out, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  if (extension === '.md') {
    const html = page(file, readFileSync(source, 'utf8'));
    writeFileSync(target.replace(/\.md$/, '.html'), html);
    count += 1;
  }
}
// The index is the README.
copyFileSync(resolve(out, 'README.html'), resolve(out, 'index.html'));
copyFileSync(resolve(docs, 'llms.txt'), resolve(dist, 'llms.txt'));

// Every page should be listed in the index.
const index = readFileSync(resolve(docs, 'README.md'), 'utf8');
const unlisted = pages.filter((file) => file !== 'README.md' && !index.includes(`(${file})`));
if (unlisted.length > 0) {
  console.warn(`build-wiki: not listed in docs/README.md: ${unlisted.join(', ')}`);
}
console.log(`build-wiki: rendered ${count} pages into app/dist/wiki`);
