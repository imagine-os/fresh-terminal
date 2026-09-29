import { describe, expect, it } from 'vitest';
import worker, { SALES_PAGES, hubRoute, redirectFor, salesRedirect } from './worker';

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

describe('sales pages', () => {
  const env = {
    ASSETS: {
      fetch: async (request: Request) => {
        const path = new URL(request.url).pathname;
        const page = SALES_PAGES.find((name) => name === path);
        return page
          ? new Response(`<!doctype html><title>${page}</title>`, { headers: { 'Content-Type': 'text/html' } })
          : new Response('<div id="root"></div>', { headers: { 'Content-Type': 'text/html' } });
      },
    },
  };

  it('serves /about, /pricing and /faq from the asset store, indexable, revalidated', async () => {
    for (const page of SALES_PAGES) {
      const response = await worker.fetch(new Request(`https://freshterminal.ai${page}`), env);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(`<title>${page}</title>`);
      expect(response.headers.get('X-Robots-Tag')).toBeNull();
      expect(response.headers.get('Cache-Control')).toContain('must-revalidate');
    }
  });

  it('gives each page one address: a trailing slash or .html redirects, keeping the query', async () => {
    expect(salesRedirect(new URL('https://freshterminal.ai/about/'))).toBe('https://freshterminal.ai/about');
    expect(salesRedirect(new URL('https://freshterminal.ai/pricing.html?lang=es'))).toBe('https://freshterminal.ai/pricing?lang=es');
    expect(salesRedirect(new URL('https://freshterminal.ai/faq'))).toBeNull();
    expect(salesRedirect(new URL('https://freshterminal.ai/aboutx/'))).toBeNull();
    const moved = await worker.fetch(new Request('https://freshterminal.ai/faq/'), env);
    expect(moved.status).toBe(301);
    expect(moved.headers.get('Location')).toBe('https://freshterminal.ai/faq');
  });
});

describe('hub gate', () => {
  const assets = {
    fetch: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === '/hub/') return new Response('<!doctype html><div id="hub"></div>', { headers: { 'Content-Type': 'text/html' } });
      if (path === '/hub/data/library.json') return new Response('{"prompts":[]}', { headers: { 'Content-Type': 'application/json' } });
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
    },
  };
  const router = {
    fetch: async (request: Request) => {
      const auth = request.headers.get('Authorization');
      if (new URL(request.url).pathname !== '/admin/whoami') return new Response('{}', { status: 404 });
      if (auth === 'Bearer admin') return Response.json({ admin: true, userId: 'user_admin', via: 'id' });
      if (auth === 'Bearer friend') return Response.json({ error: 'This account is not an admin.', code: 'not_admin' }, { status: 403 });
      return Response.json({ error: 'Session token rejected', code: 'sign_in_required' }, { status: 401 });
    },
  };
  const env = { ASSETS: assets, ROUTER: router };
  const get = (path: string, token?: string) => worker.fetch(new Request(`https://freshterminal.ai${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {}), env);

  it('routes hub paths', () => {
    expect(hubRoute('/hub')).toBe('shell');
    expect(hubRoute('/hub/credits')).toBe('shell');
    expect(hubRoute('/hub/data/library.json')).toBe('data');
    expect(hubRoute('/hub/api/session')).toBe('api');
    expect(hubRoute('/hubs')).toBe('none');
    expect(hubRoute('/')).toBe('none');
  });

  it('serves the shell to anyone, marked noindex and not cached', async () => {
    for (const path of ['/hub', '/hub/', '/hub/credits']) {
      const shell = await get(path);
      expect(shell.status).toBe(200);
      expect(await shell.text()).toContain('id="hub"');
      expect(shell.headers.get('X-Robots-Tag')).toContain('noindex');
      expect(shell.headers.get('Cache-Control')).toContain('no-store');
    }
  });

  it('answers 401 without a session, 403 for a non-admin, and the data for an admin', async () => {
    expect((await get('/hub/data/library.json')).status).toBe(401);
    expect((await get('/hub/api/session')).status).toBe(401);
    expect((await get('/hub/data/library.json', 'expired')).status).toBe(401);
    expect((await get('/hub/data/library.json', 'friend')).status).toBe(403);
    const data = await get('/hub/data/library.json', 'admin');
    expect(data.status).toBe(200);
    expect(await data.text()).toBe('{"prompts":[]}');
    expect(data.headers.get('Cache-Control')).toContain('no-store');
    expect(await (await get('/hub/api/session', 'admin')).json()).toMatchObject({ admin: true });
    expect((await get('/hub/data/missing.json', 'admin')).status).toBe(404);
    // Dot segments are normalised by the URL parser: this is the public shell, not a data file.
    expect(await (await get('/hub/data/../index.html')).text()).toContain('id="hub"');
  });

  it('never serves hub data through the plain asset path', async () => {
    const response = await worker.fetch(new Request('https://freshterminal.ai/hub/data/library.json', { method: 'POST' }), env);
    expect(response.status).toBe(405);
  });
});
