// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { exportTimeline } from '@shared/timeline';
import { LocalStore } from '../store/local';
import { ASCII_MARK, isSessionFile, readmeFor, type SessionFile } from '../lib/sessionFile';

beforeEach(() => localStorage.clear());

describe('session file round trip', () => {
  it('starts with human text and comes back as a box with its pages, menu and lines', () => {
    const store = new LocalStore('visitor-io');
    const box = store.createBox('Travel notes');
    store.appendLine(box.id, 'user', 'make a page called Notes', []);
    const edit = store.applyOps(box.id, [{ op: 'page.create', title: 'Notes', blocks: [{ kind: 'text', text: 'hello' }] }, { op: 'nav.add', label: 'Notes', target: { kind: 'page', ref: 'Notes' } }], 'assistant');
    expect(edit.ok).toBe(true);
    const snapshot = store.getSnapshot();
    const file: SessionFile = {
      readme: readmeFor(box.name, 1000),
      product: 'Fresh Terminal',
      product_version: '0.1.0',
      version: 'session.v0',
      exported_at: 1000,
      come_back: 'https://imagine-os.github.io/fresh-terminal/',
      how_to_import: 'tray',
      box,
      timeline: exportTimeline(snapshot, box.id, 1000),
      ui: store.uiState(box.id),
      entries: [],
    };
    expect(file.readme.slice(0, ASCII_MARK.length)).toEqual(ASCII_MARK);
    expect(file.readme.join('\n')).toContain('Come back: https://imagine-os.github.io/fresh-terminal/');
    expect(file.readme.join('\n')).toContain('Import:');
    // The readme is the first key when serialised, so a person opening the file reads it first.
    expect(Object.keys(JSON.parse(JSON.stringify(file)))[0]).toBe('readme');
    expect(isSessionFile(JSON.parse(JSON.stringify(file)))).toBe(true);
    expect(isSessionFile({ version: 'nope' })).toBe(false);

    // Import into a fresh store: new ids, same content, menu target follows the new page id.
    const other = new LocalStore('visitor-elsewhere');
    const imported = other.importSession(file);
    expect(imported.name).toBe('Travel notes (imported)');
    const state = other.uiState(imported.id);
    expect(state.pages.map((page) => page.title)).toEqual(['Notes']);
    const notes = state.nav.find((item) => item.label === 'Notes');
    expect(notes?.target).toEqual({ kind: 'page', ref: state.pages[0]?.id });
    expect(state.pages[0]?.id).not.toBe(file.ui.pages[0]?.id);
    expect(other.getSnapshot().lines.filter((line) => line.box_id === imported.id).map((line) => line.text)).toEqual(['make a page called Notes']);
  });
});
