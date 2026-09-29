import { describe, expect, it } from 'vitest';
import type { Line } from '../store/types';
import { DEFAULT_GRAPH, filterTags, layoutGraph, sortTags, tagFacets, tagLinks, tagRows } from './rows';

function line(id: string, box: string, at: number, chips: Array<Record<string, unknown>>, kind: Line['kind'] = 'user'): Line {
  return { id, box_id: box, kind, text: chips.map((chip) => chip.text).join(' '), chips_json: JSON.stringify(chips), component: '', reveal: '', blocks_json: '', created_at: at };
}

const lines: Line[] = [
  line('l1', 'a', 1000, [
    { kind: 'person', text: 'Justin', start: 0, end: 6 },
    { kind: 'date', text: 'tomorrow', value: '2026-09-30', start: 7, end: 15 },
    { kind: 'action', text: 'call', start: 16, end: 20 },
  ]),
  line('l2', 'a', 2000, [
    { kind: 'person', text: 'justin', start: 0, end: 6, source: 'user' },
    { kind: 'action', text: 'call', start: 7, end: 11 },
    { kind: 'list', text: 'apples', start: 12, end: 18, group: 'g1' },
    { kind: 'list', text: 'pears', start: 20, end: 25, group: 'g1' },
  ]),
  line('l3', 'b', 3000, [{ kind: 'org', text: 'Cloudflare', start: 0, end: 10 }]),
  line('r1', 'a', 1500, [{ kind: 'person', text: 'Nobody', start: 0, end: 6 }], 'assistant'),
];

describe('tagRows', () => {
  it('folds the same tag across lines, case-insensitively, and counts once per line', () => {
    const rows = tagRows(lines, null);
    const justin = rows.find((row) => row.id === 'person:justin');
    expect(justin).toBeDefined();
    expect(justin?.count).toBe(2);
    expect(justin?.text).toBe('Justin');
    expect(justin?.first_at).toBe(1000);
    expect(justin?.last_at).toBe(2000);
    expect(justin?.source).toBe('user');
    expect(justin?.uses.map((use) => use.line_id)).toEqual(['l1', 'l2']);
  });

  it('keeps values, list membership and stages, and ignores replies', () => {
    const rows = tagRows(lines, null);
    expect(rows.find((row) => row.id === 'date:tomorrow')?.value).toBe('2026-09-30');
    expect(rows.find((row) => row.id === 'list:apples')?.in_list).toBe(true);
    expect(rows.find((row) => row.id === 'org:cloudflare')?.stages).toEqual(['b']);
    expect(rows.find((row) => row.id === 'person:nobody')).toBeUndefined();
  });

  it('scopes to one stage when asked', () => {
    expect(tagRows(lines, 'b').map((row) => row.id)).toEqual(['org:cloudflare']);
  });

  it('survives broken chips_json', () => {
    expect(tagRows([{ ...lines[0], chips_json: '{not json' } as Line], null)).toEqual([]);
  });
});

describe('tagLinks', () => {
  it('links tags that share a line and weighs repeats', () => {
    const links = tagLinks(tagRows(lines, null));
    const justinCall = links.find((link) => link.a === 'action:call' && link.b === 'person:justin');
    expect(justinCall?.weight).toBe(2);
    expect(links.find((link) => link.a === 'list:apples' && link.b === 'list:pears')?.weight).toBe(1);
    expect(links.some((link) => link.a.includes('cloudflare') || link.b.includes('cloudflare'))).toBe(false);
    expect(links[0]?.weight).toBe(2);
  });
});

describe('filters, sorts and facets', () => {
  const rows = tagRows(lines, null);
  it('filters by words, kind and stage', () => {
    expect(filterTags(rows, { text: 'jus', kind: 'all', stage: 'all' }, (kind) => kind).map((row) => row.id)).toEqual(['person:justin']);
    expect(filterTags(rows, { text: '', kind: 'list', stage: 'all' }, (kind) => kind)).toHaveLength(2);
    expect(filterTags(rows, { text: '', kind: 'all', stage: 'b' }, (kind) => kind).map((row) => row.id)).toEqual(['org:cloudflare']);
    expect(filterTags(rows, { text: 'brand', kind: 'all', stage: 'all' }, (kind) => (kind === 'org' ? 'brand / org' : kind)).map((row) => row.id)).toEqual(['org:cloudflare']);
  });
  it('sorts by count, time, name and kind', () => {
    expect(sortTags(rows, 'count')[0]?.count).toBe(2);
    expect(sortTags(rows, 'newest')[0]?.id).toBe('org:cloudflare');
    expect(sortTags(rows, 'oldest')[0]?.first_at).toBe(1000);
    expect(sortTags(rows, 'alpha').map((row) => row.text)).toEqual(['apples', 'call', 'Cloudflare', 'Justin', 'pears', 'tomorrow']);
    expect(sortTags(rows, 'kind')[0]?.kind).toBe('action');
  });
  it('lists kinds most used first and stages oldest first', () => {
    const facets = tagFacets(rows);
    expect(facets.kinds.slice(0, 3)).toEqual(['action', 'list', 'person']);
    expect(facets.stages).toEqual(['a', 'b']);
  });
});

describe('layoutGraph', () => {
  const rows = tagRows(lines, null);
  const links = tagLinks(rows);
  it('places every node inside the box, deterministically', () => {
    const first = layoutGraph(rows, links, DEFAULT_GRAPH, 600, 400);
    const second = layoutGraph(rows, links, DEFAULT_GRAPH, 600, 400);
    expect(first.nodes).toHaveLength(rows.length);
    for (const node of first.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(node.r);
      expect(node.x).toBeLessThanOrEqual(600 - node.r);
      expect(node.y).toBeGreaterThanOrEqual(node.r);
      expect(node.y).toBeLessThanOrEqual(400 - node.r);
    }
    expect(second.nodes.map((node) => [node.x, node.y])).toEqual(first.nodes.map((node) => [node.x, node.y]));
    expect(first.links).toHaveLength(links.length);
  });
  it('honours size, link threshold and label options', () => {
    const equal = layoutGraph(rows, links, { ...DEFAULT_GRAPH, size: 'equal' }, 600, 400);
    expect(new Set(equal.nodes.map((node) => node.r)).size).toBe(1);
    const heavy = layoutGraph(rows, links, { ...DEFAULT_GRAPH, minWeight: 2 }, 600, 400);
    expect(heavy.links.every((link) => link.weight >= 2)).toBe(true);
    expect(heavy.links).toHaveLength(1);
    const quiet = layoutGraph(rows, links, { ...DEFAULT_GRAPH, labels: 'none' }, 600, 400);
    expect(quiet.nodes.every((node) => !node.labelled)).toBe(true);
    const sized = layoutGraph(rows, links, DEFAULT_GRAPH, 600, 400);
    const big = sized.nodes.find((node) => node.id === 'person:justin')?.r ?? 0;
    const small = sized.nodes.find((node) => node.id === 'org:cloudflare')?.r ?? 0;
    expect(big).toBeGreaterThan(small);
  });
  it('seats kinds apart in the kind layout', () => {
    const byKind = layoutGraph(rows, links, { ...DEFAULT_GRAPH, layout: 'kind' }, 600, 400);
    const apples = byKind.nodes.find((node) => node.id === 'list:apples');
    const pears = byKind.nodes.find((node) => node.id === 'list:pears');
    const cloudflare = byKind.nodes.find((node) => node.id === 'org:cloudflare');
    const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(d(apples!, pears!)).toBeLessThan(d(apples!, cloudflare!));
  });
  it('returns nothing for no tags', () => {
    expect(layoutGraph([], [], DEFAULT_GRAPH, 600, 400)).toEqual({ nodes: [], links: [] });
  });
});
