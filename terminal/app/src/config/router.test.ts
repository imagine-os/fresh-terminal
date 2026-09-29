import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTER_URL, DOMAIN_ROUTER_URL, resolveRouterUrl } from './router';

describe('resolveRouterUrl', () => {
  it('uses a non-empty build-time override and trims a trailing slash', () => {
    expect(resolveRouterUrl('https://r.example/', false)).toBe('https://r.example');
    expect(resolveRouterUrl('https://r.example', true)).toBe('https://r.example');
    expect(resolveRouterUrl('https://r.example', false, 'freshterminal.ai')).toBe('https://r.example');
  });

  it('treats an empty or blank override (unset Actions variable) as absent', () => {
    expect(resolveRouterUrl('', false)).toBe(DEFAULT_ROUTER_URL);
    expect(resolveRouterUrl('   ', false)).toBe(DEFAULT_ROUTER_URL);
    expect(resolveRouterUrl(undefined, false)).toBe(DEFAULT_ROUTER_URL);
  });

  it('uses the Vite proxy in dev and the deployed Worker in production', () => {
    expect(resolveRouterUrl(undefined, true)).toBe('/api');
    expect(DEFAULT_ROUTER_URL).toBe('https://fresh-terminal-router.jmassion.workers.dev');
  });

  it('uses api.freshterminal.ai only when served from freshterminal.ai or www', () => {
    expect(resolveRouterUrl(undefined, false, 'freshterminal.ai')).toBe(DOMAIN_ROUTER_URL);
    expect(resolveRouterUrl(undefined, false, 'www.freshterminal.ai')).toBe(DOMAIN_ROUTER_URL);
    expect(resolveRouterUrl(undefined, false, 'imagine-os.github.io')).toBe(DEFAULT_ROUTER_URL);
    expect(resolveRouterUrl(undefined, false, 'fresh-terminal-app.jmassion.workers.dev')).toBe(DEFAULT_ROUTER_URL);
    expect(DOMAIN_ROUTER_URL).toBe('https://api.freshterminal.ai');
  });
});
