/**
 * Hub data, built from the docs at build time (2026-09-29, C-088). Pure
 * functions so they can be tested; scripts/build-hub.ts writes the files.
 * Everything here comes from the repo's Markdown: prompts (verbatim), the
 * Canon's decisions, decision records, changelogs, the wiki index and the plan.
 */
import { posix } from 'node:path';
import { renderMarkdown } from './wiki-render.ts';
import type { DecisionItem, PromptItem, RecordItem, SecretState, WikiPage } from '../shared/src/hub/types.ts';

export type { HubItem } from '../shared/src/hub/types.ts';

/** Relative links in a doc become wiki links (/wiki/...html); absolute links stay. */
export function wikiLinker(page: string) {
  return (href: string): string => {
    if (/^[a-z]+:/i.test(href) || href.startsWith('#') || href.startsWith('/')) return href;
    const [path = '', anchor] = href.split('#');
    const hash = anchor ? `#${anchor}` : '';
    const target = posix.normalize(posix.join(posix.dirname(page), path));
    if (target.startsWith('..')) return `https://github.com/imagine-os/fresh-terminal/blob/main/${posix.normalize(posix.join('terminal/docs', target))}${hash}`;
    return `/wiki/${target.replace(/\.md$/, '.html')}${hash}`;
  };
}

function plain(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parsePrompts(markdown: string): PromptItem[] {
  const out: PromptItem[] = [];
  const sections = markdown.split(/\n(?=## \d+\. )/);
  const link = wikiLinker('canon/prompts.md');
  for (const section of sections) {
    const head = /^## (\d+)\. (.+)$/m.exec(section);
    if (!head) continue;
    const lines = section.split('\n').slice(1);
    const quote: string[] = [];
    const extra: string[] = [];
    let happened = '';
    let message: string | null = null;
    let ts: string | null = null;
    for (const line of lines) {
      if (line.startsWith('>')) {
        quote.push(line.replace(/^> ?/, ''));
        continue;
      }
      const what = /^\*\*What happened:\*\*\s*(.*)$/.exec(line);
      if (what) {
        happened = what[1] ?? '';
        continue;
      }
      const msg = /^\[Message link\]\(([^)]+)\)(?:\s*·\s*ts\s*([\d.]+))?/.exec(line);
      if (msg) {
        message = msg[1] ?? null;
        ts = msg[2] ?? null;
        continue;
      }
      if (line.trim() && !happened) extra.push(line.trim());
      else if (line.trim() && happened && !message) happened += `\n${line}`;
    }
    const heading = head[2] ?? '';
    const text = quote.join('\n').trim();
    out.push({
      kind: 'prompt',
      n: Number(head[1]),
      when: heading.replace(/\s*·\s*channel post\s*$/, ''),
      channel: /channel post/.test(heading),
      text,
      extra: extra.join(' '),
      happened_html: renderMarkdown(happened, { rewriteLink: link }).html,
      link: message,
      ts,
      search: plain(`${head[1]} ${heading} ${text} ${happened} ${extra.join(' ')}`),
    });
  }
  return out;
}

export function parseCanonDecisions(markdown: string): DecisionItem[] {
  const out: DecisionItem[] = [];
  const link = wikiLinker('canon/decisions.md');
  let section = '';
  const lines = markdown.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      section = heading[1] ?? '';
      continue;
    }
    const entry = /^\*\*(C-\d{3}[a-z]?) · ([^·]+?) · (.+)\*\*\s*$/.exec(line);
    if (!entry) continue;
    const body: string[] = [];
    let next = index + 1;
    while (next < lines.length && !/^\*\*C-\d{3}[a-z]? ·/.test(lines[next] ?? '') && !/^## /.test(lines[next] ?? '')) {
      body.push(lines[next] ?? '');
      next += 1;
    }
    const text = body.join('\n').trim();
    const status = /^- Status:\s*(.+)$/m.exec(text)?.[1] ?? '';
    out.push({
      kind: 'canon',
      id: entry[1] ?? '',
      date: (entry[2] ?? '').trim(),
      title: entry[3] ?? '',
      section,
      status: status.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 160),
      html: renderMarkdown(text, { rewriteLink: link }).html,
      search: plain(`${entry[1]} ${entry[3]} ${section} ${text}`),
    });
  }
  return out;
}

export function parseRecord(kind: 'decision' | 'changelog', path: string, markdown: string): RecordItem {
  const title = /^# (.+)$/m.exec(markdown)?.[1] ?? path;
  const date = /^Date:\s*([0-9-]+)/m.exec(markdown)?.[1] ?? '';
  const id = posix.basename(path).replace(/\.md$/, '');
  const rendered = renderMarkdown(markdown.replace(/^# .+\n/, ''), { rewriteLink: wikiLinker(path) });
  return { kind, id, title, date, path, html: rendered.html, search: plain(`${id} ${title} ${markdown}`) };
}

/** The wiki index: every row of docs/README.md's tables that links a page. */
export function parseWikiIndex(markdown: string): WikiPage[] {
  const out: WikiPage[] = [];
  let group = '';
  for (const line of markdown.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) group = (heading[1] ?? '').replace(/^\d+\.\s*/, '');
    const row = /^\|\s*\[([^\]]+)\]\(([^)]+\.md)\)\s*\|\s*([^|]*)\|/.exec(line);
    if (!row) continue;
    const path = row[2] ?? '';
    out.push({ path, href: `/wiki/${path.replace(/\.md$/, '.html')}`, title: row[1] ?? path, about: (row[3] ?? '').trim(), group });
  }
  return out;
}

/** Names the product uses. Values are never read into the hub; only set / missing. */
export const SECRET_NAMES: Array<Omit<SecretState, 'state'>> = [
  { name: 'CLOUDFLARE_API_TOKEN', where: 'GitHub Actions secret', for: 'Deploys both Workers, D1 migrations, DNS' },
  { name: 'CLOUDFLARE_ACCOUNT_ID', where: 'GitHub Actions secret', for: 'Which Cloudflare account' },
  { name: 'OPENROUTER_API_KEY', where: 'GitHub Actions secret', for: 'Free usage: the router key for models' },
  { name: 'CLERK_PUBLISHABLE_KEY', where: 'GitHub Actions secret', for: 'Sign-in in the app and the hub (public by design)' },
  { name: 'CLERK_SECRET_KEY', where: 'GitHub Actions secret', for: 'Router: sessions, admin email check, user lookup' },
  { name: 'ADMIN_EMAILS', where: 'GitHub Actions secret', for: 'Optional: hub admins by verified email (kept out of the public repo)' },
  { name: 'CLERK_WEBHOOK_SIGNING_SECRET', where: 'GitHub Actions secret', for: 'Clerk Billing refill plans credit the ledger (C-093). Not wired yet' },
  { name: 'STRIPE_SECRET_KEY', where: 'GitHub Actions secret', for: 'Top up / add payment (Stripe Checkout). Not wired yet' },
  { name: 'STRIPE_WEBHOOK_SECRET', where: 'GitHub Actions secret', for: 'Credits a paid top-up (Stripe webhook). Not wired yet' },
  { name: 'OPENAI_API_KEY', where: 'GitHub Actions secret', for: 'Optional: spoken replies (Justin: not needed)' },
  { name: 'GOOGLE_API_KEY', where: 'GitHub Actions secret', for: 'Optional: Gemini Live voice' },
  { name: 'SPACETIMEDB_TOKEN', where: 'GitHub Actions secret', for: 'Publishing the SpacetimeDB module' },
];

export function secretStates(found: Record<string, boolean> | null): SecretState[] {
  return SECRET_NAMES.map((secret) => ({ ...secret, state: found === null || !(secret.name in found) ? 'unknown' : found[secret.name] ? 'set' : 'missing' }));
}
