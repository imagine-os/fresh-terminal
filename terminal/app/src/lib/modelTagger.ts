import type { Chip } from '@shared/chips';
import type { GlossaryTerm } from '@shared/ui';
import { ROUTER_URL } from './routerClient';
import { cachedRouterHealth } from './routerHealth';
import { routerFetch } from './routerFetch';
import type { EntryDraft } from '@shared/ledger';
import { store } from '../store';

export interface RemoteTagResult {
  text: string;
  chips: Chip[];
  costMicro: number;
  jev: boolean;
}

/**
 * Asks the router's tagger tier (google/gemini-2.5-flash-lite, strict JSON
 * schema) for chips, merged there with our local chips and the box glossary,
 * with Jev settling spans that stay ambiguous. On by default; silently local
 * only when no router is reachable.
 */
export async function tagRemote(
  text: string,
  local: Chip[],
  glossary: GlossaryTerm[],
  signal?: AbortSignal,
  boxId = '',
): Promise<RemoteTagResult | null> {
  if (cachedRouterHealth().state !== 'ok') {
    return null;
  }
  try {
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(boxId ? { boxId } : {}),
        text,
        local,
        glossary: glossary.map((term) => ({ text: term.text, type: term.type, note: term.note, case_sensitive: term.case_sensitive })),
      }),
    };
    if (signal) {
      init.signal = signal;
    }
    // Metered like every paid call; out of credits it answers 402 and chips stay local (never blocks typing).
    const response = await routerFetch(`${ROUTER_URL}/tag`, init, { paid: true });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { chips?: Chip[]; cost_micro?: number; jev?: { used: boolean }; entry?: EntryDraft | null };
    // Every metered call lands in the ledger, so the top-bar counter matches GET /credits.
    if (body.entry) {
      const { owner_identity: _owner, ...draft } = body.entry;
      store.appendEntry(draft);
    }
    return {
      text,
      chips: Array.isArray(body.chips) ? body.chips : [],
      costMicro: body.cost_micro ?? 0,
      jev: Boolean(body.jev?.used),
    };
  } catch {
    return null;
  }
}

export { mergeChips } from '@shared/chips';
