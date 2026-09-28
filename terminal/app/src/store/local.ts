import { SEED_CARDS, makeCard, type Card, type CardInput } from '@shared/canvas';
import type { Chip } from '@shared/chips';
import { chainEntry, headsAfter, type Entry, type EntryDraft } from '@shared/ledger';
import { SEED_THEMES } from '@shared/themes';
import { newId } from '../lib/ids';
import { readJson, writeJson } from '../lib/storage';
import type { Box, Line, LineKind, LineOptions, Session, Store, StoreSnapshot } from './types';

const STORAGE_KEY = 'fresh-terminal.store.v0';

interface Persisted {
  boxes: Box[];
  sessions: Session[];
  lines: Line[];
  entries: Entry[];
  on_chain: boolean;
  cards?: Card[];
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
        streaming: false,
      })),
      presence: [],
      owner: { identity, on_chain: saved.on_chain, created_at: Date.now() },
      entries: saved.entries,
      themes: SEED_THEMES,
      routeRules: [],
      cards: mergeCards(saved.cards),
    };
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

  private commit(patch: Partial<StoreSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    const persisted: Persisted = {
      boxes: this.snapshot.boxes,
      sessions: this.snapshot.sessions,
      lines: this.snapshot.lines.map(({ streaming: _streaming, ...line }) => line),
      entries: this.snapshot.entries,
      on_chain: this.snapshot.owner.on_chain,
      cards: this.snapshot.cards,
    };
    writeJson(STORAGE_KEY, persisted);
    for (const listener of this.listeners) {
      listener();
    }
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
    this.commit({ boxes: [...this.snapshot.boxes, box] });
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
      created_at: now,
      streaming: kind === 'assistant' && text.length === 0,
    };
    const boxes = this.snapshot.boxes.map((box) => (box.id === boxId ? { ...box, updated_at: now } : box));
    this.commit({ lines: [...this.snapshot.lines, line], boxes });
    return line;
  }

  updateLine(lineId: string, text: string, streaming: boolean): void {
    const lines = this.snapshot.lines.map((line) =>
      line.id === lineId ? { ...line, text, streaming } : line,
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
}
