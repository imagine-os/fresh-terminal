import type { Chip, TextSegment } from './types';

/**
 * Local chip tagger. Regex and word lists only, no model call.
 * Rule: when unsure, leave it as text. False confidence is worse than a miss.
 *
 * A model-based tagger (the JEV tier) plugs in through `ChipTagger` later.
 */
export interface ChipTagger {
  tag(text: string): Chip[];
}

export const ACTION_VERBS = [
  'make',
  'build',
  'show',
  'list',
  'add',
  'remove',
  'open',
  'send',
  'schedule',
  'find',
] as const;

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const MONTH_NAMES =
  'january|february|march|april|may|june|july|august|september|october|november|december';

const DATE_PATTERNS: RegExp[] = [
  /\b(?:today|tomorrow|tonight|yesterday)\b/gi,
  /\b(?:next|this|last)\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  /\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  new RegExp(`\\b(?:${MONTH_NAMES}|${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, 'gi'),
  new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_NAMES}|${MONTHS})\\b`, 'gi'),
  /\b\d{4}-\d{2}-\d{2}\b/g,
];

const LIST_MARKER = /(^|\n)\s*(?:[-*•]|\d+[.)])\s+/g;
const QUOTED = /"([^"\n]{1,120})"|“([^”\n]{1,120})”|'([^'\n]{1,120})'/g;
const VARIABLE = /\$[A-Za-z_][A-Za-z0-9_]*/g;
const ENTITY = /\b(?:[A-Z][a-z]+)(?:\s+[A-Z][a-z]+)+\b/g;

function overlaps(chips: Chip[], start: number, end: number): boolean {
  return chips.some((chip) => start < chip.end && end > chip.start);
}

function pushIfFree(chips: Chip[], chip: Chip): void {
  if (!overlaps(chips, chip.start, chip.end)) {
    chips.push(chip);
  }
}

function sentenceStarts(text: string): number[] {
  const starts = [0];
  const pattern = /[.!?\n]\s*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const next = match.index + match[0].length;
    if (next < text.length) {
      starts.push(next);
    }
  }
  return starts;
}

export class LocalTagger implements ChipTagger {
  tag(text: string): Chip[] {
    const chips: Chip[] = [];
    if (text.trim().length === 0) {
      return chips;
    }

    for (const pattern of DATE_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        pushIfFree(chips, {
          kind: 'date',
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
        });
      }
    }

    QUOTED.lastIndex = 0;
    let quoted: RegExpExecArray | null;
    while ((quoted = QUOTED.exec(text)) !== null) {
      const inner = quoted[1] ?? quoted[2] ?? quoted[3] ?? '';
      pushIfFree(chips, {
        kind: 'object',
        start: quoted.index,
        end: quoted.index + quoted[0].length,
        text: quoted[0],
        value: inner,
      });
    }

    VARIABLE.lastIndex = 0;
    let variable: RegExpExecArray | null;
    while ((variable = VARIABLE.exec(text)) !== null) {
      pushIfFree(chips, {
        kind: 'variable',
        start: variable.index,
        end: variable.index + variable[0].length,
        text: variable[0],
        value: variable[0].slice(1),
      });
    }

    LIST_MARKER.lastIndex = 0;
    let marker: RegExpExecArray | null;
    while ((marker = LIST_MARKER.exec(text)) !== null) {
      const leading = marker[1] ?? '';
      const start = marker.index + leading.length;
      const end = marker.index + marker[0].length;
      if (end > start) {
        pushIfFree(chips, { kind: 'list', start, end, text: text.slice(start, end) });
      }
    }

    for (const start of sentenceStarts(text)) {
      const rest = text.slice(start);
      const word = /^([A-Za-z]+)\b/.exec(rest);
      if (word === null) {
        continue;
      }
      const verb = (word[1] ?? '').toLowerCase();
      if ((ACTION_VERBS as readonly string[]).includes(verb)) {
        pushIfFree(chips, {
          kind: 'action',
          start,
          end: start + (word[1] ?? '').length,
          text: word[1] ?? '',
          value: verb,
        });
      }
    }

    ENTITY.lastIndex = 0;
    let entity: RegExpExecArray | null;
    while ((entity = ENTITY.exec(text)) !== null) {
      pushIfFree(chips, {
        kind: 'entity',
        start: entity.index,
        end: entity.index + entity[0].length,
        text: entity[0],
      });
    }

    return chips.sort((a, b) => a.start - b.start);
  }
}

export const localTagger = new LocalTagger();

/**
 * Splits text into plain runs and chips so a renderer can lay them inline.
 */
export function segment(text: string, chips: Chip[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const chip of [...chips].sort((a, b) => a.start - b.start)) {
    if (chip.start > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, chip.start) });
    }
    segments.push({ type: 'chip', chip });
    cursor = chip.end;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', text: text.slice(cursor) });
  }
  return segments;
}

/**
 * Where a model-based tagger plugs in. Not wired yet: the router does not
 * expose a tagging endpoint and no JEV model exists on OpenRouter today.
 */
export class ModelTagger implements ChipTagger {
  readonly wired = false;

  tag(_text: string): Chip[] {
    return [];
  }
}
