/**
 * A small Markdown renderer for the docs wiki (no dependencies). It covers
 * what the docs use: headings with GitHub-style anchors, paragraphs, nested
 * lists, tables, blockquotes, fenced code, rules, and inline code, links,
 * bold, italic and strikethrough. Everything is HTML-escaped first.
 */

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** GitHub's heading anchor: lowercase, drop punctuation, spaces to hyphens. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

export interface RenderOptions {
  /** Rewrites a link target (for example `x.md` to `x.html`). */
  rewriteLink?: (href: string) => string;
}

function safeHref(href: string): string {
  const trimmed = href.trim();
  return /^(javascript|data|vbscript):/i.test(trimmed) ? '#' : trimmed;
}

export function renderInline(raw: string, options: RenderOptions = {}): string {
  const codes: string[] = [];
  let text = raw.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  const links: string[] = [];
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const target = options.rewriteLink ? options.rewriteLink(href) : href;
    const external = /^https?:\/\//.test(target);
    links.push(`<a href="${escapeHtml(safeHref(target))}"${external ? ' rel="noreferrer"' : ''}>${renderInline(label, options)}</a>`);
    return `\u0001${links.length - 1}\u0001`;
  });
  text = escapeHtml(text);
  text = text.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/g, (_m, lead: string, url: string) => `${lead}<a href="${url}" rel="noreferrer">${url}</a>`);
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  text = text.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  text = text.replace(/\u0001(\d+)\u0001/g, (_m, index: string) => links[Number(index)] ?? '');
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => codes[Number(index)] ?? '');
  return text;
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function indentOf(line: string): number {
  return (/^\s*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length;
}

function isBlockStart(line: string): boolean {
  return /^(#{1,6})\s/.test(line) || /^```/.test(line) || /^>/.test(line) || /^\|/.test(line) || LIST_ITEM.test(line) || /^(-{3,}|\*{3,})\s*$/.test(line);
}

function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  let inCode = false;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === '`') inCode = !inCode;
    if (char === '\\' && inner[index + 1] === '|') {
      current += '|';
      index += 1;
      continue;
    }
    if (char === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function renderList(lines: string[], start: number, options: RenderOptions): { html: string; next: number } {
  const first = LIST_ITEM.exec(lines[start] ?? '');
  if (!first) return { html: '', next: start + 1 };
  const baseIndent = indentOf(lines[start] ?? '');
  const ordered = /\d/.test(first[2] ?? '');
  const items: string[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const match = LIST_ITEM.exec(line);
    if (!match || indentOf(line) !== baseIndent) break;
    let content = match[3] ?? '';
    let nested = '';
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? '';
      if (next.trim() === '') {
        const after = lines[index + 1] ?? '';
        if (after.trim() !== '' && indentOf(after) > baseIndent) {
          index += 1;
          continue;
        }
        break;
      }
      const indent = indentOf(next);
      if (indent <= baseIndent) break;
      if (LIST_ITEM.test(next)) {
        const sub = renderList(lines, index, options);
        nested += sub.html;
        index = sub.next;
        continue;
      }
      content += ` ${next.trim()}`;
      index += 1;
    }
    items.push(`<li>${renderInline(content, options)}${nested}</li>`);
  }
  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && first[2] && Number.parseInt(first[2], 10) !== 1 ? ` start="${Number.parseInt(first[2], 10)}"` : '';
  return { html: `<${tag}${startAttr}>${items.join('')}</${tag}>`, next: index };
}

export interface Rendered {
  html: string;
  title: string;
  headings: Array<{ level: number; text: string; id: string }>;
}

export function renderMarkdown(markdown: string, options: RenderOptions = {}): Rendered {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const headings: Rendered['headings'] = [];
  const used = new Map<string, number>();
  let title = '';
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || /^\s*<!--.*-->\s*$/.test(line)) {
      index += 1;
      continue;
    }
    const fence = /^```\s*([\w-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index] ?? '')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;
      const lang = fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : '';
      out.push(`<pre${lang}><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const text = heading[2] ?? '';
      let id = slug(text);
      const seen = used.get(id) ?? 0;
      used.set(id, seen + 1);
      if (seen > 0) id = `${id}-${seen}`;
      if (!title && level === 1) title = text.replace(/`/g, '');
      headings.push({ level, text, id });
      out.push(`<h${level} id="${escapeHtml(id)}"><a class="anchor" href="#${escapeHtml(id)}" aria-hidden="true" tabindex="-1">#</a>${renderInline(text, options)}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr>');
      index += 1;
      continue;
    }
    if (/^>/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^>/.test(lines[index] ?? '')) {
        body.push((lines[index] ?? '').replace(/^>\s?/, ''));
        index += 1;
      }
      out.push(`<blockquote>${renderMarkdown(body.join('\n'), options).html}</blockquote>`);
      continue;
    }
    if (/^\|/.test(line) && /^\|?\s*:?-{3,}/.test(lines[index + 1] ?? '')) {
      const header = splitRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && /^\|/.test(lines[index] ?? '')) {
        rows.push(splitRow(lines[index] ?? ''));
        index += 1;
      }
      const head = header.map((cell) => `<th scope="col">${renderInline(cell, options)}</th>`).join('');
      const body = rows.map((row) => `<tr>${header.map((_cell, column) => `<td>${renderInline(row[column] ?? '', options)}</td>`).join('')}</tr>`).join('');
      out.push(`<div class="table-wrap" tabindex="0"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const list = renderList(lines, index, options);
      out.push(list.html);
      index = list.next;
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && (lines[index] ?? '').trim() !== '' && (paragraph.length === 0 || !isBlockStart(lines[index] ?? ''))) {
      paragraph.push((lines[index] ?? '').trim());
      index += 1;
    }
    out.push(`<p>${renderInline(paragraph.join(' '), options)}</p>`);
  }
  return { html: out.join('\n'), title, headings };
}
