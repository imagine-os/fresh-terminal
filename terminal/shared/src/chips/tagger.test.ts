import { describe, expect, it } from 'vitest';
import { localTagger, segment } from './tagger';

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
    expect(chips).toEqual([
      { kind: 'variable', start: 4, end: 11, text: '$budget', value: 'budget' },
    ]);
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
