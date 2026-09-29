import type { Chip, ChipKind } from '@shared/chips';
import type { Line } from '../store/types';

/**
 * The rows behind the Tags page (C-099): every tag the tagger or the person
 * put on a line, folded into one row per distinct tag (same kind, same text,
 * case-insensitive). Plain functions, so they test without the store. The
 * graph is the default view: two tags are linked when they appear on the same
 * line, and the link gets heavier each time that happens again.
 */
export interface TagRow {
  /** `${kind}:${lowercased text}` */
  id: string;
  kind: ChipKind;
  /** The text as first written. */
  text: string;
  /** Normalised value when the tagger had one (an ISO date, a number). */
  value: string | null;
  /** How many lines carry this tag. */
  count: number;
  first_at: number;
  last_at: number;
  /** Every time the tag appeared, oldest first. */
  uses: Array<{ line_id: string; box_id: string; at: number }>;
  /** Stages (box ids) the tag appeared in. */
  stages: string[];
  /** Who set it last: the tagger, the model, a glossary term or the person. */
  source: 'local' | 'model' | 'glossary' | 'user';
  /** Names the list this tag was part of, when it was (C-079 groups). */
  in_list: boolean;
}

export interface TagLink {
  a: string;
  b: string;
  /** Lines both tags appeared on. */
  weight: number;
}

export type TagSort = 'count' | 'newest' | 'oldest' | 'alpha' | 'kind';

function parseChips(json: string): Chip[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as Chip[]) : [];
  } catch {
    return [];
  }
}

export function tagId(chip: Pick<Chip, 'kind' | 'text'>): string {
  return `${chip.kind}:${chip.text.trim().toLowerCase()}`;
}

/** One row per distinct tag across the lines of one stage (or every stage when boxId is null). */
export function tagRows(lines: Line[], boxId: string | null): TagRow[] {
  const rows = new Map<string, TagRow>();
  const ordered = lines
    .filter((line) => line.kind === 'user' && (boxId === null || line.box_id === boxId))
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.created_at - b.line.created_at || a.index - b.index)
    .map(({ line }) => line);
  for (const line of ordered) {
    const seen = new Set<string>();
    for (const chip of parseChips(line.chips_json)) {
      if (!chip || typeof chip.text !== 'string' || !chip.text.trim() || !chip.kind) continue;
      const id = tagId(chip);
      if (seen.has(id)) continue; // twice on one line still counts once for that line
      seen.add(id);
      const existing = rows.get(id);
      const use = { line_id: line.id, box_id: line.box_id, at: line.created_at };
      if (existing) {
        existing.count += 1;
        existing.last_at = line.created_at;
        existing.uses.push(use);
        if (!existing.stages.includes(line.box_id)) existing.stages.push(line.box_id);
        existing.source = chip.source ?? existing.source;
        existing.in_list = existing.in_list || !!chip.group;
        if (chip.value && !existing.value) existing.value = chip.value;
      } else {
        rows.set(id, {
          id,
          kind: chip.kind,
          text: chip.text.trim(),
          value: chip.value ?? null,
          count: 1,
          first_at: line.created_at,
          last_at: line.created_at,
          uses: [use],
          stages: [line.box_id],
          source: chip.source ?? 'local',
          in_list: !!chip.group,
        });
      }
    }
  }
  return [...rows.values()];
}

/** Links between tags that share a line; weight is the number of such lines. */
export function tagLinks(rows: TagRow[]): TagLink[] {
  const byLine = new Map<string, string[]>();
  for (const row of rows) {
    for (const use of row.uses) {
      const list = byLine.get(use.line_id) ?? [];
      list.push(row.id);
      byLine.set(use.line_id, list);
    }
  }
  const weights = new Map<string, TagLink>();
  for (const ids of byLine.values()) {
    const unique = [...new Set(ids)].sort();
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const a = unique[i] as string;
        const b = unique[j] as string;
        const key = `${a}|${b}`;
        const link = weights.get(key);
        if (link) link.weight += 1;
        else weights.set(key, { a, b, weight: 1 });
      }
    }
  }
  return [...weights.values()].sort((x, y) => y.weight - x.weight || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}

export interface TagFilters {
  text: string;
  kind: ChipKind | 'all';
  stage: string | 'all';
}

export function filterTags(rows: TagRow[], filters: TagFilters, kindLabel: (kind: ChipKind) => string): TagRow[] {
  const needle = filters.text.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.kind !== 'all' && row.kind !== filters.kind) return false;
    if (filters.stage !== 'all' && !row.stages.includes(filters.stage)) return false;
    if (needle && !`${row.text} ${row.value ?? ''} ${kindLabel(row.kind)}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function sortTags(rows: TagRow[], sort: TagSort): TagRow[] {
  const copy = [...rows];
  switch (sort) {
    case 'newest':
      return copy.sort((a, b) => b.last_at - a.last_at || a.text.localeCompare(b.text));
    case 'oldest':
      return copy.sort((a, b) => a.first_at - b.first_at || a.text.localeCompare(b.text));
    case 'alpha':
      return copy.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
    case 'kind':
      return copy.sort((a, b) => a.kind.localeCompare(b.kind) || b.count - a.count || a.text.localeCompare(b.text));
    default:
      return copy.sort((a, b) => b.count - a.count || b.last_at - a.last_at || a.text.localeCompare(b.text));
  }
}

/** Kinds present, most frequent first, and stages present, oldest first. */
export function tagFacets(rows: TagRow[]): { kinds: ChipKind[]; stages: string[] } {
  const kinds = new Map<ChipKind, number>();
  const stages = new Map<string, number>();
  for (const row of rows) {
    kinds.set(row.kind, (kinds.get(row.kind) ?? 0) + row.count);
    for (const use of row.uses) stages.set(use.box_id, Math.min(stages.get(use.box_id) ?? Number.POSITIVE_INFINITY, use.at));
  }
  return {
    kinds: [...kinds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([kind]) => kind),
    stages: [...stages.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id),
  };
}

/* ---------- the graph ---------- */

export interface GraphOptions {
  /** Where nodes start and what pulls them: `kind` seats each kind on its own arc, `links` lets shared lines pull tags together. */
  layout: 'links' | 'kind';
  /** Node size: by how often the tag appears, or all the same. */
  size: 'count' | 'equal';
  /** Hide links lighter than this. */
  minWeight: number;
  /** Labels on every node, on the busiest only, or none. */
  labels: 'all' | 'top' | 'none';
}

export const DEFAULT_GRAPH: GraphOptions = { layout: 'links', size: 'count', minWeight: 1, labels: 'all' };

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  r: number;
  row: TagRow;
  /** True when the label shows under the `top` setting. */
  labelled: boolean;
}

export interface GraphLink extends TagLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A small deterministic pseudo-random sequence, so the same tags always land in the same place (tests, replays). */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Lays the tags out in a width × height box: a short force simulation (repulsion
 * between every pair, springs along links, a pull to the centre or to the
 * kind's arc). Synchronous and deterministic; a few hundred nodes finish well
 * under a frame.
 */
export function layoutGraph(rows: TagRow[], links: TagLink[], options: GraphOptions, width: number, height: number): { nodes: GraphNode[]; links: GraphLink[] } {
  if (rows.length === 0) return { nodes: [], links: [] };
  const cx = width / 2;
  const cy = height / 2;
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const dense = rows.length > 80;
  const radius = (row: TagRow) => (options.size === 'equal' ? (dense ? 6 : 9) : (dense ? 5 : 7) + Math.sqrt(row.count / maxCount) * (dense ? 11 : 15));
  const kinds = [...new Set(rows.map((row) => row.kind))].sort();
  const arc = new Map(kinds.map((kind, index) => [kind, (index / kinds.length) * Math.PI * 2 - Math.PI / 2] as const));
  const ring = Math.min(width, height) * 0.36;
  const random = seeded(rows.length * 7919 + links.length);
  const nodes: GraphNode[] = rows.map((row, index) => {
    const angle = options.layout === 'kind' ? (arc.get(row.kind) ?? 0) + (random() - 0.5) * 0.6 : (index / rows.length) * Math.PI * 2;
    const spread = options.layout === 'kind' ? ring * (0.7 + random() * 0.5) : ring * (0.5 + random() * 0.5);
    return { id: row.id, x: cx + Math.cos(angle) * spread, y: cy + Math.sin(angle) * spread, r: radius(row), row, labelled: true };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const active = links.filter((link) => link.weight >= options.minWeight && byId.has(link.a) && byId.has(link.b));
  const vx = new Float64Array(nodes.length);
  const vy = new Float64Array(nodes.length);
  const indexOf = new Map(nodes.map((node, index) => [node.id, index]));
  const iterations = nodes.length > 150 ? 110 : 220;
  for (let step = 0; step < iterations; step += 1) {
    const cooling = 1 - step / iterations;
    // Repulsion, so labels have room.
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i] as GraphNode;
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j] as GraphNode;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = random() - 0.5;
          dy = random() - 0.5;
          d2 = 1;
        }
        const min = a.r + b.r + (dense ? 30 : 26);
        const force = (min * min) / d2;
        const d = Math.sqrt(d2);
        const push = dense ? 1.6 : 0.9;
        const fx = (dx / d) * force * push;
        const fy = (dy / d) * force * push;
        vx[i] = (vx[i] as number) + fx;
        vy[i] = (vy[i] as number) + fy;
        vx[j] = (vx[j] as number) - fx;
        vy[j] = (vy[j] as number) - fy;
      }
    }
    // Springs along links; heavier links pull harder.
    for (const link of active) {
      const i = indexOf.get(link.a) as number;
      const j = indexOf.get(link.b) as number;
      const a = nodes[i] as GraphNode;
      const b = nodes[j] as GraphNode;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const rest = a.r + b.r + (dense ? 70 : 60);
      const k = (dense ? 0.006 : 0.015) * Math.min(4, link.weight);
      const f = (d - rest) * k;
      vx[i] = (vx[i] as number) + (dx / d) * f;
      vy[i] = (vy[i] as number) + (dy / d) * f;
      vx[j] = (vx[j] as number) - (dx / d) * f;
      vy[j] = (vy[j] as number) - (dy / d) * f;
    }
    // Gravity: to the centre, or to the kind's seat on the ring.
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i] as GraphNode;
      let tx = cx;
      let ty = cy;
      if (options.layout === 'kind') {
        const angle = arc.get(node.row.kind) ?? 0;
        tx = cx + Math.cos(angle) * ring;
        ty = cy + Math.sin(angle) * ring;
      }
      const pull = options.layout === 'kind' ? (dense ? 0.03 : 0.05) : dense ? 0.004 : 0.012;
      vx[i] = ((vx[i] as number) + (tx - node.x) * pull) * 0.6 * cooling;
      vy[i] = ((vy[i] as number) + (ty - node.y) * pull) * 0.6 * cooling;
      node.x = Math.min(width - node.r - 4, Math.max(node.r + 4, node.x + (vx[i] as number)));
      node.y = Math.min(height - node.r - 4, Math.max(node.r + 4, node.y + (vy[i] as number)));
    }
  }
  // Fit: spread whatever came out of the simulation across most of the box, so three tags do not huddle in the middle.
  if (nodes.length > 1) {
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = Math.max(...nodes.map((node) => node.r)) + 34;
    const scale = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY), 6);
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    for (const node of nodes) {
      node.x = offsetX + (node.x - minX) * scale;
      node.y = offsetY + (node.y - minY) * scale;
    }
  }
  if (options.labels === 'top') {
    const cut = [...rows].sort((a, b) => b.count - a.count)[Math.min(rows.length - 1, dense ? 39 : 11)]?.count ?? 1;
    for (const node of nodes) node.labelled = node.row.count >= cut;
  } else if (options.labels === 'none') {
    for (const node of nodes) node.labelled = false;
  }
  for (const node of nodes) {
    node.x = Math.round(node.x * 10) / 10;
    node.y = Math.round(node.y * 10) / 10;
    node.r = Math.round(node.r * 10) / 10;
  }
  return {
    nodes,
    links: active.map((link) => {
      const a = byId.get(link.a) as GraphNode;
      const b = byId.get(link.b) as GraphNode;
      return { ...link, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }),
  };
}
