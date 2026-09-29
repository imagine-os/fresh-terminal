import { describe, expect, it } from 'vitest';
import { createApp } from '@router/src/app';
import { fakeD1 } from '@router/src/testing/fakeD1';
import { forgetDevice, parseSoftPrompt, routerFetch, routerUrl } from './routerFetch';

describe('routerFetch', () => {
  it('gets a signed device id, sends it, and the router meters by it', async () => {
    forgetDevice();
    const db = fakeD1();
    const router = createApp({ bindings: () => ({ DEVICE_SIGNING_KEY: 'k', OPENROUTER_API_KEY: '' }), resources: () => ({ DB: db }) });
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input), 'https://api.test');
      seen.push(`${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api/, '')} device=${new Headers(init?.headers).has('X-FT-Device')}`);
      // In tests ROUTER_URL is the dev proxy path "/api".
      return router.request(url.pathname.replace(/^\/api/, '') + url.search, init);
    };
    const response = await routerFetch('https://api.test/credits', { method: 'GET' }, { fetchImpl });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { mode: string; remaining_micro: number };
    expect(body.mode).toBe('device');
    expect(body.remaining_micro).toBe(250_000);
    expect(seen).toEqual(['GET /credits device=false', 'POST /credits/device device=false', 'GET /credits device=true']);
  });

  it('reads the soft-prompt header and resolves router paths', () => {
    expect(parseSoftPrompt('1/2')).toEqual({ n: 1, of: 2 });
    expect(parseSoftPrompt(null)).toBeNull();
    expect(routerUrl('https://x.test/tag')).toBe('https://x.test/tag');
  });
});
