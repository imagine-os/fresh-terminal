import { describe, expect, it } from 'vitest';
import { cardSvg, missingTags, readMeta, shareBlock, slugFor, withShareBlock, wrap, type SharePage } from './share-pages-lib';

const page: SharePage = {
  path: '/pages/koi.html',
  title: 'Koi Pond · Fresh Terminal',
  description: 'A photographic garden pond.',
  card: { kicker: 'Page', lines: ['Koi Pond Terminal'], accentLast: false, body: 'A photographic garden pond.', prompt: false },
  image: '/og/pages-koi.png',
  private: false,
};

describe('share previews for every page', () => {
  it('reads a page\'s own title, description, h1 and first paragraph', () => {
    const meta = readMeta('<html><head><title>FreshStack</title><meta name="description" content="The default stack &amp; more"></head><body><style>p{}</style><h1>Fresh<b>Stack</b></h1><p>First <i>words</i>.</p></body></html>');
    expect(meta).toEqual({ title: 'FreshStack', description: 'The default stack & more', h1: 'Fresh Stack', firstParagraph: 'First words .' });
  });

  it('names cards by path', () => {
    expect(slugFor('/')).toBe('root');
    expect(slugFor('/wiki/canon/state.html')).toBe('wiki-canon-state');
    expect(slugFor('/pricing')).toBe('pricing');
  });

  it('wraps and cuts with an ellipsis', () => {
    expect(wrap('one two three', 20, 2)).toEqual(['one two three']);
    expect(wrap('aaaa bbbb cccc dddd', 9, 2)).toEqual(['aaaa bbbb', 'cccc dddd']);
    expect(wrap('aaaa bbbb cccc dddd eeee', 9, 2)).toEqual(['aaaa bbbb', 'cccc ddd…']);
  });

  it('writes absolute tags and replaces any older ones', () => {
    const html = '<head>\n<meta name="viewport" content="x">\n<meta property="og:image" content="/old.png">\n<link rel="canonical" href="/x">\n<title>t</title></head>';
    const next = withShareBlock(html, shareBlock(page));
    expect(next).not.toContain('/old.png');
    expect(next).toContain('<meta property="og:image" content="https://freshterminal.ai/og/pages-koi.png">');
    expect(next).toContain('<link rel="canonical" href="https://freshterminal.ai/pages/koi.html">');
    expect(missingTags(next)).toEqual([]);
    expect(withShareBlock(next, shareBlock(page))).toBe(next);
    expect(missingTags('<head></head>')).toContain('og:image');
  });

  it('marks private pages noindex and keeps the card free of content', () => {
    const block = shareBlock({ ...page, path: '/hub', private: true, title: 'Fresh Terminal', description: 'A private page. Sign in to see it.' });
    expect(block).toContain('noindex');
    expect(cardSvg({ ...page, card: { kicker: 'Private', lines: ['A private page'], accentLast: false, body: 'Sign in to see it.', prompt: false } })).toContain('A private page');
  });
});
