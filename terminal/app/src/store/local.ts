import type { Snapshot } from '@shared/agent';
import { SEED_CARDS, makeCard, type Card, type CardInput } from '@shared/canvas';
import type { Chip } from '@shared/chips';
import { chainEntry, headsAfter, type Entry, type EntryDraft } from '@shared/ledger';
import { applyOps as applyOpsPure, summarize, type EngineContext, type UiState } from '@shared/ops';
import type { Op } from '@shared/ops';
import type { Reply } from '@shared/reply';
import type { Starter } from '@shared/starters';
import type { SyncBox } from '@shared/sync';
import { SEED_THEMES } from '@shared/themes';
import { SEED_NAV, defaultBoxUi, type BoxUi, type GlossaryTerm, type NavItem, type Page } from '@shared/ui';
import { listActions } from '../actions/registry';
import { newId } from '../lib/ids';
import { readJson, writeJson } from '../lib/storage';
import type { Box, EditBatch, EditResult, EditSource, Line, LineKind, LineOptions, Session, Store, StoreSnapshot } from './types';

const STORAGE_KEY = 'fresh-terminal.store.v0';

interface Persisted {
  boxes: Box[];
  sessions: Session[];
  lines: Line[];
  entries: Entry[];
  on_chain: boolean;
  cards?: Card[];
  navItems?: NavItem[];
  pages?: Page[];
  boxUis?: BoxUi[];
  glossary?: GlossaryTerm[];
  starters?: Starter[];
  edits?: EditBatch[];
}

function emptyPersisted(): Persisted {
  return { boxes: [], sessions: [], lines: [], entries: [], on_chain: false, cards: [] };
}

/** Seed cards plus any moved/added cards saved in this browser (saved wins by id). */
function mergeCards(saved: Card[] | undefined): Card[] {
  const byId = new Map<string, Card>();
  for (const card of SEED_CARDS) {
    byId.set(card.id, card);
  }
  for (const card of saved ?? []) {
    byId.set(card.id, card);
  }
  return [...byId.values()];
}

/** Sources that are the person's intent and belong in the activity ledger. */
const LEDGERED: EditSource[] = ['assistant', 'local', 'chip', 'undo', 'redo'];

/**
 * Fallback store: works without SpacetimeDB. Everything is per browser.
 * Snapshots are immutable so useSyncExternalStore can compare by reference.
 */
export class LocalStore implements Store {
  readonly mode = 'local' as const;
  readonly identity: string;

  private snapshot: StoreSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(identity: string) {
    this.identity = identity;
    const saved = readJson<Persisted>(STORAGE_KEY, emptyPersisted());
    this.snapshot = {
      boxes: saved.boxes.filter((box) => box.owner_identity === identity),
      sessions: saved.sessions,
      lines: saved.lines.map((line) => ({
        ...line,
        component: typeof line.component === 'string' ? line.component : '',
        reveal: typeof line.reveal === 'string' ? line.reveal : '',
        blocks_json: typeof line.blocks_json === 'string' ? line.blocks_json : '',
        streaming: false,
      })),
      presence: [],
      owner: { identity, on_chain: saved.on_chain, created_at: Date.now() },
      entries: saved.entries,
      themes: SEED_THEMES,
      routeRules: [],
      cards: mergeCards(saved.cards),
      navItems: saved.navItems ?? [],
      pages: saved.pages ?? [],
      // Records from before pass 5 have no skins.
      boxUis: (saved.boxUis ?? []).map((ui) => ({ ...ui, skins: ui.skins ?? {} })),
      glossary: saved.glossary ?? [],
      starters: saved.starters ?? [],
      edits: saved.edits ?? [],
    };
    // Boxes from before menus existed get the default menu once.
    for (const box of this.snapshot.boxes) {
      this.ensureSeeded(box.id, false);
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): StoreSnapshot {
    return this.snapshot;
  }

  private commit(patch: Partial<StoreSnapshot>, notify = true): void {
    this.snapshot = { ...this.snapshot, ...patch };
    const persisted: Persisted = {
      boxes: this.snapshot.boxes,
      sessions: this.snapshot.sessions,
      lines: this.snapshot.lines.map(({ streaming: _streaming, ...line }) => line),
      entries: this.snapshot.entries,
      on_chain: this.snapshot.owner.on_chain,
      cards: this.snapshot.cards,
      navItems: this.snapshot.navItems,
      pages: this.snapshot.pages,
      boxUis: this.snapshot.boxUis,
      glossary: this.snapshot.glossary,
      starters: this.snapshot.starters,
      edits: this.snapshot.edits.slice(-200),
    };
    writeJson(STORAGE_KEY, persisted);
    if (notify) {
      for (const listener of this.listeners) {
        listener();
      }
    }
  }

  private ensureSeeded(boxId: string, notify: boolean): void {
    const existing = this.snapshot.boxUis.find((ui) => ui.box_id === boxId);
    if (existing?.seeded) {
      return;
    }
    const now = Date.now();
    const hasNav = this.snapshot.navItems.some((item) => item.box_id === boxId);
    const nav: NavItem[] = hasNav
      ? []
      : SEED_NAV.map((seed, index) => ({
          id: newId('nav'),
          box_id: boxId,
          parent_id: null,
          label: seed.label,
          icon: seed.icon,
          target: seed.target,
          order: index,
          created_at: now,
          updated_at: now,
        }));
    const ui: BoxUi = { ...(existing ?? defaultBoxUi(boxId, now)), seeded: true };
    this.commit(
      {
        navItems: [...this.snapshot.navItems, ...nav],
        boxUis: [...this.snapshot.boxUis.filter((candidate) => candidate.box_id !== boxId), ui],
      },
      notify,
    );
  }

  createBox(name: string): Box {
    const now = Date.now();
    const box: Box = {
      id: newId('box'),
      owner_identity: this.identity,
      name: name.trim() || 'Untitled box',
      created_at: now,
      updated_at: now,
    };
    this.commit({ boxes: [...this.snapshot.boxes, box] }, false);
    this.ensureSeeded(box.id, true);
    return box;
  }

  openSession(boxId: string): Session {
    const session: Session = { id: newId('session'), box_id: boxId, created_at: Date.now() };
    this.commit({ sessions: [...this.snapshot.sessions.slice(-50), session] });
    return session;
  }

  appendLine(boxId: string, kind: LineKind, text: string, chips: Chip[], options: LineOptions = {}): Line {
    const now = Date.now();
    const line: Line = {
      id: newId('line'),
      box_id: boxId,
      kind,
      text,
      chips_json: JSON.stringify(chips),
      component: options.component ?? '',
      reveal: options.reveal ?? '',
      blocks_json: options.reply ? JSON.stringify(options.reply) : '',
      created_at: now,
      streaming: kind === 'assistant' && text.length === 0 && !options.reply,
    };
    const boxes = this.snapshot.boxes.map((box) => (box.id === boxId ? { ...box, updated_at: now } : box));
    this.commit({ lines: [...this.snapshot.lines, line], boxes });
    return line;
  }

  updateLine(lineId: string, text: string, streaming: boolean): void {
    const lines = this.snapshot.lines.map((line) => (line.id === lineId ? { ...line, text, streaming } : line));
    this.commit({ lines });
  }

  setLineReply(lineId: string, reply: Reply): void {
    const lines = this.snapshot.lines.map((line) =>
      line.id === lineId ? { ...line, blocks_json: JSON.stringify(reply), streaming: false } : line,
    );
    this.commit({ lines });
  }

  touchPresence(boxId: string): void {
    const presence = [{ identity: this.identity, box_id: boxId, last_seen: Date.now() }];
    this.commit({ presence });
  }

  appendEntry(draft: Omit<EntryDraft, 'owner_identity'>): Entry {
    const full: EntryDraft = { ...draft, owner_identity: this.identity };
    const entry = chainEntry(full, {
      id: newId('entry'),
      onChain: this.snapshot.owner.on_chain,
      heads: headsAfter(this.snapshot.entries, this.identity),
    });
    this.commit({ entries: [...this.snapshot.entries, entry] });
    return entry;
  }

  setOnChain(onChain: boolean): void {
    this.commit({ owner: { ...this.snapshot.owner, on_chain: onChain } });
  }

  addCard(input: CardInput): Card {
    const card = makeCard(input, this.snapshot.cards);
    this.commit({ cards: [...this.snapshot.cards, card] });
    return card;
  }

  moveCard(id: string, x: number, y: number): void {
    const now = Date.now();
    const cards = this.snapshot.cards.map((card) => (card.id === id ? { ...card, x, y, updated_at: now } : card));
    this.commit({ cards });
  }

  boxUi(boxId: string): BoxUi {
    return this.snapshot.boxUis.find((ui) => ui.box_id === boxId) ?? defaultBoxUi(boxId, 0);
  }

  uiState(boxId: string): UiState {
    return {
      nav: this.snapshot.navItems.filter((item) => item.box_id === boxId),
      pages: this.snapshot.pages.filter((page) => page.box_id === boxId),
      boxUi: this.boxUi(boxId),
      cards: this.snapshot.cards,
      starters: this.snapshot.starters,
      glossary: this.snapshot.glossary.filter((term) => term.box_id === boxId),
    };
  }

  private context(boxId: string): EngineContext {
    return {
      boxId,
      now: Date.now(),
      newId: (prefix) => newId(prefix),
      themeIds: this.snapshot.themes.map((theme) => theme.id),
      actionIds: listActions().map((action) => action.id),
      boxes: this.snapshot.boxes.map((box) => ({ id: box.id, name: box.name })),
    };
  }

  /** Writes a box's new UiState back into the flat tables. */
  private writeState(boxId: string, state: UiState): Partial<StoreSnapshot> {
    return {
      navItems: [...this.snapshot.navItems.filter((item) => item.box_id !== boxId), ...state.nav],
      pages: [...this.snapshot.pages.filter((page) => page.box_id !== boxId), ...state.pages],
      boxUis: [...this.snapshot.boxUis.filter((ui) => ui.box_id !== boxId), state.boxUi],
      glossary: [...this.snapshot.glossary.filter((term) => term.box_id !== boxId), ...state.glossary],
      cards: state.cards,
      starters: state.starters,
    };
  }

  private ledgerEdit(batch: EditBatch): Entry {
    const kinds = [...new Set(batch.ops.map((op) => op.op))].join(',');
    const full: EntryDraft = {
      box_id: batch.box_id,
      owner_identity: this.identity,
      kind: 'edit',
      what: `${batch.source === 'undo' ? 'undo' : batch.source === 'redo' ? 'redo' : 'edit'}:${kinds}`.slice(0, 120),
      model: '',
      units: batch.ops.length,
      unit_kind: 'op',
      cost_micro: 0,
      price_micro: 0,
      ref: batch.id,
      created_at: batch.created_at,
    };
    return chainEntry(full, {
      id: newId('entry'),
      onChain: this.snapshot.owner.on_chain,
      heads: headsAfter(this.snapshot.entries, this.identity),
    });
  }

  applyOps(boxId: string, ops: Op[], source: EditSource): EditResult {
    const result = applyOpsPure(this.uiState(boxId), ops, this.context(boxId));
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }
    const batch: EditBatch = {
      id: newId('edit'),
      box_id: boxId,
      ops: result.applied,
      inverse: result.inverse,
      changes: result.changes,
      summary: summarize(result.changes),
      source,
      state: 'applied',
      created_at: Date.now(),
    };
    const patch = this.writeState(boxId, result.state);
    this.snapshot = { ...this.snapshot, ...patch };
    const entries = LEDGERED.includes(source) ? [...this.snapshot.entries, this.ledgerEdit(batch)] : this.snapshot.entries;
    this.commit({ edits: [...this.snapshot.edits, batch], entries });
    return { ok: true, batch };
  }

  private flip(batchId: string, direction: 'undo' | 'redo'): EditResult {
    const batch = this.snapshot.edits.find((candidate) => candidate.id === batchId);
    if (!batch) {
      return { ok: false, reason: 'That edit is no longer in the history' };
    }
    if (direction === 'undo' && batch.state !== 'applied') {
      return { ok: false, reason: 'Already undone' };
    }
    if (direction === 'redo' && batch.state !== 'undone') {
      return { ok: false, reason: 'Already applied' };
    }
    const ops = direction === 'undo' ? batch.inverse : batch.ops;
    const result = applyOpsPure(this.uiState(batch.box_id), ops, this.context(batch.box_id));
    if (!result.ok) {
      return { ok: false, reason: `Cannot ${direction}: ${result.reason}` };
    }
    const flipped: EditBatch = {
      ...batch,
      state: direction === 'undo' ? 'undone' : 'applied',
      flipped_at: Date.now(),
      // Redo re-applies the original ops; keep the inverse that matches what is now applied.
      ...(direction === 'redo' ? { ops: result.applied, inverse: result.inverse } : {}),
    };
    const patch = this.writeState(batch.box_id, result.state);
    this.snapshot = { ...this.snapshot, ...patch };
    const record: EditBatch = { ...flipped, source: direction, created_at: Date.now(), changes: result.changes, summary: summarize(result.changes) };
    const entries = [...this.snapshot.entries, this.ledgerEdit({ ...record, ops })];
    this.commit({ edits: this.snapshot.edits.map((candidate) => (candidate.id === batchId ? flipped : candidate)), entries });
    return { ok: true, batch: record };
  }

  undo(batchId: string): EditResult {
    return this.flip(batchId, 'undo');
  }

  redo(batchId: string): EditResult {
    return this.flip(batchId, 'redo');
  }

  setBoxDialect(boxId: string, text: string | null): void {
    const ui = { ...this.boxUi(boxId), dialect_text: text, updated_at: Date.now() };
    this.commit({ boxUis: [...this.snapshot.boxUis.filter((candidate) => candidate.box_id !== boxId), ui] });
  }

  snapshotFor(boxId: string, effectiveThemeId: string): Snapshot {
    const state = this.uiState(boxId);
    const box = this.snapshot.boxes.find((candidate) => candidate.id === boxId);
    return {
      box: { id: boxId, name: box?.name ?? 'box' },
      nav: state.nav.slice(0, 200),
      pages: state.pages.slice(0, 50),
      boxUi: state.boxUi,
      themes: this.snapshot.themes.map((theme) => ({ id: theme.id, name: theme.name })),
      actions: listActions().map((action) => ({ id: action.id, intent: action.intent })).slice(0, 120),
      boxes: this.snapshot.boxes.map((candidate) => ({ id: candidate.id, name: candidate.name })).slice(0, 60),
      starters: state.starters.slice(0, 80),
      cards: state.cards.slice(0, 120),
      glossary: state.glossary.slice(0, 300),
      effectiveThemeId,
    };
  }

  syncBoxes(): SyncBox[] {
    return this.snapshot.boxes.map((box) => {
      const state = this.uiState(box.id);
      return {
        id: box.id,
        name: box.name,
        state_json: JSON.stringify({ nav: state.nav, pages: state.pages, boxUi: state.boxUi, glossary: state.glossary }),
        created_at: box.created_at,
        updated_at: box.updated_at,
        deleted_at: null,
      };
    });
  }

  importSyncBoxes(rows: SyncBox[]): number {
    let applied = 0;
    let next = this.snapshot;
    for (const row of rows) {
      if (row.deleted_at !== null) {
        continue;
      }
      let state: { nav?: unknown; pages?: unknown; boxUi?: unknown; glossary?: unknown };
      try {
        state = JSON.parse(row.state_json) as typeof state;
      } catch {
        continue;
      }
      const nav = Array.isArray(state.nav) ? (state.nav as NavItem[]).map((item) => ({ ...item, box_id: row.id })) : [];
      const pages = Array.isArray(state.pages) ? (state.pages as Page[]).map((page) => ({ ...page, box_id: row.id })) : [];
      const glossary = Array.isArray(state.glossary) ? (state.glossary as GlossaryTerm[]).map((term) => ({ ...term, box_id: row.id })) : [];
      const boxUi: BoxUi =
        state.boxUi && typeof state.boxUi === 'object' ? { ...(state.boxUi as BoxUi), box_id: row.id, seeded: true } : { ...defaultBoxUi(row.id, row.updated_at), seeded: true };
      const box: Box = { id: row.id, owner_identity: this.identity, name: row.name, created_at: row.created_at, updated_at: row.updated_at };
      const exists = next.boxes.some((candidate) => candidate.id === row.id);
      next = {
        ...next,
        boxes: exists ? next.boxes.map((candidate) => (candidate.id === row.id ? box : candidate)) : [...next.boxes, box],
        navItems: [...next.navItems.filter((item) => item.box_id !== row.id), ...nav],
        pages: [...next.pages.filter((page) => page.box_id !== row.id), ...pages],
        glossary: [...next.glossary.filter((term) => term.box_id !== row.id), ...glossary],
        boxUis: [...next.boxUis.filter((ui) => ui.box_id !== row.id), boxUi],
      };
      applied += 1;
    }
    if (applied > 0) {
      this.commit({ boxes: next.boxes, navItems: next.navItems, pages: next.pages, glossary: next.glossary, boxUis: next.boxUis });
    }
    return applied;
  }
}
