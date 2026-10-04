import { DEVICE_HEADER, SOFT_PROMPT_HEADER } from '@shared/credits';
import { readJson, writeJson } from './storage';
import { ROUTER_URL } from './routerClient';
import { turnstileToken } from './turnstile';

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
/** In-memory copy, for browsers where localStorage is blocked (and tests). */
let deviceInMemory: string | null = null;

export function setSessionTokenProvider(provider: (() => Promise<string | null>) | null): void {
  sessionToken = provider;
}

export function routerUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl) || pathOrUrl.startsWith(`${ROUTER_URL}/`)) return pathOrUrl;
  return `${ROUTER_URL}${pathOrUrl}`;
}

export function storedDevice(): string | null {
  return readJson<string | null>(DEVICE_KEY, null) ?? deviceInMemory;
}

export function forgetDevice(): void {
  deviceInMemory = null;
  writeJson(DEVICE_KEY, null);
}

/** Cancel a caller's wait without cancelling a shared device-registration request. */
function waitFor<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const aborted = () => {
      signal.removeEventListener('abort', aborted);
      reject(new DOMException('The request was stopped', 'AbortError'));
    };
    if (signal.aborted) {
      aborted();
      void work.catch(() => undefined);
      return;
    }
    signal.addEventListener('abort', aborted, { once: true });
    work.then(
      (value) => { signal.removeEventListener('abort', aborted); resolve(value); },
      (error: unknown) => { signal.removeEventListener('abort', aborted); reject(error); },
    );
  });
}

/** The signed device id for this browser, fetching one the first time. Null when the router has no credits (local dev). */
export async function deviceToken(fetchImpl: typeof fetch = fetch, timeoutMs = 30_000): Promise<string | null> {
  const saved = storedDevice();
  if (saved) return saved;
  if (deviceInflight) return deviceInflight;
  deviceInflight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // If the router runs Turnstile, get an invisible token first.
      let turnstile = '';
      const info = await waitFor(fetchImpl(routerUrl('/credits'), { method: 'GET', signal: controller.signal }), controller.signal).catch((error: unknown) => {
        if (controller.signal.aborted) throw error;
        return null;
      });
      if (info?.ok) {
        const status = (await waitFor(info.json(), controller.signal).catch((error: unknown) => {
          if (controller.signal.aborted) throw error;
          return {};
        })) as { turnstile?: string; turnstile_sitekey?: string };
        if (status.turnstile === 'on' && status.turnstile_sitekey) turnstile = await waitFor(turnstileToken(status.turnstile_sitekey), controller.signal);
      }
      const response = await waitFor(fetchImpl(routerUrl('/credits/device'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(turnstile ? { turnstile } : {}),
        signal: controller.signal,
      }), controller.signal);
      if (!response.ok) return null;
      const body = (await waitFor(response.json(), controller.signal)) as { device?: string };
      if (body.device) {
        deviceInMemory = body.device;
        writeJson(DEVICE_KEY, body.device);
      }
      return body.device ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
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
  if (init.signal?.aborted) throw new DOMException('The request was stopped', 'AbortError');
  const headers = new Headers(init.headers);
  if (sessionToken && !headers.has('Authorization')) {
    const token = await waitFor(sessionToken().catch(() => null), init.signal);
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  // The device also participates in signed-in welcome-credit checks. Keep
  // that header while making its shared setup bounded and caller-cancellable.
  const device = await waitFor(deviceToken(fetchImpl), init.signal);
  if (device && !headers.has(DEVICE_HEADER)) headers.set(DEVICE_HEADER, device);
  return headers;
}

/** fetch() for the router. `paid` marks calls that spend credits. */
export async function routerFetch(pathOrUrl: string, init: RequestInit = {}, options: { paid?: boolean; fetchImpl?: typeof fetch } = {}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = routerUrl(pathOrUrl);
  let response = await waitFor(fetchImpl(url, { ...init, headers: await withHeaders(init, fetchImpl) }), init.signal);
  if (response.status === 401) {
    const body = await waitFor(response.clone().json().catch(() => ({})), init.signal) as { code?: string } | null;
    const code = body?.code;
    if (code === 'device_required') {
      forgetDevice();
      response = await waitFor(fetchImpl(url, { ...init, headers: await withHeaders(init, fetchImpl) }), init.signal);
    }
  }
  const soft = parseSoftPrompt(response.headers.get(SOFT_PROMPT_HEADER));
  if (soft) emit('ft:soft-prompt', soft);
  if (options.paid) emit('ft:credits-changed');
  return response;
}
