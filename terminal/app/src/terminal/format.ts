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

export interface ListItem {
  start: number;
  end: number;
  text: string;
}

/**
 * A paragraph that enumerates inline ("1st is ..., second is ..., 3rd is ...")
 * splits into items at each ordinal of one group, so the page can show it as
 * the list it is. Offsets are relative to the paragraph. Null when there is no
 * such list.
 */
export function inlineListItems(paragraph: string, chips: Array<{ start: number; end: number; kind: string; group?: string }>): ListItem[] | null {
  const ordinals = chips.filter((chip) => chip.kind === 'list' && chip.group?.startsWith('ord-')).sort((a, b) => a.start - b.start);
  if (ordinals.length < 2) return null;
  const items: ListItem[] = [];
  for (let index = 0; index < ordinals.length; index += 1) {
    const start = ordinals[index]!.start;
    const next = ordinals[index + 1];
    let end = next ? next.start : paragraph.length;
    // The separator before the next ordinal (", " or ";") belongs to no item.
    while (end > start && /[\s,;]/.test(paragraph[end - 1] as string)) end -= 1;
    items.push({ start, end, text: paragraph.slice(start, end) });
  }
  return items;
}

/** The draft page appears once there is enough text to be worth formatting. */
export function wantsPage(text: string): boolean {
  return text.length >= 80 || text.includes('\n');
}
