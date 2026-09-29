import { describe, expect, it } from 'vitest';
import { store } from '../store';

describe('renameBox (C-091)', () => {
  it('renames a stage, trims it, and ignores blank names', () => {
    const box = store.createBox('Untitled stage');
    store.renameBox(box.id, '  Travel notes  ');
    expect(store.getSnapshot().boxes.find((candidate) => candidate.id === box.id)?.name).toBe('Travel notes');
    store.renameBox(box.id, '   ');
    expect(store.getSnapshot().boxes.find((candidate) => candidate.id === box.id)?.name).toBe('Travel notes');
    store.removeBox(box.id);
  });
});
