import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCanonDecisions, parsePrompts, parseRecord, parseWikiIndex, secretStates, wikiLinker } from './hub-data';

const docs = resolve(__dirname, '../docs');
const read = (path: string) => readFileSync(resolve(docs, path), 'utf8');

describe('hub data from the real docs', () => {
  it('reads every prompt verbatim with its reply summary and Slack link', () => {
    const markdown = read('canon/prompts.md');
    const prompts = parsePrompts(markdown);
    const headings = markdown.match(/^## \d+\. /gm) ?? [];
    expect(prompts.length).toBe(headings.length);
    const first = prompts[0];
    expect(first?.n).toBe(1);
    expect(first?.text.startsWith('@Claude Take a look at /between-gigs on github please.')).toBe(true);
    expect(first?.text).toContain('Lets talk this through please.');
    expect(first?.happened_html).toContain('Started the whole topic');
    expect(first?.link).toMatch(/^https:\/\/aluzinaworkspace\.slack\.com\/archives\//);
    expect(prompts.filter((prompt) => prompt.channel).length).toBeGreaterThanOrEqual(2);
    // Every prompt has its words and a link back.
    for (const prompt of prompts) {
      expect(prompt.text.length, `prompt ${prompt.n}`).toBeGreaterThan(0);
      expect(prompt.link, `prompt ${prompt.n}`).toBeTruthy();
    }
    // No key-shaped strings in what the hub serves.
    expect(JSON.stringify(prompts)).not.toMatch(/sk-or-v1-[0-9a-f]{20}|sk_(live|test)_[A-Za-z0-9]{20}/);
  });

  it('reads the Canon entries in order, with sections and status', () => {
    const canon = parseCanonDecisions(read('canon/decisions.md'));
    expect(canon[0]?.id).toBe('C-001');
    expect(canon.length).toBeGreaterThan(80);
    expect(canon.every((entry) => /^C-\d{3}[a-z]?$/.test(entry.id) && entry.title.length > 0)).toBe(true);
    expect(canon.some((entry) => entry.status.length > 0)).toBe(true);
  });

  it('reads decision records and changelogs, and the wiki index', () => {
    for (const folder of ['decisions', 'changelog'] as const) {
      for (const name of readdirSync(resolve(docs, folder)).filter((file) => file.endsWith('.md'))) {
        const record = parseRecord(folder === 'decisions' ? 'decision' : 'changelog', `${folder}/${name}`, read(`${folder}/${name}`));
        expect(record.title.length, name).toBeGreaterThan(0);
      }
    }
    const pages = parseWikiIndex(read('README.md'));
    expect(pages.find((page) => page.path === 'canon/prompts.md')?.href).toBe('/wiki/canon/prompts.html');
  });

  it('links docs into the wiki and marks secrets without values', () => {
    expect(wikiLinker('canon/prompts.md')('vision.md#x')).toBe('/wiki/canon/vision.html#x');
    expect(wikiLinker('canon/prompts.md')('../../router/src/app.ts')).toBe('https://github.com/imagine-os/fresh-terminal/blob/main/terminal/router/src/app.ts');
    const states = secretStates({ CLERK_SECRET_KEY: true, STRIPE_SECRET_KEY: false });
    expect(states.find((s) => s.name === 'CLERK_SECRET_KEY')?.state).toBe('set');
    expect(states.find((s) => s.name === 'STRIPE_SECRET_KEY')?.state).toBe('missing');
    expect(states.find((s) => s.name === 'OPENROUTER_API_KEY')?.state).toBe('unknown');
    expect(secretStates(null).every((s) => s.state === 'unknown')).toBe(true);
  });
});

describe('hub card pictures (C-104)', () => {
  it('shoots site paths, reuses canvas thumbs, and skips external links or preview: false', async () => {
    const { previewSource } = await import('./hub-thumbs');
    expect(previewSource({ href: '/canvas' })).toEqual({ kind: 'page', path: '/canvas' });
    expect(previewSource({ href: '/pages/koi.html', preview: 'canvas:koi-pond' })).toEqual({ kind: 'canvas', id: 'koi-pond' });
    expect(previewSource({ href: '#credits', preview: '/hub/?sample=1#credits' })).toEqual({ kind: 'page', path: '/hub/?sample=1#credits' });
    expect(previewSource({ href: 'https://github.com/imagine-os/fresh-terminal' })).toBeNull();
    expect(previewSource({ href: '/', preview: false })).toBeNull();
  });
  it('every hub item has a picture source or an explicit monogram', () => {
    const items = JSON.parse(readFileSync(resolve(__dirname, '../app/hub/items.json'), 'utf8')).items as Array<{ id: string; href: string; preview?: string | false }>;
    for (const item of items) expect(item.preview === false || (item.preview ?? item.href).match(/^(\/|canvas:)/), item.id).toBeTruthy();
  });
  it('monograms are two letters', async () => {
    const { monogram } = await import('../app/src/hub/monogram');
    expect(monogram('Friend credits')).toBe('FC');
    expect(monogram('Replay')).toBe('RE');
    expect(monogram('The terminal')).toBe('TE');
    expect(monogram('Clerk production')).toBe('CP');
  });
});
