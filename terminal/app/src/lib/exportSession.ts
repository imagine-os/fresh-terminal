import { exportTimeline } from '@shared/timeline';
import { store } from '../store';

/**
 * One file with everything about a box: its timeline (steps, lines, edits),
 * the interface records (menu, pages, layout, theme, glossary) and its ledger
 * entries. Nobody is locked into a browser: this is the export the first-run
 * notice and the tray offer, and the shape a future import reads.
 */
export function sessionExport(boxId: string, now = Date.now()) {
  const snapshot = store.getSnapshot();
  const box = snapshot.boxes.find((candidate) => candidate.id === boxId) ?? null;
  return {
    version: 'session.v0' as const,
    exported_at: now,
    box,
    timeline: exportTimeline(snapshot, boxId, now),
    ui: store.uiState(boxId),
    entries: snapshot.entries.filter((entry) => entry.box_id === boxId),
  };
}

export function downloadSession(boxId: string): string {
  const data = sessionExport(boxId);
  const safe = (data.box?.name ?? 'box').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'box';
  const name = `${safe}-session.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
  return name;
}
