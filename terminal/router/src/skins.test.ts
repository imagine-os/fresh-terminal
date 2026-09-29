import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { cleanCssVariant, expectedScore } from './skins';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  return app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('skins', () => {
  it('plans with Jev: path choice over the five routes, ledgered', async () => {
    let question: { criteria?: Record<string, string> } = {};
    const fakeFetch: typeof fetch = async (url, init) => {
      expect(String(url)).toContain('/alpha/decisions');
      question = (JSON.parse(String(init?.body)) as { questions: { path: typeof question } }).questions.path;
      return json({ id: 'dec-1', model: 'typesafe/jev-1.13', answers: { path: { type: 'choice', choice: 'image_search', confidence: 0.8, probabilities: { image_search: 0.8 } } }, usage: { input_tokens: 300, output_tokens: 0, cost: 0.0000126 } });
    };
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch, now: () => 7 });
    const response = await post(app, '/skin/plan', { boxId: 'b1', text: 'skin the sidebar with a mossy stone photo' });
    const body = (await response.json()) as { target: string; material: string; path: string; source: string; entries: Array<{ what: string; cost_micro: number }>; params: { cap_micro: number } };
    expect(body.target).toBe('sidebar');
    expect(body.material).toContain('mossy stone');
    expect(body.path).toBe('image_search');
    expect(body.source).toBe('jev');
    expect(Object.keys(question.criteria ?? {}).sort()).toEqual(['css_tokens', 'image_generate', 'image_search', 'library', 'procedural_code']);
    expect(body.entries).toEqual([expect.objectContaining({ what: 'skin.plan', cost_micro: 13 })]);
    expect(body.params.cap_micro).toBe(30000);
    expect((body as unknown as { estimate: { micro: number; certainty: string } }).estimate).toEqual({ micro: 733, low_micro: 253, high_micro: 1213, certainty: 'fairly sure' });
  });

  it('library variants are free and never repeat excluded ones', async () => {
    const app = createApp({ bindings: () => ({}) });
    const response = await post(app, '/skin/variants', { boxId: 'b1', path: 'library', material: 'brass', target: 'stage', round: 2, n: 3, parent: null, exclude: ['lib-brass'] });
    const body = (await response.json()) as { variants: Array<{ id: string }>; entries: unknown[] };
    expect(body.variants).toHaveLength(3);
    expect(body.variants.map((v) => v.id)).not.toContain('lib-brass');
    expect(body.entries).toEqual([]);
  });

  it('image search records the licence, keeps https only, and ledgers the call at $0', async () => {
    const fakeFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain('api.openverse.org/v1/images/?q=rust');
      expect(String(url)).toContain('license=cc0%2Cpdm%2Cby%2Cby-sa');
      return json({
        results: [
          { id: 'a1', title: 'Rusty plate', url: 'https://live.staticflickr.com/1/a.jpg', thumbnail: 'https://api.openverse.org/v1/images/a1/thumb/', creator: 'Ann', license: 'by', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by/2.0/', foreign_landing_url: 'https://flickr.com/a', width: 1024, height: 768 },
          { id: 'a2', title: 'Plain http', url: 'http://example.com/b.jpg', license: 'cc0' },
          { id: 'a3', title: 'Rust CC0', url: 'https://example.org/c.jpg', creator: 'Bo', license: 'cc0', license_version: '1.0' },
          { id: 'a4', title: 'Non-commercial', url: 'https://example.org/d.jpg', creator: 'Cy', license: 'by-nc-sa', license_version: '2.0' },
        ],
      });
    };
    const app = createApp({ bindings: () => ({}), fetchImpl: fakeFetch });
    const response = await post(app, '/skin/variants', { boxId: 'b1', path: 'image_search', material: 'rust', target: 'stage', round: 1, n: 3, parent: null });
    const body = (await response.json()) as { variants: Array<{ image: { license: string; creator: string; source_url: string } }>; entries: Array<{ what: string; price_micro: number }> };
    expect(body.variants).toHaveLength(2);
    expect(body.variants[0]?.image).toMatchObject({ license: 'CC BY 2.0', creator: 'Ann', source_url: 'https://flickr.com/a' });
    expect(body.variants[1]?.image.license).toBe('CC0 1.0');
    expect(body.entries).toEqual([expect.objectContaining({ what: 'skin.search', price_micro: 0 })]);
  });

  it('drops unsafe CSS (url(), unknown functions) and fixes unreadable text', () => {
    expect(cleanCssVariant({ name: 'x', tokens: {}, background: 'url(https://evil.test/a.png)' }, 'id', 'procedural_code')).toBeNull();
    expect(cleanCssVariant({ name: 'x', tokens: {}, background: 'expression(alert(1))' }, 'id', 'procedural_code')).toBeNull();
    const ok = cleanCssVariant({ name: 'Brass', tokens: { '--bg': '#2a1f0e', '--fg': '#302010' }, background: 'linear-gradient(135deg, #5a3f12, #d8b45e)', veil: 80 }, 'id', 'procedural_code');
    expect(ok?.background).toContain('linear-gradient');
    expect(ok?.tokens['--fg']).toBe('#f5f5f0');
    expect(ok?.veil).toBe(60);
  });

  it('scores: vision describes images, Jev scores each variant, both ledgered', async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push(String(url));
      if (String(url).includes('chat/completions')) {
        const request = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: unknown[] }> };
        expect(request.model).toBe('google/gemini-2.5-flash-lite');
        expect(request.messages[0]?.content).toHaveLength(2);
        return json({
          id: 'gen-v',
          model: 'google/gemini-2.5-flash-lite',
          usage: { prompt_tokens: 400, completion_tokens: 60, total_tokens: 460, cost: 0.00006 },
          choices: [{ message: { content: JSON.stringify({ items: [{ index: 1, description: 'Orange rusted steel plate.', bg: '#2a1408', surface: '#3a1c0c', fg: '#fbe8d8', accent: '#e07030' }] }) } }],
        });
      }
      return json({
        id: 'dec-s',
        model: 'typesafe/jev-1.13',
        answers: {
          v0: { type: 'score', score: 0.8, confidence: 0.7, probabilities: { 'Recognisably the requested material': 0.2, 'A convincing version of the material that keeps text readable': 0.5, 'Exactly the requested material, polished, and text stays readable': 0.3 } },
          v1: { type: 'score', score: 0.25, confidence: 0.6, probabilities: {} },
        },
        usage: { input_tokens: 500, output_tokens: 0, cost: 0.000021 },
      });
    };
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch });
    const response = await post(app, '/skin/score', {
      boxId: 'b1',
      material: 'rust',
      target: 'stage',
      variants: [
        { id: 'a', description: 'photo', image: 'https://api.openverse.org/v1/images/a1/thumb/' },
        { id: 'b', description: 'CSS rust gradient', image: null },
      ],
    });
    const body = (await response.json()) as { scores: Array<{ score: number; note: string; palette: Record<string, string> | null }>; entries: Array<{ what: string }> };
    expect(body.scores[0]?.score).toBe(4.1);
    expect(body.scores[0]?.note).toBe('Orange rusted steel plate.');
    expect(body.scores[0]?.palette?.['--bg']).toBe('#2a1408');
    expect(body.scores[1]?.score).toBe(2);
    expect(body.entries.map((entry) => entry.what)).toEqual(['skin.vision', 'skin.score']);
  });

  it('expectedScore reads probabilities per rung, or scales a 0–1 score', () => {
    expect(expectedScore({ type: 'score', score: 1, confidence: 1, probabilities: {} })).toBe(5);
    expect(expectedScore(undefined)).toBeNull();
  });

  it('/route hands skin requests to the app without a chat call', async () => {
    const urls: string[] = [];
    const fakeFetch: typeof fetch = async (url) => {
      urls.push(String(url));
      return json({ id: 'dec-r', model: 'typesafe/jev-1.13', answers: { intent: { type: 'choice', choice: 'skin', confidence: 0.9, probabilities: { skin: 0.9 } } }, usage: { input_tokens: 400, output_tokens: 0, cost: 0.0000168 } });
    };
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch, now: () => 3 });
    const response = await post(app, '/route', { boxId: 'b1', text: 'make the sidebar look like brass', chips: [] });
    const text = await response.text();
    expect(text).toContain('event: skin');
    expect(text).toContain('"what":"skin.route"');
    expect(urls.every((url) => url.includes('/alpha/decisions'))).toBe(true);
  });

  it('never plans a path the cap cannot afford: image generation falls back with a note', async () => {
    const fakeFetch: typeof fetch = async () =>
      json({ id: 'dec-2', model: 'typesafe/jev-1.13', answers: { path: { type: 'choice', choice: 'image_generate', confidence: 0.9, probabilities: { image_generate: 0.9, image_search: 0.06, procedural_code: 0.04 } } }, usage: { input_tokens: 300, output_tokens: 0, cost: 0.0000126 } });
    const app = createApp({ bindings: () => ({ OPENROUTER_API_KEY: 'k' }), fetchImpl: fakeFetch });
    const body = (await (await post(app, '/skin/plan', { boxId: 'b1', text: 'generate an image of a misty koi pond at dawn' })).json()) as { path: string; note: string; material: string };
    expect(body.path).toBe('image_search');
    expect(body.note).toContain('over the 3¢ cap');
    expect(body.material).toBe('misty koi pond at dawn');
  });

  it('image search upgrades fall back to the next search page when "related" 404s', async () => {
    const urls: string[] = [];
    const fakeFetch: typeof fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes('/related/')) return json({ detail: 'not found' }, 404);
      return json({ results: [{ id: 'b1', title: 'Moss', url: 'https://example.org/m.jpg', creator: 'D', license: 'cc0', license_version: '1.0' }] });
    };
    const app = createApp({ bindings: () => ({}), fetchImpl: fakeFetch });
    const body = (await (await post(app, '/skin/variants', { boxId: 'b1', path: 'image_search', material: 'moss', target: 'stage', round: 3, n: 3, parent: { name: 'x', openverse_id: 'gone' } })).json()) as { variants: unknown[]; entries: unknown[]; error?: string };
    expect(urls[0]).toContain('/gone/related/');
    expect(urls[1]).toContain('page=3');
    expect(body.variants).toHaveLength(1);
    expect(body.entries).toHaveLength(2);
    expect(body.error).toBeUndefined();
  });
});
