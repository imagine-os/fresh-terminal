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
  /** C-103 / C-105: the markup on this turn (the rate is the account's own choice, 10% by default). */
  markup?: { margin_bp: number; at_cost_micro: number; marked_micro: number; markup_micro: number };
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
  /** What is on screen now: open page, visible regions, recent edits (C-081). */
  screen?: { open_page?: string | null; visible?: string[]; recent_edits?: string[] };
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
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let done = false;
  let failed = false;
  const fail = (failure: RouteFailure) => {
    if (done || failed) return;
    failed = true;
    handlers.onFail(failure);
  };
  const stop = (reason: 'user' | 'idle') => {
    if (stoppedBy === null && !done) {
      stoppedBy = reason;
      controller.abort();
    }
  };
  const onAbort = () => stop('user');
  if (options.signal?.aborted) {
    fail({ kind: 'stopped', reason: 'user' });
    return;
  }
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const idleMs = options.idleMs ?? 60_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => stop('idle'), idleMs);
  };

  // Header preparation can wait on device registration or Clerk before fetch
  // sees its signal. Race that work (and stream reads) so Esc/idle always settles.
  const untilStopped = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const aborted = () => {
      controller.signal.removeEventListener('abort', aborted);
      reject(new DOMException('The turn was stopped', 'AbortError'));
    };
    if (controller.signal.aborted) {
      aborted();
      // Observe a late rejection from work that had already started.
      void work.catch(() => undefined);
      return;
    }
    controller.signal.addEventListener('abort', aborted, { once: true });
    work.then(
      (value) => { controller.signal.removeEventListener('abort', aborted); resolve(value); },
      (error: unknown) => { controller.signal.removeEventListener('abort', aborted); reject(error); },
    );
  });
  const json = async (response: Response): Promise<Record<string, unknown>> => {
    try {
      const value: unknown = await untilStopped(response.json());
      return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    } catch (error) {
      if (controller.signal.aborted) throw error;
      return {};
    }
  };

  armIdle();
  try {
    let response: Response;
    try {
      response = await untilStopped(routerFetch(
        '/route',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        },
        { paid: true },
      ));
    } catch {
      fail(stoppedBy ? { kind: 'stopped', reason: stoppedBy } : { kind: 'no-router' });
      return;
    }

    if ([401, 402, 403, 413, 429].includes(response.status)) {
      const body = await json(response.clone());
      if (typeof body.code === 'string') {
        fail({ kind: 'credits', code: body.code as CreditsErrorCode, message: typeof body.error === 'string' ? body.error : `HTTP ${response.status}` });
        return;
      }
    }
    if (response.status === 503) {
      const body = await json(response);
      fail({ kind: 'no-key', ...(typeof body.hint === 'string' ? { hint: body.hint } : {}) });
      return;
    }
    if (response.status === 501) {
      const body = await json(response);
      fail({ kind: 'pending', note: typeof body.error === 'string' ? body.error : 'pending tier' });
      return;
    }
    if (!response.ok || response.body === null) {
      fail(response.status === 404 || response.status === 502 ? { kind: 'no-router' } : { kind: 'error', message: `HTTP ${response.status}` });
      return;
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const handleEvent = (block: string) => {
      if (done || controller.signal.aborted) return;
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      }
      if (dataLines.length === 0) return;
      const data = dataLines.join('\n');
      if (eventName === 'delta') {
        handlers.onDelta((JSON.parse(data) as { text: string }).text);
      } else if (eventName === 'meta') {
        handlers.onMeta?.(JSON.parse(data) as RouteMeta);
      } else if (eventName === 'ops') {
        handlers.onOps?.(JSON.parse(data) as OpsPayload);
      } else if (eventName === 'skin') {
        handlers.onSkin?.(JSON.parse(data) as { text: string });
      } else if (eventName === 'reply') {
        handlers.onReply?.((JSON.parse(data) as { blocks: ReplyBlock[] }).blocks);
      } else if (eventName === 'done') {
        const result = JSON.parse(data) as RouteDone;
        done = true;
        handlers.onDone(result);
      } else if (eventName === 'error') {
        // The server may still send done with billed usage after an error.
        // Preserve that ledger event, but never add a second generic failure.
        fail({ kind: 'error', message: (JSON.parse(data) as { message: string }).message });
      }
    };

    while (!done) {
      const { value, done: finished } = await untilStopped(reader.read());
      if (finished) {
        buffer += decoder.decode();
        if (buffer.trim()) handleEvent(buffer);
        break;
      }
      armIdle();
      buffer += decoder.decode(value, { stream: true });
      let separator = /\r?\n\r?\n/.exec(buffer);
      while (separator && !done) {
        const block = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        handleEvent(block);
        separator = /\r?\n\r?\n/.exec(buffer);
      }
    }
    if (!done) {
      fail(stoppedBy ? { kind: 'stopped', reason: stoppedBy } : { kind: 'error', message: 'stream ended without done' });
    }
  } catch (error) {
    if (done) throw error;
    fail(stoppedBy ? { kind: 'stopped', reason: stoppedBy } : { kind: 'error', message: error instanceof SyntaxError ? 'Invalid router stream' : 'stream broke' });
  } finally {
    if (idleTimer !== null) clearTimeout(idleTimer);
    options.signal?.removeEventListener('abort', onAbort);
    if (reader) {
      // A valid done settles the UI immediately, but let the server close its
      // stream naturally so its final usage/metering flush is not cancelled.
      if (!done) void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
