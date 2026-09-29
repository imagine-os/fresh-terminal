import { describe, expect, it } from 'vitest';
import { SEED_THEMES } from '@shared/themes';
import { TARGET, VOID_TOKENS, clerkAppearance, isDark, parseColor, solid, type ThemeTokens } from './clerkAppearance';

function tokensFor(id: string): ThemeTokens {
  const theme = SEED_THEMES.find((candidate) => candidate.id === id);
  if (!theme) throw new Error(`no theme ${id}`);
  const t = theme.tokens as Record<string, string>;
  return {
    ...VOID_TOKENS,
    bg: t['--bg'] ?? VOID_TOKENS.bg,
    elevated: t['--bg-elevated'] ?? VOID_TOKENS.elevated,
    surface: t['--surface'] ?? VOID_TOKENS.surface,
    fg: t['--fg'] ?? VOID_TOKENS.fg,
    muted: t['--fg-muted'] ?? VOID_TOKENS.muted,
    accent: t['--accent'] ?? VOID_TOKENS.accent,
    accentFg: t['--accent-fg'] ?? VOID_TOKENS.accentFg,
    border: t['--border'] ?? VOID_TOKENS.border,
    borderStrong: t['--border-strong'] ?? VOID_TOKENS.borderStrong,
    focus: t['--focus'] ?? VOID_TOKENS.focus,
    ...(t['--font-sans'] ? { fontSans: t['--font-sans'] } : {}),
  };
}

describe('clerkAppearance', () => {
  it('Void: square, black, green foreground, green primary button, no shadow, mono fonts', () => {
    const a = clerkAppearance(tokensFor('void'));
    expect(a.variables.borderRadius).toBe('0');
    expect(a.variables.colorBackground).toBe('#000000');
    expect(a.variables.colorForeground).toBe('#33ff66');
    expect(a.variables.colorPrimary).toBe('#33ff66');
    expect(a.variables.colorPrimaryForeground).toBe('#000000');
    expect(a.variables.colorShadow).toBe('transparent');
    expect(a.variables.fontFamily).toContain('monospace');
    expect(a.variables.fontFamilyMono).toContain('monospace');
    expect(a.elements.cardBox).toMatchObject({ boxShadow: 'none', borderRadius: 0 });
    expect(a.elements.footer).toMatchObject({ fontFamily: VOID_TOKENS.fontMono });
  });

  it('Blank Page: white card, black text and a black primary button', () => {
    const tokens = tokensFor('blank-page');
    const a = clerkAppearance(tokens);
    expect(isDark(tokens)).toBe(false);
    expect(a.variables.colorBackground).toBe('#ffffff');
    expect(a.variables.colorForeground).toBe('#000000');
    expect(a.variables.colorPrimary).toBe('#000000');
    expect(a.variables.colorPrimaryForeground).toBe('#ffffff');
  });

  it('Glass Window: translucent tokens are flattened to solid colours for the portal', () => {
    const a = clerkAppearance(tokensFor('glass-window'));
    for (const key of ['colorBackground', 'colorInput', 'colorBorder'] as const) {
      expect(a.variables[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(a.variables.colorPrimary).toBe('#7cf0c4');
    expect(a.variables.colorForeground).toBe('#eef3f8');
  });

  it('every interactive element gets a 44px target and a visible focus outline', () => {
    const a = clerkAppearance();
    for (const key of ['formButtonPrimary', 'formFieldInput', 'socialButtonsBlockButton', 'footerActionLink', 'userButtonTrigger', 'userButtonPopoverActionButton'] as const) {
      const style = a.elements[key] as Record<string, unknown>;
      expect(style.minHeight, key).toBe(TARGET);
      expect(TARGET).toContain('2.75rem');
    }
    const focus = (a.elements.formButtonPrimary as Record<string, Record<string, string>>)['&:focus-visible'];
    expect(focus?.outline).toBe('2px solid #33ff66');
  });

  it('parses and flattens colours', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0, 0.5]);
    expect(solid('#ffffff80', '#000000')).toBe('#808080');
    expect(solid('not-a-colour', '#000')).toBe('not-a-colour');
  });
});
