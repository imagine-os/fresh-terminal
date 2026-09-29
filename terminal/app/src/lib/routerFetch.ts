import { DEVICE_HEADER, SOFT_PROMPT_HEADER } from '@shared/credits';
import { readJson, writeJson } from './storage';
import { ROUTER_URL } from './routerClient';

/**
 * Every call to our router goes through here (2026-09-29). It adds:
 * - the signed anonymous device id (X-FT-Device), issued once per browser by
 *   POST /credits/device and kept in localStorage;
 * - the Clerk session token when someone is signed in, so their account's
 *   credits are used instead of the device's.
 * It re-issues a device id once if the router does not know it, and tells the
 * credits hook when a paid call happened or a soft sign-in prompt was used.
 * Own-key (BYOK) calls go straight to OpenRouter and never come through here.
 */
const DEVICE_KEY = 'fresh-terminal.device.v1';

let sessionToken: (() => Promise<string | null>) | null = null;
let deviceInflight: Promise<string | null> | null = null;

export function setSessionTokenProvider(provider: (() => Promise<string | null>) | null): void {
  sessionToken = provider;
}

export function routerUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl) || pathOrUrl.startsWith(`${ROUTER_URL}/`)) return pathOrUrl;
  return `${ROUTER_URL}${pathOrUrl}`;
}

export function storedDevice(): string | null {
  return readJson<string | null>(DEVICE_KEY, null);
}

export function forgetDevice(): void {
  writeJson(DEVICE_KEY, null);
}

/** The signed device id for this browser, fetching one the first time. Null when the router has no credits (local dev). */
export async function deviceToken(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const saved = storedDevice();
  if (saved) return saved;
  if (deviceInflight) return deviceInflight;
  deviceInflight = (async () => {
    try {
      const response = await fetchImpl(routerUrl('/credits/device'), { method: 'POST' });
      if (!response.ok) return null;
      const body = (await response.json()) as { device?: string };
      if (body.device) writeJson(DEVICE_KEY, body.device);
      return body.device ?? null;
    } catch {
      return null;
    } finally {
      deviceInflight = null;
    }
  })();
  return deviceInflight;
}

export interface SoftPromptEvent {
  n: number;
  of: number;
}

function emit(name: string, detail?: unknown): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function parseSoftPrompt(value: string | null): SoftPromptEvent | null {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '');
  return match ? { n: Number(match[1]), of: Number(match[2]) } : null;
}

async function withHeaders(init: RequestInit, fetchImpl: typeof fetch): Promise<Headers> {
  const headers = new Headers(init.headers);
  const device = await deviceToken(fetchImpl);
  if (device && !headers.has(DEVICE_HEADER)) headers.set(DEVICE_HEADER, device);
  if (sessionToken && !headers.has('Authorization')) {
    const token = await sessionToken().catch(() => null);
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

/** fetch() for the router. `paid` marks calls that spend credits. */
export async function routerFetch(pathOrUrl: string, init: RequestInit = {}, options: { paid?: boolean; fetchImpl?: typeof fetch } = {}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = routerUrl(pathOrUrl);
  let response = await fetchImpl(url, { ...init, headers: await withHeaders(init, fetchImpl) });
  if (response.status === 401) {
    const code = ((await response.clone().json().catch(() => ({}))) as { code?: string }).code;
    if (code === 'device_required') {
      forgetDevice();
      response = await fetchImpl(url, { ...init, headers: await withHeaders(init, fetchImpl) });
    }
  }
  const soft = parseSoftPrompt(response.headers.get(SOFT_PROMPT_HEADER));
  if (soft) emit('ft:soft-prompt', soft);
  if (options.paid) emit('ft:credits-changed');
  return response;
}
