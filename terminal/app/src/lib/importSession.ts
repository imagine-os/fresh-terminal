import { store, type Box } from '../store';
import { isSessionFile, type SessionFile } from './sessionFile';

export type ImportResult = { ok: true; box: Box; lines: number; pages: number } | { ok: false; reason: string };

/** Parses a file's text and rebuilds the box from its final state. */
export function importSessionText(text: string, fileName = 'session'): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: `${fileName} is not a JSON file` };
  }
  if (!isSessionFile(parsed)) {
    return { ok: false, reason: `${fileName} is not a Fresh Terminal session file (session.v0)` };
  }
  return importSession(parsed);
}

export function importSession(file: SessionFile): ImportResult {
  const box = store.importSession(file);
  return { ok: true, box, lines: file.timeline.lines.length, pages: file.ui.pages.length };
}

export async function importSessionFile(file: File): Promise<ImportResult> {
  return importSessionText(await file.text(), file.name);
}

/** Opens the system file picker and imports the chosen file. */
export function pickAndImport(): Promise<ImportResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await importSessionFile(file) : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
