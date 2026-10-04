import { describe, expect, it, vi } from 'vitest';
import { OPENROUTER_URL, streamDirect } from './openrouterDirect';
import type { Snapshot } from '@shared/agent';
import { defaultBoxUi } from '@shared/ui';
import type { RouteDone, RouteFailure, RouteMeta } from './routerClient';

const snapshot: Snapshot = {
  box: { id: 'b1', name: 'Box' },
  nav: [],
  pages: [],
  boxUi: defaultBoxUi('b1', 0),
  themes: [{ id: 'terminal-dark', name: 'Terminal' }],
  actions: [],
  boxes: [{ id: 'b1', name: 'Box' }],
  starters: [],
  cards: [],
  glossary: [],
  effectiveThemeId: 'terminal-dark',
};

function sse(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });
}

function collect() {
  const deltas: string[] = [];
  const fails: RouteFailure[] = [];
  const metas: RouteMeta[] = [];
  let done: RouteDone | null = null;
  return {
    deltas,
    fails,
    metas,
    get done() {
      return done;
    },
    handlers: {
      onMeta: (meta: RouteMeta) => metas.push(meta),
      onDelta: (text: string) => deltas.push(text),
      onDone: (result: RouteDone) => {
        done = result;
      },
      onFail: (failure: RouteFailure) => fails.push(failure),
    },
  };
}

describe('streamDirect (bring your own key)', () => {
  it('calls OpenRouter directly with the key, referer and title, and records price = cost', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fakeFetch: typeof fetch = async (url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response(
        sse([
          'data: {"id":"gen-own-1","model":"served/own-model","choices":[{"delta":{"content":"Hi"}}]}',
          'data: {"id":"gen-own-1","choices":[{"delta":{"content":" there"}}]}',
          'data: {"id":"gen-own-1","choices":[{"delta":{}}],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6,"cost":0.00042}}',
          'data: [DONE]',
        ]),
        { status: 200 },
      );
    };
    const sink = collect();
    await streamDirect(
      { boxId: 'b1', text: 'make a thing', chips: [], history: [], snapshot },
      { apiKey: 'sk-test-not-real', referer: 'https://example.test', fetchImpl: fakeFetch, now: () => 1_700_000_000_000 },
      sink.handlers,
    );

    expect(seenUrl).toBe(OPENROUTER_URL);
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test-not-real');
    expect(headers['HTTP-Referer']).toBe('https://example.test');
    expect(headers['X-Title']).toBe('Fresh Terminal');
    const body = JSON.parse(String(seenInit?.body)) as { stream: boolean; usage: { include: boolean }; model: string; tools: Array<{ function: { name: string } }> };
    expect(body.stream).toBe(true);
    // The own-key path gets the same editing tools as the router.
    expect(body.tools.map((tool) => tool.function.name)).toEqual(expect.arrayContaining(['nav_add', 'theme_set', 'respond']));
    expect(body.usage.include).toBe(true);
    expect(body.model.length).toBeGreaterThan(0);

    expect(sink.deltas.join('')).toBe('Hi there');
    expect(sink.fails).toEqual([]);
    expect(sink.metas[0]?.route.marginBasisPoints).toBe(0);
    expect(sink.done?.ok).toBe(true);
    expect(sink.done?.served_model).toBe('served/own-model');
    expect(sink.done?.entry).toMatchObject({
      what: 'model.call.own-key',
      model: 'served/own-model',
      cost_micro: 420,
      price_micro: 420,
      ref: 'gen-own-1',
      unit_kind: 'call',
      created_at: 1_700_000_000_000,
    });
  });

  it('reports an OpenRouter error status without recording an entry', async () => {
    const fakeFetch: typeof fetch = async () => new Response('{"error":"bad key"}', { status: 401 });
    const sink = collect();
    await streamDirect(
      { boxId: 'b1', text: 'hello', chips: [], history: [], snapshot },
      { apiKey: 'nope', referer: 'https://example.test', fetchImpl: fakeFetch },
      sink.handlers,
    );
    expect(sink.fails[0]?.kind).toBe('error');
    expect(sink.fails[0] && 'message' in sink.fails[0] ? sink.fails[0].message : '').toContain('401');
    expect(sink.done).toBeNull();
  });

  it('never sends a chat request to a non-chat tier; the default chat tier answers instead', async () => {
    let model = '';
    const fakeFetch: typeof fetch = async (_url, init) => {
      model = (JSON.parse(String(init?.body)) as { model: string }).model;
      return new Response(sse(['data: {"id":"g","model":"anthropic/claude-haiku-4.5","choices":[{"delta":{"content":"x"}}]}', 'data: [DONE]']), { status: 200 });
    };
    const sink = collect();
    await streamDirect(
      { boxId: 'b1', text: 'tag this', chips: [], history: [], snapshot },
      { apiKey: 'k', referer: 'https://example.test', fetchImpl: fakeFetch },
      sink.handlers,
    );
    expect(model).toBe('anthropic/claude-haiku-4.5');
    expect(sink.metas[0]?.route.tier).toBe('fast');
    expect(sink.fails).toEqual([]);
  });
  it('does not start an already-cancelled own-key request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn<typeof fetch>();
    const sink = collect();
    await streamDirect(
      { boxId: 'b1', text: 'hello', chips: [], history: [], snapshot },
      { apiKey: 'k', referer: 'https://example.test', fetchImpl, signal: controller.signal },
      sink.handlers,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sink.fails).toEqual([{ kind: 'stopped', reason: 'user' }]);
    expect(sink.done).toBeNull();
  });

  it('propagates Esc to OpenRouter and never applies buffered edits after cancellation', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    let receivedSignal: AbortSignal | null | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      receivedSignal = init?.signal;
      return new Response(new ReadableStream({
        start(stream) {
          stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n'));
        },
        cancel,
      }));
    };
    const sink = collect();
    const onOps = vi.fn();
    await streamDirect(
      { boxId: 'b1', text: 'hello', chips: [], history: [], snapshot },
      { apiKey: 'k', referer: 'https://example.test', fetchImpl, signal: controller.signal },
      { ...sink.handlers, onOps, onDelta: (text) => { sink.handlers.onDelta(text); controller.abort(); } },
    );
    expect(receivedSignal).toBe(controller.signal);
    expect(sink.deltas).toEqual(['Hi']);
    expect(sink.fails).toEqual([{ kind: 'stopped', reason: 'user' }]);
    expect(sink.done).toBeNull();
    expect(onOps).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

});
