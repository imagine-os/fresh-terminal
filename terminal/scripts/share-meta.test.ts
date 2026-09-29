import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHARE, SHARE_PAGES, shareTags, withShareTags } from '../shared/src/share';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../app');

describe('share tags', () => {
  it('are in the raw HTML of every shared page and match shared/src/share.ts (run pnpm share:sync)', () => {
    for (const page of SHARE_PAGES) {
      const html = readFileSync(resolve(app, page.file), 'utf8');
      expect(withShareTags(html, page.path), page.file).toBe(html);
      expect(html).toContain(`<meta property="og:url" content="${SHARE.origin}${page.path}" />`);
      expect(html).toContain(`<meta property="og:image" content="${SHARE.origin}${SHARE.image}" />`);
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    }
  });

  it('use absolute freshterminal.ai URLs and share copy that differs from the card line', () => {
    const block = shareTags('/pricing');
    expect(block).toContain('content="https://freshterminal.ai/pricing"');
    expect(block).not.toMatch(/content="\/(?!\/)/);
    expect(SHARE.title).not.toContain(SHARE.imageAlt.replace('Fresh Terminal: ', ''));
    expect(SHARE.description).not.toContain('A terminal that adapts to you');
  });

  it('inserts the block after the viewport tag when a page has none', () => {
    const html = '<head>\n  <meta name="viewport" content="width=device-width" />\n  <title>x</title>\n</head>';
    const next = withShareTags(html, '/faq');
    expect(next).toContain('  <!-- share:start');
    expect(withShareTags(next, '/faq')).toBe(next);
  });

  it('points at a 1200x630 PNG under 1 MB', () => {
    const file = resolve(app, 'public', SHARE.image.slice(1));
    expect(existsSync(file)).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(SHARE.imageWidth);
    expect(bytes.readUInt32BE(20)).toBe(SHARE.imageHeight);
    expect(statSync(file).size).toBeLessThan(1_000_000);
  });
});
