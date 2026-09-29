import type { Snapshot } from '@shared/agent';
import type { Chip } from '@shared/chips';
import type { Change, Op } from '@shared/ops';
import type { ReplyBlock } from '@shared/reply';
import type { EntryDraft } from '@shared/ledger';
import { resolveRouterUrl } from '../config/router';
import type { CreditsErrorCode } from '@shared/credits';
import { routerFetch } from './routerFetch';


export const ROUTER_URL: string = resolveRouterUrl(
  import.meta.env.VITE_ROUTER_URL as string | undefined,
  import.meta.env.DEV,
  typeof window === 'undefined' ? '' : window.location.hostname,
);

export interface RouteMeta {
  routing?: { intent: string; source: string; confidence: number | null; model: string | null; costMicro: number };
  escalated?: boolean;
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
  served_model: string;
  costSource: string;
  ms?: number;
  entry: EntryDraft | null;
  chars: number;
}

export type RouteFailure =
  | { kind: 'no-router' }
  | { kind: 'no-key'; hint?: string }
  | { kind: 'pending'; note: string }
  | { kind: 'error'; message: string }
  /** The person pressed Esc, or nothing arrived for `idleMs` (C-079). */
  | { kind: 'stopped'; reason: 'user' | 'idle' }
  /** Free credits: used up, daily cap, rate limit, too large, or a model choice that needs sign-in. */
  | { kind: 'credits'; code: CreditsErrorCode; message: string };

export interface OpsPayload {
  ops: Op[];
  changes: Change[];
  rejected: string[];
}

export interface RouteHandlers {
  onMeta?: (meta: RouteMeta) => void;
  onDelta: (text: string) => void;
  /** A validated batch of interface changes to apply. */
  onOps?: (payload: OpsPayload) => void;
  /** The structured reply. */
  onReply?: (blocks: ReplyBlock[]) => void;
  /** Jev routed the prompt to the skin loop (pass 5); the app runs it. */
  onSkin?: (payload: { text: string }) => void;
  onDone: (done: RouteDone) => void;
  onFail: (failure: RouteFailure) => void;
}

export interface RouteRequest {
  boxId: string;
  text: string;
  chips: Chip[];
  /** Optional explicit model from the allowlist. */
  model?: string;
  /** The box's own records, so the model can change them. */
  snapshot?: Snapshot;
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

/** Calls POST /route and reads the SSE stream. Never sees the API key. */
export interface StreamOptions {
  /** Aborting it stops the turn; the box gets a "stopped" line, never silence. */
  signal?: AbortSignal;
  /** No bytes for this long ends the turn as stopped (idle). Default 60 s. */
  idleMs?: number;
}

/** No turn may end in silence: a hung stream stops itself, and Esc stops it sooner. */
export async function streamRoute(request: RouteRequest, handlers: RouteHandlers, options: StreamOptions = {}): Promise<void> {
  const controller = new AbortController();
  let stoppedBy: 'user' | 'idle' | null = null;
  const stop = (reason: 'user' | 'idle') => {
    if (stoppedBy === null) {
      stoppedBy = reason;
      controller.abort();
    }
  };
  if (options.signal?.aborted) {
    handlers.onFail({ kind: 'stopped', reason: 'user' });
    return;
  }
  options.signal?.addEventListener('abort', () => stop('user'), { once: true });
  const idleMs = options.idleMs ?? 60_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => stop('idle'), idleMs);
  };
  const disarm = () => {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  };

  let response: Response;
  armIdle();
  try {
    response = await routerFetch(
      '/route',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      },
      { paid: true },
    );
  } catch {
    disarm();
    handlers.onFail(stoppedBy ? { kind: 'stopped', reason: stoppedBy } : { kind: 'no-router' });
    return;
  }

  if ([401, 402, 403, 413, 429].includes(response.status)) {
    const body = (await response.clone().json().catch(() => ({}))) as { code?: CreditsErrorCode; error?: string };
    if (body.code) {
      handlers.onFail({ kind: 'credits', code: body.code, message: body.error ?? `HTTP ${response.status}` });
      return;
    }
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
    } else if (eventName === 'ops') {
      handlers.onOps?.(JSON.parse(data) as OpsPayload);
    } else if (eventName === 'skin') {
      handlers.onSkin?.(JSON.parse(data) as { text: string });
    } else if (eventName === 'reply') {
      handlers.onReply?.((JSON.parse(data) as { blocks: ReplyBlock[] }).blocks);
    } else if (eventName === 'done') {
      done = true;
      handlers.onDone(JSON.parse(data) as RouteDone);
    } else if (eventName === 'error') {
      const parsed = JSON.parse(data) as { message: string };
      handlers.onFail({ kind: 'error', message: parsed.message });
    }
  };

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      disarm();
      handlers.onFail(stoppedBy ? { kind: 'stopped', reason: stoppedBy } : { kind: 'error', message: 'stream broke' });
      return;
    }
    const { value, done: finished } = chunk;
    if (finished) {
      break;
    }
    armIdle();
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

  disarm();
  if (!done) {
    handlers.onFail(stoppedBy ? { kind: 'stopped', reason: stoppedBy } : { kind: 'error', message: 'stream ended without done' });
  }
}
