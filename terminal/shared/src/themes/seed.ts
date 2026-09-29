import type { Theme } from './types';

/**
 * The three themes shipped in pass 1. Simplicity is the point.
 * Camera and tilt responses are listed in the schema but not wired.
 */
export const THEME_VOID: Theme = {
  id: 'void',
  name: 'Void',
  scheme: 'dark',
  surface: 'flat',
  backdrop: 'none',
  spacing: 'roomy',
  bezel: 'none',
  text: 'phosphor',
  cursor: { shape: 'block', color: 'green', blink: true, glow: true },
  motion: 'none',
  respondsTo: 'none',
  tokens: {
    '--bg': '#000000',
    '--bg-elevated': '#000000',
    '--surface': '#050805',
    '--surface-hover': '#0b120b',
    '--border': '#123a1c',
    '--border-strong': '#1f6b32',
    '--fg': '#33ff66',
    '--fg-muted': '#22b347',
    '--fg-faint': '#177a31',
    '--accent': '#33ff66',
    '--accent-fg': '#000000',
    '--accent-soft': '#33ff6622',
    '--focus': '#33ff66',
    '--doodle': '#33ff66b0',
    '--font-sans': "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
  },
};

export const THEME_BLANK_PAGE: Theme = {
  id: 'blank-page',
  name: 'Blank Page',
  scheme: 'light',
  surface: 'paper',
  backdrop: 'none',
  spacing: 'airy',
  bezel: 'none',
  text: 'ink',
  cursor: { shape: 'block', color: 'black', blink: true, glow: false },
  motion: 'none',
  respondsTo: 'none',
  tokens: {
    '--bg': '#ffffff',
    '--bg-elevated': '#ffffff',
    '--surface': '#ffffff',
    '--surface-hover': '#f2f2f2',
    '--border': '#e6e6e6',
    '--border-strong': '#bdbdbd',
    '--fg': '#000000',
    '--fg-muted': '#4a4a4a',
    '--fg-faint': '#9a9a9a',
    '--accent': '#000000',
    '--accent-fg': '#ffffff',
    '--accent-soft': '#00000010',
    '--focus': '#000000',
    '--doodle': '#000000a0',
    '--chip-date': '#1f6fd1',
    '--chip-action': '#0b8f66',
    '--chip-list': '#6e3fd6',
    '--chip-object': '#a56a00',
    '--chip-variable': '#c22e86',
    '--chip-entity': '#0a7f9e',
    '--danger': '#c2322f',
    '--warn': '#a56a00',
    '--shadow': '0 10px 40px #0000001f',
  },
};

export const THEME_GLASS_WINDOW: Theme = {
  id: 'glass-window',
  name: 'Glass Window',
  scheme: 'dark',
  surface: 'glass',
  backdrop: 'fog',
  spacing: 'airy',
  bezel: 'none',
  text: 'etched',
  cursor: { shape: 'caret', color: 'mint', blink: true, glow: true },
  motion: 'drift',
  respondsTo: 'pointer',
  tokens: {
    '--bg': '#0a0f16',
    '--bg-elevated': '#0f161f99',
    '--surface': '#ffffff0a',
    '--surface-hover': '#ffffff14',
    '--border': '#ffffff1f',
    '--border-strong': '#ffffff33',
    '--fg': '#eef3f8',
    '--fg-muted': '#a9b6c6',
    '--fg-faint': '#6d7a8c',
    '--accent': '#7cf0c4',
    '--accent-fg': '#06110d',
    '--accent-soft': '#7cf0c41f',
    '--focus': '#7cf0c4',
    '--doodle': '#c8f5e6b0',
  },
};

export const SEED_THEMES: Theme[] = [THEME_VOID, THEME_BLANK_PAGE, THEME_GLASS_WINDOW];
export const DEFAULT_THEME_ID = THEME_VOID.id;

export function findTheme(id: string, themes: Theme[] = SEED_THEMES): Theme {
  return themes.find((theme) => theme.id === id) ?? THEME_VOID;
}

export function nextThemeId(currentId: string, themes: Theme[] = SEED_THEMES): string {
  const index = themes.findIndex((theme) => theme.id === currentId);
  const next = themes[(index + 1) % themes.length] ?? THEME_VOID;
  return next.id;
}

/**
 * The themes page lists 16 themes; three are built. The rest map to the
 * closest built theme until they exist (pass 2, "themes-13").
 */
export const THEME_FALLBACKS: Record<string, string> = {
  phosphor: 'void',
  amber: 'void',
  'bezel-and-glass': 'glass-window',
  'you-as-the-camera': 'glass-window',
  'tilt-window': 'glass-window',
  'paper-and-typewriter': 'blank-page',
  'ledger-lines': 'blank-page',
  chalkboard: 'void',
  frosted: 'glass-window',
  'hardware-panel': 'void',
  'night-sky': 'void',
  'deep-water': 'glass-window',
  'e-ink': 'blank-page',
};

export interface ThemeResolution {
  id: string;
  built: boolean;
  requested: string;
}

export function resolveThemeId(requested: string, themes: Theme[] = SEED_THEMES): ThemeResolution {
  const clean = requested.trim().toLowerCase();
  if (themes.some((theme) => theme.id === clean)) {
    return { id: clean, built: true, requested: clean };
  }
  const fallback = THEME_FALLBACKS[clean];
  if (fallback !== undefined) {
    return { id: fallback, built: false, requested: clean };
  }
  return { id: DEFAULT_THEME_ID, built: false, requested: clean };
}

/**
 * Themes that are whole pages today rather than token sets. /box/new?theme=<id>
 * sends the visitor to the page. The koi surface becomes an in-app theme in pass 3.
 */
export const THEME_SURFACE_PAGES: Record<string, string> = {
  'koi-pond': 'pages/koi.html',
};
