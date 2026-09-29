/**
 * Where the app finds the router.
 *
 * DEFAULT_ROUTER_URL is the Cloudflare Worker deployed by
 * .github/workflows/router-deploy.yml (worker "fresh-terminal-router" on the
 * jmassion.workers.dev subdomain). It is a public URL, not a secret.
 *
 * Order: a non-empty VITE_ROUTER_URL at build time wins; in dev the Vite proxy
 * at /api (-> localhost:8787) is used; otherwise the deployed Worker.
 */
export const DEFAULT_ROUTER_URL = 'https://fresh-terminal-router.jmassion.workers.dev';

export const DEV_ROUTER_URL = '/api';

export function resolveRouterUrl(envValue: string | undefined, isDev: boolean): string {
  const override = (envValue ?? '').trim().replace(/\/+$/, '');
  if (override.length > 0) {
    return override;
  }
  return isDev ? DEV_ROUTER_URL : DEFAULT_ROUTER_URL;
}
