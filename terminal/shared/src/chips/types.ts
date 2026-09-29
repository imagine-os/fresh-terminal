import { z } from 'zod';

/**
 * Chip kinds. The last four (page, nav, theme, and box-scoped glossary terms)
 * resolve against the box's own records. `entity` is a proper noun the
 * tagger could not classify further.
 */
export const CHIP_KINDS = [
  'action',
  'date',
  'time',
  'person',
  'org',
  'place',
  'object',
  'variable',
  'list',
  'number',
  'money',
  'url',
  'page',
  'nav',
  'theme',
  'entity',
] as const;
export type ChipKind = (typeof CHIP_KINDS)[number];

export const CHIP_SOURCES = ['local', 'model', 'glossary', 'user'] as const;
export type ChipSource = (typeof CHIP_SOURCES)[number];

export interface ChipReading {
  kind: ChipKind;
  value?: string;
  /** Probability 0..1. */
  p: number;
}

export interface Chip {
  kind: ChipKind;
  /** Character offset of the span start in the source text. */
  start: number;
  /** Character offset one past the span end. */
  end: number;
  /** The exact text covered. */
  text: string;
  /** Normalised value when the tagger is sure (e.g. ISO date), else omitted. */
  value?: string;
  /** Who decided the kind. User and glossary chips are authoritative. */
  source?: ChipSource;
  /** Confidence 0..1 of the chosen reading. */
  p?: number;
  /** Other plausible readings, highest first (ambiguity). */
  alternatives?: ChipReading[];
  /** Free-text context the person added. */
  note?: string;
  /** Resolved record id for page / nav / theme chips. */
  ref?: string;
}

export type TextSegment = { type: 'text'; text: string } | { type: 'chip'; chip: Chip };

/** Ambiguous = a second reading is close enough that the person should confirm. */
export function isAmbiguous(chip: Chip): boolean {
  if (chip.source === 'user' || chip.source === 'glossary') {
    return false;
  }
  const second = chip.alternatives?.[0];
  if (!second) {
    return false;
  }
  return second.kind !== chip.kind && second.p >= 0.25 && (chip.p ?? 1) - second.p < 0.35;
}

export const chipReadingSchema = z.object({
  kind: z.enum(CHIP_KINDS),
  value: z.string().optional(),
  p: z.number().min(0).max(1),
});

export const chipSchema = z.object({
  kind: z.enum(CHIP_KINDS),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  text: z.string().max(200),
  value: z.string().max(200).optional(),
  source: z.enum(CHIP_SOURCES).optional(),
  p: z.number().min(0).max(1).optional(),
  alternatives: z.array(chipReadingSchema).max(4).optional(),
  note: z.string().max(300).optional(),
  ref: z.string().max(120).optional(),
});
