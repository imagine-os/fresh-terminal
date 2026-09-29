// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from '../store/local';

beforeEach(() => localStorage.clear());

describe('removing a box', () => {
  it('drops the box with its lines, menu, pages, edits and UI, and keeps the ledger', () => {
    const store = new LocalStore('visitor-remove');
    const keep = store.createBox('Keep');
    const gone = store.createBox('Gone');
    store.openSession(gone.id);
    store.appendLine(gone.id, 'user', 'hello', []);
    const edit = store.applyOps(gone.id, [{ op: 'page.create', title: 'Scratch', blocks: [] }], 'assistant');
    expect(edit.ok).toBe(true);
    const entriesBefore = store.getSnapshot().entries.length;

    store.removeBox(gone.id);
    const snapshot = store.getSnapshot();
    expect(snapshot.boxes.map((box) => box.id)).toEqual([keep.id]);
    expect(snapshot.lines.some((line) => line.box_id === gone.id)).toBe(false);
    expect(snapshot.sessions.some((session) => session.box_id === gone.id)).toBe(false);
    expect(snapshot.navItems.some((item) => item.box_id === gone.id)).toBe(false);
    expect(snapshot.pages.some((page) => page.box_id === gone.id)).toBe(false);
    expect(snapshot.edits.some((batch) => batch.box_id === gone.id)).toBe(false);
    expect(snapshot.boxUis.some((ui) => ui.box_id === gone.id)).toBe(false);
    expect(snapshot.entries.length).toBe(entriesBefore);
    // The kept box still has its default menu.
    expect(snapshot.navItems.filter((item) => item.box_id === keep.id).length).toBeGreaterThan(0);
    // Reloading the store from storage agrees.
    expect(new LocalStore('visitor-remove').getSnapshot().boxes).toHaveLength(1);
  });
});
