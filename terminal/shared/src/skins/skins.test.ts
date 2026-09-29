import { describe, expect, it } from 'vitest';
import { applyOps, type EngineContext, type UiState } from '../ops/engine';
import { defaultBoxUi } from '../ui/types';
import { SKIN_LIBRARY, draftSkin, libraryToSkin, rankLibrary } from './library';
import { looksLikeSkinRequest, parseSkinRequest } from './request';
import { contrastRatio, ensureReadable, isSafeBackground, skinSchema } from '../ui/skin';

const ctx = (): EngineContext => {
  let n = 0;
  return { boxId: 'b1', now: 10, newId: (prefix) => `${prefix}-${++n}`, themeIds: ['void'], actionIds: [], boxes: [] };
};
const empty = (): UiState => ({ nav: [], pages: [], boxUi: defaultBoxUi('b1', 1), cards: [], starters: [], glossary: [] });

describe('skins', () => {
  it('parses the part and the material out of a request', () => {
    expect(parseSkinRequest('skin the sidebar brass')).toEqual({ target: 'sidebar', material: 'brass' });
    expect(parseSkinRequest('make the stage look like worn leather')).toEqual({ target: 'stage', material: 'worn leather' });
    expect(parseSkinRequest('use a marble material on the top bar')).toEqual({ target: 'topbar', material: 'marble' });
    expect(looksLikeSkinRequest('skin the prompt box ocean')).toBe(true);
    expect(looksLikeSkinRequest('rename Projects to Work')).toBe(false);
  });

  it('accepts gradients and refuses url(), expressions and rule breaks', () => {
    for (const material of SKIN_LIBRARY) expect(isSafeBackground(material.background)).toBe(true);
    expect(isSafeBackground('url(https://x.test/a.png)')).toBe(false);
    expect(isSafeBackground('linear-gradient(red, blue); } body { color: red')).toBe(false);
    expect(isSafeBackground('expression(alert(1))')).toBe(false);
    expect(isSafeBackground('linear-gradient(red, blue')).toBe(false);
  });

  it('keeps library materials readable (fg on bg at least 4.5:1)', () => {
    for (const material of SKIN_LIBRARY) {
      const tokens = ensureReadable(material.tokens);
      expect(contrastRatio(tokens['--fg'] ?? '', tokens['--bg'] ?? '')).toBeGreaterThanOrEqual(4.5);
    }
    expect(ensureReadable({ '--bg': '#101010', '--fg': '#202020' })['--fg']).toBe('#f5f5f0');
  });

  it('drafts instantly: library hit, colour tint, or a labelled stand-in', () => {
    expect(rankLibrary('old brass door')[0]?.material.id).toBe('brass');
    expect(draftSkin('brass', 'stage', 's1', 1).name).toBe('Draft: Brushed brass');
    expect(draftSkin('something teal and fluffy', 'stage', 's2', 1).name).toBe('Draft: colour tint');
    expect(draftSkin('zorblax', 'stage', 's3', 1).name).toBe('Draft: working on it');
    expect(skinSchema.safeParse(draftSkin('zorblax', 'stage', 's3', 1)).success).toBe(true);
  });

  it('skin.apply is undoable, and a second skin undoes back to the first', () => {
    const brass = libraryToSkin(SKIN_LIBRARY[0]!, 'sidebar', 'brass', 'skin-a', 1);
    const first = applyOps(empty(), [{ op: 'skin.apply', skin: brass }], ctx());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.boxUi.skins.sidebar?.name).toBe('Brushed brass');
    expect(first.changes[0]?.text).toBe("skinned the sidebar as 'Brushed brass' (material library)");
    const paper = libraryToSkin(SKIN_LIBRARY[1]!, 'sidebar', 'paper', 'skin-b', 2);
    const second = applyOps(first.state, [{ op: 'skin.apply', skin: paper }], ctx());
    if (!second.ok) throw new Error('second failed');
    const back = applyOps(second.state, second.inverse, ctx());
    if (!back.ok) throw new Error('undo failed');
    expect(back.state.boxUi.skins.sidebar?.id).toBe('skin-a');
    const gone = applyOps(back.state, first.inverse, ctx());
    if (!gone.ok) throw new Error('undo 2 failed');
    expect(gone.state.boxUi.skins.sidebar).toBeUndefined();
  });

  it('rejects a skin with unsafe CSS as an op', () => {
    const result = applyOps(empty(), [{ op: 'skin.apply', skin: { ...libraryToSkin(SKIN_LIBRARY[0]!, 'stage', 'x', 'id', 1), background: 'url(javascript:alert(1))' } } as never], ctx());
    expect(result.ok).toBe(false);
  });
});
