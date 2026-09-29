import { describe, expect, it } from 'vitest';
import { applyOps, type EngineContext, type UiState } from '../ops/engine';
import { defaultBoxUi } from '../ui/types';
import { deriveTimeline, exportTimeline, lineIdsAt, positionOf, stateAt } from './derive';
import type { TimelineSource } from './types';

const ctx: EngineContext = {
  boxId: 'box_1',
  now: 1000,
  newId: (prefix) => `${prefix}_x`,
  themeIds: ['void'],
  actionIds: [],
  boxes: [{ id: 'box_1', name: 'Box' }],
};

function emptyState(): UiState {
  return { nav: [], pages: [], boxUi: defaultBoxUi('box_1', 0), cards: [], starters: [], glossary: [] };
}

describe('timeline', () => {
  it('derives ordered steps from sessions, lines, edits and undo entries, each with its parent', () => {
    const source: TimelineSource = {
      sessions: [{ id: 's1', box_id: 'box_1', created_at: 10 }],
      lines: [
        { id: 'l1', box_id: 'box_1', kind: 'user', text: 'add a Projects menu', created_at: 20 },
        { id: 'l2', box_id: 'box_1', kind: 'assistant', text: 'Edited: added Projects', created_at: 20 },
        { id: 'l9', box_id: 'other', kind: 'user', text: 'not this box', created_at: 25 },
      ],
      edits: [{ id: 'e1', box_id: 'box_1', summary: "Edited: added 'Projects' at the top in the sidebar", created_at: 30, state: 'undone', ops: [], inverse: [] }],
      entries: [{ id: 'n1', box_id: 'box_1', kind: 'edit', what: 'undo:nav.add', ref: 'e1', created_at: 40 }],
    };
    const steps = deriveTimeline(source, 'box_1');
    expect(steps.map((step) => step.kind)).toEqual(['session', 'user', 'assistant', 'edit', 'undo']);
    expect(steps[0]?.parent_ids).toEqual([]);
    expect(steps[1]?.parent_ids).toEqual([steps[0]?.id]);
    expect(steps[3]?.summary).toBe("added 'Projects' at the top in the sidebar");
    expect(steps.every((step) => step.branch_id === 'main')).toBe(true);
    expect([...lineIdsAt(steps, 1)]).toEqual(['l1']);
    expect([...lineIdsAt(steps, 4)]).toEqual(['l1', 'l2']);
    expect(positionOf(steps, 0)).toBe(0);
    expect(positionOf(steps, 4)).toBe(1);
  });

  it('rebuilds the interface at any step by reversing later edits, undos and redos', () => {
    const before = emptyState();
    const added = applyOps(before, [{ op: 'nav.add', label: 'Projects' }], ctx);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const source: TimelineSource = {
      sessions: [],
      lines: [{ id: 'l1', box_id: 'box_1', kind: 'user', text: 'add Projects', created_at: 1 }],
      edits: [{ id: 'e1', box_id: 'box_1', summary: 'Edited: added Projects', created_at: 2, state: 'applied', ops: added.applied, inverse: added.inverse }],
      entries: [],
    };
    const steps = deriveTimeline(source, 'box_1');
    // At the last step the state is the current one.
    const now = stateAt(steps, steps.length - 1, added.state, source.edits, ctx);
    expect(now.exact).toBe(true);
    expect(now.state.nav).toHaveLength(1);
    // One step earlier the menu item did not exist yet.
    const earlier = stateAt(steps, 0, added.state, source.edits, ctx);
    expect(earlier.exact).toBe(true);
    expect(earlier.state.nav).toHaveLength(0);

    // Undo it, then redo it: the state at each step follows.
    const undone = applyOps(added.state, added.inverse, ctx);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    const redone = applyOps(undone.state, added.applied, ctx);
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    const withFlips: TimelineSource = {
      ...source,
      edits: [{ ...source.edits[0]!, state: 'applied', ops: redone.applied, inverse: redone.inverse }],
      entries: [
        { id: 'n1', box_id: 'box_1', kind: 'edit', what: 'undo:nav.add', ref: 'e1', created_at: 3 },
        { id: 'n2', box_id: 'box_1', kind: 'edit', what: 'redo:nav.add', ref: 'e1', created_at: 4 },
      ],
    };
    const flipped = deriveTimeline(withFlips, 'box_1');
    expect(flipped.map((step) => step.kind)).toEqual(['user', 'edit', 'undo', 'redo']);
    expect(stateAt(flipped, 3, redone.state, withFlips.edits, ctx).state.nav).toHaveLength(1);
    expect(stateAt(flipped, 2, redone.state, withFlips.edits, ctx).state.nav).toHaveLength(0);
    expect(stateAt(flipped, 1, redone.state, withFlips.edits, ctx).state.nav).toHaveLength(1);
    expect(stateAt(flipped, 0, redone.state, withFlips.edits, ctx).state.nav).toHaveLength(0);
  });

  it('exports one file with branches, steps, lines and edits for the box', () => {
    const source: TimelineSource = {
      sessions: [],
      lines: [{ id: 'l1', box_id: 'box_1', kind: 'user', text: 'hi', created_at: 5, streaming: false }],
      edits: [],
      entries: [],
    };
    const file = exportTimeline(source, 'box_1', 99);
    expect(file.version).toBe('timeline.v0');
    expect(file.branches).toEqual([{ id: 'main', box_id: 'box_1', name: 'main', from_step_id: null, created_at: 5 }]);
    expect(file.steps).toHaveLength(1);
    expect(file.lines[0]).not.toHaveProperty('streaming');
  });
});
