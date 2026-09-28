import type { Chip } from '@shared/chips';
import type { EntryDraft } from '@shared/ledger';

export const ROUTER_URL: string = (import.meta.env.VITE_ROUTER_URL as string | undefined) ?? '/api';

export interface RouteMeta {
  route: {
    intent: string;
    tier: string;
    model: string;
    permission: string;
    marginBasisPoints: number;
    pending: boolean;
    note?: string;
  };
}

export interface RouteDone {
  ok: boolean;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost?: number };
  costSource: string;
  entry: EntryDraft | null;
  chars: number;
}

export type RouteFailure =
  | { kind: 'no-router' }
  | { kind: 'no-key'; hint?: string }
  | { kind: 'pending'; note: string }
  | { kind: 'error'; message: string };

export interface RouteHandlers {
  onMeta?: (meta: RouteMeta) => void;
  onDelta: (text: string) => void;
  onDone: (done: RouteDone) => void;
  onFail: (failure: RouteFailure) => void;
}

export interface RouteRequest {
  boxId: string;
  text: string;
  chips: Chip[];
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

/** Calls POST /route and reads the SSE stream. Never sees the API key. */
export async function streamRoute(request: RouteRequest, handlers: RouteHandlers): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${ROUTER_URL}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    handlers.onFail({ kind: 'no-router' });
    return;
  }

  if (response.status === 503) {
    const body = (await response.json().catch(() => ({}))) as { hint?: string };
    handlers.onFail({ kind: 'no-key', ...(body.hint ? { hint: body.hint } : {}) });
    return;
  }
  if (response.status === 501) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    handlers.onFail({ kind: 'pending', note: body.error ?? 'pending tier' });
    return;
  }
  if (!response.ok || response.body === null) {
    if (response.status === 404 || response.status === 502) {
      handlers.onFail({ kind: 'no-router' });
      return;
    }
    handlers.onFail({ kind: 'error', message: `HTTP ${response.status}` });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  const handleEvent = (eventName: string, data: string) => {
    if (eventName === 'delta') {
      const parsed = JSON.parse(data) as { text: string };
      handlers.onDelta(parsed.text);
    } else if (eventName === 'meta') {
      handlers.onMeta?.(JSON.parse(data) as RouteMeta);
    } else if (eventName === 'done') {
      done = true;
      handlers.onDone(JSON.parse(data) as RouteDone);
    } else if (eventName === 'error') {
      const parsed = JSON.parse(data) as { message: string };
      handlers.onFail({ kind: 'error', message: parsed.message });
    }
  };

  while (true) {
    const { value, done: finished } = await reader.read();
    if (finished) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf('\n\n');
    while (separator !== -1) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf('\n\n');
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (dataLines.length > 0) {
        handleEvent(eventName, dataLines.join('\n'));
      }
    }
  }

  if (!done) {
    handlers.onFail({ kind: 'error', message: 'stream ended without done' });
  }
}
