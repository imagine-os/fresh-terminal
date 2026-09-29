import { beforeEach, describe, expect, it } from 'vitest';
import { probeRouter, resetRouterHealthCache, routerConfigured } from './routerHealth';

describe('routerConfigured', () => {
  it('treats a relative /api as configured only in dev, and any absolute URL as configured', () => {
    expect(routerConfigured('/api', true)).toBe(true);
    expect(routerConfigured('/api', false)).toBe(false);
    expect(routerConfigured('https://router.example.workers.dev', false)).toBe(true);
  });
});

describe('probeRouter', () => {
  beforeEach(() => resetRouterHealthCache());

  it('does not even fetch when no router is configured for a static build', async () => {
    let called = false;
    const fakeFetch: typeof fetch = async () => {
      called = true;
      return new Response('');
    };
    const health = await probeRouter({ url: '/api', isDev: false, fetchImpl: fakeFetch });
    expect(health).toEqual({ state: 'unreachable', reason: 'not-configured', url: '/api' });
    expect(called).toBe(false);
  });

  it('reports ok with keyConfigured from /health and caches the result', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ ok: true, keyConfigured: true }), { status: 200 });
    };
    const first = await probeRouter({ url: 'https://r.test', isDev: false, fetchImpl: fakeFetch });
    const second = await probeRouter({ url: 'https://r.test', isDev: false, fetchImpl: fakeFetch });
    expect(first).toEqual({ state: 'ok', keyConfigured: true, url: 'https://r.test' });
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it('flags a static 405/404 as not a router and a hang as a timeout', async () => {
    const static405: typeof fetch = async () => new Response('Method Not Allowed', { status: 405 });
    expect((await probeRouter({ url: 'https://pages.test/api', isDev: false, fetchImpl: static405 })).state).toBe('unreachable');
    resetRouterHealthCache();
    const html: typeof fetch = async () => new Response('<html></html>', { status: 200 });
    expect(await probeRouter({ url: 'https://pages.test/api', isDev: false, fetchImpl: html })).toMatchObject({ reason: 'not-a-router' });
    resetRouterHealthCache();
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    expect(await probeRouter({ url: 'https://slow.test', isDev: false, fetchImpl: hang, timeoutMs: 10 })).toMatchObject({ reason: 'timeout' });
  });
});
