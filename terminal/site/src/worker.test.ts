import { describe, expect, it } from 'vitest';
import worker, { redirectFor } from './worker';

describe('site worker', () => {
  it('redirects www to the apex and keeps path and query', () => {
    expect(redirectFor(new URL('https://www.freshterminal.ai/box/abc?x=1'))).toBe('https://freshterminal.ai/box/abc?x=1');
    expect(redirectFor(new URL('https://freshterminal.ai/'))).toBeNull();
    expect(redirectFor(new URL('https://fresh-terminal-app.jmassion.workers.dev/'))).toBeNull();
  });

  it('serves assets with cache headers', async () => {
    const env = { ASSETS: { fetch: async (request: Request) => new Response(`ok ${new URL(request.url).pathname}`, { headers: { 'Content-Type': 'text/html' } }) } };
    const html = await worker.fetch(new Request('https://freshterminal.ai/box/1'), env);
    expect(await html.text()).toBe('ok /box/1');
    expect(html.headers.get('Cache-Control')).toContain('must-revalidate');
    const asset = await worker.fetch(new Request('https://freshterminal.ai/assets/index-abc.js'), env);
    expect(asset.headers.get('Cache-Control')).toContain('immutable');
    const www = await worker.fetch(new Request('https://www.freshterminal.ai/canvas'), env);
    expect(www.status).toBe(301);
    expect(www.headers.get('Location')).toBe('https://freshterminal.ai/canvas');
  });
});
