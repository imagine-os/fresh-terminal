import { describe, expect, it } from 'vitest';
import { DECISIONS_URL, decide, intentQuestion, needsOwner, routeIntent } from './jev';
import { detectIntent, loadRules } from './rules';

const table = loadRules();

function jevResponse(answers: unknown, cost = 0.00002): Response {
  return new Response(
    JSON.stringify({ id: 'gen-dec-1', model: 'typesafe/jev-1.13-20260917', provider: 'TypeSafe', answers, usage: { input_tokens: 40, output_tokens: 3, cost } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('decide()', () => {
  it('posts a decisions request and returns typed answers', async () => {
    let seenUrl = '';
    let seenBody: Record<string, unknown> = {};
    const fakeFetch: typeof fetch = async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jevResponse({ intent: { type: 'choice', choice: 'make', confidence: 0.8, probabilities: { make: 0.9, chat: 0.1 } } });
    };
    const decision = await decide({ apiKey: 'k', state: 'make a page', questions: { intent: intentQuestion(table) }, fetchImpl: fakeFetch });
    expect(seenUrl).toBe(DECISIONS_URL);
    expect(seenBody.model).toBe('typesafe/jev-1.13');
    expect(seenBody.state).toBe('make a page');
    expect((seenBody.questions as { intent: { type: string } }).intent.type).toBe('choice');
    expect(decision?.answers.intent).toMatchObject({ type: 'choice', choice: 'make' });
    expect(decision?.usage.cost).toBe(0.00002);
  });

  it('returns null without a key, on non-2xx, on network failure and on a bad shape', async () => {
    expect(await decide({ apiKey: '', state: 'x', questions: {} })).toBeNull();
    const failing: typeof fetch = async () => new Response('nope', { status: 500 });
    expect(await decide({ apiKey: 'k', state: 'x', questions: {}, fetchImpl: failing })).toBeNull();
    const throwing: typeof fetch = async () => {
      throw new Error('offline');
    };
    expect(await decide({ apiKey: 'k', state: 'x', questions: {}, fetchImpl: throwing })).toBeNull();
    const odd: typeof fetch = async () => new Response('{"hello":1}', { status: 200 });
    expect(await decide({ apiKey: 'k', state: 'x', questions: {}, fetchImpl: odd })).toBeNull();
  });
});

describe('routeIntent()', () => {
  const fallback = (text: string) => detectIntent(text, table);

  it('uses Jev\'s choice when confident and records its cost', async () => {
    const fakeFetch: typeof fetch = async () =>
      jevResponse({ intent: { type: 'choice', choice: 'schedule', confidence: 0.91, probabilities: { schedule: 0.95 } } }, 0.000021);
    const result = await routeIntent('put the dentist in for thursday', table, { apiKey: 'k', fetchImpl: fakeFetch, fallback });
    expect(result).toMatchObject({ intent: 'schedule', source: 'jev', confidence: 0.91, costMicro: 21, generationId: 'gen-dec-1' });
    expect(result.model).toBe('typesafe/jev-1.13-20260917');
  });

  it('falls back to rules when Jev is unavailable, unsure, or picks an unknown intent', async () => {
    const down: typeof fetch = async () => new Response('', { status: 503 });
    expect(await routeIntent('make a page', table, { apiKey: 'k', fetchImpl: down, fallback })).toMatchObject({ intent: 'make', source: 'rules', costMicro: 0 });

    const unsure: typeof fetch = async () => jevResponse({ intent: { type: 'choice', choice: 'send', confidence: 0.2, probabilities: {} } });
    const low = await routeIntent('make a page', table, { apiKey: 'k', fetchImpl: unsure, fallback });
    expect(low.intent).toBe('make');
    expect(low.source).toBe('rules');
    expect(low.costMicro).toBe(20);

    const unknown: typeof fetch = async () => jevResponse({ intent: { type: 'choice', choice: 'juggle', confidence: 0.99, probabilities: {} } });
    expect((await routeIntent('hello', table, { apiKey: 'k', fetchImpl: unknown, fallback })).intent).toBe('chat');

    expect((await routeIntent('make a page', table, { apiKey: 'k', enabled: false, fallback })).source).toBe('rules');
    expect((await routeIntent('make a page', table, { fallback })).source).toBe('rules');
  });
});

describe('needsOwner()', () => {
  it('reads the noul probability', async () => {
    const yes: typeof fetch = async () => jevResponse({ owner: { type: 'noul', noul: 0.93 } });
    expect(await needsOwner('delete everything', { apiKey: 'k', fetchImpl: yes })).toMatchObject({ needsOwner: true, probability: 0.93, costMicro: 20 });
    const no: typeof fetch = async () => jevResponse({ owner: { type: 'noul', noul: 0.04 } });
    expect((await needsOwner('show today', { apiKey: 'k', fetchImpl: no })).needsOwner).toBe(false);
    expect(await needsOwner('x', { apiKey: '' })).toEqual({ needsOwner: false, probability: null, costMicro: 0 });
  });
});
