// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { LocalStore } from '../store/local';
import { exportTimeline } from '@shared/timeline';

beforeEach(() => localStorage.clear());

describe('session export shape', () => {
  it('bundles the box, its timeline, interface records and ledger entries', () => {
    const store = new LocalStore('visitor-export');
    const box = store.createBox('Export me');
    store.appendLine(box.id, 'user', 'hello', []);
    store.applyOps(box.id, [{ op: 'page.create', title: 'Notes', blocks: [] }], 'assistant');
    const snapshot = store.getSnapshot();
    const data = {
      version: 'session.v0' as const,
      box: snapshot.boxes.find((candidate) => candidate.id === box.id) ?? null,
      timeline: exportTimeline(snapshot, box.id, 1),
      ui: store.uiState(box.id),
      entries: snapshot.entries.filter((entry) => entry.box_id === box.id),
    };
    expect(data.box?.name).toBe('Export me');
    expect(data.timeline.steps.map((step) => step.kind)).toEqual(['user', 'edit']);
    expect(data.ui.pages.map((page) => page.title)).toEqual(['Notes']);
    expect(data.entries.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(data)).version).toBe('session.v0');
  });
});
