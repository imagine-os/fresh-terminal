import { describe, expect, it } from 'vitest';
import { applyGlossary, applyOverrides, mergeChips, overrideKey } from './merge';
import { localTagger, segment } from './tagger';
import { isAmbiguous } from './types';

function kinds(text: string) {
  return localTagger.tag(text).map((chip) => `${chip.kind}:${chip.text}`);
}

describe('LocalTagger', () => {
  it('finds action verbs at sentence start only', () => {
    expect(kinds('make a page')).toEqual(['action:make']);
    expect(kinds('please make a page')).toEqual([]);
    expect(kinds('Open settings. Send it')).toEqual(['action:Open', 'action:Send']);
  });

  it('finds relative and absolute dates', () => {
    expect(kinds('remind me tomorrow')).toEqual(['date:tomorrow']);
    expect(kinds('ship on Oct 3')).toEqual(['date:Oct 3']);
    expect(kinds('meet next week')).toEqual(['date:next week']);
    expect(kinds('due 2026-10-03')).toEqual(['date:2026-10-03']);
  });

  it('finds quoted strings as objects with their inner value', () => {
    const chips = localTagger.tag('make a page called "Pricing"');
    const object = chips.find((chip) => chip.kind === 'object');
    expect(object?.value).toBe('Pricing');
    expect(object?.text).toBe('"Pricing"');
  });

  it('finds $variables', () => {
    const chips = localTagger.tag('set $budget to 40');
    expect(chips[0]).toEqual({ kind: 'variable', start: 4, end: 11, text: '$budget', value: 'budget' });
    expect(chips[1]).toMatchObject({ kind: 'number', text: '40' });
  });

  it('finds list markers at line starts', () => {
    expect(kinds('- apples\n- pears\n1. plums')).toEqual(['list:- ', 'list:- ', 'list:1. ']);
  });

  it('finds capitalised multi-word entities but not single capitalised words', () => {
    expect(kinds('call Between Gigs later')).toEqual(['entity:Between Gigs']);
    expect(kinds('call Justin later')).toEqual([]);
  });

  it('never overlaps chips', () => {
    const chips = localTagger.tag('Schedule "Team Sync" tomorrow');
    for (let index = 1; index < chips.length; index += 1) {
      expect(chips[index]!.start).toBeGreaterThanOrEqual(chips[index - 1]!.end);
    }
  });

  it('segments text around chips', () => {
    const text = 'show today';
    const segments = segment(text, localTagger.tag(text));
    expect(segments.map((part) => part.type)).toEqual(['chip', 'text', 'chip']);
  });

  it('returns nothing for empty input', () => {
    expect(localTagger.tag('   ')).toEqual([]);
  });
});

describe('LocalTagger, pass 4 kinds', () => {
  it('reads Hoy by context: possessive leans brand, lowercase with a time is a date', () => {
    const chips = localTagger.tag("Hoy's launch is hoy at 3pm");
    const brand = chips.find((chip) => chip.start === 0);
    expect(brand).toMatchObject({ kind: 'org', text: 'Hoy' });
    expect(brand?.alternatives?.[0]?.kind).toBe('date');
    const today = chips.find((chip) => chip.text === 'hoy');
    expect(today).toMatchObject({ kind: 'date', value: 'today' });
    expect(chips.find((chip) => chip.kind === 'time')?.text).toBe('at 3pm');
    expect(localTagger.tag('nos vemos hoy a las 3').map((chip) => `${chip.kind}:${chip.text}`)).toEqual(['date:hoy', 'time:a las 3']);
  });

  it('marks a sentence-start Hoy as ambiguous', () => {
    const chip = localTagger.tag('Hoy is great').find((candidate) => candidate.text === 'Hoy');
    expect(chip && isAmbiguous(chip)).toBe(true);
    const lower = localTagger.tag('see you hoy').find((candidate) => candidate.text === 'hoy');
    expect(lower && isAmbiguous(lower)).toBe(false);
  });

  it('finds times, money, urls and numbers', () => {
    const kinds = (text: string) => localTagger.tag(text).map((chip) => `${chip.kind}:${chip.text}`);
    expect(kinds('meet at 15:30 for $40')).toEqual(['time:at 15:30', 'money:$40']);
    expect(kinds('open https://example.com/x now')).toEqual(['action:open', 'url:https://example.com/x']);
    expect(kinds('add 12 items')).toEqual(['action:add', 'number:12']);
  });

  it("resolves the box's own pages, menu items and themes", () => {
    const chips = localTagger.tag('open Koi Pond and switch to Glass Window', {
      nav: [{ id: 'nav-1', label: 'Koi Pond' }],
      themes: [{ id: 'glass-window', name: 'Glass Window' }],
    });
    expect(chips.find((chip) => chip.kind === 'nav')).toMatchObject({ text: 'Koi Pond', ref: 'nav-1' });
    expect(chips.find((chip) => chip.kind === 'theme')).toMatchObject({ text: 'Glass Window', ref: 'glass-window' });
  });
});

describe('chip merge, glossary and overrides', () => {
  it('combines readings of the same span and keeps the rest', () => {
    const local = [{ kind: 'date' as const, start: 0, end: 3, text: 'Hoy', p: 0.55, alternatives: [{ kind: 'org' as const, p: 0.45 }] }];
    const remote = [
      { kind: 'org' as const, start: 0, end: 3, text: 'Hoy', p: 0.8 },
      { kind: 'person' as const, start: 10, end: 14, text: 'Juan', p: 0.9 },
    ];
    const merged = mergeChips(local, remote);
    expect(merged[0]).toMatchObject({ kind: 'org', p: 0.8 });
    expect(merged[0]?.alternatives?.[0]).toMatchObject({ kind: 'date', p: 0.55 });
    expect(merged[1]).toMatchObject({ kind: 'person', source: 'model' });
  });

  it('lets a case-sensitive glossary term override the tagger, leaving lowercase alone', () => {
    const text = "Hoy's launch is hoy at 3pm";
    const chips = applyGlossary(text, localTagger.tag(text), [{ text: 'Hoy', type: 'org', note: 'the brand', case_sensitive: true }]);
    expect(chips.find((chip) => chip.start === 0)).toMatchObject({ kind: 'org', source: 'glossary', note: 'the brand' });
    expect(chips.find((chip) => chip.text === 'hoy')).toMatchObject({ kind: 'date' });
    expect(chips.filter((chip) => chip.source === 'glossary')).toHaveLength(1);
  });

  it('applies popover overrides as authoritative user chips', () => {
    const chips = localTagger.tag('Hoy is great');
    const target = chips.find((chip) => chip.text === 'Hoy');
    const next = applyOverrides(chips, { [overrideKey(target!)]: { kind: 'org', note: 'our client' } });
    expect(next.find((chip) => chip.text === 'Hoy')).toEqual({ kind: 'org', start: 0, end: 3, text: 'Hoy', p: 1, source: 'user', note: 'our client' });
    expect(isAmbiguous(next.find((chip) => chip.text === 'Hoy')!)).toBe(false);
  });
});
