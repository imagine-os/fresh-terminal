import type { Card, CardInput } from '@shared/canvas';
import type { Chip } from '@shared/chips';
import type { Entry, EntryDraft } from '@shared/ledger';
import type { Theme } from '@shared/themes';

export type LineKind = 'user' | 'assistant' | 'system';

export interface Box {
  id: string;
  owner_identity: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface Session {
  id: string;
  box_id: string;
  created_at: number;
}

export interface Line {
  id: string;
  box_id: string;
  kind: LineKind;
  text: string;
  chips_json: string;
  /** Name of a rendered composition, '' for plain text. */
  component: string;
  /** Reveal pattern name, '' for the default. */
  reveal: string;
  created_at: number;
  /** UI-only: the assistant is still streaming into this line. */
  streaming?: boolean;
}

export interface LineOptions {
  component?: string;
  reveal?: string;
}

export interface Presence {
  identity: string;
  box_id: string;
  last_seen: number;
}

export interface Owner {
  identity: string;
  on_chain: boolean;
  created_at: number;
}

export interface RouteRule {
  id: string;
  intent: string;
  model: string;
  permission: string;
  margin_bp: number;
  updated_at: number;
}

export interface StoreSnapshot {
  boxes: Box[];
  sessions: Session[];
  lines: Line[];
  presence: Presence[];
  owner: Owner;
  entries: Entry[];
  themes: Theme[];
  routeRules: RouteRule[];
  cards: Card[];
}

export type StoreMode = 'local' | 'spacetimedb';

/**
 * The store seam. LocalStore is the fallback used now (in memory, mirrored to
 * localStorage). SpacetimeStore will wrap the generated module bindings.
 */
export interface Store {
  readonly mode: StoreMode;
  readonly identity: string;
  subscribe(listener: () => void): () => void;
  getSnapshot(): StoreSnapshot;
  createBox(name: string): Box;
  openSession(boxId: string): Session;
  appendLine(boxId: string, kind: LineKind, text: string, chips: Chip[], options?: LineOptions): Line;
  updateLine(lineId: string, text: string, streaming: boolean): void;
  touchPresence(boxId: string): void;
  appendEntry(draft: Omit<EntryDraft, 'owner_identity'>): Entry;
  setOnChain(onChain: boolean): void;
  addCard(input: CardInput): Card;
  moveCard(id: string, x: number, y: number): void;
}
