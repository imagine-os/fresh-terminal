import startersJson from '../../../docs/prompts/starters.json';
import { startersFileSchema, type RevealPattern, type Starter } from './types';

export * from './types';

/**
 * Starter prompts are records. They seed the suggestion strip and are the seed
 * of the actions vocabulary: every new verb gets a starter. Source of truth is
 * terminal/docs/prompts/starters.json (append-only).
 */
export const STARTERS: Starter[] = startersFileSchema.parse(startersJson).starters;

export function findStarter(id: string): Starter | undefined {
  return STARTERS.find((starter) => starter.id === id);
}

/** Matches typed text against starter texts, ignoring case, quotes and trailing punctuation. */
export function matchStarter(text: string): Starter | undefined {
  const normalise = (value: string) => value.toLowerCase().replace(/["'“”.?!]/g, '').replace(/\s+/g, ' ').trim();
  const wanted = normalise(text);
  return STARTERS.find((starter) => normalise(starter.text) === wanted);
}

export function revealFor(text: string, fallback: RevealPattern = 'typewriter'): RevealPattern {
  return matchStarter(text)?.reveal ?? fallback;
}

export const STARTER_VERBS: string[] = [...new Set(STARTERS.map((starter) => starter.verb))];
