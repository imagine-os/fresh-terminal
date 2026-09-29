import type { Snapshot } from '@shared/agent';
import type { Card, CardInput } from '@shared/canvas';
import type { Change, Op, UiState } from '@shared/ops';
import type { Reply } from '@shared/reply';
import type { Starter } from '@shared/starters';
import type { BoxUi, GlossaryTerm, NavItem, Page } from '@shared/ui';
import type { Chip } from '@shared/chips';
import type { Entry, EntryDraft } from '@shared/ledger';
import type { Theme } from '@shared/themes';
import type { SyncBox } from '@shared/sync';

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
  /** Structured reply (Reply JSON) for assistant lines, '' for plain text. */
  blocks_json: string;
  created_at: number;
  /** UI-only: the assistant is still streaming into this line. */
  streaming?: boolean;
}

export interface LineOptions {
  component?: string;
  reveal?: string;
  reply?: Reply;
}

export type EditSource = 'assistant' | 'local' | 'shortcut' | 'chip' | 'undo' | 'redo' | 'system';

/** One applied batch of ops, with its exact inverse. */
export interface EditBatch {
  id: string;
  box_id: string;
  ops: Op[];
  inverse: Op[];
  changes: Change[];
  summary: string;
  source: EditSource;
  state: 'applied' | 'undone';
  /** When undo/redo last flipped this batch (drives Ctrl+Shift+Z order). */
  flipped_at?: number;
  created_at: number;
}

export type EditResult = { ok: true; batch: EditBatch } | { ok: false; reason: string };

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
  navItems: NavItem[];
  pages: Page[];
  boxUis: BoxUi[];
  glossary: GlossaryTerm[];
  /** Starters people added (the seed list lives in docs/prompts/starters.json). */
  starters: Starter[];
  edits: EditBatch[];
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
  /** Deletes a box with its lines, sessions, menu, pages, edits and box UI. Ledger entries stay (the chain is append-only). */
  removeBox(id: string): void;
  /** Click-to-edit name in the top bar or sidebar (C-091). Blank names are ignored. */
  renameBox(id: string, name: string): void;
  /** Rebuilds a box from an exported session file's final state (new ids; edits and ledger stay in the file). */
  importSession(file: { box: Box | null; timeline: { lines: Array<{ kind: LineKind; text: string; chips_json?: string; component?: string; reveal?: string; blocks_json?: string; created_at: number }> }; ui: UiState }): Box;
  openSession(boxId: string): Session;
  appendLine(boxId: string, kind: LineKind, text: string, chips: Chip[], options?: LineOptions): Line;
  updateLine(lineId: string, text: string, streaming: boolean): void;
  touchPresence(boxId: string): void;
  appendEntry(draft: Omit<EntryDraft, 'owner_identity'>): Entry;
  setOnChain(onChain: boolean): void;
  addCard(input: CardInput): Card;
  moveCard(id: string, x: number, y: number): void;
  setLineReply(lineId: string, reply: Reply): void;
  /** Everything one box's interface is made of. */
  uiState(boxId: string): UiState;
  boxUi(boxId: string): BoxUi;
  /** The only way the interface changes: atomic, logged, undoable. */
  applyOps(boxId: string, ops: Op[], source: EditSource): EditResult;
  undo(batchId: string): EditResult;
  redo(batchId: string): EditResult;
  /** Dev-panel live editing of the layout text (not logged per keystroke). */
  setBoxDialect(boxId: string, text: string | null): void;
  snapshotFor(boxId: string, effectiveThemeId: string): Snapshot;
  /** Cloud sync (signed in): this browser's boxes as sync rows (updated_at is the box's own). */
  syncBoxes(): SyncBox[];
  /** Cloud sync: adopt server rows (replaces those boxes' records here). Returns how many were applied. */
  importSyncBoxes(rows: SyncBox[]): number;
}
