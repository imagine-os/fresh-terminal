// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveTimeline, lineIdsAt, stateAt } from '@shared/timeline';
import { I18nProvider } from '../i18n';
import { newId } from '../lib/ids';
import { Scrubber } from '../playback/Scrubber';
import type { Playback } from '../playback/usePlayback';
import { LocalStore } from '../store/local';
import { ToastProvider } from '../ui/Toast';

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

describe('playback over a real box', () => {
  it('derives every step from the store and rebuilds the menu at each one', () => {
    const store = new LocalStore('visitor-play');
    const box = store.createBox('Replay me');
    store.openSession(box.id);
    store.appendLine(box.id, 'user', 'add a Notes page', []);
    const edit = store.applyOps(box.id, [{ op: 'page.create', title: 'Notes', blocks: [] }, { op: 'nav.add', label: 'Notes', target: { kind: 'page', ref: 'Notes' } }], 'assistant');
    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    store.appendLine(box.id, 'assistant', edit.batch.summary, []);
    const undone = store.undo(edit.batch.id);
    expect(undone.ok).toBe(true);

    const snapshot = store.getSnapshot();
    const steps = deriveTimeline(snapshot, box.id);
    expect(steps.map((step) => step.kind)).toEqual(['session', 'user', 'edit', 'assistant', 'undo']);
    expect(steps[4]?.parent_ids).toEqual([steps[3]?.id]);

    const ctx = {
      boxId: box.id,
      now: Date.now(),
      newId: (prefix: string) => newId(prefix),
      themeIds: snapshot.themes.map((theme) => theme.id),
      actionIds: [],
      boxes: [{ id: box.id, name: box.name }],
    };
    const seedNav = store.uiState(box.id).nav.length; // the undo already removed Notes
    // At the assistant step (before the undo) Notes is in the menu and the page exists.
    const beforeUndo = stateAt(steps, 3, store.uiState(box.id), snapshot.edits, ctx);
    expect(beforeUndo.exact).toBe(true);
    expect(beforeUndo.state.nav.some((item) => item.label === 'Notes')).toBe(true);
    expect(beforeUndo.state.pages.some((page) => page.title === 'Notes')).toBe(true);
    // At the user step (before the edit) neither exists.
    const beforeEdit = stateAt(steps, 1, store.uiState(box.id), snapshot.edits, ctx);
    expect(beforeEdit.exact).toBe(true);
    expect(beforeEdit.state.nav).toHaveLength(seedNav);
    expect(beforeEdit.state.pages).toHaveLength(0);
    // Lines visible at the user step: just the user line.
    expect(lineIdsAt(steps, 1).size).toBe(1);
    expect(lineIdsAt(steps, 4).size).toBe(2);
  });

  it('renders the scrubber with a range, transport buttons and the step label', () => {
    const store = new LocalStore('visitor-play-2');
    const box = store.createBox('Bar');
    store.appendLine(box.id, 'user', 'hello there', []);
    store.appendLine(box.id, 'assistant', 'hi', []);
    const steps = deriveTimeline(store.getSnapshot(), box.id);
    const calls: string[] = [];
    const playback: Playback = {
      index: 1,
      playing: false,
      speed: 1,
      seek: (index) => calls.push(`seek:${index}`),
      step: (delta) => calls.push(`step:${delta}`),
      toStart: () => calls.push('start'),
      toEnd: () => calls.push('end'),
      toggle: () => calls.push('toggle'),
      cycleSpeed: () => calls.push('speed'),
    };
    act(() =>
      root.render(
        <I18nProvider lang="en">
          <ToastProvider>
            <Scrubber steps={steps} playback={playback} exact onExit={() => calls.push('exit')} onSave={() => calls.push('save')} />
          </ToastProvider>
        </I18nProvider>,
      ),
    );
    const range = host.querySelector<HTMLInputElement>('[data-testid="scrubber-range"]');
    expect(range?.max).toBe('1');
    expect(range?.value).toBe('1');
    expect(host.querySelector('[data-testid="scrubber-label"]')?.textContent).toContain('Step 2 of 2');
    expect(host.querySelector('[data-testid="scrubber-label"]')?.textContent).toContain('hi');
    expect(host.querySelectorAll('.scrubber-mark')).toHaveLength(2);
    act(() => host.querySelector<HTMLElement>('[data-testid="play-toggle"]')?.click());
    act(() => host.querySelector<HTMLElement>('[data-testid="play-exit"]')?.click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    });
    expect(calls).toEqual(['toggle', 'exit', 'step:-1', 'start']);
  });
});
