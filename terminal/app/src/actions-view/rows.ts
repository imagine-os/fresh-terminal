import type { Line } from '../store/types';

/**
 * The rows behind Actions (C-090), as plain functions so they can be tested
 * without the store. Every line sent, every reply, every note and every edit
 * is one row. Model and cost come from the ledger (C-094): the entries a reply
 * names in its header, or failing that the charges written during its turn.
 */
export type ActionKind = 'line' | 'reply' | 'edit' | 'system';
export type ActionStatus = 'sent' | 'answered' | 'failed' | 'applied' | 'undone' | 'noted';

export interface ActionRow {
  id: string;
  at: number;
  kind: ActionKind;
  status: ActionStatus;
  text: string;
  /** The stage (box id) the row happened in. */
  box_id: string;
  /** What the person paid for this row, in micro-dollars (ledger price_micro). */
  cost_micro: number;
  /** False when nothing says what it cost (a line sent, a note, an edit). */
  cost_known: boolean;
  /** Served models of the turn this row belongs to, from the ledger; empty when no model ran. */
  models: string[];
  /** Ledger entries counted in cost_micro. */
  entry_ids: string[];
  /** The row this one follows (dependency): an edit follows its prompt, a reply follows its line. */
  follows: string | null;
}

/** The ledger fields Actions reads. The store's Entry fits as is. */
export interface LedgerLite {
  id: string;
  box_id: string;
  kind: string;
  what: string;
  model: string;
  price_micro: number;
  created_at: number;
}

export interface EditLite {
  id: string;
  box_id: string;
  summary: string;
  state: 'applied' | 'undone';
  created_at: number;
}

interface ReplyMetaLite {
  meta?: { cost_micro?: number; model?: string; ledger_ids?: unknown } | null;
  blocks?: Array<{ kind: string }>;
}

function parseMeta(json: string): ReplyMetaLite | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ReplyMetaLite;
  } catch {
    return null;
  }
}

function byTime<T extends { created_at: number }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.created_at - b.item.created_at || a.index - b.index)
    .map(({ item }) => item);
}

interface Turn {
  userId: string;
  box: string;
  from: number;
  to: number;
  replies: ActionRow[];
  members: ActionRow[];
  entries: LedgerLite[];
  metaModels: string[];
}

export function actionRows(lines: Line[], edits: EditLite[], boxId: string | null, entries: LedgerLite[] = []): ActionRow[] {
  const rows: ActionRow[] = [];
  const lastUser = new Map<string, string>();
  const turns = new Map<string, Turn>();
  const ownLines = byTime(lines.filter((line) => boxId === null || line.box_id === boxId));
  const metas = new Map<string, ReplyMetaLite | null>();
  for (const line of ownLines) {
    const reply = parseMeta(line.blocks_json);
    metas.set(line.id, reply);
    const follows = lastUser.get(line.box_id) ?? null;
    const base = { id: line.id, at: line.created_at, box_id: line.box_id, models: [] as string[], entry_ids: [] as string[] };
    let row: ActionRow;
    if (line.kind === 'user') {
      row = { ...base, kind: 'line', status: 'sent', text: line.text, cost_micro: 0, cost_known: false, follows: null };
      const previous = turns.get(follows ?? '');
      if (previous) previous.to = line.created_at;
      lastUser.set(line.box_id, line.id);
      turns.set(line.id, { userId: line.id, box: line.box_id, from: line.created_at, to: Number.POSITIVE_INFINITY, replies: [], members: [row], entries: [], metaModels: [] });
    } else if (line.kind === 'assistant') {
      const failed = (reply?.blocks ?? []).some((block) => block.kind === 'error');
      const hasMeta = !!reply?.meta;
      row = { ...base, kind: 'reply', status: failed ? 'failed' : 'answered', text: line.text || '…', cost_micro: hasMeta ? Math.max(0, reply?.meta?.cost_micro ?? 0) : 0, cost_known: hasMeta, follows };
    } else {
      row = { ...base, kind: 'system', status: 'noted', text: line.text, cost_micro: 0, cost_known: false, follows };
    }
    rows.push(row);
    const turn = follows !== null && line.kind !== 'user' ? turns.get(follows) : undefined;
    if (turn) {
      turn.members.push(row);
      if (row.kind === 'reply') turn.replies.push(row);
      const model = reply?.meta?.model;
      if (model && !turn.metaModels.includes(model)) turn.metaModels.push(model);
    }
  }
  const userLines = ownLines.filter((line) => line.kind === 'user');
  for (const batch of byTime(edits.filter((candidate) => boxId === null || candidate.box_id === boxId))) {
    // An edit follows the newest line sent before it in the same stage.
    const before = userLines.filter((line) => line.box_id === batch.box_id && line.created_at <= batch.created_at).pop();
    const row: ActionRow = {
      id: batch.id,
      at: batch.created_at,
      kind: 'edit',
      status: batch.state,
      text: batch.summary.replace(/^Edited: /, ''),
      box_id: batch.box_id,
      cost_micro: 0,
      cost_known: false,
      models: [],
      entry_ids: [],
      follows: before?.id ?? null,
    };
    rows.push(row);
    turns.get(row.follows ?? '')?.members.push(row);
  }

  // The ledger: entries a reply names first, then charges by the turn they were written in.
  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
  const claimed = new Set<string>();
  for (const turn of turns.values()) {
    for (const reply of turn.replies) {
      const ids = metas.get(reply.id)?.meta?.ledger_ids;
      for (const id of Array.isArray(ids) ? ids : []) {
        const entry = typeof id === 'string' ? byId.get(id) : undefined;
        if (entry && !claimed.has(entry.id)) {
          claimed.add(entry.id);
          turn.entries.push(entry);
        }
      }
    }
  }
  const ordered = [...turns.values()].sort((a, b) => a.from - b.from);
  for (const entry of byTime(entries.filter((candidate) => candidate.kind === 'charge' && !claimed.has(candidate.id)))) {
    const inBox = ordered.filter((turn) => turn.box === entry.box_id);
    // The tagger runs while a prompt is typed: its charge belongs to the next line sent.
    const turn =
      (entry.what === 'chips.tag' ? inBox.find((candidate) => candidate.from >= entry.created_at) : undefined) ??
      inBox.find((candidate) => entry.created_at >= candidate.from && entry.created_at < candidate.to);
    if (!turn) continue;
    claimed.add(entry.id);
    turn.entries.push(entry);
  }
  for (const turn of turns.values()) {
    const ledgerModels = [...new Set(turn.entries.map((entry) => entry.model).filter(Boolean))];
    const models = ledgerModels.length > 0 ? ledgerModels : turn.metaModels;
    for (const member of turn.members) member.models = models;
    if (turn.entries.length === 0) continue;
    const payer = turn.replies[0] ?? turn.members[0];
    if (!payer) continue;
    for (const reply of turn.replies) reply.cost_micro = 0;
    payer.cost_micro = turn.entries.reduce((sum, entry) => sum + entry.price_micro, 0);
    payer.cost_known = true;
    payer.entry_ids = turn.entries.map((entry) => entry.id);
  }
  return rows.sort((a, b) => a.at - b.at);
}

export type Sort = 'newest' | 'oldest' | 'status' | 'cost';
export const STATUS_ORDER: ActionStatus[] = ['sent', 'answered', 'applied', 'undone', 'failed', 'noted'];
/** The model filter's value for rows where no model ran (local commands, edits by key). */
export const NO_MODEL = 'local';

export interface RowFilter {
  text?: string;
  status?: ActionStatus | 'all';
  /** A stage (box id), or 'all'. */
  stage?: string;
  /** A model id, NO_MODEL, or 'all'. */
  model?: string;
}

export function rowModels(row: ActionRow): string[] {
  return row.models.length > 0 ? row.models : [NO_MODEL];
}

/** Every word of the text must appear in the row's text, its models, or its labels (kind and status, in the reader's language). */
export function filterRows(rows: ActionRow[], filter: RowFilter, labels: (row: ActionRow) => string = (row) => `${row.kind} ${row.status}`): ActionRow[] {
  const words = (filter.text ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (filter.status && filter.status !== 'all' && row.status !== filter.status) return false;
    if (filter.stage && filter.stage !== 'all' && row.box_id !== filter.stage) return false;
    if (filter.model && filter.model !== 'all' && !rowModels(row).includes(filter.model)) return false;
    if (words.length === 0) return true;
    const haystack = `${row.text} ${row.models.join(' ')} ${labels(row)}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Newest, oldest, by status (the order above), or by cost (highest first). Ties go newest first. */
export function sortRows(rows: ActionRow[], sort: Sort): ActionRow[] {
  const chronological = [...rows].sort((a, b) => a.at - b.at);
  if (sort === 'oldest') return chronological;
  const newest = chronological.reverse();
  if (sort === 'status') return [...newest].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  if (sort === 'cost') return [...newest].sort((a, b) => b.cost_micro - a.cost_micro);
  return newest;
}

/** The stages and models present, for the filter menus, in first-seen order. */
export function rowFacets(rows: ActionRow[]): { stages: string[]; models: string[] } {
  const stages: string[] = [];
  const models: string[] = [];
  for (const row of rows) {
    if (!stages.includes(row.box_id)) stages.push(row.box_id);
    for (const model of rowModels(row)) if (!models.includes(model)) models.push(model);
  }
  return { stages, models };
}
