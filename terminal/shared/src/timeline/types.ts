/**
 * Timeline v0: every step of a session, saved as an event with parents.
 *
 * Today the steps are derived from what the store already records (sessions,
 * lines, edit batches and the ledger's undo/redo entries), so nothing that
 * happened before this pass is lost. `parent_ids` is a list, not one id, so a
 * branch (a step with a parent that already has a child) and a merge (a step
 * with two parents) fit without changing the shape. Only `main` exists now.
 */

export const STEP_KINDS = ['session', 'user', 'assistant', 'system', 'edit', 'undo', 'redo'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const MAIN_BRANCH = 'main';

export interface Step {
  id: string;
  box_id: string;
  /** Which branch this step sits on. Only "main" today. */
  branch_id: string;
  /** Empty for the first step, one id for a linear step, two or more for a merge. */
  parent_ids: string[];
  kind: StepKind;
  /** The record this step points at: a session id, a line id or an edit batch id. */
  ref: string;
  /** One plain line for the scrubber label. */
  summary: string;
  /** Milliseconds since the epoch, from the record itself. */
  at: number;
}

export interface Branch {
  id: string;
  box_id: string;
  name: string;
  /** null for main; otherwise the step the branch forked from. */
  from_step_id: string | null;
  created_at: number;
}

/** The minimum a store must hand over for a timeline to be derived. */
export interface TimelineSource {
  sessions: Array<{ id: string; box_id: string; created_at: number }>;
  lines: Array<{ id: string; box_id: string; kind: 'user' | 'assistant' | 'system'; text: string; created_at: number; streaming?: boolean }>;
  edits: Array<{ id: string; box_id: string; summary: string; created_at: number; state: 'applied' | 'undone'; ops: unknown[]; inverse: unknown[] }>;
  entries: Array<{ id: string; box_id: string; kind: string; what: string; ref: string; created_at: number }>;
}

/** The saved form: one file per box, ready to be stored as rows later. */
export interface TimelineExport {
  version: 'timeline.v0';
  box_id: string;
  exported_at: number;
  branches: Branch[];
  steps: Step[];
  lines: TimelineSource['lines'];
  edits: TimelineSource['edits'];
}
