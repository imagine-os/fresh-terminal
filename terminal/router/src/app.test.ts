import { describe, expect, it } from 'vitest';
import { createApp } from './app';

function sseChunks(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n\n`));
      }
      controller.close();
    },
  });
}

describe('router app', () => {
  it('reports health without a key', async () => {
    const app = createApp({ bindings: () => ({}) });
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { keyConfigured: boolean };
    expect(body.keyConfigured).toBe(false);
  });

  it('returns 503 from /route when the key is missing', async () => {
    const app = createApp({ bindings: () => ({}) });
    const response = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: 'b1', text: 'hello', chips: [] }),
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; route: { intent: string } };
    expect(body.error).toContain('OPENROUTER_API_KEY');
    expect(body.route.intent).toBe('chat');
  });

  it('rejects an invalid body', async () => {
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }) });
    const response = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    expect(response.status).toBe(400);
  });

  it('routes with Jev when it answers, folds its cost into the entry, and never serves a non-chat tier', async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push(String(url));
      if (String(url).includes('/decisions')) {
        const body = JSON.parse(String(init?.body)) as { model: string; questions: { intent: { type: string } } };
        expect(body.model).toBe('typesafe/jev-1.13');
        expect(body.questions.intent.type).toBe('choice');
        return new Response(
          JSON.stringify({ id: 'gen-dec-9', model: 'typesafe/jev-1.13-20260917', answers: { intent: { type: 'choice', choice: 'tag', confidence: 0.9, probabilities: {} } }, usage: { input_tokens: 50, output_tokens: 2, cost: 0.00001 } }),
          { status: 200 },
        );
      }
      return new Response(
        sseChunks([
          'data: {"id":"gen-1","model":"anthropic/claude-haiku-4.5","choices":[{"delta":{"content":"ok"}}],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6,"cost":0.00005}}',
          'data: [DONE]',
        ]),
        { status: 200 },
      );
    };
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch, now: () => 1 });
    const response = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: 'b1', text: 'label these words', chips: [] }),
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(calls[0]).toContain('/api/alpha/decisions');
    const meta = JSON.parse((text.split('\n').find((line) => line.startsWith('data:') && line.includes('"routing"')) as string).slice(5)) as {
      route: { kind: string; tier: string; model: string };
      routing: { intent: string; source: string; confidence: number };
    };
    expect(meta.routing).toMatchObject({ intent: 'tag', source: 'jev', confidence: 0.9 });
    expect(meta.route.kind).toBe('chat');
    expect(meta.route.model).toBe('anthropic/claude-haiku-4.5');
    const doneLine = text.split('\n').find((line) => line.startsWith('data:') && line.includes('"entry"')) as string;
    const done = JSON.parse(doneLine.slice(5)) as { entry: { cost_micro: number; price_micro: number } };
    expect(done.entry.cost_micro).toBe(50 + 10);
    expect(done.entry.price_micro).toBe(60);
  });

  it('falls back to rules-only routing when the decisions endpoint is down', async () => {
    const fakeFetch: typeof fetch = async (url) => {
      if (String(url).includes('/decisions')) {
        return new Response('', { status: 503 });
      }
      return new Response(sseChunks(['data: {"id":"g","model":"anthropic/claude-haiku-4.5","choices":[{"delta":{"content":"x"}}]}', 'data: [DONE]']), { status: 200 });
    };
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch });
    const response = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: 'b1', text: 'schedule a call', chips: [] }),
    });
    const text = await response.text();
    expect(text).toContain('"source":"rules"');
    expect(text).toContain('"intent":"schedule"');
  });

  it('serves /tag through the tagger tier and returns validated chips', async () => {
    const fakeFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      expect(body.model).toBe('google/gemini-2.5-flash-lite');
      return new Response(
        JSON.stringify({ id: 'gen-t', model: 'google/gemini-2.5-flash-lite', choices: [{ message: { content: JSON.stringify({ chips: [{ kind: 'date', start: 5, end: 13, text: 'tomorrow' }] }) } }], usage: { cost: 0.000002 } }),
        { status: 200 },
      );
    };
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch });
    const response = await app.request('/tag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'call tomorrow' }) });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; chips: Array<{ kind: string }>; cost_micro: number };
    expect(body.ok).toBe(true);
    expect(body.chips[0]?.kind).toBe('date');
    expect(body.cost_micro).toBe(2);
  });

  it('streams deltas and a charge entry using a fake OpenRouter', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        sseChunks([
          'data: {"id":"gen-123","model":"served/actual-model","choices":[{"delta":{"content":"Hel"}}]}',
          'data: {"id":"gen-123","model":"served/actual-model","choices":[{"delta":{"content":"lo"}}]}',
          'data: {"id":"gen-123","model":"served/actual-model","choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7,"cost":0.0001}}',
          'data: [DONE]',
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );

    const app = createApp({
      bindings: () => ({ OPENROUTER_API_KEY: 'k' }),
      fetchImpl: fakeFetch,
      now: () => 1_700_000_000_000,
    });
    const response = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: 'b1', text: 'make a thing', chips: [] }),
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('event: meta');
    expect(text).toContain('"text":"Hel"');
    expect(text).toContain('"text":"lo"');
    expect(text).toContain('event: done');

    const doneLine = text.split('\n').find((line) => line.startsWith('data:') && line.includes('"entry"'));
    expect(doneLine).toBeDefined();
    const done = JSON.parse((doneLine as string).slice(5)) as {
      ok: boolean;
      served_model: string;
      entry: { cost_micro: number; price_micro: number; ref: string; unit_kind: string; model: string };
      costSource: string;
    };
    expect(done.ok).toBe(true);
    expect(done.costSource).toBe('openrouter');
    expect(done.served_model).toBe('served/actual-model');
    expect(done.entry.model).toBe('served/actual-model');
    expect(done.entry.cost_micro).toBe(100);
    expect(done.entry.price_micro).toBe(100);
    expect(done.entry.ref).toBe('gen-123');
    expect(done.entry.unit_kind).toBe('call');
  });

  it('accepts an allowed per-request model and rejects an unlisted one', async () => {
    let requestedModel = '';
    const fakeFetch: typeof fetch = async (_url, init) => {
      requestedModel = (JSON.parse(String(init?.body)) as { model: string }).model;
      return new Response(sseChunks(['data: {"id":"g","model":"openrouter/auto","choices":[{"delta":{"content":"x"}}]}', 'data: [DONE]']), {
        status: 200,
      });
    };
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch });
    const ok = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: 'b1', text: 'hello', chips: [], model: 'openrouter/auto' }),
    });
    expect(ok.status).toBe(200);
    await ok.text();
    expect(requestedModel).toBe('openrouter/auto');

    const bad = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: 'b1', text: 'hello', chips: [], model: 'evil/model' }),
    });
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { allowed: string[] };
    expect(body.allowed).toContain('anthropic/claude-haiku-4.5');
  });
});
