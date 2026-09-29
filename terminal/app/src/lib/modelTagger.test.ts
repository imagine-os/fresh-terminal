import { describe, expect, it } from 'vitest';
import { mergeChips } from './modelTagger';

describe('mergeChips', () => {
  it('keeps local chips and adds non-overlapping remote chips in order', () => {
    const local = [{ kind: 'action' as const, start: 0, end: 4, text: 'make' }];
    const remote = [
      { kind: 'entity' as const, start: 2, end: 9, text: 'ke a pa' },
      { kind: 'date' as const, start: 12, end: 20, text: 'tomorrow' },
    ];
    expect(mergeChips(local, remote).map((chip) => chip.kind)).toEqual(['action', 'date']);
  });
});
