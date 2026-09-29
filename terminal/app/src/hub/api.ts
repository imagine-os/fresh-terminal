import { resolveRouterUrl } from '../config/router';

/**
 * Hub requests (2026-09-29, C-086). Content comes from the site Worker at
 * /hub/data/* and the session check from /hub/api/session; both need the Clerk
 * session token and answer 401 without it. The credits panel talks to the
 * router's /admin/* with the same token; the router checks admin again.
 */
export const HUB_ROUTER_URL = resolveRouterUrl(
  import.meta.env.VITE_ROUTER_URL as string | undefined,
  import.meta.env.DEV,
  typeof window === 'undefined' ? '' : window.location.hostname,
);

export type TokenFn = () => Promise<string | null>;

export class HubError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function send<T>(url: string, token: TokenFn, init: RequestInit = {}): Promise<T> {
  const bearer = await token();
  const headers = new Headers(init.headers);
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...init, headers, cache: 'no-store' });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!response.ok) throw new HubError(response.status, body.error ?? `HTTP ${response.status}`, body.code);
  return body;
}

export function hubData<T>(name: string, token: TokenFn): Promise<T> {
  return send<T>(`/hub/data/${name}.json`, token);
}

export function hubSession(token: TokenFn): Promise<{ admin: boolean; userId: string; via: string }> {
  return send(`/hub/api/session`, token);
}

export function admin<T>(path: string, token: TokenFn, body?: unknown): Promise<T> {
  return send<T>(`${HUB_ROUTER_URL}${path}`, token, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
}

export function usd(micro: number | undefined | null, digits = 2): string {
  const value = Number(micro ?? 0) / 1_000_000;
  return `$${value.toFixed(value !== 0 && Math.abs(value) < 0.01 ? 4 : digits)}`;
}

export function when(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(Number(ms)).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
