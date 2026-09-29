// Normalises a vendor SVG into our icon-only colour source, app/public/brand/<slug>/<slug>.svg.
// Run from terminal/:
//   node scripts/brand-crop.mjs --in <downloaded.svg> --slug <slug> --title "<Vendor>" [--select <css>] [--right <n>] [--drop-subpath <d-fragment>] [--pad 0.08]
//
// What it does (in a real browser, so transforms, classes, <style> and Inkscape files resolve the same way they render):
//   - keeps the shapes matched by --select (default: every path, rect, circle, ellipse, polygon), optionally only those whose
//     right edge sits at or left of --right (in the source's own units) — that is how an icon is cut out of a wordmark logo;
//   - bakes each shape's transform into a matrix in the root user space and writes its computed fill as a hex colour
//     (gradient fills keep their url(#id) and the gradient element is copied along);
//   - drops background rectangles that cover the whole canvas, <style>, <title>, editor metadata and clip paths;
//   - sets a square viewBox around the kept shapes with a small pad, so the mark centres in a tile.
// The output stays the vendor's mark in the vendor's colours; brand-variants.mjs then derives mono/light/dark/wide/stacked from it.
// Nothing here draws or edits a mark by hand (skills/logos-and-icons/SKILL.md §1, §3).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
const input = arg('--in');
const slug = arg('--slug');
const title = arg('--title', slug);
const select = arg('--select', 'path, rect, circle, ellipse, polygon');
const right = arg('--right') ? Number(arg('--right')) : null;
const dropSubpath = arg('--drop-subpath', null);
const pad = Number(arg('--pad', '0.08'));
if (!input || !slug) { console.error('usage: --in <svg> --slug <slug> --title <name> [--select css] [--right n] [--drop-subpath d] [--pad 0.08]'); process.exit(2); }

let source = readFileSync(input, 'utf8');
if (dropSubpath) source = source.split(dropSubpath).join('');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, colorScheme: 'light' });
await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${source}</body></html>`);
const result = await page.evaluate(({ select, right }) => {
  const root = document.querySelector('svg');
  const rootCTM = root.getScreenCTM().inverse();
  const vb = root.viewBox.baseVal;
  const canvas = vb && vb.width ? { w: vb.width, h: vb.height, x: vb.x, y: vb.y } : { w: root.width.baseVal.value, h: root.height.baseVal.value, x: 0, y: 0 };
  const toHex = (rgb) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(rgb);
    if (!m) return null;
    const hex = '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
    return { hex, alpha: m[4] === undefined ? 1 : Number(m[4]) };
  };
  const shapes = [];
  const defs = new Map();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of root.querySelectorAll(select)) {
    if (el.closest('defs, clipPath, mask, pattern, symbol')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const m = rootCTM.multiply(el.getScreenCTM());
    const b = el.getBBox();
    const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const bx0 = Math.min(...corners.map((c) => c[0])), bx1 = Math.max(...corners.map((c) => c[0]));
    const by0 = Math.min(...corners.map((c) => c[1])), by1 = Math.max(...corners.map((c) => c[1]));
    if (right !== null && bx1 > right + 1e-6) continue;
    // A rectangle covering (nearly) the whole canvas is a background tile, not part of the mark.
    if (el.tagName.toLowerCase() === 'rect' && bx1 - bx0 >= canvas.w * 0.98 && by1 - by0 >= canvas.h * 0.98) continue;
    let fill = cs.fill;
    let alpha = 1;
    if (fill.startsWith('url(')) {
      const id = /url\("?#([^")]+)"?\)/.exec(fill)?.[1];
      const def = id ? document.getElementById(id) : null;
      if (def) {
        defs.set(id, def.outerHTML);
        const href = def.getAttribute('xlink:href') || def.getAttribute('href');
        if (href && href.startsWith('#')) { const base = document.getElementById(href.slice(1)); if (base) defs.set(href.slice(1), base.outerHTML); }
        fill = `url(#${id})`;
      } else fill = 'currentColor';
    } else if (fill === 'none') {
      fill = 'none';
    } else {
      const c = toHex(fill); fill = c ? c.hex : 'currentColor'; alpha = c ? c.alpha : 1;
    }
    const opacity = Number(cs.fillOpacity) * Number(cs.opacity) * alpha;
    if (fill === 'none' && cs.stroke === 'none') continue;
    const attrs = {};
    const tag = el.tagName.toLowerCase();
    for (const name of tag === 'path' ? ['d'] : tag === 'rect' ? ['x', 'y', 'width', 'height', 'rx', 'ry'] : tag === 'circle' ? ['cx', 'cy', 'r'] : tag === 'ellipse' ? ['cx', 'cy', 'rx', 'ry'] : ['points']) {
      if (el.hasAttribute(name)) attrs[name] = el.getAttribute(name);
    }
    const identity = Math.abs(m.a - 1) < 1e-9 && Math.abs(m.d - 1) < 1e-9 && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && Math.abs(m.e) < 1e-9 && Math.abs(m.f) < 1e-9;
    shapes.push({ tag, attrs, fill, fillRule: cs.fillRule === 'evenodd' ? 'evenodd' : null, opacity: opacity < 0.999 ? Number(opacity.toFixed(3)) : null,
      stroke: cs.stroke !== 'none' ? (toHex(cs.stroke)?.hex ?? null) : null, strokeWidth: cs.stroke !== 'none' ? cs.strokeWidth : null,
      transform: identity ? null : [m.a, m.b, m.c, m.d, m.e, m.f].map((n) => Number(n.toFixed(4))) });
    minX = Math.min(minX, bx0); minY = Math.min(minY, by0); maxX = Math.max(maxX, bx1); maxY = Math.max(maxY, by1);
  }
  return { shapes, defs: [...defs.values()], box: { minX, minY, maxX, maxY }, canvas };
}, { select, right });
await browser.close();

if (!result.shapes.length) { console.error('brand-crop: no shapes kept'); process.exit(1); }
const { box } = result;
const w = box.maxX - box.minX, h = box.maxY - box.minY;
const side = Math.max(w, h) * (1 + pad * 2);
const x = box.minX - (side - w) / 2, y = box.minY - (side - h) / 2;
const r = (n) => Number(n.toFixed(3)).toString();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const shapeMarkup = result.shapes.map((s) => {
  const parts = [`fill="${s.fill}"`];
  if (s.fillRule) parts.push(`fill-rule="${s.fillRule}"`);
  if (s.opacity !== null) parts.push(`fill-opacity="${s.opacity}"`);
  if (s.stroke) parts.push(`stroke="${s.stroke}"`, `stroke-width="${s.strokeWidth}"`);
  for (const [k, v] of Object.entries(s.attrs)) parts.push(`${k}="${v}"`);
  if (s.transform) parts.push(`transform="matrix(${s.transform.join(' ')})"`);
  return `<${s.tag} ${parts.join(' ')}/>`;
}).join('');
const defsMarkup = result.defs.length ? `<defs>${result.defs.join('').replace(/xlink:href=/g, 'href=')}</defs>` : '';
const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(x)} ${r(y)} ${r(side)} ${r(side)}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${defsMarkup}${shapeMarkup}</svg>\n`;
mkdirSync(`app/public/brand/${slug}`, { recursive: true });
writeFileSync(`app/public/brand/${slug}/${slug}.svg`, out);
console.log(`brand-crop: ${slug} ← ${input}: ${result.shapes.length} shapes, ${result.defs.length} defs, viewBox ${r(x)} ${r(y)} ${r(side)} ${r(side)}, ${out.length} bytes`);
