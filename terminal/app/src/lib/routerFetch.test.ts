import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@router/src/app';
import { fakeD1 } from '@router/src/testing/fakeD1';
import { deviceToken, forgetDevice, parseSoftPrompt, routerFetch, routerUrl, setSessionTokenProvider } from './routerFetch';

afterEach(() => { setSessionTokenProvider(null); vi.useRealTimers(); });

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
  it('keeps both account and device headers for welcome-credit checks', async () => {
    forgetDevice();
    setSessionTokenProvider(async () => 'session-test');
    const fetchImpl = vi.fn<typeof fetch>(async (url) => Response.json(String(url).endsWith('/credits/device') ? { device: 'device-test' } : { ok: true }));
    await routerFetch('/route', { method: 'POST' }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const headers = new Headers(fetchImpl.mock.calls[2]?.[1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer session-test');
    expect(headers.get('X-FT-Device')).toBe('device-test');
    forgetDevice();
  });

  it('cancels a wait for shared device setup without sending a paid request', async () => {
    forgetDevice();
    let answer!: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>((url) => {
      if (String(url).endsWith('/credits')) return new Promise<Response>((resolve) => { answer = resolve; });
      return Promise.resolve(Response.json({ device: 'device-test' }));
    });
    const controller = new AbortController();
    const pending = routerFetch('/route', { method: 'POST', signal: controller.signal }, { fetchImpl });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    answer(Response.json({ turnstile: 'off' }));
    await deviceToken(fetchImpl);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).endsWith('/route'))).toBe(false);
    forgetDevice();
  });

  it('cancels while Clerk token lookup is pending', async () => {
    setSessionTokenProvider(() => new Promise(() => {}));
    const fetchImpl = vi.fn<typeof fetch>();
    const controller = new AbortController();
    const pending = routerFetch('/route', { signal: controller.signal }, { fetchImpl });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('times out a hung bootstrap and lets the next request recover', async () => {
    vi.useFakeTimers();
    forgetDevice();
    const stuck = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const pending = deviceToken(stuck, 20);
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    const recovered: typeof fetch = async (url) => Response.json(String(url).endsWith('/credits/device') ? { device: 'recovered' } : { turnstile: 'off' });
    expect(await deviceToken(recovered)).toBe('recovered');
    forgetDevice();
  });

});
