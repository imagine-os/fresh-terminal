import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@router/src/app';
import { fakeD1 } from '@router/src/testing/fakeD1';
import { usedMicro } from '@shared/ledger';
import type { CreditsStatus } from '@shared/credits';
import { tagRemote } from '../lib/modelTagger';
import { streamRoute } from '../lib/routerClient';
import { probeRouter, resetRouterHealthCache } from '../lib/routerHealth';
import { forgetDevice, routerFetch } from '../lib/routerFetch';
import { store } from '../store';

function sse(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n\n`));
      controller.close();
    },
  });
}

/** OpenRouter stand-in: the tagger answers JSON, chat answers a stream; both report a cost. */
const openRouter: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as { model: string; stream?: boolean };
  if (!body.stream) {
    return new Response(
      JSON.stringify({ id: 'gen-tag', model: body.model, choices: [{ message: { content: JSON.stringify({ chips: [] }) } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, cost: 0.000031 } }),
      { status: 200 },
    );
  }
  return new Response(
    sse([
      'data: {"id":"gen-chat","model":"anthropic/claude-haiku-4.5","choices":[{"delta":{"content":"hi"}}],"usage":{"prompt_tokens":20,"completion_tokens":2,"total_tokens":22,"cost":0.000123}}',
      'data: [DONE]',
    ]),
    { status: 200 },
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  forgetDevice();
  resetRouterHealthCache();
});

describe('the top-bar counter matches GET /credits', () => {
  it('after one tag call and one route call, counter delta = credits delta', async () => {
    const db = fakeD1();
    const router = createApp({
      bindings: () => ({ OPENROUTER_API_KEY: 'k', DEVICE_SIGNING_KEY: 'k', ROUTER_USE_JEV: 'false' }),
      resources: () => ({ DB: db }),
      fetchImpl: openRouter,
    });
    // The app's own fetch goes to the router (ROUTER_URL is the dev proxy "/api" in tests).
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://app.test');
      return router.request(url.pathname.replace(/^\/api/, '') + url.search, init);
    }) as typeof fetch);
    expect((await probeRouter()).state).toBe('ok');

    const spent = async () => ((await (await routerFetch('/credits', { method: 'GET' })).json()) as CreditsStatus).spent_micro;
    const creditsBefore = await spent();
    const counterBefore = usedMicro(store.getSnapshot().entries);

    const tagged = await tagRemote('call Sergio tomorrow', [], [], undefined, 'stage-1');
    expect(tagged).not.toBeNull();

    await new Promise<void>((resolve, reject) => {
      void streamRoute(
        { boxId: 'stage-1', text: 'hello there', chips: [], history: [] },
        {
          onDelta: () => undefined,
          onDone: (done) => {
            // Same as BoxView: the turn's entry goes on the ledger.
            if (done.entry) {
              const { owner_identity: _owner, ...draft } = done.entry;
              store.appendEntry(draft);
            }
            resolve();
          },
          onFail: (failure) => reject(new Error(JSON.stringify(failure))),
        },
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 20)); // the meter records after the stream ends

    const creditsDelta = (await spent()) - creditsBefore;
    const counterDelta = usedMicro(store.getSnapshot().entries) - counterBefore;
    expect(creditsDelta).toBe(31 + 123);
    expect(counterDelta).toBe(creditsDelta);
    const whats = store.getSnapshot().entries.slice(-2).map((entry) => entry.what);
    expect(whats).toEqual(['chips.tag', 'model.call']);
  });
});
