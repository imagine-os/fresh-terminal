import { MATERIAL_WORDS, SPACING_WORDS, type MaterialWord, type SpacingWord } from '../dialect/types';
import {
  BACKDROP_WORDS,
  BEZEL_WORDS,
  CURSOR_COLORS,
  CURSOR_SHAPES,
  MOTION_WORDS,
  RESPONDS_WORDS,
  TEXT_WORDS,
  themeSchema,
  type BackdropWord,
  type BezelWord,
  type CursorColor,
  type CursorShape,
  type MotionWord,
  type RespondsWord,
  type TextWord,
  type Theme,
} from './types';

export interface ThemeIssue {
  line: number;
  message: string;
}

export interface ThemeParseResult {
  theme: Theme;
  issues: ThemeIssue[];
}

function includes<T extends string>(list: readonly T[], word: string): word is T {
  return (list as readonly string[]).includes(word);
}

/**
 * Parses the theme dialect on top of a base theme (id/name/scheme/tokens come
 * from the base; the text changes the words).
 */
export function parseTheme(text: string, base: Theme): ThemeParseResult {
  const theme: Theme = structuredClone(base);
  const issues: ThemeIssue[] = [];

  const statements = text
    .split(/\n|(?<=\.)\s+(?=[A-Z])/)
    .map((statement) => statement.trim().replace(/\.$/, '').trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('#'));

  statements.forEach((statement, index) => {
    const line = index + 1;
    const colon = statement.indexOf(':');
    if (colon === -1) {
      issues.push({ line, message: 'Expected "<Subject>: ..."' });
      return;
    }
    const subject = statement.slice(0, colon).trim().toLowerCase();
    const rest = statement.slice(colon + 1).trim().toLowerCase();
    const parts = rest.split(',').map((part) => part.trim()).filter(Boolean);

    switch (subject) {
      case 'stage': {
        const first = parts[0] ?? '';
        const over = /^([a-z]+)(?:\s+over\s+([a-z]+))?$/.exec(first);
        if (over === null) {
          issues.push({ line, message: `Unknown stage "${first}"` });
          return;
        }
        const material = over[1] ?? '';
        if (!includes<MaterialWord>(MATERIAL_WORDS, material)) {
          issues.push({ line, message: `Unknown material "${material}"` });
          return;
        }
        theme.surface = material;
        if (over[2] !== undefined) {
          if (includes<BackdropWord>(BACKDROP_WORDS, over[2])) {
            theme.backdrop = over[2];
          } else {
            issues.push({ line, message: `Unknown backdrop "${over[2]}"` });
          }
        }
        for (const extra of parts.slice(1)) {
          if (includes<SpacingWord>(SPACING_WORDS, extra)) {
            theme.spacing = extra;
          } else {
            issues.push({ line, message: `Unknown word "${extra}"` });
          }
        }
        return;
      }
      case 'bezel': {
        if (includes<BezelWord>(BEZEL_WORDS, rest)) {
          theme.bezel = rest;
        } else {
          issues.push({ line, message: `Unknown bezel "${rest}"` });
        }
        return;
      }
      case 'text': {
        if (includes<TextWord>(TEXT_WORDS, rest)) {
          theme.text = rest;
        } else {
          issues.push({ line, message: `Unknown text "${rest}"` });
        }
        return;
      }
      case 'cursor': {
        for (const part of parts) {
          if (includes<CursorShape>(CURSOR_SHAPES, part)) {
            theme.cursor.shape = part;
          } else if (includes<CursorColor>(CURSOR_COLORS, part)) {
            theme.cursor.color = part;
          } else if (part === 'blink') {
            theme.cursor.blink = true;
          } else if (part === 'steady') {
            theme.cursor.blink = false;
          } else if (part === 'glow') {
            theme.cursor.glow = true;
          } else if (part === 'plain') {
            theme.cursor.glow = false;
          } else {
            issues.push({ line, message: `Unknown cursor word "${part}"` });
          }
        }
        return;
      }
      case 'motion': {
        if (includes<MotionWord>(MOTION_WORDS, rest)) {
          theme.motion = rest;
        } else {
          issues.push({ line, message: `Unknown motion "${rest}"` });
        }
        return;
      }
      case 'responds to':
      case 'responds': {
        if (includes<RespondsWord>(RESPONDS_WORDS, rest)) {
          theme.respondsTo = rest;
        } else {
          issues.push({ line, message: `Unknown response "${rest}"` });
        }
        return;
      }
      default:
        issues.push({ line, message: `Unknown subject "${statement.slice(0, colon).trim()}"` });
    }
  });

  const checked = themeSchema.safeParse(theme);
  if (!checked.success) {
    issues.push({ line: 0, message: checked.error.message });
    return { theme: structuredClone(base), issues };
  }
  return { theme: checked.data, issues };
}

export function printTheme(theme: Theme): string {
  const stage = theme.backdrop === 'none' ? theme.surface : `${theme.surface} over ${theme.backdrop}`;
  const cursor = [
    theme.cursor.shape,
    theme.cursor.color,
    theme.cursor.blink ? 'blink' : 'steady',
    ...(theme.cursor.glow ? ['glow'] : []),
  ].join(', ');
  return [
    `Stage: ${stage}, ${theme.spacing}.`,
    `Bezel: ${theme.bezel}.`,
    `Text: ${theme.text}.`,
    `Cursor: ${cursor}.`,
    `Motion: ${theme.motion}.`,
    `Responds to: ${theme.respondsTo}.`,
  ].join('\n');
}
