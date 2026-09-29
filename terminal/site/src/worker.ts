/**
 * freshterminal.ai front door (2026-09-29). Redirects www to the apex, then
 * serves the built app from static assets (SPA fallback is configured in
 * wrangler.toml). No secrets and no state live here.
 */
export interface SiteEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export const APEX = 'freshterminal.ai';

export function redirectFor(url: URL): string | null {
  if (url.hostname === `www.${APEX}`) {
    return `https://${APEX}${url.pathname}${url.search}`;
  }
  return null;
}

export default {
  async fetch(request: Request, env: SiteEnv): Promise<Response> {
    const url = new URL(request.url);
    const target = redirectFor(url);
    if (target) {
      return Response.redirect(target, 301);
    }
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
