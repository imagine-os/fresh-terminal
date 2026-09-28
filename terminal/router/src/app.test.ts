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

  it('returns 501 for the pending JEV tier', async () => {
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }) });
    const response = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: 'b1', text: 'tag this', chips: [] }),
    });
    expect(response.status).toBe(501);
  });

  it('streams deltas and a charge entry using a fake OpenRouter', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        sseChunks([
          'data: {"id":"gen-123","choices":[{"delta":{"content":"Hel"}}]}',
          'data: {"id":"gen-123","choices":[{"delta":{"content":"lo"}}]}',
          'data: {"id":"gen-123","choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7,"cost":0.0001}}',
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
      entry: { cost_micro: number; price_micro: number; ref: string; unit_kind: string };
      costSource: string;
    };
    expect(done.ok).toBe(true);
    expect(done.costSource).toBe('openrouter');
    expect(done.entry.cost_micro).toBe(100);
    expect(done.entry.price_micro).toBe(100);
    expect(done.entry.ref).toBe('gen-123');
    expect(done.entry.unit_kind).toBe('call');
  });
});
