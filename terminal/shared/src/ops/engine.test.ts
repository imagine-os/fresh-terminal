import { describe, expect, it } from 'vitest';
import { parseDialect } from '../dialect/parse';
import { defaultSpecText } from '../dialect/types';
import { buildNavTree } from '../ui/nav';
import { defaultBoxUi, type NavItem } from '../ui/types';
import { applyOps, summarize, type EngineContext, type UiState } from './engine';
import { opBatchSchema, type Op } from './schema';
import { ALL_TOOLS, parseToolCall, toolNameFor } from './tools';

function ctx(): EngineContext {
  let counter = 0;
  return {
    boxId: 'box-1',
    now: 1000,
    newId: (prefix) => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
    themeIds: ['void', 'blank-page', 'glass-window'],
    actionIds: ['canvas.open', 'plan.open'],
    boxes: [{ id: 'box-1', name: 'First box' }],
  };
}

function seedNav(): NavItem[] {
  return [{ id: 'nav-lib', box_id: 'box-1', parent_id: null, label: 'Library', target: { kind: 'url', ref: 'pages/library.html' }, order: 0, created_at: 1, updated_at: 1 }];
}

function empty(): UiState {
  return { nav: seedNav(), pages: [], boxUi: defaultBoxUi('box-1', 1), cards: [], starters: [], glossary: [] };
}

/** Timestamps legitimately move on rename-back; everything else must round-trip exactly. */
function strip(state: UiState) {
  const clean = <T extends object>(list: T[]) => list.map((item) => ({ ...item, updated_at: 0 }));
  return { ...state, nav: clean(state.nav), pages: clean(state.pages), boxUi: { ...state.boxUi, updated_at: 0 } };
}

function roundTrip(ops: Op[], start: UiState = empty()) {
  const context = ctx();
  const forward = applyOps(start, ops, context);
  if (!forward.ok) {
    throw new Error(forward.reason);
  }
  const back = applyOps(forward.state, forward.inverse, context);
  if (!back.ok) {
    throw new Error(back.reason);
  }
  expect(strip(back.state)).toEqual(strip(start));
  return forward;
}

describe('ops engine', () => {
  it('builds a nested menu in one batch by label and undoes it exactly', () => {
    const result = roundTrip([
      { op: 'nav.add', label: 'Projects' },
      { op: 'nav.add', label: 'Koi Pond', parent: 'Projects', target: { kind: 'url', ref: 'pages/koi.html' } },
      { op: 'nav.add', label: 'Library', parent: 'projects', target: { kind: 'url', ref: 'pages/library.html' } },
    ]);
    const tree = buildNavTree(result.state.nav);
    const projects = tree.find((node) => node.item.label === 'Projects');
    expect(projects?.children.map((child) => child.item.label)).toEqual(['Koi Pond', 'Library']);
    expect(summarize(result.changes)).toBe(
      "Edited: added 'Projects' at the top in the sidebar; added 'Koi Pond' under 'Projects' in the sidebar; added 'Library' under 'Projects' in the sidebar",
    );
  });

  it('round-trips rename, move, retarget and remove of a subtree', () => {
    const built = applyOps(
      empty(),
      [
        { op: 'nav.add', label: 'Projects' },
        { op: 'nav.add', label: 'Koi', parent: 'Projects', target: { kind: 'url', ref: 'pages/koi.html' } },
      ],
      ctx(),
    );
    if (!built.ok) throw new Error(built.reason);
    roundTrip([{ op: 'nav.rename', item: 'Projects', label: 'Work' }], built.state);
    roundTrip([{ op: 'nav.move', item: 'Koi', parent: null }], built.state);
    roundTrip([{ op: 'nav.retarget', item: 'Koi', target: { kind: 'action', ref: 'canvas.open' } }], built.state);
    const removed = roundTrip([{ op: 'nav.remove', item: 'Projects' }], built.state);
    expect(removed.state.nav.map((item) => item.label)).toEqual(['Library']);
    expect(removed.changes[0]?.text).toBe("removed 'Projects' and 1 nested item from the sidebar");
  });

  it('round-trips shell, theme and style ops, patching only what the dialect mentions', () => {
    const result = roundTrip([
      { op: 'shell.set', dialect_text: 'Left sidebar: rail on laptop.' },
      { op: 'theme.set', theme_id: 'glass-window' },
      { op: 'style.set', token: '--accent', value: '#ff7a00' },
    ]);
    expect(result.state.boxUi.theme_id).toBe('glass-window');
    expect(result.state.boxUi.style['--accent']).toBe('#ff7a00');
    const spec = parseDialect(result.state.boxUi.dialect_text ?? defaultSpecText).spec;
    expect(spec.regions.leftSidebar.behaviour).toEqual({ phone: 'hidden', tablet: 'hidden', laptop: 'rail', desk: 'hidden', wall: 'hidden' });
  });

  it('round-trips page, card, starter and glossary ops', () => {
    const page = roundTrip([
      { op: 'page.create', title: 'Notes', blocks: [{ kind: 'heading', text: 'Notes', level: 1 }] },
      { op: 'page.add_block', page: 'Notes', block: { kind: 'list', items: ['a', 'b'] } },
      { op: 'page.update_block', page: 'Notes', index: 0, block: { kind: 'heading', text: 'My notes', level: 1 } },
      { op: 'nav.add', label: 'Notes', target: { kind: 'page', ref: 'Notes' } },
    ]);
    expect(page.state.pages[0]?.blocks).toHaveLength(2);
    expect(page.state.nav.find((item) => item.label === 'Notes')?.target).toEqual({ kind: 'page', ref: page.state.pages[0]?.id });
    roundTrip([{ op: 'card.add', title: 'Koi Pond', kind: 'page', href: 'pages/koi.html' }]);
    roundTrip([{ op: 'starter.add', text: 'Show my projects' }]);
    const term = roundTrip([{ op: 'glossary.add', text: 'Hoy', type: 'org', note: 'the brand' }]);
    expect(term.state.glossary[0]).toMatchObject({ text: 'Hoy', type: 'org', case_sensitive: true });
  });

  it('is atomic: one bad op applies nothing and names the reason', () => {
    const result = applyOps(
      empty(),
      [
        { op: 'nav.add', label: 'Projects' },
        { op: 'nav.add', label: 'Koi', parent: 'Nope' },
      ],
      ctx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.index).toBe(1);
      expect(result.reason).toBe('No menu item called "Nope"');
    }
    const theme = applyOps(empty(), [{ op: 'theme.set', theme_id: 'neon' }], ctx());
    expect(theme.ok).toBe(false);
    const dialect = applyOps(empty(), [{ op: 'shell.set', dialect_text: 'Left sidebar: wobbly on laptop.' }], ctx());
    expect(dialect.ok ? '' : dialect.reason).toContain('Unknown behaviour "wobbly"');
    const cycle = applyOps(empty(), [{ op: 'nav.add', label: 'A' }, { op: 'nav.add', label: 'B', parent: 'A' }, { op: 'nav.move', item: 'A', parent: 'B' }], ctx());
    expect(cycle.ok ? '' : cycle.reason).toBe("Cannot move 'A' inside itself");
  });

  it('rejects unsafe links in the schema', () => {
    expect(opBatchSchema.safeParse([{ op: 'nav.add', label: 'x', target: { kind: 'url', ref: 'javascript:alert(1)' } }]).success).toBe(false);
  });
});

describe('tools', () => {
  it('exposes every public op plus respond, with dot-free names', () => {
    const names = ALL_TOOLS.map((tool) => tool.function.name);
    expect(names).toContain('nav_add');
    expect(names).toContain('respond');
    expect(names).not.toContain('nav_restore');
    for (const name of names) {
      expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
    expect(toolNameFor('page.add_block')).toBe('page_add_block');
  });

  it('parses tool calls into ops, tolerating nulls, and rejects bad ones with reasons', () => {
    const ok = parseToolCall('nav_add', JSON.stringify({ label: 'Koi', parent: null, target: { kind: 'url', ref: 'pages/koi.html' }, icon: null }));
    expect(ok).toEqual({ ok: true, kind: 'op', op: { op: 'nav.add', label: 'Koi', target: { kind: 'url', ref: 'pages/koi.html' } } });
    expect(parseToolCall('page_add_block', JSON.stringify({ page: 'Notes', block: { kind: 'heading', text: 'x' } }))).toMatchObject({ ok: true });
    expect(parseToolCall('nav_add', '{"label":')).toEqual({ ok: false, reason: 'nav_add: arguments are not valid JSON' });
    expect(parseToolCall('nav_restore', '{}')).toEqual({ ok: false, reason: 'Unknown tool "nav_restore"' });
    expect(parseToolCall('theme_set', '{}')).toMatchObject({ ok: false });
  });

  it('parses respond blocks, dropping invalid ones', () => {
    const parsed = parseToolCall(
      'respond',
      JSON.stringify({ blocks: [{ kind: 'summary', text: 'Added Projects.' }, { kind: 'next', commands: ['rename Projects to Work'] }, { kind: 'table' }] }),
    );
    expect(parsed.ok && parsed.kind === 'respond' ? parsed.blocks.map((block) => block.kind) : []).toEqual(['summary', 'next']);
    expect(parsed.ok && parsed.kind === 'respond' ? parsed.dropped.length : 0).toBe(1);
  });
});
