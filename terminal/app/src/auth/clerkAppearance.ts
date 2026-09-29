import { useEffect, useRef, useState } from 'react';
/**
 * The Clerk sign-in, sign-up and user menu in our look (Justin, 2026-09-29:
 * "signin system should match style"). Clerk renders in a portal on <body>,
 * outside `.shell`, so the theme's custom properties do not reach it. We read
 * the active theme's tokens off the shell when a Clerk surface opens and hand
 * Clerk plain colour values: square corners, our fonts (mono for meta text),
 * our background and foreground, the accent on the primary button, a 1px
 * border instead of a heavy shadow, visible focus and 44px targets.
 *
 * "Secured by Clerk" and the development-instance notice are left in place:
 * removing the first is a Clerk plan setting (Dashboard, Branding), the
 * second goes away only on a production instance.
 */

export interface ThemeTokens {
  bg: string;
  elevated: string;
  surface: string;
  fg: string;
  muted: string;
  accent: string;
  accentFg: string;
  border: string;
  borderStrong: string;
  danger: string;
  warn: string;
  focus: string;
  fontSans: string;
  fontMono: string;
}

/** Void, the default theme, for when nothing is mounted yet. */
export const VOID_TOKENS: ThemeTokens = {
  bg: '#000000',
  elevated: '#000000',
  surface: '#050805',
  fg: '#33ff66',
  muted: '#22b347',
  accent: '#33ff66',
  accentFg: '#000000',
  border: '#123a1c',
  borderStrong: '#1f6b32',
  danger: '#ff7a7a',
  warn: '#ffc76b',
  focus: '#33ff66',
  fontSans: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
  fontMono: "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
};

const TOKEN_NAMES: Record<keyof ThemeTokens, string> = {
  bg: '--bg',
  elevated: '--bg-elevated',
  surface: '--surface',
  fg: '--fg',
  muted: '--fg-muted',
  accent: '--accent',
  accentFg: '--accent-fg',
  border: '--border',
  borderStrong: '--border-strong',
  danger: '--danger',
  warn: '--warn',
  focus: '--focus',
  fontSans: '--font-sans',
  fontMono: '--font-mono',
};

/** The active theme's tokens, read from the shell (where themes set them) or the document root. */
export function readThemeTokens(root?: Element | null): ThemeTokens {
  if (typeof window === 'undefined' || typeof document === 'undefined') return VOID_TOKENS;
  const element = root ?? document.querySelector('.shell') ?? document.documentElement;
  const style = window.getComputedStyle(element);
  const tokens = { ...VOID_TOKENS };
  for (const key of Object.keys(TOKEN_NAMES) as (keyof ThemeTokens)[]) {
    const value = style.getPropertyValue(TOKEN_NAMES[key]).trim();
    if (value) tokens[key] = value;
  }
  return tokens;
}

type Rgba = [number, number, number, number];

/** #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(). Anything else returns null. */
export function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1];
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text)?.[1];
  if (rgb) {
    const parts = rgb.split(/[\s,/]+/).filter(Boolean).map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      const alpha = parts[3] === undefined ? 1 : rgb.includes('%') && parts[3] > 1 ? parts[3] / 255 : parts[3];
      return [parts[0]!, parts[1]!, parts[2]!, alpha];
    }
  }
  return null;
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** A colour flattened onto a background, so translucent theme tokens become solid on Clerk's portal. */
export function solid(color: string, over: string): string {
  const top = parseColor(color);
  if (!top) return color;
  const base = parseColor(over) ?? [0, 0, 0, 1];
  const a = top[3];
  const mix = (i: 0 | 1 | 2) => top[i] * a + base[i] * (1 - a);
  return `#${hex2(mix(0))}${hex2(mix(1))}${hex2(mix(2))}`;
}

function withAlpha(color: string, alpha: number): string {
  const rgba = parseColor(color);
  if (!rgba) return color;
  return `rgba(${Math.round(rgba[0])}, ${Math.round(rgba[1])}, ${Math.round(rgba[2])}, ${alpha})`;
}

/** Relative luminance, for picking a readable foreground. */
function luminance(color: string): number {
  const rgba = parseColor(color);
  if (!rgba) return 0;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgba[0]) + 0.7152 * lin(rgba[1]) + 0.0722 * lin(rgba[2]);
}

export function isDark(tokens: ThemeTokens): boolean {
  return luminance(solid(tokens.bg, '#000000')) < 0.4;
}

/** Target size from the design system: 44px at a 16px root, growing with the type on large screens. */
export const TARGET = 'max(2.75rem, 3.1em)';

/** Type and spacing that stay 14px / 16px on phones and laptops and grow for 10-foot viewing on 4K. */
export const FONT_SIZE = 'clamp(0.875rem, 0.6rem + 0.35vw, 1.5rem)';
export const SPACING = 'clamp(1rem, 0.75rem + 0.3vw, 1.75rem)';
/**
 * Sign-in and sign-up width: one column, a comfortable reading width that grows for 4K.
 * Only for those two. The account window (UserProfile) has a side nav and a
 * page next to it, so this width squeezed its page to ~200px at 1908px wide
 * (Justin's screenshot, 2026-09-29, C-099); it has its own sizes below.
 */
export const CARD_WIDTH = 'min(calc(100vw - 2rem), clamp(25rem, 16rem + 10vw, 46rem))';

type Styles = Record<string, unknown>;

/** The one-column sign-in and sign-up card. Never on the global cardBox (see CARD_WIDTH). */
export const AUTH_CARD: Styles = { width: CARD_WIDTH, maxWidth: CARD_WIDTH };

/**
 * The account window (UserProfile, opened from the avatar): a nav and a page
 * side by side. Clerk's own size is 55rem x 44rem; ours is in em of the card's
 * type (and at least half the screen on 4K), so it grows with our larger type instead of clipping, and it never
 * leaves the viewport (1rem gutter at the sides, 1.5rem top and bottom).
 * On phones Clerk folds the nav into a menu and the page scrolls inside.
 */
export const PROFILE_CARD_WIDTH = 'min(calc(100vw - 2rem), max(64em, 50vw))';
export const PROFILE_CARD_HEIGHT = 'min(calc(100dvh - 3rem), 48em)';
export const PROFILE_CARD: Styles = {
  width: PROFILE_CARD_WIDTH,
  maxWidth: 'calc(100vw - 2rem)',
  height: PROFILE_CARD_HEIGHT,
  maxHeight: 'calc(100dvh - 3rem)',
};
/**
 * Clerk's modal box is fixed at min(44rem, 100% - 3rem) tall; it follows the
 * card instead, so the card's own height (above) is the one that counts.
 */
export const PROFILE_ELEMENTS = {
  modalContent: { height: 'auto', maxHeight: 'calc(100% - 3rem)' },
  rootBox: { borderRadius: 0, height: 'auto', maxWidth: '100%' },
  cardBox: PROFILE_CARD,
};

/**
 * The `appearance` object for ClerkProvider, openSignIn and UserButton. Plain
 * values only; Clerk derives its shades from these.
 */
export function clerkAppearance(tokens: ThemeTokens = VOID_TOKENS) {
  const bg = solid(tokens.bg, '#000000');
  const card = solid(tokens.elevated, bg);
  const input = solid(tokens.surface, card);
  const border = solid(tokens.borderStrong, card);
  const focus = solid(tokens.focus, card);
  const focusRing: Styles = {
    '&:focus-visible': { outline: `2px solid ${focus}`, outlineOffset: '2px', boxShadow: 'none' },
  };
  const target: Styles = { minHeight: TARGET, ...focusRing };
  const meta: Styles = { fontFamily: tokens.fontMono };

  return {
    variables: {
      borderRadius: '0',
      colorBackground: card,
      colorForeground: tokens.fg,
      colorMutedForeground: tokens.muted,
      colorPrimary: tokens.accent,
      colorPrimaryForeground: tokens.accentFg,
      colorDanger: tokens.danger,
      colorWarning: tokens.warn,
      colorSuccess: tokens.accent,
      colorInput: input,
      colorInputForeground: tokens.fg,
      colorNeutral: tokens.fg,
      colorBorder: border,
      colorRing: focus,
      colorShadow: 'transparent',
      colorModalBackdrop: withAlpha(bg, 0.82),
      fontFamily: tokens.fontSans,
      fontFamilyButtons: tokens.fontSans,
      fontFamilyMono: tokens.fontMono,
      fontSize: FONT_SIZE,
      spacing: SPACING,
    },
    elements: {
      rootBox: { borderRadius: 0 },
      cardBox: { borderRadius: 0, boxShadow: 'none', border: `1px solid ${border}` },
      card: { borderRadius: 0, boxShadow: 'none', background: card },
      footer: { background: card, borderTop: `1px solid ${solid(tokens.border, card)}`, ...meta },
      footerAction: { ...meta, alignItems: 'center', gap: '0.25rem' },
      footerActionText: { color: tokens.muted },
      footerActionLink: { color: tokens.accent, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', minHeight: TARGET, padding: '0 0.25rem', ...focusRing },
      footerPagesLink: { ...meta, color: tokens.muted },
      headerTitle: { color: tokens.fg, fontWeight: 600 },
      headerSubtitle: { ...meta, color: tokens.muted },
      dividerText: { ...meta, color: tokens.muted },
      dividerLine: { background: solid(tokens.border, card) },
      formFieldLabel: { ...meta, textAlign: 'left' },
      formFieldLabelRow: { alignItems: 'center' },
      formFieldHintText: meta,
      formFieldInfoText: meta,
      formFieldErrorText: meta,
      formFieldInput: { ...target, background: input, borderRadius: 0, boxShadow: `inset 0 0 0 1px ${solid(tokens.border, card)}` },
      formButtonPrimary: {
        ...target,
        background: tokens.accent,
        color: tokens.accentFg,
        borderRadius: 0,
        boxShadow: 'none',
        '&:hover, &:focus': { background: tokens.accent, color: tokens.accentFg, filter: 'brightness(1.08)' },
        '&::after': { display: 'none' },
      },
      formButtonReset: target,
      socialButtonsBlockButton: { ...target, borderRadius: 0, border: 'none', boxShadow: `inset 0 0 0 1px ${border}` },
      socialButtonsIconButton: { ...target, minWidth: TARGET, borderRadius: 0 },
      alternativeMethodsBlockButton: target,
      backLink: target,
      identityPreviewEditButton: target,
      formFieldAction: { ...focusRing, ...meta, minHeight: TARGET, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', color: tokens.accent },
      otpCodeFieldInput: { minHeight: TARGET, minWidth: TARGET, borderRadius: 0 },
      modalCloseButton: { minWidth: TARGET, minHeight: TARGET, ...focusRing },
      badge: { ...meta, borderRadius: 0 },
      userButtonTrigger: { minWidth: TARGET, minHeight: TARGET, borderRadius: 0, ...focusRing },
      userButtonAvatarBox: { borderRadius: 0 },
      avatarBox: { borderRadius: 0 },
      userButtonPopoverCard: { borderRadius: 0, boxShadow: 'none', border: `1px solid ${border}` },
      userButtonPopoverActionButton: target,
      userButtonPopoverFooter: { background: card, ...meta },
      userPreviewSecondaryIdentifier: meta,
      // The account window (C-099): its nav, section buttons and "..." menus get the same 44px targets and focus.
      navbarButton: target,
      navbarMobileMenuButton: { ...target, minWidth: TARGET },
      profileSectionPrimaryButton: target,
      menuButton: target,
      menuButtonEllipsis: { ...target, minWidth: TARGET, borderRadius: 0 },
      menuItem: target,
      // Long email addresses and names wrap instead of ending in "..." (the values must always be readable).
      profileSectionItem: { '& p': { whiteSpace: 'normal', overflowWrap: 'anywhere', textOverflow: 'clip' } },
      userPreviewTextContainer: { '& p, & span': { whiteSpace: 'normal', overflowWrap: 'anywhere', textOverflow: 'clip' } },
      formFieldInputShowPasswordButton: { minWidth: TARGET, minHeight: TARGET, borderRadius: 0, ...focusRing },
    },
    signIn: { elements: { cardBox: AUTH_CARD } },
    signUp: { elements: { cardBox: AUTH_CARD } },
    userProfile: { elements: PROFILE_ELEMENTS },
    organizationProfile: { elements: PROFILE_ELEMENTS },
    options: {
      socialButtonsVariant: 'blockButton' as const,
      logoPlacement: 'none' as const,
    },
  };
}

export type FreshClerkAppearance = ReturnType<typeof clerkAppearance>;

/** Appearance for whatever theme is showing right now. */
export function currentClerkAppearance(): FreshClerkAppearance {
  return clerkAppearance(readThemeTokens());
}

/**
 * Follows the active theme: re-reads the tokens when the shell's theme (or
 * skin) changes, so an open Clerk surface and the next one match what is on
 * screen. Only those attributes are watched; pointer effects on the shell's
 * inline style do not trigger it.
 */
export function useClerkAppearance(): FreshClerkAppearance {
  const [appearance, setAppearance] = useState<FreshClerkAppearance>(() => clerkAppearance());
  const last = useRef('');
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const update = () => {
      const tokens = readThemeTokens();
      const key = JSON.stringify(tokens);
      if (key === last.current) return;
      last.current = key;
      setAppearance(clerkAppearance(tokens));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-theme-id', 'data-skinned', 'data-theme'] });
    return () => observer.disconnect();
  }, []);
  return appearance;
}
