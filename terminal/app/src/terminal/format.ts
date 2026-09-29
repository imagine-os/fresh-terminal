/**
 * Length-preserving formatting for the draft page: chip offsets computed on the
 * raw text stay valid on the formatted text. Only letters change case; nothing
 * is inserted or removed.
 */
export function formatDraft(text: string): string {
  const chars = [...text];
  let atSentenceStart = true;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] as string;
    if (atSentenceStart && /[a-z]/.test(char)) {
      chars[index] = char.toUpperCase();
      atSentenceStart = false;
    } else if (/[A-Za-z0-9]/.test(char)) {
      atSentenceStart = false;
    }
    if (/[.!?\n]/.test(char)) {
      atSentenceStart = true;
    }
    // A lone lowercase "i" is the pronoun.
    if (char === 'i') {
      const before = index === 0 ? ' ' : (chars[index - 1] as string);
      const after = index === chars.length - 1 ? ' ' : (chars[index + 1] as string);
      if (/[\s"'(]/.test(before) && /[\s,.!?;:'")]/.test(after)) {
        chars[index] = 'I';
      }
    }
  }
  return chars.join('');
}

export interface Paragraph {
  start: number;
  end: number;
  text: string;
}

/** Paragraphs by newline, with their offsets into the (formatted) text. */
export function paragraphs(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    if (index === text.length || text[index] === '\n') {
      if (index > start && text.slice(start, index).trim().length > 0) {
        out.push({ start, end: index, text: text.slice(start, index) });
      }
      start = index + 1;
    }
  }
  return out;
}

/** The draft page appears once there is enough text to be worth formatting. */
export function wantsPage(text: string): boolean {
  return text.length >= 80 || text.includes('\n');
}
