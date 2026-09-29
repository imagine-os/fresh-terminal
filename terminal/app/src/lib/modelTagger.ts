import type { Chip } from '@shared/chips';
import { ROUTER_URL } from './routerClient';

/**
 * The model tagger hook: asks the router's tagger tier (google/gemini-2.5-flash-lite)
 * for chips as JSON. Off by default; the dev panel toggles it. Local chips win on
 * overlap so the heuristic tagger stays the source of certainty.
 */
export async function tagRemote(text: string, signal?: AbortSignal): Promise<Chip[]> {
  try {
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    };
    if (signal) {
      init.signal = signal;
    }
    const response = await fetch(`${ROUTER_URL}/tag`, init);
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as { chips?: Chip[] };
    return Array.isArray(body.chips) ? body.chips : [];
  } catch {
    return [];
  }
}

export function mergeChips(local: Chip[], remote: Chip[]): Chip[] {
  const merged = [...local];
  for (const chip of remote) {
    const overlaps = merged.some((existing) => chip.start < existing.end && chip.end > existing.start);
    if (!overlaps) {
      merged.push(chip);
    }
  }
  return merged.sort((a, b) => a.start - b.start);
}
