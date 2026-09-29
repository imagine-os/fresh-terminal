/**
 * Where the app finds the router.
 *
 * DEFAULT_ROUTER_URL is the Cloudflare Worker deployed by
 * .github/workflows/router-deploy.yml (worker "fresh-terminal-router" on the
 * jmassion.workers.dev subdomain). DOMAIN_ROUTER_URL is the same Worker on its
 * custom domain; it is used only when the app itself is served from
 * freshterminal.ai, so GitHub Pages keeps the workers.dev address until the
 * domain is proven. Both are public URLs, not secrets.
 *
 * Order: a non-empty VITE_ROUTER_URL at build time wins; in dev the Vite proxy
 * at /api (-> localhost:8787) is used; on freshterminal.ai (or www) the custom
 * domain; otherwise the workers.dev Worker.
 */
export const DEFAULT_ROUTER_URL = 'https://fresh-terminal-router.jmassion.workers.dev';

export const DOMAIN_ROUTER_URL = 'https://api.freshterminal.ai';

export const APP_DOMAINS = ['freshterminal.ai', 'www.freshterminal.ai'] as const;

export const DEV_ROUTER_URL = '/api';

export function resolveRouterUrl(envValue: string | undefined, isDev: boolean, hostname: string = ''): string {
  const override = (envValue ?? '').trim().replace(/\/+$/, '');
  if (override.length > 0) {
    return override;
  }
  if (isDev) {
    return DEV_ROUTER_URL;
  }
  return (APP_DOMAINS as readonly string[]).includes(hostname.toLowerCase()) ? DOMAIN_ROUTER_URL : DEFAULT_ROUTER_URL;
}
