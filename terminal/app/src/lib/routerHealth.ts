import { ROUTER_URL } from './routerClient';

/**
 * Is a router deployed for this site? Probed once per page load with a 3 s
 * timeout; successful probes are cached, while failed probes can recover on the
 * next attempt. The composer consults it before any POST so a static
 * host (GitHub Pages) never answers with "HTTP 405".
 */
export type RouterHealth =
  | { state: 'unknown' }
  | { state: 'ok'; keyConfigured: boolean; url: string }
  | { state: 'unreachable'; reason: 'not-configured' | 'timeout' | 'error' | 'not-a-router'; url: string };

/** True when the build points at a real router (absolute URL) or a dev proxy exists. */
export function routerConfigured(url: string = ROUTER_URL, isDev: boolean = import.meta.env.DEV): boolean {
  if (/^https?:\/\//.test(url)) {
    return true;
  }
  // A relative "/api" only works where Vite proxies it (dev). On Pages it is a static 405.
  return isDev;
}

let cached: RouterHealth = { state: 'unknown' };
let inflight: Promise<RouterHealth> | null = null;
let inflightUrl: string | null = null;
let generation = 0;

export function resetRouterHealthCache(): void {
  cached = { state: 'unknown' };
  inflight = null;
  inflightUrl = null;
  generation += 1;
}

export function cachedRouterHealth(): RouterHealth {
  return cached;
}

export async function probeRouter(options: {
  url?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  isDev?: boolean;
} = {}): Promise<RouterHealth> {
  const url = options.url ?? ROUTER_URL;
  if (cached.state === 'ok' && cached.url === url) {
    return cached;
  }
  if (inflight && inflightUrl === url) {
    return inflight;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const isDev = options.isDev ?? import.meta.env.DEV;

  const probeGeneration = ++generation;
  inflightUrl = url;
  const pending = (async (): Promise<RouterHealth> => {
    if (!routerConfigured(url, isDev)) {
      return { state: 'unreachable', reason: 'not-configured', url };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000);
    try {
      const response = await fetchImpl(`${url}/health`, { signal: controller.signal });
      if (!response.ok) {
        return { state: 'unreachable', reason: 'error', url };
      }
      const body = (await response.json().catch(() => null)) as { ok?: boolean; keyConfigured?: boolean } | null;
      if (!body || body.ok !== true) {
        return { state: 'unreachable', reason: 'not-a-router', url };
      }
      return { state: 'ok', keyConfigured: Boolean(body.keyConfigured), url };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return { state: 'unreachable', reason: aborted ? 'timeout' : 'error', url };
    } finally {
      clearTimeout(timer);
    }
  })();

  inflight = pending;
  const result = await pending;
  // A reset or a newer URL must not be overwritten by an older request.
  if (probeGeneration === generation) {
    cached = result;
    inflight = null;
    inflightUrl = null;
  }
  return result;
}
