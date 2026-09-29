import { describe, expect, it } from 'vitest';
import { formatDraft, inlineListItems, paragraphs, wantsPage } from './format';

describe('draft formatting', () => {
  it('capitalises sentence starts and the pronoun I without changing length', () => {
    const raw = 'hid everything but the counter. i cant seem to move it. also i want a timer';
    const out = formatDraft(raw);
    expect(out).toBe('Hid everything but the counter. I cant seem to move it. Also I want a timer');
    expect(out.length).toBe(raw.length);
  });
  it('leaves words like "it" and "in" alone and handles newlines as sentence breaks', () => {
    expect(formatDraft('put it in\nthe box')).toBe('Put it in\nThe box');
  });
  it('splits paragraphs with offsets', () => {
    const list = paragraphs('one\n\ntwo words\n');
    expect(list).toEqual([
      { start: 0, end: 3, text: 'one' },
      { start: 5, end: 14, text: 'two words' },
    ]);
  });
  it('shows the page for long or multi-line drafts only', () => {
    expect(wantsPage('short')).toBe(false);
    expect(wantsPage('a\nb')).toBe(true);
    expect(wantsPage('x'.repeat(80))).toBe(true);
  });
});

describe('inlineListItems (C-079)', () => {
  it('splits a paragraph at the ordinals of one group', () => {
    const text = 'Some things: 1st is the worst, second is the best, 3rd is the one.';
    const chips = [
      { kind: 'list', start: 13, end: 16, group: 'ord-13' },
      { kind: 'list', start: 31, end: 37, group: 'ord-13' },
      { kind: 'list', start: 51, end: 54, group: 'ord-13' },
    ];
    expect(inlineListItems(text, chips)?.map((item) => item.text)).toEqual(['1st is the worst', 'second is the best', '3rd is the one.']);
    expect(inlineListItems(text, [])).toBeNull();
  });
});
