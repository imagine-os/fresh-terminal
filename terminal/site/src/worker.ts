/**
 * freshterminal.ai front door (2026-09-29). Redirects www to the apex, then
 * serves the built app from static assets (SPA fallback is configured in
 * wrangler.toml). No secrets and no state live here.
 *
 * The hub (C-088) is at /hub. The page itself is a shell with no content.
 * Everything with content (/hub/data/*) and the session check (/hub/api/*)
 * needs a Clerk session token from an admin: this Worker asks the router
 * (service binding ROUTER, else api.freshterminal.ai) at /admin/whoami, which
 * verifies the token and the admin list. No token: 401. Not an admin: 403.
 * Assets are only reachable through this Worker (run_worker_first), so the
 * data files cannot be fetched around the check.
 */
export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface SiteEnv {
  ASSETS: Fetcher;
  /** Service binding to the router Worker (fresh-terminal-router). */
  ROUTER?: Fetcher;
  /** Fallback when there is no binding (tests, local). */
  ROUTER_ORIGIN?: string;
}

export const APEX = 'freshterminal.ai';
const DEFAULT_ROUTER_ORIGIN = 'https://api.freshterminal.ai';

export function redirectFor(url: URL): string | null {
  if (url.hostname === `www.${APEX}`) {
    return `https://${APEX}${url.pathname}${url.search}`;
  }
  return null;
}

export type HubRoute = 'none' | 'shell' | 'data' | 'api';

export function hubRoute(pathname: string): HubRoute {
  if (pathname !== '/hub' && !pathname.startsWith('/hub/')) return 'none';
  if (pathname.startsWith('/hub/data/')) return 'data';
  if (pathname.startsWith('/hub/api/')) return 'api';
  return 'shell';
}

const HUB_HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'private, no-store',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...HUB_HEADERS } });
}

/** Asks the router whether this bearer token belongs to an admin. */
export async function checkHubAdmin(request: Request, env: SiteEnv): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+/i.test(authorization)) {
    return { ok: false, response: json({ error: 'Sign in as an admin to see this.', code: 'sign_in_required' }, 401) };
  }
  const origin = (env.ROUTER_ORIGIN ?? DEFAULT_ROUTER_ORIGIN).replace(/\/$/, '');
  const ask = new Request(`${origin}/admin/whoami`, { headers: { Authorization: authorization } });
  let answer: Response;
  try {
    answer = env.ROUTER ? await env.ROUTER.fetch(ask) : await fetch(ask);
  } catch {
    return { ok: false, response: json({ error: 'The router did not answer the admin check.', code: 'router_unavailable' }, 503) };
  }
  const body = (await answer.json().catch(() => ({}))) as { admin?: boolean; error?: string; code?: string };
  if (answer.status === 200 && body.admin === true) return { ok: true, body };
  const status = answer.status === 401 || answer.status === 403 ? answer.status : 503;
  return { ok: false, response: json({ error: body.error ?? 'Admin check failed.', code: body.code ?? 'admin_check_failed' }, status) };
}

async function withHeaders(response: Response, extra: Record<string, string>): Promise<Response> {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function serveHub(request: Request, env: SiteEnv, route: HubRoute, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405);
  if (route === 'shell') {
    // Every hub path shows the same shell; it has no content until the checks below pass.
    const shell = await env.ASSETS.fetch(new Request(new URL('/hub/', url), request));
    return withHeaders(shell, { ...HUB_HEADERS, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  }
  const check = await checkHubAdmin(request, env);
  if (!check.ok) return check.response;
  if (route === 'api') {
    if (url.pathname === '/hub/api/session') return json(check.body, 200);
    return json({ error: 'Not found' }, 404);
  }
  if (!/^\/hub\/data\/[a-z0-9-]+\.json$/.test(url.pathname)) return json({ error: 'Not found' }, 404);
  // Asked without the Authorization header, so nothing about the caller reaches the asset store.
  const file = await env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }));
  if (!file.ok || !(file.headers.get('Content-Type') ?? '').includes('json')) return json({ error: 'Not in this build', code: 'not_built' }, 404);
  return withHeaders(file, { ...HUB_HEADERS, 'X-Content-Type-Options': 'nosniff' });
}

export default {
  async fetch(request: Request, env: SiteEnv): Promise<Response> {
    const url = new URL(request.url);
    const target = redirectFor(url);
    if (target) {
      return Response.redirect(target, 301);
    }
    const route = hubRoute(url.pathname);
    if (route !== 'none') return serveHub(request, env, route, url);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Hashed build assets can be cached for a year; HTML must revalidate so deploys show up.
    if (url.pathname.startsWith('/assets/')) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if ((headers.get('Content-Type') ?? '').includes('text/html')) {
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
