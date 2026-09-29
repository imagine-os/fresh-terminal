import { describe, expect, it } from 'vitest';
import { defaultBoxUi } from '../ui/types';
import type { Snapshot } from './snapshot';
import { runTurn, turnCostMicro } from './turn';

function snapshot(): Snapshot {
  return {
    box: { id: 'box-1', name: 'First box' },
    nav: [{ id: 'nav-lib', box_id: 'box-1', parent_id: null, label: 'Library', target: { kind: 'url', ref: 'pages/library.html' }, order: 0, created_at: 1, updated_at: 1 }],
    pages: [],
    boxUi: defaultBoxUi('box-1', 1),
    themes: [{ id: 'void', name: 'Void' }, { id: 'glass-window', name: 'Glass Window' }],
    actions: [{ id: 'canvas.open', intent: 'open the canvas' }],
    boxes: [{ id: 'box-1', name: 'First box' }],
    starters: [],
    cards: [],
    glossary: [],
    effectiveThemeId: 'void',
  };
}

/** Builds an SSE stream that emits tool-call argument fragments like a real provider. */
function toolStream(calls: Array<{ name: string; args: object }>, model = 'anthropic/claude-haiku-4.5', cost = 0.0002): Response {
  const lines: string[] = [];
  calls.forEach((call, index) => {
    const json = JSON.stringify(call.args);
    const mid = Math.floor(json.length / 2);
    lines.push(`data: ${JSON.stringify({ id: `gen-${index}`, model, choices: [{ delta: { tool_calls: [{ index, id: `toolu_${index}`, type: 'function', function: { name: call.name, arguments: '' } }] } }] })}`);
    lines.push(`data: ${JSON.stringify({ model, choices: [{ delta: { tool_calls: [{ index, function: { arguments: json.slice(0, mid) } }] } }] })}`);
    lines.push(`data: ${JSON.stringify({ model, choices: [{ delta: { tool_calls: [{ index, function: { arguments: json.slice(mid) } }] } }] })}`);
  });
  lines.push(`data: ${JSON.stringify({ model, choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 900, completion_tokens: 80, total_tokens: 980, cost } })}`);
  lines.push('data: [DONE]');
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

const nested = [
  { name: 'nav_add', args: { label: 'Projects' } },
  { name: 'nav_add', args: { label: 'Koi Pond', parent: 'Projects', target: { kind: 'url', ref: 'pages/koi.html' } } },
  { name: 'nav_add', args: { label: 'Library', parent: 'Projects', target: { kind: 'url', ref: 'pages/library.html' } } },
  { name: 'respond', args: { blocks: [{ kind: 'summary', text: 'Added a Projects menu with Koi Pond and Library.' }, { kind: 'next', commands: ['rename Projects to Work'] }] } },
];

describe('runTurn', () => {
  it('collects fragmented parallel tool calls into a validated op batch and structured reply', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return toolStream(nested);
    };
    const result = await runTurn({
      apiKey: 'k',
      model: 'anthropic/claude-haiku-4.5',
      escalateModel: 'anthropic/claude-sonnet-5.5',
      messages: [{ role: 'user', content: 'Add a Projects menu with Koi Pond and Library nested under it' }],
      snapshot: snapshot(),
      fetchImpl: fakeFetch,
      now: () => 5,
    });
    expect(result.ok).toBe(true);
    expect(result.ops.map((op) => op.op)).toEqual(['nav.add', 'nav.add', 'nav.add']);
    expect(result.changes[1]?.text).toBe("added 'Koi Pond' under 'Projects' in the sidebar");
    expect(result.blocks.map((block) => block.kind)).toEqual(['summary', 'next']);
    expect(result.rounds).toHaveLength(1);
    expect(bodies[0]?.tool_choice).toBe('required');
    expect((bodies[0]?.tools as unknown[]).length).toBeGreaterThan(10);
    expect(turnCostMicro(result.rounds)).toBe(200);
  });

  it('retries once on the escalation model with the rejection reasons, and applies nothing partial', async () => {
    const bodies: Array<{ model: string; messages: Array<{ role: string; content?: string }> }> = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content?: string }> };
      bodies.push(body);
      if (bodies.length === 1) {
        return toolStream([
          { name: 'nav_add', args: { label: 'Koi Pond', parent: 'Projects', target: { kind: 'url', ref: 'pages/koi.html' } } },
          { name: 'respond', args: { blocks: [{ kind: 'summary', text: 'Done.' }] } },
        ]);
      }
      return toolStream(nested, 'anthropic/claude-sonnet-5.5', 0.001);
    };
    const result = await runTurn({
      apiKey: 'k',
      model: 'anthropic/claude-haiku-4.5',
      escalateModel: 'anthropic/claude-sonnet-5.5',
      messages: [{ role: 'user', content: 'Add Koi Pond under Projects' }],
      snapshot: snapshot(),
      fetchImpl: fakeFetch,
    });
    expect(result.ok).toBe(true);
    expect(result.rounds.map((round) => round.model)).toEqual(['anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-5.5']);
    expect(result.rounds[0]?.rejected).toEqual(['nav_add: No menu item called "Projects"']);
    const retry = bodies[1]?.messages ?? [];
    expect(retry.some((message) => message.role === 'tool' && message.content === 'rejected: No menu item called "Projects"')).toBe(true);
    expect(retry[retry.length - 1]?.content).toContain('Nothing was applied');
    expect(result.ops).toHaveLength(3);
    expect(turnCostMicro(result.rounds)).toBe(1200);
  });

  it('falls back to a summary block when the model only writes prose', async () => {
    const encoder = new TextEncoder();
    const fakeFetch: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"model":"m","choices":[{"delta":{"content":"Hello there.\\nSecond line."}}]}\n\ndata: [DONE]\n\n'));
            controller.close();
          },
        }),
        { status: 200 },
      );
    const result = await runTurn({ apiKey: 'k', model: 'm', messages: [{ role: 'user', content: 'hi' }], snapshot: snapshot(), fetchImpl: fakeFetch });
    expect(result.ok).toBe(true);
    expect(result.blocks).toEqual([{ kind: 'summary', text: 'Hello there.' }, { kind: 'text', text: 'Second line.' }]);
  });
});
