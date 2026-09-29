/**
 * What a shared freshterminal.ai link shows (Slack, iMessage, X, LinkedIn).
 * One place for the share copy and the card (Justin, 2026-09-29). The copy is
 * deliberately different from the line on the card image.
 *
 * After changing anything here run `pnpm -C terminal share:sync`: it rewrites
 * the tag block between <!-- share:start --> and <!-- share:end --> in the app's
 * index.html and the sales pages, so the tags are in the raw HTML (no JS needed).
 * scripts/share-meta.test.ts fails when a page is out of date.
 */
export const SHARE = {
  origin: 'https://freshterminal.ai',
  siteName: 'Fresh Terminal',
  title: 'Fresh Terminal — the terminal for everyone',
  description: 'If computers had started smart, the terminal would look like this. Type, and it builds itself around you.',
  /** 1200×630 PNG, source terminal/docs/brand/og-card.html, rendered by scripts/og-card.mjs. */
  image: '/brand/og-1200x630.png',
  imageWidth: 1200,
  imageHeight: 630,
  imageAlt: 'Fresh Terminal: A terminal that adapts to you.',
  themeColor: '#000000',
} as const;

/** Every page that carries the share tags: file (relative to terminal/app) and its public path. */
export const SHARE_PAGES = [
  { file: 'index.html', path: '/' },
  { file: 'public/about.html', path: '/about' },
  { file: 'public/pricing.html', path: '/pricing' },
  { file: 'public/faq.html', path: '/faq' },
] as const;

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The tag block for one page, indented to match the file. */
export function shareTags(path: string, indent = ''): string {
  const url = `${SHARE.origin}${path === '/' ? '/' : path}`;
  const image = `${SHARE.origin}${SHARE.image}`;
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escape(SHARE.siteName)}" />`,
    `<meta property="og:title" content="${escape(SHARE.title)}" />`,
    `<meta property="og:description" content="${escape(SHARE.description)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    `<meta property="og:image" content="${escape(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${SHARE.imageWidth}" />`,
    `<meta property="og:image:height" content="${SHARE.imageHeight}" />`,
    `<meta property="og:image:alt" content="${escape(SHARE.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(SHARE.title)}" />`,
    `<meta name="twitter:description" content="${escape(SHARE.description)}" />`,
    `<meta name="twitter:image" content="${escape(image)}" />`,
    `<meta name="twitter:image:alt" content="${escape(SHARE.imageAlt)}" />`,
    `<meta name="theme-color" content="${SHARE.themeColor}" />`,
  ];
  return [`${indent}<!-- share:start (generated from shared/src/share.ts by pnpm share:sync; do not edit by hand) -->`, ...tags.map((tag) => indent + tag), `${indent}<!-- share:end -->`].join('\n');
}

const BLOCK = /^([ \t]*)<!-- share:start[^\n]*-->[\s\S]*?<!-- share:end -->/m;

/** Replaces the block in an HTML file's text, or inserts it after <meta name="viewport">. */
export function withShareTags(html: string, path: string): string {
  const found = BLOCK.exec(html);
  if (found) return html.replace(BLOCK, shareTags(path, found[1] ?? ''));
  const viewport = /^([ \t]*)<meta name="viewport"[^>]*>\n/m.exec(html);
  if (!viewport) throw new Error('share: no <meta name="viewport"> to insert after');
  const at = viewport.index + viewport[0].length;
  return `${html.slice(0, at)}${shareTags(path, viewport[1] ?? '')}\n${html.slice(at)}`;
}
