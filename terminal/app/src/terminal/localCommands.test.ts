import { describe, expect, it } from 'vitest';
import { matchLocalCommand } from './localCommands';

const context = { boxes: [], lang: 'en', dialectText: '', actionIntents: [] };

describe('typed undo and redo', () => {
  it('runs locally, like Ctrl+Z, in English and Spanish', () => {
    for (const text of ['undo', 'Undo.', 'undo that', 'undo the last change', 'deshacer']) {
      expect(matchLocalCommand(text, [], context)).toEqual({ kind: 'flip', direction: 'undo' });
    }
    for (const text of ['redo', 'Redo!', 'rehacer']) {
      expect(matchLocalCommand(text, [], context)).toEqual({ kind: 'flip', direction: 'redo' });
    }
  });

  it('leaves longer requests to the model', () => {
    expect(matchLocalCommand('undo the theme and make it blue', [], context)).toBeNull();
  });
});
