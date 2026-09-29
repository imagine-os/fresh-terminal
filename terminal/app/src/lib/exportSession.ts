import { PRODUCT_NAME, PRODUCT_VERSION } from '@shared/brand';
import { exportTimeline } from '@shared/timeline';
import { store } from '../store';
import { SESSION_VERSION, SITE_URL, readmeFor, type SessionFile } from './sessionFile';

/**
 * One file with everything about a box: a human header first (our mark, what
 * it is, how to come back, how to import), then the timeline (steps, lines,
 * edits), the interface records and the ledger entries. Nobody is locked
 * into a browser.
 */
export function sessionExport(boxId: string, now = Date.now()): SessionFile {
  const snapshot = store.getSnapshot();
  const box = snapshot.boxes.find((candidate) => candidate.id === boxId) ?? null;
  return {
    readme: readmeFor(box?.name ?? 'box', now),
    product: PRODUCT_NAME,
    product_version: PRODUCT_VERSION,
    version: SESSION_VERSION,
    exported_at: now,
    come_back: SITE_URL,
    how_to_import: 'Tools icon (top right) → Import a session → pick this file. Or drag the file onto the terminal.',
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
