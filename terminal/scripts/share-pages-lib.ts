/**
 * Share previews for every public page (Justin, 2026-09-29: "by default any page
 * needs share preview that updates each publish"). Pure helpers, tested in
 * share-pages.test.ts; scripts/share-pages.ts runs them over app/dist on every build.
 */
import { SHARE } from '../shared/src/share.ts';

export interface SharePage {
  /** Public path on freshterminal.ai, e.g. "/pricing" or "/wiki/canon/state.html". */
  path: string;
  title: string;
  description: string;
  /** Lines drawn on the card (the card text differs from the share title on the brand pages). */
  /** `lines` is the title (re-wrapped to fit unless `fixed`); the brand card keeps its two set lines. */
  card: { kicker: string | null; lines: string[]; accentLast: boolean; body: string | null; prompt: boolean; fixed?: boolean };
  image: string;
  private: boolean;
}

const decode = (text: string) =>
  text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const clean = (text: string) => decode(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function readMeta(html: string): { title: string | null; description: string | null; h1: string | null; firstParagraph: string | null } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const description = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1];
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const body = html.split(/<body[^>]*>/i)[1] ?? '';
  const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ''))?.[1];
  return { title: title ? clean(title) : null, description: description ? clean(description) : null, h1: h1 ? clean(h1) : null, firstParagraph: p ? clean(p) : null };
}

/** "/wiki/canon/state.html" → "wiki-canon-state"; "/" → "root". */
export function slugFor(path: string): string {
  const slug = path.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return slug || 'root';
}

/** Greedy word wrap to at most `max` lines of `width` characters; the last line gets an ellipsis if text is cut. */
export function wrap(text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const raw of words) {
    const word = raw.length > width ? `${raw.slice(0, width - 1)}…` : raw;
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === max) {
      const last = lines[max - 1] ?? '';
      lines[max - 1] = `${last.length >= width ? last.slice(0, width - 1) : last}…`;
      return lines;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The 1200×630 card as SVG (rendered to PNG by resvg in share-pages.ts). Void: black, one green, the >_ mark. */
export function cardSvg(page: SharePage): string {
  const { kicker, accentLast, body, prompt } = page.card;
  // Monospace: a character is 0.6 em wide, so the title fits 1040 px exactly. Big when it fits in two lines.
  const text = page.card.lines.join(' ');
  const big = page.card.fixed ? page.card.lines : wrap(text, Math.floor(1040 / (0.6 * 76)), 2);
  const fitsBig = page.card.fixed || !big[big.length - 1]?.endsWith('…');
  const size = fitsBig ? 76 : 60;
  const lines = page.card.fixed ? page.card.lines : fitsBig ? big : wrap(text, Math.floor(1040 / (0.6 * 60)), 3);
  const lead = Math.round(size * 1.12);
  const top = kicker ? 300 : 250;
  const titleSvg = lines
    .map((line, i) => `<text x="80" y="${top + i * lead}" font-size="${size}" font-weight="700" fill="${accentLast && i === lines.length - 1 ? '#33ff66' : '#eaf5ec'}">${esc(line)}</text>`)
    .join('');
  const bodyLines = body ? wrap(body, 60, lines.length >= 3 ? 1 : 2) : [];
  const bodyTop = top + (lines.length - 1) * lead + 62;
  const bodySvg = bodyLines.map((line, i) => `<text x="80" y="${bodyTop + i * 40}" font-size="28" fill="#a3b8a8">${esc(line)}</text>`).join('');
  const where = `freshterminal.ai${page.path === '/' ? '' : page.path.replace(/\.html$/, '')}`;
  const bottom = prompt
    ? `<rect x="80" y="486" width="1040" height="80" fill="none" stroke="#33ff66" stroke-width="3"/><rect x="108" y="508" width="18" height="36" fill="#33ff66"/><text x="148" y="538" font-size="30" fill="#7d9684">Type here.</text><rect x="1050" y="498" width="56" height="56" fill="#33ff66"/><text x="1078" y="537" font-size="30" font-weight="700" text-anchor="middle" fill="#000">→</text>`
    : `<text x="80" y="574" font-size="26" fill="#7d9684">${esc(where.length > 64 ? `${where.slice(0, 63)}…` : where)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="DejaVu Sans Mono">
<rect width="1200" height="630" fill="#000"/><rect x="1" y="1" width="1198" height="628" fill="none" stroke="#123a1c" stroke-width="2"/>
<rect x="80" y="64" width="64" height="64" fill="#33ff66"/><path d="M96 84l14 12-14 12" stroke="#000" stroke-width="6.4" fill="none" stroke-linecap="square"/><path d="M114 108h16" stroke="#000" stroke-width="6.4" stroke-linecap="square"/>
<text x="168" y="108" font-size="38" font-weight="700" fill="#eaf5ec">Fresh Terminal</text>
${kicker ? `<text x="80" y="206" font-size="26" font-weight="700" fill="#33ff66" letter-spacing="2">${esc(kicker.toUpperCase())}</text>` : ''}
${titleSvg}${bodySvg}${bottom}
</svg>`;
}

/** The tags for one page. Every value is absolute on freshterminal.ai. */
export function shareBlock(page: SharePage): string {
  const url = `${SHARE.origin}${page.path}`;
  const image = `${SHARE.origin}${page.image}`;
  const alt = `${SHARE.siteName}: ${page.card.lines.join(' ')}`;
  return [
    `<!-- share-pages:start (generated at build by scripts/share-pages.ts) -->`,
    `<link rel="canonical" href="${esc(url)}">`,
    page.private ? `<meta name="robots" content="noindex, nofollow">` : '',
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(SHARE.siteName)}">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(page.title)}">`,
    `<meta name="twitter:description" content="${esc(page.description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<meta name="theme-color" content="${SHARE.themeColor}">`,
    `<!-- share-pages:end -->`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Drops earlier share tags (source blocks, stray og:/twitter:/canonical/theme-color) and puts the fresh block after the viewport tag. */
export function withShareBlock(html: string, block: string): string {
  let out = html
    .replace(/[ \t]*<!-- share(?:-pages)?:start[\s\S]*?<!-- share(?:-pages)?:end -->\n?/g, '')
    .replace(/[ \t]*<meta\s+(?:property|name)="(?:og:[^"]+|twitter:[^"]+|theme-color)"[^>]*>\n?/gi, '')
    .replace(/[ \t]*<link\s+rel="canonical"[^>]*>\n?/gi, '');
  const viewport = /<meta\s+name="viewport"[^>]*>\n?/i.exec(out);
  if (viewport) {
    const at = viewport.index + viewport[0].length;
    out = `${out.slice(0, at)}${viewport[0].endsWith('\n') ? '' : '\n'}${block}\n${out.slice(at)}`;
  } else {
    out = out.replace(/<head[^>]*>/i, (head) => `${head}\n${block}`);
  }
  return out;
}

/** What a check needs to see in a public page's HTML. */
export function missingTags(html: string): string[] {
  const need: Array<[string, RegExp]> = [
    ['og:title', /<meta property="og:title" content="[^"]+"/],
    ['og:description', /<meta property="og:description" content="[^"]+"/],
    ['og:image', /<meta property="og:image" content="https:\/\/freshterminal\.ai\/[^"]+\.png"/],
    ['og:url', /<meta property="og:url" content="https:\/\/freshterminal\.ai[^"]*"/],
    ['twitter:card', /<meta name="twitter:card" content="summary_large_image"/],
    ['canonical', /<link rel="canonical" href="https:\/\/freshterminal\.ai[^"]*"/],
  ];
  return need.filter(([, pattern]) => !pattern.test(html)).map(([name]) => name);
}
