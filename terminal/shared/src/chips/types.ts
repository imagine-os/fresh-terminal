export const CHIP_KINDS = ['date', 'action', 'list', 'object', 'variable', 'entity'] as const;
export type ChipKind = (typeof CHIP_KINDS)[number];

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
}

export type TextSegment = { type: 'text'; text: string } | { type: 'chip'; chip: Chip };
