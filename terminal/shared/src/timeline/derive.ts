import { applyOps, type EngineContext, type UiState } from '../ops/engine';
import type { Op } from '../ops/schema';
import { MAIN_BRANCH, type Branch, type Step, type StepKind, type TimelineExport, type TimelineSource } from './types';

function clip(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

interface Raw {
  kind: StepKind;
  ref: string;
  summary: string;
  at: number;
}

/**
 * Builds the ordered steps for one box from the records the store already
 * keeps. Stable: equal timestamps keep record order (a user line before the
 * assistant line it caused; an edit before the reply that describes it).
 */
export function deriveTimeline(source: TimelineSource, boxId: string): Step[] {
  const raw: Raw[] = [];
  for (const session of source.sessions) {
    if (session.box_id === boxId) {
      raw.push({ kind: 'session', ref: session.id, summary: 'Session opened', at: session.created_at });
    }
  }
  for (const line of source.lines) {
    if (line.box_id !== boxId) {
      continue;
    }
    const text = line.text.trim();
    const summary = text.length > 0 ? clip(text) : line.streaming ? '…' : '(empty reply)';
    raw.push({ kind: line.kind, ref: line.id, summary, at: line.created_at });
  }
  for (const edit of source.edits) {
    if (edit.box_id === boxId) {
      raw.push({ kind: 'edit', ref: edit.id, summary: clip(edit.summary.replace(/^Edited: /, '')), at: edit.created_at });
    }
  }
  for (const entry of source.entries) {
    if (entry.box_id !== boxId || entry.kind !== 'edit') {
      continue;
    }
    if (entry.what.startsWith('undo:')) {
      raw.push({ kind: 'undo', ref: entry.ref, summary: `Undid ${clip(entry.what.slice(5), 80)}`, at: entry.created_at });
    } else if (entry.what.startsWith('redo:')) {
      raw.push({ kind: 'redo', ref: entry.ref, summary: `Redid ${clip(entry.what.slice(5), 80)}`, at: entry.created_at });
    }
  }
  const ordered = raw.map((item, index) => ({ item, index })).sort((a, b) => a.item.at - b.item.at || a.index - b.index);
  const steps: Step[] = [];
  for (const { item } of ordered) {
    const previous = steps[steps.length - 1];
    steps.push({
      id: `step_${item.kind}_${item.ref}`,
      box_id: boxId,
      branch_id: MAIN_BRANCH,
      parent_ids: previous ? [previous.id] : [],
      kind: item.kind,
      ref: item.ref,
      summary: item.summary,
      at: item.at,
    });
  }
  return steps;
}

export interface StateAtResult {
  state: UiState;
  /** false when a step could not be reversed; the state is then the closest we could get. */
  exact: boolean;
}

/**
 * The interface as it was right after step `index`, rebuilt from the current
 * state by walking the later steps backwards and reversing each one: an edit is
 * reversed with its inverse, an undo by applying the ops again, a redo by the
 * inverse. Nothing is stored twice; the current state plus the edit batches
 * are enough.
 */
export function stateAt(steps: Step[], index: number, current: UiState, edits: TimelineSource['edits'], ctx: EngineContext): StateAtResult {
  let state = current;
  let exact = true;
  const applied = new Map<string, boolean>();
  for (const edit of edits) {
    applied.set(edit.id, edit.state === 'applied');
  }
  const byId = new Map(edits.map((edit) => [edit.id, edit] as const));
  for (let position = steps.length - 1; position > index; position -= 1) {
    const step = steps[position];
    if (!step || (step.kind !== 'edit' && step.kind !== 'undo' && step.kind !== 'redo')) {
      continue;
    }
    const batch = byId.get(step.ref);
    if (!batch) {
      exact = false;
      continue;
    }
    const isApplied = applied.get(batch.id) ?? false;
    let ops: Op[] | null = null;
    if (step.kind === 'edit' || step.kind === 'redo') {
      // Before this step the batch was not in effect.
      if (isApplied) {
        ops = batch.inverse as Op[];
        applied.set(batch.id, false);
      } else {
        exact = false;
      }
    } else if (!isApplied) {
      // Before the undo, the batch was in effect.
      ops = batch.ops as Op[];
      applied.set(batch.id, true);
    } else {
      exact = false;
    }
    if (ops && ops.length > 0) {
      const result = applyOps(state, ops, ctx);
      if (result.ok) {
        state = result.state;
      } else {
        exact = false;
      }
    }
  }
  return { state, exact };
}

/** The lines visible at a step: everything spoken up to and including it. */
export function lineIdsAt(steps: Step[], index: number): Set<string> {
  const ids = new Set<string>();
  for (let position = 0; position <= index && position < steps.length; position += 1) {
    const step = steps[position];
    if (step && (step.kind === 'user' || step.kind === 'assistant' || step.kind === 'system')) {
      ids.add(step.ref);
    }
  }
  return ids;
}

export function mainBranch(boxId: string, createdAt: number): Branch {
  return { id: MAIN_BRANCH, box_id: boxId, name: 'main', from_step_id: null, created_at: createdAt };
}

/** Everything needed to replay the box later, in one file. */
export function exportTimeline(source: TimelineSource, boxId: string, now: number): TimelineExport {
  const steps = deriveTimeline(source, boxId);
  const first = steps[0]?.at ?? now;
  return {
    version: 'timeline.v0',
    box_id: boxId,
    exported_at: now,
    branches: [mainBranch(boxId, first)],
    steps,
    lines: source.lines.filter((line) => line.box_id === boxId).map(({ streaming: _streaming, ...line }) => line),
    edits: source.edits.filter((edit) => edit.box_id === boxId),
  };
}

/** Where a step sits along the session, 0 to 1, by wall-clock time. */
export function positionOf(steps: Step[], index: number): number {
  if (steps.length < 2) {
    return steps.length === 0 ? 0 : 1;
  }
  const first = steps[0]!.at;
  const last = steps[steps.length - 1]!.at;
  const step = steps[Math.max(0, Math.min(index, steps.length - 1))]!;
  return last === first ? index / (steps.length - 1) : (step.at - first) / (last - first);
}
