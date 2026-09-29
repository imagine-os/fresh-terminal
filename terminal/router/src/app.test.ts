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
    expect(done.entry.price_micro).toBe(66); // C-103: 10% markup (no meter in this test, so all of it is past the starter kit)
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
        JSON.stringify({ id: 'gen-t', model: 'google/gemini-2.5-flash-lite', choices: [{ message: { content: JSON.stringify({ chips: [{ kind: 'date', start: 5, end: 13, text: 'tomorrow', value: '', p: 0.9, alternatives: [] }] }) } }], usage: { cost: 0.000002 } }),
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
    expect(done.entry.price_micro).toBe(110); // C-103: cost + 10%
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

describe('realtime voice sessions', () => {
  it('lists providers with configured flags and prices', async () => {
    const app = createApp({ bindings: () => ({ OPENAI_API_KEY: 'sk' }) });
    const response = await app.request('/realtime/providers');
    const body = (await response.json()) as { providers: Array<{ id: string; configured: boolean; price: { estimate: boolean } | null }> };
    expect(body.providers.find((p) => p.id === 'openai')).toMatchObject({ configured: true });
    expect(body.providers.find((p) => p.id === 'gemini')).toMatchObject({ configured: false });
    expect(body.providers.find((p) => p.id === 'openai')?.price?.estimate).toBe(true);
  });

  it('mints an OpenAI client secret without exposing the server key', async () => {
    const fakeFetch: typeof fetch = async (url, init) => {
      expect(String(url)).toContain('/v1/realtime/client_secrets');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-server');
      return new Response(JSON.stringify({ value: 'ek_abc', expires_at: 1 }), { status: 200 });
    };
    const app = createApp({ bindings: () => ({ OPENAI_API_KEY: 'sk-server' }), fetchImpl: fakeFetch });
    const response = await app.request('/realtime/session?provider=openai', { method: 'POST' });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"value":"ek_abc"');
    expect(text).not.toContain('sk-server');
  });

  it('returns 503 when the provider key is missing and 400 for an unknown provider', async () => {
    const app = createApp({ bindings: () => ({}) });
    expect((await app.request('/realtime/session?provider=gemini', { method: 'POST' })).status).toBe(503);
    expect((await app.request('/realtime/session?provider=nope', { method: 'POST' })).status).toBe(400);
  });

  it('allows the Pages origin by default and honours ALLOWED_ORIGINS', async () => {
    const app = createApp({ bindings: () => ({}) });
    const pages = await app.request('/health', { headers: { Origin: 'https://imagine-os.github.io' } });
    expect(pages.headers.get('access-control-allow-origin')).toBe('https://imagine-os.github.io');
    const other = await app.request('/health', { headers: { Origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    const custom = createApp({ bindings: () => ({ ALLOWED_ORIGINS: 'https://a.test, https://b.test' }) });
    const b = await custom.request('/health', { headers: { Origin: 'https://b.test' } });
    expect(b.headers.get('access-control-allow-origin')).toBe('https://b.test');
  });
});

function sseLines(lines: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(`${line}\n\n`));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function toolCallStream(model: string, calls: Array<{ name: string; args: object }>, cost: number): Response {
  const lines = calls.map((call, index) =>
    `data: ${JSON.stringify({ id: 'gen-edit', model, choices: [{ delta: { tool_calls: [{ index, id: `toolu_${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] } }] })}`,
  );
  lines.push(`data: ${JSON.stringify({ model, choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1500, completion_tokens: 120, total_tokens: 1620, cost } })}`);
  lines.push('data: [DONE]');
  return sseLines(lines);
}

const SNAPSHOT = {
  box: { id: 'b1', name: 'First box' },
  nav: [{ id: 'nav-lib', box_id: 'b1', parent_id: null, label: 'Library', target: { kind: 'url', ref: 'pages/library.html' }, order: 0, created_at: 1, updated_at: 1 }],
  pages: [],
  boxUi: { box_id: 'b1', dialect_text: null, theme_id: null, style: {}, seeded: true, updated_at: 1 },
  themes: [{ id: 'void', name: 'Void' }, { id: 'glass-window', name: 'Glass Window' }],
  actions: [{ id: 'canvas.open', intent: 'open the canvas' }],
  boxes: [{ id: 'b1', name: 'First box' }],
  starters: [],
  cards: [],
  glossary: [],
  effectiveThemeId: 'void',
};

function eventData(text: string, name: string): unknown {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => line === `event: ${name}`);
  return index === -1 ? null : JSON.parse((lines[index + 1] ?? '').slice(5));
}

describe('self-editing /route', () => {
  it('streams an ops batch and structured reply from tool calls, and charges the whole turn', async () => {
    const chatBodies: Array<{ model: string; tools?: unknown[]; messages: Array<{ role: string; content: string }> }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      if (String(url).includes('/decisions')) {
        return new Response(
          JSON.stringify({ id: 'gen-dec', model: 'typesafe/jev-1.13', answers: { intent: { type: 'choice', choice: 'edit_ui', confidence: 0.92, probabilities: { edit_ui: 0.95 } } }, usage: { input_tokens: 90, output_tokens: 2, cost: 0.00002 } }),
          { status: 200 },
        );
      }
      chatBodies.push(JSON.parse(String(init?.body)));
      return toolCallStream(
        'anthropic/claude-haiku-4.5',
        [
          { name: 'nav_add', args: { label: 'Projects' } },
          { name: 'nav_add', args: { label: 'Koi Pond', parent: 'Projects', target: { kind: 'url', ref: 'pages/koi.html' } } },
          { name: 'respond', args: { blocks: [{ kind: 'summary', text: 'Added Projects with Koi Pond under it.' }, { kind: 'next', commands: ['rename Projects to Work'] }] } },
        ],
        0.0021,
      );
    };
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch, now: () => 1 });
    const response = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: 'b1', text: 'Add a Projects menu with Koi Pond under it', chips: [{ kind: 'org', start: 0, end: 3, text: 'Add', source: 'user' }], snapshot: SNAPSHOT }),
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    const ops = eventData(text, 'ops') as { ops: Array<{ op: string; label: string }>; changes: Array<{ text: string }>; rejected: string[] };
    expect(ops.ops.map((op) => op.label)).toEqual(['Projects', 'Koi Pond']);
    expect(ops.changes[1]?.text).toBe("added 'Koi Pond' under 'Projects' in the sidebar");
    const reply = eventData(text, 'reply') as { blocks: Array<{ kind: string }> };
    expect(reply.blocks.map((block) => block.kind)).toEqual(['summary', 'next']);
    const done = eventData(text, 'done') as { entry: { cost_micro: number; model: string }; routing: { intent: string } };
    expect(done.routing.intent).toBe('edit_ui');
    expect(done.entry.cost_micro).toBe(2100 + 20);
    expect(done.entry.model).toBe('anthropic/claude-haiku-4.5');
    // The model saw the box state, the no-files rule, typed chips and the tools.
    const body = chatBodies[0]!;
    expect(body.model).toBe('anthropic/claude-haiku-4.5');
    expect(body.messages[0]?.content).toContain('Never tell the user to edit files');
    expect(body.messages[0]?.content).toContain('"sidebar_menu"');
    expect(body.messages[body.messages.length - 1]?.content).toContain('"source":"user"');
    expect((body.tools ?? []).length).toBeGreaterThan(10);
  });

  it('starts on the escalation model when Jev is unsure the request is an edit', async () => {
    const models: string[] = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      if (String(url).includes('/decisions')) {
        return new Response(JSON.stringify({ id: 'd', model: 'typesafe/jev-1.13', answers: { intent: { type: 'choice', choice: 'edit_ui', confidence: 0.45, probabilities: {} } }, usage: { input_tokens: 1, output_tokens: 0, cost: 0 } }), { status: 200 });
      }
      models.push((JSON.parse(String(init?.body)) as { model: string }).model);
      return toolCallStream('anthropic/claude-sonnet-5.5', [{ name: 'respond', args: { blocks: [{ kind: 'summary', text: 'ok' }] } }], 0.001);
    };
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch });
    const response = await app.request('/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: 'b1', text: 'make it nicer somehow', snapshot: SNAPSHOT }),
    });
    const text = await response.text();
    expect(models).toEqual(['anthropic/claude-sonnet-5.5']);
    expect((eventData(text, 'meta') as { escalated: boolean }).escalated).toBe(true);
  });
});

describe('/tag with glossary and Jev disambiguation', () => {
  it('settles an ambiguous Hoy with Jev and lets the glossary override outright', async () => {
    const decisionBodies: Array<{ questions: Record<string, { criteria: Record<string, string> }> }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      if (String(url).includes('/decisions')) {
        decisionBodies.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({ id: 'd', model: 'typesafe/jev-1.13', answers: { chip_0: { type: 'choice', choice: 'org', confidence: 0.8, probabilities: { org: 0.86, date: 0.14 } } }, usage: { input_tokens: 60, output_tokens: 2, cost: 0.000004 } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: 'gen-t', model: 'google/gemini-2.5-flash-lite', choices: [{ message: { content: JSON.stringify({ chips: [] }) } }], usage: { cost: 0.000001 } }), { status: 200 });
    };
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch });
    const local = [{ kind: 'date', start: 0, end: 3, text: 'Hoy', value: 'today', p: 0.55, alternatives: [{ kind: 'org', p: 0.45 }], source: 'local' }];
    const settled = await app.request('/tag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Hoy launches today', local }) });
    const body = (await settled.json()) as { chips: Array<{ kind: string; p: number; alternatives?: Array<{ kind: string }> }>; jev: { used: boolean } };
    expect(body.jev.used).toBe(true);
    expect(body.chips[0]).toMatchObject({ kind: 'org', p: 0.86 });
    expect(body.chips[0]?.alternatives?.[0]?.kind).toBe('date');
    expect(Object.keys(decisionBodies[0]?.questions.chip_0?.criteria ?? {})).toEqual(['date', 'org']);

    const taught = await app.request('/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hoy launches hoy', local, glossary: [{ text: 'Hoy', type: 'org', case_sensitive: true }] }),
    });
    const taughtBody = (await taught.json()) as { chips: Array<{ kind: string; source: string; text: string }>; jev: { used: boolean } };
    expect(taughtBody.chips.find((chip) => chip.text === 'Hoy')).toMatchObject({ kind: 'org', source: 'glossary' });
    expect(taughtBody.jev.used).toBe(false);
  });
});
