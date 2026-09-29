/**
 * The readability layer for image and material skins.
 *
 * A skin can put a photo or a busy material behind text. The theme's text
 * colours were chosen for the theme's flat background, so over a photo they
 * can vanish (green phosphor text on a mossy wall). This module works out,
 * from the image's darkest and lightest tones, how strong a scrim (a veil in
 * the theme's background colour) has to be behind text surfaces so every
 * text colour reaches WCAG AA (4.5:1), and picks neutral text colours so small
 * text is never tinted the skin's own colour. The scrim is the weakest one
 * that passes, so the image stays visible, and it never covers the edges.
 */

export type Rgb = [number, number, number];

/** The tones behind text: the darkest and lightest areas and the average. */
export interface ImageTones {
  dark: Rgb;
  light: Rgb;
  mean: Rgb;
}

/** When an image cannot be sampled (no CORS, still loading), assume the worst. */
export const UNKNOWN_TONES: ImageTones = { dark: [0, 0, 0], light: [255, 255, 255], mean: [128, 128, 128] };

export const AA_TEXT = 4.5;
const LIGHT_INK = '#f5f5f0';
const DARK_INK = '#111318';
const FALLBACK_SCRIM: Rgb = [11, 13, 16];
const MAX_ALPHA = 0.96;

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/** #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() with commas or spaces. Alpha is ignored. */
export function parseColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex && hex[1]) {
    const body = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1].slice(0, 6);
    return [0, 2, 4].map((index) => Number.parseInt(body.slice(index, index + 2), 16)) as Rgb;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  if (rgb) return [clamp(Number(rgb[1])), clamp(Number(rgb[2])), clamp(Number(rgb[3]))];
  return null;
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => clamp(channel).toString(16).padStart(2, '0')).join('')}`;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRgb(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** `top` at `alpha` over `bottom`, the way a browser composites in sRGB. */
export function blend(top: Rgb, bottom: Rgb, alpha: number): Rgb {
  return [0, 1, 2].map((index) => clamp(top[index]! * alpha + bottom[index]! * (1 - alpha))) as Rgb;
}

/** `a` moved towards `b` by `amount` (0–1). */
export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return blend(b, a, amount);
}

/** Every hex or rgb() colour stop in a CSS background, for procedural materials. */
export function colorsInBackground(css: string): Rgb[] {
  const found: Rgb[] = [];
  for (const match of css.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)) {
    const token = match[0];
    const alpha = /rgba\([^)]*,\s*([\d.]+)\s*\)/i.exec(token);
    // Near-transparent stops (sheen lines, grain) barely change what lies behind text.
    if (alpha && Number(alpha[1]) < 0.2) continue;
    const color = parseColor(token);
    if (color) found.push(color);
  }
  return found;
}

export function tonesFromColors(colors: Rgb[]): ImageTones | null {
  if (colors.length === 0) return null;
  const sorted = [...colors].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  const sum = colors.reduce<[number, number, number]>((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0]);
  return {
    dark: sorted[0]!,
    light: sorted[sorted.length - 1]!,
    mean: sum.map((value) => clamp(value / colors.length)) as Rgb,
  };
}

/**
 * Tones from RGBA pixel data (a small canvas sample). Uses the 3rd and 97th
 * luminance percentiles so a few specks do not decide the scrim.
 */
export function tonesFromPixels(data: ArrayLike<number>, percentile = 0.03): ImageTones | null {
  const pixels: Rgb[] = [];
  for (let index = 0; index + 3 < data.length; index += 4) {
    if ((data[index + 3] ?? 0) < 16) continue;
    pixels.push([data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0]);
  }
  if (pixels.length === 0) return null;
  const sorted = pixels.map((rgb) => ({ rgb, lum: relativeLuminance(rgb) })).sort((a, b) => a.lum - b.lum);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]!.rgb;
  const sum = pixels.reduce<[number, number, number]>((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0]);
  return { dark: at(percentile), light: at(1 - percentile), mean: sum.map((value) => clamp(value / pixels.length)) as Rgb };
}

function hueSat([r, g, b]: Rgb): { hue: number; sat: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  const light = (max + min) / 2;
  const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  let hue = 0;
  if (delta !== 0) {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) hue = 60 * ((bn - rn) / delta + 2);
    else hue = 60 * ((rn - gn) / delta + 4);
  }
  return { hue: (hue + 360) % 360, sat };
}

/** True when `color` is a saturated colour close in hue to the skin's own colour. */
export function sameHue(color: Rgb, skin: Rgb): boolean {
  const a = hueSat(color);
  const b = hueSat(skin);
  if (a.sat < 0.25 || b.sat < 0.18) return false;
  const diff = Math.abs(a.hue - b.hue);
  return Math.min(diff, 360 - diff) < 60;
}

export interface Readability {
  /** Scrim opacity behind text surfaces, 0–0.96. */
  alpha: number;
  /** The scrim colour: the theme (or skin) background. */
  scrim: Rgb;
  fg: string;
  fgMuted: string;
  fgFaint: string;
  /** Replacement accent for text, or null to keep the theme's. */
  accent: string | null;
  /** The lowest text contrast over the worst tone, for tests and the dev panel. */
  worst: number;
}

/**
 * The weakest scrim, and the text colours, that keep every text colour at
 * AA over both the darkest and lightest tones of the skin.
 */
export function readableOver(tones: ImageTones, theme: { bg?: string; accent?: string }, min = AA_TEXT): Readability {
  const scrim = (theme.bg ? parseColor(theme.bg) : null) ?? FALLBACK_SCRIM;
  const light = parseColor(LIGHT_INK)!;
  const dark = parseColor(DARK_INK)!;
  const ink = contrastRgb(light, scrim) >= contrastRgb(dark, scrim) ? light : dark;
  const muted = mix(ink, scrim, 0.12);
  const faint = mix(ink, scrim, 0.22);
  const themeAccent = theme.accent ? parseColor(theme.accent) : null;
  // Small text is never tinted the skin's own colour; an accent that matches the
  // skin's hue, or cannot reach AA even on the plain scrim, falls back to neutral ink.
  const accentUsable = themeAccent !== null && !sameHue(themeAccent, tones.mean) && contrastRgb(themeAccent, scrim) >= min;
  const texts: Rgb[] = [ink, muted, faint, ...(accentUsable && themeAccent ? [themeAccent] : [])];

  const worstAt = (alpha: number, colors: Rgb[]) => {
    const behind = [blend(scrim, tones.dark, alpha), blend(scrim, tones.light, alpha), blend(scrim, tones.mean, alpha)];
    return Math.min(...colors.flatMap((color) => behind.map((bg) => contrastRgb(color, bg))));
  };

  for (let step = 0; step <= Math.round(MAX_ALPHA * 50); step += 1) {
    const alpha = step / 50;
    const worst = worstAt(alpha, texts);
    if (worst >= min) {
      return {
        alpha,
        scrim,
        fg: toHex(ink),
        fgMuted: toHex(muted),
        fgFaint: toHex(faint),
        accent: accentUsable ? null : themeAccent ? toHex(ink) : null,
        worst,
      };
    }
  }
  // Even the strongest scrim is not enough for the softer greys: use full ink everywhere.
  const worst = worstAt(MAX_ALPHA, [ink]);
  return { alpha: MAX_ALPHA, scrim, fg: toHex(ink), fgMuted: toHex(ink), fgFaint: toHex(ink), accent: themeAccent ? toHex(ink) : null, worst };
}
