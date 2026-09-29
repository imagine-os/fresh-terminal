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

function pathsOf(svg) {
  // Simple Icons files: one <path d="…"/> inside a 24x24 viewBox.
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"[^>]*\/>/g)].map((m) => m[1]);
  const title = /<title>([^<]*)<\/title>/.exec(svg)?.[1] ?? '';
  return { paths, title };
}

function icon(paths, fill) {
  return paths.map((d) => `<path fill="${fill}" d="${d}"/>`).join('');
}

function esc(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function single(title, paths, fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${icon(paths, fill)}</svg>\n`;
}

/** Icon at 24 units plus the name in the house font. Width estimated at 0.58em per character. */
function wide(title, name, paths) {
  const textWidth = Math.ceil(name.length * 0.66 * 14 + 4);
  const width = 24 + 8 + textWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 24" width="${width}" height="24" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${icon(paths, 'currentColor')}<text x="32" y="16.4" font-family="${FONT}" font-size="14" font-weight="600" letter-spacing="-0.2" fill="currentColor">${esc(name)}</text></svg>\n`;
}

function stacked(title, name, paths) {
  const textWidth = Math.ceil(name.length * 0.66 * 11 + 4);
  const width = Math.max(40, textWidth);
  const offset = (width - 24) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 44" width="${width}" height="44" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><g transform="translate(${offset} 0)">${icon(paths, 'currentColor')}</g><text x="${width / 2}" y="40" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" letter-spacing="-0.1" fill="currentColor">${esc(name)}</text></svg>\n`;
}

const manifest = [];
let written = 0;
for (const slug of readdirSync(root).sort()) {
  const base = join(root, slug, `${slug}.svg`);
  if (!existsSync(base)) continue;
  const svg = readFileSync(base, 'utf8');
  const { paths, title } = pathsOf(svg);
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
  writeFileSync(join(root, slug, files.mono), single(title, paths, 'currentColor'));
  writeFileSync(join(root, slug, files.light), single(title, paths, LIGHT_FG));
  writeFileSync(join(root, slug, files.dark), single(title, paths, DARK_FG));
  writeFileSync(join(root, slug, files.wide), wide(title, name, paths));
  writeFileSync(join(root, slug, files.stacked), stacked(title, name, paths));
  written += 5;
  manifest.push({
    slug,
    name: meta.name,
    short: name,
    colour,
    /** Official colour marks that are white need a dark tile behind them on light pages. */
    needs_dark_tile: colour !== null && colour.toUpperCase() === '#FFFFFF',
    files,
    lockups_are_ours: true,
    source: meta.source,
    terms: meta.terms,
    checked: meta.checked,
  });
}
writeFileSync(join(root, 'index.json'), JSON.stringify({ version: 'brand.v1', generated: new Date().toISOString().slice(0, 10), note: 'Icon-only marks are the vendors\' (see terms). -wide and -stacked are our own icon+name lockups in the house font, not official wordmarks. -light/-dark are fixed-colour copies for places without currentColor. All files are transparent SVG.', marks: manifest }, null, 2) + '\n');
console.log(`brand-variants: ${manifest.length} marks, ${written} variant files, index.json written`);
