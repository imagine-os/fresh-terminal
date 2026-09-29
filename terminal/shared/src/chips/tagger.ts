import type { Chip, ChipKind, TextSegment } from './types';

/**
 * Local chip tagger. Regex and word lists only, no model call.
 * Rule: when unsure, leave it as text. False confidence is worse than a miss.
 *
 * A model-based tagger (the JEV tier) plugs in through `ChipTagger` later.
 */
export interface ChipTagger {
  tag(text: string, context?: TagContext): Chip[];
}

/** The box's own records, so names resolve to page / nav / theme chips. */
export interface TagContext {
  pages?: Array<{ id: string; title: string }>;
  nav?: Array<{ id: string; label: string }>;
  themes?: Array<{ id: string; name: string }>;
}

/** Multi-word verbs read as one action chip ("make sure", not "make" + a quote). Longest first. */
export const ACTION_PHRASES = ['make sure', 'set up', 'sign in', 'log in', 'figure out', 'check out', 'clean up', 'turn on', 'turn off'] as const;

/** Verbs about teaching the terminal; tagged wherever they appear, not only at a sentence start. */
export const TEACHING_VERBS = ['learn', 'tag', 'tagged', 'teach', 'remember'] as const;

export const ACTION_VERBS = [
  'make',
  'learn',
  'tag',
  'create',
  'rename',
  'switch',
  'draw',
  'hide',
  'move',
  'fix',
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

const SPANISH_DAYS = 'lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo';
const SPANISH_DATES = new RegExp(`\\b(?:pasado mañana|mañana|ayer|${SPANISH_DAYS})\\b`, 'gi');
const TIME_PATTERNS: RegExp[] = [
  /\b(?:at|a las|a la)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.)?(?=\W|$)/gi,
  /\b\d{1,2}(?::\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.)(?=\W|$)/gi,
  /\b\d{1,2}:\d{2}\b/g,
  /\b(?:noon|midnight|mediodía|medianoche)\b/gi,
];
const MONEY = /(?:[$€£]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|eur|dollars|dólares|euros)\b)/gi;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)]/gi;
const NUMBER = /\b\d+(?:[.,]\d+)?\b/g;
const HOY = /\bhoy\b/gi;

const LIST_MARKER = /(^|\n)\s*(?:[-*•]|\d+[.)])\s+/g;
const QUOTED = /"([^"\n]{1,120})"|“([^”\n]{1,120})”|'([^'\n]{1,120})'/g;
const VARIABLE = /\$[A-Za-z_][A-Za-z0-9_]*/g;
const ENTITY = /\b(?:[A-Z][a-z]+)(?:\s+[A-Z][a-z]+)+\b/g;

/**
 * Words that are capitalised for grammar, not because they name something.
 * "What Can you do" is a question, not a thing (Justin, C-079).
 */
export const STOPWORDS = new Set(
  (
    'a an the and or but so if then than as at by for from in into of off on onto out over to under up with without via like about above after before ' +
    'what when where who whom which why how can could will would should shall may might must do does did done have has had be been being am is are was were ' +
    'i me my mine we us our ours you your yours he him his she her hers it its they them their theirs this that these those there here who whose ' +
    'not no yes ok okay please thanks thank hi hello hey lets let just also very really some any all each every both more most less much many ' +
    'one two three first second third next last new old good bad great well now again still yet ever never always often maybe perhaps ' +
    'is my name lol btw ps ' +
    'qué que cómo como cuándo cuando dónde donde quién quien cuál cual por para con sin los las el la un una unos unas del al lo le les es son está están estoy hay ' +
    'hola gracias sí muy más menos también pero porque yo tú tu mi mis tus sus su nosotros ellos ellas esto esta este eso esa ese aquí allí ahora'
  ).split(/\s+/),
);

/** One capitalised item: "Hoy", "Between-Gigs", "Santa Maria Tenis Club". */
const ITEM = '[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*(?:\\s+[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)*';
const LIST_RUN = new RegExp(`(${ITEM})((?:\\s*,\\s*${ITEM})+)(\\s*,?\\s*(?:and|or|y|o|&)\\s+${ITEM})?(\\s*,?\\s*(?:etc\\.?|and so on|entre otros))?`, 'g');
const LIST_SEP = /\s*,\s*|\s*,?\s*(?:and|or|y|o|&)\s+/;

/** The word before a list says what its items are: "3 companies, Hoy, ..." */
const LIST_HEADS: Array<[RegExp, ChipKind]> = [
  [/\b(compan(?:y|ies)|clients?|brands?|business(?:es)?|orgs?|organi[sz]ations?|teams?|startups?|vendors?|customers?|partners?|sponsors?|empresas?|clientes?|marcas?|equipos?)\b/i, 'org'],
  [/\b(people|persons?|friends?|folks|names?|contacts?|users?|players?|members?|guys|kids|personas?|amigos?|gente|contactos?|usuarios?)\b/i, 'person'],
  [/\b(cities|city|places?|countries|country|towns?|offices?|locations?|ciudades|ciudad|lugares?|pa[ií]s(?:es)?|oficinas?)\b/i, 'place'],
  [/\b(pages?|p[aá]ginas?)\b/i, 'page'],
];

/** "my name is Justin", "I'm Justin", "Justin is my name", "me llamo Justin". */
const NAME_INTROS = [
  /\b(?:my name is|my name's|i am|i'm|im|call me|this is|me llamo|soy|ll[aá]mame)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
  /\b([A-Z][a-z]+)\s+(?:is my name|es mi nombre)\b/g,
];

/** Inline ordinals that enumerate a list in one breath: "1st is ..., second is ..., 3rd is ...". */
const ORDINALS = /\b(1st|2nd|3rd|[4-9]th|1[0-9]th|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|primero|segundo|tercero|cuarto|quinto)\b/gi;
const ORDINAL_RANK: Record<string, number> = {
  '1st': 1, first: 1, primero: 1,
  '2nd': 2, second: 2, segundo: 2,
  '3rd': 3, third: 3, tercero: 3,
  '4th': 4, fourth: 4, cuarto: 4,
  '5th': 5, fifth: 5, quinto: 5,
  '6th': 6, sixth: 6, '7th': 7, seventh: 7, '8th': 8, eighth: 8, '9th': 9, ninth: 9, '10th': 10, tenth: 10,
};

/** Feeling words about the work (C-081). Whole words only, so "badass" never reads as "bad". */
const MOOD_NEGATIVE = 'bad|awful|terrible|horrible|ugly|annoying|annoyed|broken|worse|worst|hate|hated|wrong|useless|confusing|frustrating|slow|sucks|meh|malo|mala|feo|fea|horrible|pésimo|pesimo|molesto|odio';
const MOOD_POSITIVE = 'good|great|awesome|amazing|love|loved|like it|nice|perfect|beautiful|excellent|better|best|badass|cool|wonderful|fantastic|bueno|buena|genial|perfecto|hermoso|excelente|mejor|increíble|increible';
const MOOD = new RegExp(`\\b(${MOOD_NEGATIVE}|${MOOD_POSITIVE})\\b`, 'gi');
const NEGATIVE_SET = new Set(MOOD_NEGATIVE.split('|'));
const NEGATION_BEFORE = /\b(?:not|never|no|isn't|isnt|wasn't|doesn't|dont|don't|ain't|nunca|tampoco)\s+(?:so|that|very|too|really|tan|muy)?\s*$/i;

function isStopword(word: string): boolean {
  return STOPWORDS.has(word.toLowerCase());
}

/** Drops grammar words from both ends of a capitalised run; "" when nothing names anything. */
export function trimStopwords(span: string): { text: string; offset: number } {
  const words = span.split(/(\s+)/);
  let start = 0;
  let end = words.length;
  while (start < end && (words[start] === '' || /^\s+$/.test(words[start] as string) || isStopword(words[start] as string))) start += 1;
  while (end > start && (words[end - 1] === '' || /^\s+$/.test(words[end - 1] as string) || isStopword(words[end - 1] as string))) end -= 1;
  const kept = words.slice(start, end).join('');
  const offset = words.slice(0, start).join('').length;
  return { text: kept, offset };
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

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

function scan(pattern: RegExp, text: string, visit: (match: RegExpExecArray) => void): void {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    visit(match);
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
    }
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * "Hoy" is both the Spanish word for today and a brand. Context decides:
 * possessive or mid-sentence capital leans brand, "hoy a las 3" is a date,
 * a capital at the start of a sentence stays ambiguous.
 */
function hoyReading(text: string, start: number, word: string): Chip {
  const after = text.slice(start + word.length, start + word.length + 8).toLowerCase();
  const before = text.slice(Math.max(0, start - 2), start);
  const sentenceStart = start === 0 || /[.!?\n]\s*$/.test(text.slice(0, start));
  const capital = word[0] === 'H';
  const possessive = /^['’]s\b/.test(after);
  const timeFollows = /^\s+(a las|a la|at|por la|en la)\b/.test(after);
  let org = 0.1;
  if (possessive) org = 0.8;
  else if (capital && !sentenceStart) org = 0.65;
  else if (capital && sentenceStart) org = 0.45;
  if (timeFollows) org = Math.min(org, 0.05);
  void before;
  const date = 1 - org;
  const top: ChipKind = org > date ? 'org' : 'date';
  return {
    kind: top,
    start,
    end: start + word.length,
    text: word,
    ...(top === 'date' ? { value: 'today' } : {}),
    p: Math.max(org, date),
    alternatives: [top === 'org' ? { kind: 'date', value: 'today', p: date } : { kind: 'org', p: org }],
    source: 'local',
  };
}

export class LocalTagger implements ChipTagger {
  tag(text: string, context: TagContext = {}): Chip[] {
    const chips: Chip[] = [];
    if (text.trim().length === 0) {
      return chips;
    }

    // The box's own records first: a page, menu item or theme named in the text.
    const records: Array<{ kind: ChipKind; id: string; name: string }> = [
      ...(context.pages ?? []).map((page) => ({ kind: 'page' as const, id: page.id, name: page.title })),
      ...(context.nav ?? []).map((item) => ({ kind: 'nav' as const, id: item.id, name: item.label })),
      ...(context.themes ?? []).map((theme) => ({ kind: 'theme' as const, id: theme.id, name: theme.name })),
    ].sort((a, b) => b.name.length - a.name.length);
    for (const record of records) {
      if (record.name.trim().length < 3) {
        continue;
      }
      scan(new RegExp(`\\b${escapeRegExp(record.name)}\\b`, 'gi'), text, (match) => {
        pushIfFree(chips, { kind: record.kind, start: match.index, end: match.index + match[0].length, text: match[0], ref: record.id, value: record.name, p: 0.9, source: 'local' });
      });
    }

    // People introduce themselves: "my name is Justin". The name is a person everywhere it appears.
    const names = new Set<string>();
    for (const pattern of NAME_INTROS) {
      scan(pattern, text, (match) => {
        const name = match[1] ?? '';
        if (name.length === 0 || isStopword(name)) return;
        const start = match.index + match[0].indexOf(name);
        pushIfFree(chips, { kind: 'person', start, end: start + name.length, text: name, value: name, p: 0.95, source: 'local' });
        names.add(name);
      });
    }
    for (const name of names) {
      scan(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g'), text, (match) => {
        pushIfFree(chips, { kind: 'person', start: match.index, end: match.index + match[0].length, text: match[0], value: name, p: 0.9, source: 'local' });
      });
    }

    // Comma lists of capitalised items are one group of the same kind: "3 companies, Hoy, Santa Maria Tenis Club, Between-Gigs, Aluzina".
    const listCounts: Array<{ start: number; end: number; listed: number; open: boolean }> = [];
    scan(LIST_RUN, text, (match) => {
      const run = match[0];
      const runStart = match.index;
      const items: Array<{ start: number; end: number; text: string }> = [];
      let cursor = 0;
      const body = run.slice(0, run.length - (match[4] ?? '').length);
      for (const raw of body.split(LIST_SEP)) {
        const at = body.indexOf(raw, cursor);
        cursor = at + raw.length;
        const trimmed = trimStopwords(raw);
        if (trimmed.text.length === 0) continue;
        items.push({ start: runStart + at + trimmed.offset, end: runStart + at + trimmed.offset + trimmed.text.length, text: trimmed.text });
      }
      if (items.length < 2) return;
      const before = text.slice(Math.max(0, runStart - 60), runStart);
      let kind: ChipKind = 'entity';
      let head: RegExpExecArray | null = null;
      for (const [pattern, candidate] of LIST_HEADS) {
        const found = new RegExp(`${pattern.source}\\W*$`, 'i').exec(before);
        if (found) {
          kind = candidate;
          head = found;
          break;
        }
      }
      const group = `list-${runStart}`;
      for (const item of items) {
        pushIfFree(chips, { kind, start: item.start, end: item.end, text: item.text, p: kind === 'entity' ? 0.6 : 0.75, source: 'local', group });
      }
      // "I have 3 companies" followed by four names: the count is worth a question.
      if (head) {
        const count = /(\d+)\s+\w+\W*$/.exec(before);
        if (count) {
          const at = runStart - 60 < 0 ? count.index : runStart - 60 + count.index;
          listCounts.push({ start: at, end: at + (count[1] ?? '').length, listed: items.length, open: Boolean(match[4]) });
        }
      }
    });

    // "1st is the worst, second is the best, 3rd ..." enumerates a list inline.
    const ordinals: Array<{ start: number; end: number; text: string; rank: number }> = [];
    scan(ORDINALS, text, (match) => {
      const rank = ORDINAL_RANK[match[0].toLowerCase()];
      const before = text.slice(Math.max(0, match.index - 3), match.index);
      // "a second" is time; an ordinal opens a clause: starts a sentence or follows a comma, semicolon or newline.
      if (rank === undefined || (match.index > 0 && !/(?:^|[,;:\n(]\s*|\.\s+)$/.test(before) && before.trim().length > 0)) return;
      ordinals.push({ start: match.index, end: match.index + match[0].length, text: match[0], rank });
    });
    if (ordinals.length >= 2 && ordinals[0]?.rank === 1 && ordinals.every((item, index) => index === 0 || item.rank === (ordinals[index - 1]?.rank ?? 0) + 1)) {
      const group = `ord-${ordinals[0]?.start ?? 0}`;
      for (const item of ordinals) {
        pushIfFree(chips, { kind: 'list', start: item.start, end: item.end, text: item.text, value: String(item.rank), p: 0.85, source: 'local', group });
      }
    }

    scan(URL_PATTERN, text, (match) => {
      pushIfFree(chips, { kind: 'url', start: match.index, end: match.index + match[0].length, text: match[0], value: match[0], p: 0.99, source: 'local' });
    });

    scan(HOY, text, (match) => {
      pushIfFree(chips, hoyReading(text, match.index, match[0]));
    });

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

    scan(SPANISH_DATES, text, (match) => {
      pushIfFree(chips, { kind: 'date', start: match.index, end: match.index + match[0].length, text: match[0], p: 0.85, source: 'local' });
    });

    for (const pattern of TIME_PATTERNS) {
      scan(pattern, text, (match) => {
        pushIfFree(chips, { kind: 'time', start: match.index, end: match.index + match[0].length, text: match[0], p: 0.9, source: 'local' });
      });
    }

    scan(MONEY, text, (match) => {
      pushIfFree(chips, { kind: 'money', start: match.index, end: match.index + match[0].length, text: match[0], value: match[0].replace(/\s/g, ''), p: 0.9, source: 'local' });
    });

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
      const lower = rest.toLowerCase();
      const phrase = ACTION_PHRASES.find((candidate) => lower.startsWith(candidate) && !/[A-Za-z]/.test(lower.charAt(candidate.length)));
      if (phrase) {
        pushIfFree(chips, { kind: 'action', start, end: start + phrase.length, text: rest.slice(0, phrase.length), value: phrase });
        continue;
      }
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

    // Teaching verbs count only when used as verbs: "tag Hoy as a brand", "should be tagged as", not "a tag" or "a stack of tags".
    const teaching = new RegExp(`\\b(${TEACHING_VERBS.join('|')})\\b`, 'gi');
    let taught: RegExpExecArray | null;
    while ((taught = teaching.exec(text)) !== null) {
      const word = taught[1] ?? '';
      const lower = word.toLowerCase();
      const before = text.slice(Math.max(0, taught.index - 12), taught.index);
      const after = text.slice(taught.index + word.length, taught.index + word.length + 12);
      const nounBefore = /\b(?:a|an|the|of|into|same|one|per|this|that|my|your|our|each|every|no|type of|kind of)\s+$/i.test(before);
      if (lower === 'tag') {
        const verbAfter = /^\s+(?:it|this|that|them|those|these|as|every|all|each|the|me|[A-Z"“$'])/.test(after);
        if (nounBefore || !verbAfter) continue;
      } else if (lower === 'tagged') {
        const passive = /\b(?:be|been|get|got|is|are|was|were|not)\s+$/i.test(before);
        const asAfter = /^\s+as\b/i.test(after);
        if (!passive && !asAfter) continue;
      } else if (nounBefore) {
        continue;
      }
      pushIfFree(chips, { kind: 'action', start: taught.index, end: taught.index + word.length, text: word, value: lower });
    }

    ENTITY.lastIndex = 0;
    let entity: RegExpExecArray | null;
    while ((entity = ENTITY.exec(text)) !== null) {
      // "What Can you do" is grammar; "Santa Maria Tenis Club" names something.
      const trimmed = trimStopwords(entity[0]);
      if (wordCount(trimmed.text) < 2) {
        continue;
      }
      const start = entity.index + trimmed.offset;
      pushIfFree(chips, { kind: 'entity', start, end: start + trimmed.text.length, text: trimmed.text, p: 0.6, source: 'local' });
    }

    // Mood: "you're doing a bad job" is feedback, not a thing to learn. Negation flips it: "not bad" leans positive.
    scan(MOOD, text, (match) => {
      const word = match[0];
      const before = text.slice(Math.max(0, match.index - 24), match.index);
      // "Bad is an adjective" talks about the word; "a bad job" and "that's bad" feel it.
      if (/^\s+(?:is|es|means|significa)\b/.test(text.slice(match.index + word.length, match.index + word.length + 12))) return;
      let negative = NEGATIVE_SET.has(word.toLowerCase());
      let p = 0.6;
      if (NEGATION_BEFORE.test(before)) {
        negative = !negative;
        p = 0.55;
      }
      const value = negative ? 'negative' : 'positive';
      pushIfFree(chips, {
        kind: 'mood',
        start: match.index,
        end: match.index + word.length,
        text: word,
        value,
        p,
        alternatives: [{ kind: 'mood', value: negative ? 'positive' : 'negative', p: 1 - p }],
        source: 'local',
      });
    });

    scan(NUMBER, text, (match) => {
      const chip: Chip = { kind: 'number', start: match.index, end: match.index + match[0].length, text: match[0], value: match[0], p: 0.8, source: 'local' };
      const counted = listCounts.find((entry) => entry.start === match.index);
      if (counted && counted.listed !== Number(match[0]) && (counted.listed > Number(match[0]) || !counted.open)) {
        // The count says 3, the list has 4: keep the words, ask.
        chip.p = 0.5;
        chip.alternatives = [{ kind: 'number', value: String(counted.listed), p: 0.5 }];
        chip.note = `listed ${counted.listed}`;
      }
      pushIfFree(chips, chip);
    });

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

  tag(_text: string, _context?: TagContext): Chip[] {
    return [];
  }
}
