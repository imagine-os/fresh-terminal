import { describe, expect, it } from 'vitest';
import { tagWithModel } from './tagger';

function completion(content: string, model = 'google/gemini-2.5-flash-lite'): Response {
  return new Response(JSON.stringify({ id: 'gen-tag-1', model, choices: [{ message: { content } }], usage: { cost: 0.0000031 } }), { status: 200 });
}

describe('tagWithModel', () => {
  it('asks for a JSON schema response and keeps only chips whose offsets match the text', async () => {
    let body: Record<string, unknown> = {};
    const fakeFetch: typeof fetch = async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return completion(
        JSON.stringify({
          chips: [
            { kind: 'action', start: 0, end: 8, text: 'schedule', value: 'schedule', p: 0.9, alternatives: [] },
            { kind: 'date', start: 16, end: 24, text: 'tomorrow', value: '', p: 0.8, alternatives: [{ kind: 'time', value: '', p: 0.1 }] },
            { kind: 'entity', start: 0, end: 3, text: 'WRONG', value: '', p: 0.5, alternatives: [] },
          ],
        }),
      );
    };
    const result = await tagWithModel({ apiKey: 'k', model: 'google/gemini-2.5-flash-lite', text: 'schedule a call tomorrow', fetchImpl: fakeFetch });
    expect((body.response_format as { type: string }).type).toBe('json_schema');
    expect(body.model).toBe('google/gemini-2.5-flash-lite');
    expect(result?.chips.map((chip) => chip.kind)).toEqual(['action', 'date']);
    expect(result?.chips[1]).toEqual({ kind: 'date', start: 16, end: 24, text: 'tomorrow', p: 0.8, source: 'model', alternatives: [{ kind: 'time', p: 0.1 }] });
    expect(result?.costMicro).toBe(3);
    expect(result?.servedModel).toBe('google/gemini-2.5-flash-lite');
  });

  it('returns null on a bad status or malformed JSON', async () => {
    const bad: typeof fetch = async () => new Response('', { status: 429 });
    expect(await tagWithModel({ apiKey: 'k', model: 'm', text: 'x', fetchImpl: bad })).toBeNull();
    const malformed: typeof fetch = async () => completion('not json');
    expect(await tagWithModel({ apiKey: 'k', model: 'm', text: 'x', fetchImpl: malformed })).toBeNull();
  });
});
