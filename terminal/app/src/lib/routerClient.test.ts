import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamRoute, type RouteDone, type RouteHandlers } from './routerClient';
import { routerFetch } from './routerFetch';

vi.mock('./routerFetch', () => ({ routerFetch: vi.fn() }));
const request = { boxId: 'b1', text: 'hello', chips: [], history: [] };
const result: RouteDone = { ok: true, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, served_model: 'test', costSource: 'test', entry: null, chars: 2 };
const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const callbacks = (): RouteHandlers & { onDone: ReturnType<typeof vi.fn>; onFail: ReturnType<typeof vi.fn>; onDelta: ReturnType<typeof vi.fn> } => ({ onDelta: vi.fn(), onDone: vi.fn(), onFail: vi.fn() });
const encoder = new TextEncoder();
function response(chunks: string[], close = true) {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((text) => controller.enqueue(encoder.encode(text)));
      if (close) controller.close();
    },
    cancel,
  });
  return { response: new Response(body), cancel };
}

beforeEach(() => { vi.useFakeTimers(); vi.mocked(routerFetch).mockReset(); });
afterEach(() => vi.useRealTimers());

describe('streamRoute lifecycle', () => {
  it('finishes on done even when the transport stays open, ignores duplicates, and cleans up', async () => {
    const stream = response([event('delta', { text: 'Hi' }) + event('done', result) + event('done', result)], false);
    vi.mocked(routerFetch).mockResolvedValue(stream.response);
    const signal = new AbortController();
    const remove = vi.spyOn(signal.signal, 'removeEventListener');
    const sink = callbacks();
    await streamRoute(request, sink, { signal: signal.signal });
    expect(sink.onDelta).toHaveBeenCalledWith('Hi');
    expect(sink.onDone).toHaveBeenCalledTimes(1);
    expect(sink.onFail).not.toHaveBeenCalled();
    expect(stream.cancel).not.toHaveBeenCalled();
    expect(stream.response.body?.locked).toBe(false);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([401, 402, 503, 501, 404, 500])('cleans up every HTTP %i error path', async (status) => {
    vi.mocked(routerFetch).mockResolvedValue(Response.json({ code: 'sign_in_required', error: 'problem' }, { status }));
    const sink = callbacks();
    await streamRoute(request, sink);
    expect(sink.onFail).toHaveBeenCalledOnce();
    expect(sink.onDone).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the server error and its eventual usage without another failure', async () => {
    const stream = response([event('error', { message: 'provider failed' }), event('done', { ...result, ok: false })]);
    vi.mocked(routerFetch).mockResolvedValue(stream.response);
    const sink = callbacks();
    await streamRoute(request, sink);
    expect(sink.onFail).toHaveBeenCalledExactlyOnceWith({ kind: 'error', message: 'provider failed' });
    expect(sink.onDone).toHaveBeenCalledOnce();
  });

  it('does not add a second failure when an error stream ends without done', async () => {
    vi.mocked(routerFetch).mockResolvedValue(response([event('error', { message: 'provider failed' })]).response);
    const sink = callbacks();
    await streamRoute(request, sink);
    expect(sink.onFail).toHaveBeenCalledExactlyOnceWith({ kind: 'error', message: 'provider failed' });
  });

  it('accepts CRLF and split events, including the final unterminated event', async () => {
    const text = (event('delta', { text: 'Hi' }) + event('done', result)).replaceAll('\n', '\r\n').trimEnd();
    vi.mocked(routerFetch).mockResolvedValue(response([text.slice(0, 20), text.slice(20, 21), text.slice(21)]).response);
    const sink = callbacks();
    await streamRoute(request, sink);
    expect(sink.onDelta).toHaveBeenCalledWith('Hi');
    expect(sink.onDone).toHaveBeenCalledOnce();
    expect(sink.onFail).not.toHaveBeenCalled();
  });

  it('reports malformed data once and clears its idle timer', async () => {
    vi.mocked(routerFetch).mockResolvedValue(response(['event: delta\ndata: {bad}\n\n']).response);
    const sink = callbacks();
    await streamRoute(request, sink);
    expect(sink.onFail).toHaveBeenCalledExactlyOnceWith({ kind: 'error', message: 'Invalid router stream' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Esc settles even if header preparation does not resolve', async () => {
    vi.mocked(routerFetch).mockReturnValue(new Promise(() => {}));
    const signal = new AbortController();
    const sink = callbacks();
    const pending = streamRoute(request, sink, { signal: signal.signal });
    signal.abort();
    await pending;
    expect(sink.onFail).toHaveBeenCalledExactlyOnceWith({ kind: 'stopped', reason: 'user' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('idle timeout settles a stuck reader and releases it', async () => {
    const stream = response([], false);
    vi.mocked(routerFetch).mockResolvedValue(stream.response);
    const sink = callbacks();
    const pending = streamRoute(request, sink, { idleMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(sink.onFail).toHaveBeenCalledExactlyOnceWith({ kind: 'stopped', reason: 'idle' });
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
