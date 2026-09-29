import { describe, expect, it } from 'vitest';
import type { Line } from '../store/types';
import { NO_MODEL, actionRows, filterRows, rowFacets, sortRows, type EditLite, type LedgerLite } from './rows';

const meta = (value: Record<string, unknown> | null, blocks: Array<Record<string, unknown>> = []) => JSON.stringify({ meta: value, blocks });
function line(id: string, kind: Line['kind'], text: string, at: number, blocks_json = '', box = 'b1'): Line {
  return { id, box_id: box, kind, text, chips_json: '[]', component: '', reveal: '', blocks_json, created_at: at };
}
const edit = (id: string, at: number, state: EditLite['state'] = 'applied', box = 'b1'): EditLite => ({ id, box_id: box, summary: `Edited: ${id}`, state, created_at: at });
const charge = (id: string, at: number, model: string, price: number, what = 'model.call', box = 'b1'): LedgerLite => ({ id, box_id: box, kind: 'charge', what, model, price_micro: price, created_at: at });
const local = meta({ intent: 'edit_ui', model: '', ms: 1, cost_micro: 0, source: 'local' });

/** Justin's live check: make a page, switch the theme, then undo. */
const lines: Line[] = [
  line('u1', 'user', 'make a page called Notes', 1000),
  line('a1', 'assistant', 'Edited: page Notes', 1002, local),
  line('u2', 'user', 'switch to Glass Window', 2000),
  line('a2', 'assistant', 'Edited: theme', 2002, local),
  line('u3', 'user', 'undo', 3000),
  line('s3', 'system', 'Undone: theme', 3002, meta({ intent: 'undo', model: '', ms: 1, cost_micro: 0, source: 'local' })),
];
const edits = [edit('e1', 1001), edit('e2', 2001, 'undone')];

describe('actionRows', () => {
  it('makes one row per line, reply, note and edit, in order, with statuses', () => {
    const rows = actionRows(lines, edits, 'b1');
    expect(rows.map((row) => [row.id, row.kind, row.status])).toEqual([
      ['u1', 'line', 'sent'],
      ['e1', 'edit', 'applied'],
      ['a1', 'reply', 'answered'],
      ['u2', 'line', 'sent'],
      ['e2', 'edit', 'undone'],
      ['a2', 'reply', 'answered'],
      ['u3', 'line', 'sent'],
      ['s3', 'system', 'noted'],
    ]);
  });

  it('links each reply, note and edit to the line that asked for it', () => {
    const follows = Object.fromEntries(actionRows(lines, edits, 'b1').map((row) => [row.id, row.follows]));
    expect(follows).toEqual({ u1: null, e1: 'u1', a1: 'u1', u2: null, e2: 'u2', a2: 'u2', u3: null, s3: 'u3' });
  });

  it('keeps the follows relation inside a stage when every stage is shown', () => {
    const mixed = [line('w1', 'user', 'hello from work', 1500, '', 'b2'), line('w2', 'assistant', 'hi', 1600, '', 'b2'), ...lines];
    const rows = actionRows(mixed, [...edits, edit('w3', 1700, 'applied', 'b2')], null);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('a1')?.follows).toBe('u1');
    expect(byId.get('e2')?.follows).toBe('u2');
    expect(byId.get('w2')?.follows).toBe('w1');
    expect(byId.get('w3')?.follows).toBe('w1');
    expect(byId.get('w3')?.box_id).toBe('b2');
    expect(actionRows(mixed, edits, 'b2').map((row) => row.id)).toEqual(['w1', 'w2']);
  });

  it('marks a reply with an error block as failed', () => {
    const rows = actionRows([line('u1', 'user', 'x', 1), line('a1', 'assistant', 'Not applied', 2, meta({ intent: 'edit_ui', model: 'm', ms: 1, cost_micro: 0 }, [{ kind: 'error', text: 'bad' }]))], [], 'b1');
    expect(rows[1]?.status).toBe('failed');
  });

  it('knows a local turn cost nothing and ran no model', () => {
    const rows = actionRows(lines, edits, 'b1');
    const reply = rows.find((row) => row.id === 'a2');
    expect(reply).toMatchObject({ cost_micro: 0, cost_known: true, models: [] });
    expect(rows.find((row) => row.id === 'u2')?.cost_known).toBe(false);
  });

  it('takes model and cost from the ledger entry a reply names, even if the router clock put it early', () => {
    const turn = [line('u1', 'user', 'write a haiku', 1000), line('a1', 'assistant', 'Autumn…', 1500, meta({ intent: 'chat', model: 'meta-model', ms: 400, cost_micro: 999, ledger_ids: ['c1'] }))];
    const rows = actionRows(turn, [], 'b1', [charge('c1', 900, 'openai/gpt-5-mini', 120)]);
    expect(rows[1]).toMatchObject({ models: ['openai/gpt-5-mini'], cost_micro: 120, cost_known: true, entry_ids: ['c1'] });
    // The line that asked carries the model too (for the model filter), not the cost.
    expect(rows[0]).toMatchObject({ models: ['openai/gpt-5-mini'], cost_micro: 0 });
  });

  it('counts charges written during a turn, and the tagger charge from while it was typed', () => {
    const turn = [
      line('u1', 'user', 'first', 1000),
      line('a1', 'assistant', 'one', 1400, meta({ intent: 'chat', model: 'x', ms: 1, cost_micro: 7 })),
      line('u2', 'user', 'second', 2000),
      line('a2', 'assistant', 'two', 2600, meta({ intent: 'chat', model: 'y', ms: 1, cost_micro: 5 })),
    ];
    const rows = actionRows(turn, [], 'b1', [
      charge('c1', 1300, 'anthropic/claude-haiku-5', 40),
      charge('t2', 1900, 'google/gemini-2.5-flash-lite', 3, 'chips.tag'),
      charge('c2', 2500, 'anthropic/claude-haiku-5', 45),
      charge('other', 2500, 'z', 1000, 'model.call', 'b9'),
    ]);
    expect(rows.find((row) => row.id === 'a1')).toMatchObject({ cost_micro: 40, models: ['anthropic/claude-haiku-5'] });
    expect(rows.find((row) => row.id === 'a2')).toMatchObject({ cost_micro: 48, models: ['google/gemini-2.5-flash-lite', 'anthropic/claude-haiku-5'] });
  });

  it('falls back to the reply header when the ledger has nothing for the turn', () => {
    const rows = actionRows([line('u1', 'user', 'hi', 1), line('a1', 'assistant', 'Hello', 2, meta({ intent: 'chat', model: 'openrouter/auto', ms: 1, cost_micro: 12 }))], [], 'b1', []);
    expect(rows[1]).toMatchObject({ cost_micro: 12, cost_known: true, models: ['openrouter/auto'] });
  });

  it('is empty with nothing typed', () => {
    expect(actionRows([], [], null, [])).toEqual([]);
  });
});

describe('filterRows and sortRows', () => {
  const rows = actionRows(
    [...lines, line('w1', 'user', 'draft the launch post', 4000, '', 'b2'), line('w2', 'assistant', 'Here it is', 4100, meta({ intent: 'write', model: 'm', ms: 1, cost_micro: 0, ledger_ids: ['c9'] }), 'b2')],
    edits,
    null,
    [charge('c9', 4090, 'anthropic/claude-sonnet-5', 2100, 'model.call', 'b2')],
  );
  const ids = (list: typeof rows) => list.map((row) => row.id);

  it('filters by status, stage, model and words', () => {
    expect(ids(filterRows(rows, { status: 'undone' }))).toEqual(['e2']);
    expect(ids(filterRows(rows, { stage: 'b2' }))).toEqual(['w1', 'w2']);
    expect(ids(filterRows(rows, { model: 'anthropic/claude-sonnet-5' }))).toEqual(['w1', 'w2']);
    expect(filterRows(rows, { model: NO_MODEL }).every((row) => row.box_id === 'b1')).toBe(true);
    expect(ids(filterRows(rows, { text: 'GLASS' }))).toEqual(['u2']);
    expect(ids(filterRows(rows, { text: 'launch sonnet' }))).toEqual(['w1']);
    expect(ids(filterRows(rows, { text: 'reply', stage: 'b1' }))).toEqual(['a1', 'a2']);
    expect(filterRows(rows, { status: 'all', stage: 'all', model: 'all', text: '  ' })).toHaveLength(rows.length);
  });

  it('matches the labels in the reader language', () => {
    expect(ids(filterRows(rows, { text: 'deshecha' }, (row) => (row.status === 'undone' ? 'edición deshecha' : '')))).toEqual(['e2']);
  });

  it('sorts newest, oldest, by status and by cost', () => {
    expect(ids(sortRows(rows, 'oldest'))).toEqual(['u1', 'e1', 'a1', 'u2', 'e2', 'a2', 'u3', 's3', 'w1', 'w2']);
    expect(ids(sortRows(rows, 'newest'))).toEqual(['w2', 'w1', 's3', 'u3', 'a2', 'e2', 'u2', 'a1', 'e1', 'u1']);
    expect(sortRows(rows, 'status').map((row) => row.status)).toEqual(['sent', 'sent', 'sent', 'sent', 'answered', 'answered', 'answered', 'applied', 'undone', 'noted']);
    // Status ties go newest first.
    expect(ids(sortRows(rows, 'status')).slice(0, 4)).toEqual(['w1', 'u3', 'u2', 'u1']);
    expect(ids(sortRows(rows, 'cost'))[0]).toBe('w2');
    expect(sortRows(rows, 'cost').map((row) => row.cost_micro)).toEqual([2100, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('lists the stages and models to filter by', () => {
    expect(rowFacets(rows)).toEqual({ stages: ['b1', 'b2'], models: [NO_MODEL, 'anthropic/claude-sonnet-5'] });
  });
});
