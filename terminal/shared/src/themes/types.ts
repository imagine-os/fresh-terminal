import { z } from 'zod';
import { MATERIAL_WORDS, SPACING_WORDS } from '../dialect/types';

/**
 * Theme v0. A theme is a record, expressed in the dialect text form too:
 *   Stage: glass over fog, airy.
 *   Bezel: none.
 *   Text: etched.
 *   Cursor: block, green, blink.
 *   Motion: drift.
 *   Responds to: pointer.
 * All theme CSS is custom properties applied on the shell root; no per-theme
 * component code.
 */

export const BACKDROP_WORDS = ['none', 'fog', 'grain', 'stars'] as const;
export type BackdropWord = (typeof BACKDROP_WORDS)[number];

export const BEZEL_WORDS = ['none', 'plastic', 'metal', 'paper', 'glass'] as const;
export type BezelWord = (typeof BEZEL_WORDS)[number];

export const TEXT_WORDS = ['ink', 'chalk', 'phosphor', 'etched', 'amber'] as const;
export type TextWord = (typeof TEXT_WORDS)[number];

export const CURSOR_SHAPES = ['block', 'caret', 'dot'] as const;
export type CursorShape = (typeof CURSOR_SHAPES)[number];

export const CURSOR_COLORS = ['black', 'white', 'green', 'amber', 'mint', 'accent'] as const;
export type CursorColor = (typeof CURSOR_COLORS)[number];

export const MOTION_WORDS = ['none', 'drift', 'parallax'] as const;
export type MotionWord = (typeof MOTION_WORDS)[number];

export const RESPONDS_WORDS = ['none', 'pointer', 'tilt', 'camera'] as const;
export type RespondsWord = (typeof RESPONDS_WORDS)[number];

export const SCHEMES = ['light', 'dark'] as const;
export type Scheme = (typeof SCHEMES)[number];

export const cursorSchema = z.object({
  shape: z.enum(CURSOR_SHAPES),
  color: z.enum(CURSOR_COLORS),
  blink: z.boolean(),
  glow: z.boolean(),
});
export type CursorSpec = z.infer<typeof cursorSchema>;

export const themeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  scheme: z.enum(SCHEMES),
  surface: z.enum(MATERIAL_WORDS),
  backdrop: z.enum(BACKDROP_WORDS),
  spacing: z.enum(SPACING_WORDS),
  bezel: z.enum(BEZEL_WORDS),
  text: z.enum(TEXT_WORDS),
  cursor: cursorSchema,
  motion: z.enum(MOTION_WORDS),
  respondsTo: z.enum(RESPONDS_WORDS),
  /** CSS custom property overrides, e.g. { "--bg": "#000" }. */
  tokens: z.record(z.string().regex(/^--[a-z0-9-]+$/), z.string()),
});
export type Theme = z.infer<typeof themeSchema>;

export const CURSOR_COLOR_VALUES: Record<CursorColor, string> = {
  black: '#000000',
  white: '#ffffff',
  green: '#33ff66',
  amber: '#ffb000',
  mint: '#7cf0c4',
  accent: 'var(--accent)',
};
