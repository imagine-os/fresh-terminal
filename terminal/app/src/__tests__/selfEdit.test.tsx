// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Chip } from '@shared/chips';
import type { Reply } from '@shared/reply';
import { I18nProvider } from '../i18n';
import { NavTree } from '../shell/NavTree';
import { store as appStore } from '../store';
import { LocalStore } from '../store/local';
import { ChipPopover, type ChipDecision } from '../terminal/ChipPopover';
import { ChipTray } from '../terminal/ChipTray';
import { ReplyView, parseReply } from '../terminal/ReplyView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(node: React.ReactNode) {
  act(() => root.render(<I18nProvider lang="en">{node}</I18nProvider>));
}

function click(selector: string) {
  const element = host.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  act(() => element.click());
}

describe('self-editing: add a nested menu item, then undo', () => {
  it('adds Projects with Koi Pond and Library nested, renders the tree, undoes and redoes', () => {
    const store = new LocalStore('visitor-test');
    const box = store.createBox('Box 1');
    const before = store.uiState(box.id).nav.length;

    const result = store.applyOps(
      box.id,
      [
        { op: 'nav.add', label: 'Projects' },
        { op: 'nav.add', label: 'Koi Pond', parent: 'Projects', target: { kind: 'url', ref: 'pages/koi.html' } },
        { op: 'nav.add', label: 'Library', parent: 'Projects', target: { kind: 'url', ref: 'pages/library.html' } },
      ],
      'assistant',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.summary).toContain("'Koi Pond' under 'Projects'");

    const opened: string[] = [];
    const draw = () =>
      render(<NavTree items={store.uiState(box.id).nav} onActivate={(target) => opened.push(`${target.kind}:${target.ref}`)} />);
    draw();
    const projects = host.querySelector('[data-testid="nav-projects"]');
    expect(projects?.getAttribute('aria-expanded')).toBe('true');
    const koi = host.querySelector('[data-testid="nav-koi-pond"]');
    expect(koi?.getAttribute('aria-level')).toBe('2');
    click('[data-testid="nav-koi-pond"]');
    expect(opened).toEqual(['url:pages/koi.html']);
    // Every row is a 44px-class target in CSS; the tree is keyboard reachable.
    expect(host.querySelector('[role="tree"]')).not.toBeNull();

    // The edit is ledgered as kind "edit".
    expect(store.getSnapshot().entries.some((entry) => entry.kind === 'edit')).toBe(true);

    // Undo removes all three, atomically.
    const undone = store.undo(result.batch.id);
    expect(undone.ok).toBe(true);
    expect(store.uiState(box.id).nav.length).toBe(before);
    draw();
    expect(host.querySelector('[data-testid="nav-koi-pond"]')).toBeNull();

    // Redo brings them back; then rename Projects to Work.
    expect(store.redo(result.batch.id).ok).toBe(true);
    const renamed = store.applyOps(box.id, [{ op: 'nav.rename', item: 'Projects', label: 'Work' }], 'assistant');
    expect(renamed.ok).toBe(true);
    draw();
    expect(host.querySelector('[data-testid="nav-work"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="nav-koi-pond"]')?.getAttribute('aria-level')).toBe('2');
  });

  it('rejects a bad batch atomically (nothing applied)', () => {
    const store = new LocalStore('visitor-test');
    const box = store.createBox('Box 1');
    const before = store.uiState(box.id).nav.length;
    const result = store.applyOps(
      box.id,
      [
        { op: 'nav.add', label: 'Projects' },
        { op: 'nav.add', label: 'Orphan', parent: 'Does not exist' },
      ],
      'assistant',
    );
    expect(result.ok).toBe(false);
    expect(store.uiState(box.id).nav.length).toBe(before);
  });
});

describe('chip popover', () => {
  const hoy: Chip = {
    text: 'Hoy',
    start: 0,
    end: 3,
    kind: 'date',
    source: 'local',
    p: 0.5,
    alternatives: [{ kind: 'org', p: 0.45 }],
  };

  it('renders an ambiguous chip dashed with a "?" and opens on click', () => {
    let opened: Chip | null = null;
    render(<ChipTray chips={[hoy]} onOpen={(chip) => (opened = chip)} />);
    const button = host.querySelector('[data-testid="chip-hoy"]');
    expect(button?.getAttribute('data-ambiguous')).toBe('true');
    expect(button?.querySelector('.chip-q')?.textContent).toBe('?');
    click('[data-testid="chip-hoy"]');
    expect(opened).not.toBeNull();
  });

  it('changes the type to brand and teaches the glossary', () => {
    let decision: ChipDecision | null = null;
    render(
      <ChipPopover
        chip={hoy}
        records={{ pages: [], nav: [], themes: [] }}
        anchor={null}
        onApply={(value) => (decision = value)}
        onClose={() => {}}
      />,
    );
    expect(host.querySelector('[data-testid="reading-date"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="reading-org"]')).not.toBeNull();
    click('[data-testid="kind-org"]');
    click('[data-testid="teach-glossary"]');
    click('[data-testid="chip-apply"]');
    expect(decision).toEqual({
      override: { kind: 'org' },
      teach: { text: 'Hoy', type: 'org', note: '', case_sensitive: true },
    });
    // Every control in the popover is a real button or input (44px in CSS).
    const buttons = host.querySelectorAll('[data-testid="chip-popover"] button');
    expect(buttons.length).toBeGreaterThan(10);
  });
});

describe('super-CLI reply', () => {
  it('parses stored blocks and renders a header, steps, a diff, edits with undo and a next row', () => {
    // Undo in a reply acts on the app's store, so the batch lives there.
    const box = appStore.createBox('Box 1');
    const applied = appStore.applyOps(box.id, [{ op: 'nav.add', label: 'Projects' }], 'assistant');
    if (!applied.ok) throw new Error('setup failed');
    const reply: Reply = {
      meta: { intent: 'edit_ui', model: 'anthropic/claude-haiku-4.5', ms: 1840, cost_micro: 2120 },
      blocks: [
        { kind: 'summary', text: 'Added a Projects menu.' },
        { kind: 'steps', items: [{ status: 'done', text: 'Projects' }, { status: 'todo', text: 'Nest pages' }] },
        { kind: 'diff', rows: [{ label: 'sidebar', before: null, after: 'Projects' }] },
        { kind: 'edits', batch_id: applied.batch.id, summary: applied.batch.summary },
        { kind: 'next', commands: ['rename Projects to Work'] },
      ],
    };
    const parsed = parseReply(JSON.stringify(reply));
    expect(parsed).not.toBeNull();
    expect(parseReply('not json')).toBeNull();
    render(<ReplyView reply={parsed as Reply} />);
    const header = host.querySelector('[data-testid="reply-header"]')?.textContent ?? '';
    expect(header).toContain('edit_ui');
    expect(header).toContain('anthropic/claude-haiku-4.5');
    expect(header).toContain('1.8s');
    expect(host.querySelector('.rb-steps li[data-status="done"]')?.textContent).toContain('✓');
    expect(host.querySelector('[data-testid="diff-block"] ins')?.textContent).toBe('Projects');
    click('[data-testid="undo-button"]');
    expect(appStore.uiState(box.id).nav.some((item) => item.label === 'Projects')).toBe(false);
    expect(host.querySelector('[data-testid="redo-button"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="next-block"] button')?.textContent).toContain('rename Projects to Work');
  });
});
