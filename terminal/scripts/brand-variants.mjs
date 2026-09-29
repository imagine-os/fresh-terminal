// Generates the configuration set for every gathered brand mark and writes the
// machine-readable manifest. Run from terminal/: node scripts/brand-variants.mjs
//
// For each app/public/brand/<slug>/<slug>.svg (the official-colour mark from the
// registry) it writes, deterministically:
//   <slug>-mono.svg     currentColor, for chips and any UI that sets the colour
//   <slug>-light.svg    fixed near-black fill, for light backgrounds where currentColor is unavailable (img, email)
//   <slug>-dark.svg     fixed near-white fill, for dark backgrounds
//   <slug>-wide.svg     our lockup: icon + name side by side, currentColor (NOT the vendor's wordmark)
//   <slug>-stacked.svg  our lockup: icon above name, currentColor (NOT the vendor's wordmark)
// Every SVG is transparent. The icon-only configuration is the base file.
// Then app/public/brand/index.json lists slug, name, files and provenance for
// chips, FreshStack cards and the preview page. Names come from docs/brand/registry.md.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = 'app/public/brand';
const registry = readFileSync('docs/brand/registry.md', 'utf8');
const names = new Map();
for (const line of registry.split('\n')) {
  const m = /^\| ([^|]+?) \| `app\/public\/brand\/([a-z0-9]+)\/\2\.svg` \| ([^|]+?) \| ([^|]+?) \| (\d{4}-\d{2}-\d{2}) \|/.exec(line);
  if (m) names.set(m[2], { name: m[1].trim(), source: m[3].trim(), terms: m[4].trim(), checked: m[5] });
}

const LIGHT_FG = '#15181d';
const DARK_FG = '#e8eaed';
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** The mark's own drawing: viewBox plus every shape inside the root, with <title>, <defs> and editor leftovers set aside.
 *  Simple Icons files are one <path d> in a 24×24 box; cropped vendor marks (scripts/brand-crop.mjs) carry their own viewBox,
 *  several shapes, explicit fills and sometimes a gradient in <defs>. Both come through here the same way. */
function parse(svg) {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 24 24';
  const title = /<title>([^<]*)<\/title>/.exec(svg)?.[1] ?? '';
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
  const defs = /<defs>[\s\S]*?<\/defs>/.exec(inner)?.[0] ?? '';
  const body = inner.replace(/<title>[\s\S]*?<\/title>/g, '').replace(/<defs>[\s\S]*?<\/defs>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const shapes = [...body.matchAll(/<(path|rect|circle|ellipse|polygon)\b([^>]*?)\/?>(?:<\/\1>)?/g)].map((m) => {
    const attrs = {};
    for (const a of m[2].matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    return { tag: m[1], attrs };
  });
  const [x, y, w, h] = viewBox.split(/[\s,]+/).map(Number);
  return { viewBox, box: { x, y, w, h }, title, defs, shapes };
}

/** Re-emits the shapes with one fill. `fill` null keeps the vendor's colours (and gradients). */
function draw(mark, fill) {
  return mark.shapes.map(({ tag, attrs }) => {
    const out = { ...attrs };
    delete out.class; delete out.style;
    const own = out.fill ?? null;
    if (fill !== null) {
      if (own !== 'none') out.fill = fill;
      if (out.stroke && out.stroke !== 'none') out.stroke = fill;
    } else if (own === null) {
      out.fill = 'currentColor';
    }
    const order = ['fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'd', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'points', 'transform'];
    const keys = [...order.filter((k) => k in out), ...Object.keys(out).filter((k) => !order.includes(k))];
    return `<${tag} ${keys.map((k) => `${k}="${out[k]}"`).join(' ')}/>`;
  }).join('');
}

function esc(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function single(mark, fill) {
  const defs = fill === null ? mark.defs : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}" role="img" aria-label="${esc(mark.title)}"><title>${esc(mark.title)}</title>${defs}${draw(mark, fill)}</svg>\n`;
}

/** The icon placed at 24 units through a nested <svg>, so any source viewBox lands in the same slot without a transform. */
function placed(mark, x, y, size) {
  const plain = mark.box.x === 0 && mark.box.y === 0 && mark.box.w === 24 && mark.box.h === 24 && x === 0 && y === 0 && size === 24;
  return plain ? draw(mark, 'currentColor') : `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${mark.viewBox}">${draw(mark, 'currentColor')}</svg>`;
}

/** Icon at 24 units plus the name in the house font. Width estimated at 0.66em per character. */
function wide(mark, name) {
  const textWidth = Math.ceil(name.length * 0.66 * 14 + 4);
  const width = 24 + 8 + textWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 24" width="${width}" height="24" role="img" aria-label="${esc(mark.title)}"><title>${esc(mark.title)}</title>${placed(mark, 0, 0, 24)}<text x="32" y="16.4" font-family="${FONT}" font-size="14" font-weight="600" letter-spacing="-0.2" fill="currentColor">${esc(name)}</text></svg>\n`;
}

function stacked(mark, name) {
  const textWidth = Math.ceil(name.length * 0.66 * 11 + 4);
  const width = Math.max(40, textWidth);
  const offset = (width - 24) / 2;
  const iconMarkup = mark.box.x === 0 && mark.box.y === 0 && mark.box.w === 24 && mark.box.h === 24
    ? `<g transform="translate(${offset} 0)">${draw(mark, 'currentColor')}</g>`
    : placed(mark, offset, 0, 24);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 44" width="${width}" height="44" role="img" aria-label="${esc(mark.title)}"><title>${esc(mark.title)}</title>${iconMarkup}<text x="${width / 2}" y="40" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" letter-spacing="-0.1" fill="currentColor">${esc(name)}</text></svg>\n`;
}

/** Relative luminance of a hex colour, for the dark-tile flag. */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [16, 8, 0].map((s) => ((n >> s) & 255) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

const manifest = [];
let written = 0;
for (const slug of readdirSync(root).sort()) {
  const base = join(root, slug, `${slug}.svg`);
  if (!existsSync(base)) continue;
  const svg = readFileSync(base, 'utf8');
  const mark = parse(svg);
  const { title } = mark;
  const meta = names.get(slug) ?? { name: title || slug, source: 'unknown', terms: 'unknown', checked: '' };
  const name = meta.name.replace(/\s*\(.*\)$/, ''); // "X (xAI / Grok)" → "X"
  const colour = /fill="(#[0-9A-Fa-f]{6})"/.exec(svg)?.[1] ?? null;
  const files = {
    colour: `${slug}.svg`,
    mono: `${slug}-mono.svg`,
    light: `${slug}-light.svg`,
    dark: `${slug}-dark.svg`,
    wide: `${slug}-wide.svg`,
    stacked: `${slug}-stacked.svg`,
  };
  writeFileSync(join(root, slug, files.mono), single(mark, 'currentColor'));
  writeFileSync(join(root, slug, files.light), single(mark, LIGHT_FG));
  writeFileSync(join(root, slug, files.dark), single(mark, DARK_FG));
  writeFileSync(join(root, slug, files.wide), wide(mark, name));
  writeFileSync(join(root, slug, files.stacked), stacked(mark, name));
  written += 5;
  manifest.push({
    slug,
    name: meta.name,
    short: name,
    colour,
    /** Official colour marks that are white or near-white need a dark tile behind them on light pages. */
    needs_dark_tile: colour !== null && luminance(colour) > 0.6,
    files,
    lockups_are_ours: true,
    source: meta.source,
    terms: meta.terms,
    checked: meta.checked,
  });
}
// Our own mark (the `product` entry, sales site pass 2026-09-29) is hand-made; keep it across regenerations.
const previous = existsSync(join(root, 'index.json')) ? JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) : {};
writeFileSync(join(root, 'index.json'), JSON.stringify({ version: 'brand.v1', generated: new Date().toISOString().slice(0, 10), note: 'Icon-only marks are the vendors\' (see terms). -wide and -stacked are our own icon+name lockups in the house font, not official wordmarks. -light/-dark are fixed-colour copies for places without currentColor. All files are transparent SVG.', marks: manifest, ...(previous.product ? { product: previous.product } : {}) }, null, 2) + '\n');
console.log(`brand-variants: ${manifest.length} marks, ${written} variant files, index.json written`);
