import type { GlossaryTerm } from '../ui/types';
import { CHIP_KINDS, type Chip, type ChipKind, type ChipReading } from './types';

/** Plain-language meaning of each chip kind (popover labels, Jev criteria). */
export const CHIP_KIND_DESCRIPTIONS: Record<ChipKind, string> = {
  action: 'an action verb, what to do',
  date: 'a date or day, e.g. today (hoy in Spanish), tomorrow, Oct 3',
  time: 'a time of day, e.g. 3pm, 15:00, a las 3',
  person: 'a person',
  org: 'a company, brand or organisation',
  place: 'a place or location',
  object: 'a named thing, often in quotes',
  variable: 'a $variable',
  list: 'a list marker',
  number: 'a number',
  money: 'an amount of money',
  url: 'a web address',
  page: 'a page in this box',
  nav: 'a sidebar menu item in this box',
  theme: 'a theme of this terminal',
  entity: 'a proper noun of unknown kind',
};

export function isChipKind(value: string): value is ChipKind {
  return (CHIP_KINDS as readonly string[]).includes(value);
}

function sameSpan(a: Chip, b: Chip): boolean {
  return a.start === b.start && a.end === b.end;
}

function overlaps(a: Chip, b: Chip): boolean {
  return a.start < b.end && a.end > b.start;
}

function readings(chip: Chip): ChipReading[] {
  const top: ChipReading = { kind: chip.kind, p: chip.p ?? 0.7, ...(chip.value ? { value: chip.value } : {}) };
  return [top, ...(chip.alternatives ?? [])];
}

/** Combines readings of one span: highest probability first, one per kind. */
function combine(a: Chip, b: Chip): Chip {
  const byKind = new Map<ChipKind, ChipReading>();
  for (const reading of [...readings(a), ...readings(b)]) {
    const existing = byKind.get(reading.kind);
    if (!existing || reading.p > existing.p) {
      byKind.set(reading.kind, reading);
    }
  }
  const sorted = [...byKind.values()].sort((x, y) => y.p - x.p);
  const top = sorted[0] as ChipReading;
  const base = (a.p ?? 0) >= (b.p ?? 0) ? a : b;
  const merged: Chip = { ...base, kind: top.kind, p: top.p, alternatives: sorted.slice(1, 4) };
  if (top.value) {
    merged.value = top.value;
  } else {
    delete merged.value;
  }
  if (merged.alternatives?.length === 0) {
    delete merged.alternatives;
  }
  return merged;
}

/**
 * Local heuristic chips + model chips. Same span: readings combine. A model
 * chip overlapping a local one on a different span loses (the heuristics are
 * exact about what they match); non-overlapping model chips are added.
 */
export function mergeChips(local: Chip[], remote: Chip[]): Chip[] {
  const merged = [...local];
  for (const chip of remote) {
    const same = merged.findIndex((existing) => sameSpan(existing, chip));
    if (same !== -1) {
      merged[same] = combine(merged[same] as Chip, { ...chip, source: chip.source ?? 'model' });
      continue;
    }
    if (!merged.some((existing) => overlaps(existing, chip))) {
      merged.push({ ...chip, source: chip.source ?? 'model' });
    }
  }
  return merged.sort((a, b) => a.start - b.start);
}

/** Glossary terms are the box's own rules: they replace whatever overlaps them. */
export function applyGlossary(text: string, chips: Chip[], glossary: Array<Pick<GlossaryTerm, 'text' | 'type' | 'note' | 'case_sensitive'>>): Chip[] {
  let result = [...chips];
  const terms = [...glossary].sort((a, b) => b.text.length - a.text.length);
  for (const term of terms) {
    const escaped = term.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, term.case_sensitive ? 'gu' : 'giu');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const chip: Chip = { kind: term.type, start: match.index, end: match.index + match[0].length, text: match[0], p: 1, source: 'glossary' };
      if (term.note) {
        chip.note = term.note;
      }
      if (result.some((existing) => existing.source === 'glossary' && overlaps(existing, chip))) {
        continue;
      }
      result = result.filter((existing) => !overlaps(existing, chip));
      result.push(chip);
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

export interface ChipOverride {
  kind: ChipKind;
  value?: string;
  note?: string;
}

export function overrideKey(chip: Pick<Chip, 'start' | 'end' | 'text'>): string {
  return `${chip.start}:${chip.end}:${chip.text}`;
}

/** The person's own choices from the chip popover win over everything. */
export function applyOverrides(chips: Chip[], overrides: Record<string, ChipOverride>): Chip[] {
  return chips.map((chip) => {
    const override = overrides[overrideKey(chip)];
    if (!override) {
      return chip;
    }
    const next: Chip = { kind: override.kind, start: chip.start, end: chip.end, text: chip.text, p: 1, source: 'user' };
    if (override.value) next.value = override.value;
    if (override.note) next.note = override.note;
    if (chip.ref && override.kind === chip.kind) next.ref = chip.ref;
    return next;
  });
}
