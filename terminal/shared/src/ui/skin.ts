import { z } from 'zod';
import { STYLE_TOKEN, STYLE_VALUE } from './style';

/**
 * Skins (pass 5): a material applied to one part of the interface. A skin is
 * a record like a theme: token overrides, an optional procedural background
 * (CSS gradients only, no url()), an optional image with its licence, and a
 * veil that keeps text readable over it.
 */
export const SKIN_TARGETS = ['shell', 'stage', 'sidebar', 'topbar', 'composer'] as const;
export type SkinTarget = (typeof SKIN_TARGETS)[number];

export const SKIN_PATHS = ['css_tokens', 'procedural_code', 'image_generate', 'image_search', 'library'] as const;
export type SkinPath = (typeof SKIN_PATHS)[number];

export const SKIN_TARGET_LABELS: Record<SkinTarget, string> = {
  shell: 'whole app',
  stage: 'stage',
  sidebar: 'sidebar',
  topbar: 'top bar',
  composer: 'prompt box',
};

export const SKIN_PATH_LABELS: Record<SkinPath, string> = {
  css_tokens: 'colour tokens',
  procedural_code: 'procedural CSS',
  image_generate: 'generated image',
  image_search: 'image search',
  library: 'material library',
};

const CSS_FUNCTIONS = new Set([
  'linear-gradient',
  'radial-gradient',
  'conic-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
  'repeating-conic-gradient',
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'oklch',
  'oklab',
  'color-mix',
  'var',
  'calc',
]);

/** Procedural backgrounds: gradients and colours only. No url(), no escapes, no rules. */
export function isSafeBackground(value: string): boolean {
  if (value.length === 0 || value.length > 2400) return false;
  if (!/^[a-zA-Z0-9#%.,()\s\-+/]+$/.test(value)) return false;
  for (const match of value.matchAll(/([a-zA-Z-]+)\s*\(/g)) {
    if (!CSS_FUNCTIONS.has((match[1] ?? '').toLowerCase())) return false;
  }
  let depth = 0;
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** Image references: an IndexedDB key written by this browser, or an https URL. */
export const IMAGE_REF = /^(idb:[a-z0-9-]{4,80}|https:\/\/[^\s"'()\\<>]{8,600})$/;

export const skinImageSchema = z.object({
  ref: z.string().regex(IMAGE_REF),
  thumb: z.string().regex(IMAGE_REF).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  title: z.string().max(200),
  creator: z.string().max(200),
  /** e.g. "CC BY 2.0", "CC0", "generated (google/gemini-2.5-flash-image)". */
  license: z.string().max(120),
  license_url: z.string().max(400),
  source_url: z.string().max(600),
  provider: z.enum(['openverse', 'openrouter']),
});
export type SkinImage = z.infer<typeof skinImageSchema>;

export const skinSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(60),
  target: z.enum(SKIN_TARGETS),
  path: z.enum(SKIN_PATHS),
  tokens: z.record(z.string().regex(STYLE_TOKEN), z.string().regex(STYLE_VALUE)).default({}),
  background: z
    .string()
    .refine(isSafeBackground, 'background must be CSS gradients and colours only')
    .nullable()
    .default(null),
  image: skinImageSchema.nullable().default(null),
  /** How much of the theme background lies over the material, 0–90 %. */
  veil: z.number().min(0).max(90).default(40),
  request: z.string().max(300).default(''),
  description: z.string().max(600).default(''),
  score: z.number().min(0).max(5).nullable().default(null),
  round: z.number().int().min(0).max(20).nullable().default(null),
  created_at: z.number().default(0),
});
export type Skin = z.infer<typeof skinSchema>;
export type SkinInput = z.input<typeof skinSchema>;

/** WCAG contrast ratio between two #rrggbb colours (1–21), or null if unparsable. */
export function contrastRatio(a: string, b: string): number | null {
  const lum = (hex: string): number | null => {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!match || !match[1]) return null;
    const full = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
    const channels = [0, 2, 4].map((index) => {
      const value = Number.parseInt(full.slice(index, index + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
  };
  const la = lum(a);
  const lb = lum(b);
  if (la === null || lb === null) return null;
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Keeps text readable: if --fg on --bg is below 4.5:1, picks near-white or near-black. */
export function ensureReadable(tokens: Record<string, string>): Record<string, string> {
  const bg = tokens['--bg'];
  const fg = tokens['--fg'];
  if (!bg) return tokens;
  const ratio = fg ? contrastRatio(fg, bg) : null;
  if (ratio !== null && ratio >= 4.5) return tokens;
  if (fg && ratio === null) return tokens;
  const light = contrastRatio('#f5f5f0', bg) ?? 0;
  const dark = contrastRatio('#111318', bg) ?? 0;
  return { ...tokens, '--fg': light >= dark ? '#f5f5f0' : '#111318' };
}
