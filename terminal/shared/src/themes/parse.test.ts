import { describe, expect, it } from 'vitest';
import { parseTheme, printTheme } from './parse';
import { SEED_THEMES, THEME_GLASS_WINDOW, THEME_VOID, nextThemeId } from './seed';
import { themeSchema } from './types';

describe('theme dialect', () => {
  it('parses the example from the brief', () => {
    const { theme, issues } = parseTheme('Stage: glass over fog, airy. Cursor: glow, green. Bezel: none.', THEME_VOID);
    expect(issues).toEqual([]);
    expect(theme.surface).toBe('glass');
    expect(theme.backdrop).toBe('fog');
    expect(theme.spacing).toBe('airy');
    expect(theme.cursor.glow).toBe(true);
    expect(theme.cursor.color).toBe('green');
    expect(theme.bezel).toBe('none');
  });

  it('parses cursor, motion and response words', () => {
    const { theme, issues } = parseTheme(
      'Cursor: caret, amber, steady.\nMotion: parallax.\nResponds to: tilt.\nText: chalk.\nBezel: plastic.',
      THEME_VOID,
    );
    expect(issues).toEqual([]);
    expect(theme.cursor).toEqual({ shape: 'caret', color: 'amber', blink: false, glow: true });
    expect(theme.motion).toBe('parallax');
    expect(theme.respondsTo).toBe('tilt');
    expect(theme.text).toBe('chalk');
    expect(theme.bezel).toBe('plastic');
  });

  it('reports unknown words instead of guessing', () => {
    const { issues } = parseTheme('Stage: velvet. Cursor: wiggly. Bezel: chrome.', THEME_VOID);
    expect(issues.map((issue) => issue.message)).toEqual([
      'Unknown material "velvet"',
      'Unknown cursor word "wiggly"',
      'Unknown bezel "chrome"',
    ]);
  });

  it('round-trips the seeded themes through printTheme', () => {
    for (const seed of SEED_THEMES) {
      const printed = printTheme(seed);
      const { theme, issues } = parseTheme(printed, seed);
      expect(issues).toEqual([]);
      expect(theme).toEqual(seed);
    }
  });

  it('validates the seeded themes against the schema', () => {
    for (const seed of SEED_THEMES) {
      expect(themeSchema.safeParse(seed).success).toBe(true);
    }
  });

  it('cycles themes', () => {
    expect(nextThemeId(THEME_VOID.id)).toBe('blank-page');
    expect(nextThemeId(THEME_GLASS_WINDOW.id)).toBe(THEME_VOID.id);
  });
});

describe('theme fallbacks', () => {
  it('resolves built ids directly and unbuilt ids to the closest built theme', async () => {
    const { resolveThemeId, THEME_FALLBACKS } = await import('./seed');
    expect(resolveThemeId('void')).toEqual({ id: 'void', built: true, requested: 'void' });
    expect(resolveThemeId('Frosted')).toEqual({ id: 'glass-window', built: false, requested: 'frosted' });
    expect(resolveThemeId('nope').id).toBe('void');
    expect(Object.keys(THEME_FALLBACKS)).toHaveLength(13);
  });
});

describe('theme surface pages', () => {
  it('maps koi-pond to its page', async () => {
    const { THEME_SURFACE_PAGES } = await import('./seed');
    expect(THEME_SURFACE_PAGES['koi-pond']).toBe('pages/koi.html');
  });
});
