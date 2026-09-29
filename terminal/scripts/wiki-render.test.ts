import { describe, expect, it } from 'vitest';
import { renderMarkdown, slug } from './wiki-render';

describe('wiki renderer', () => {
  it('renders headings with GitHub anchors, tables, nested lists, quotes and code', () => {
    const md = [
      '# Title',
      '',
      '## 4. Decisions: one per file',
      '',
      '| Page | Updated |',
      '| --- | --- |',
      '| [a](a.md) | 2026-09-29 |',
      '',
      '- one',
      '  - nested `code`',
      '- two **bold**',
      '',
      '> quoted',
      '',
      '```sh',
      'pnpm i <x>',
      '```',
    ].join('\n');
    const out = renderMarkdown(md, { rewriteLink: (href) => href.replace(/\.md$/, '.html') });
    expect(out.title).toBe('Title');
    expect(out.html).toContain('<h2 id="4-decisions-one-per-file">');
    expect(out.html).toContain('<a href="a.html">a</a>');
    expect(out.html).toContain('<ul><li>one<ul><li>nested <code>code</code></li></ul></li><li>two <strong>bold</strong></li></ul>');
    expect(out.html).toContain('<blockquote><p>quoted</p></blockquote>');
    expect(out.html).toContain('<pre data-lang="sh"><code>pnpm i &lt;x&gt;</code></pre>');
  });

  it('escapes HTML and refuses script links', () => {
    const out = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1))');
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('href="#"');
  });

  it('matches GitHub slugs for punctuation', () => {
    expect(slug("3. Prompts: Justin's build prompts, verbatim")).toBe('3-prompts-justins-build-prompts-verbatim');
  });
});
