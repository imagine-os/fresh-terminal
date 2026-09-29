/**
 * Invisible Cloudflare Turnstile, run once per browser before it gets a
 * free-credit device id (2026-09-29). The router verifies the token; this only
 * fetches one. Nothing shows unless Cloudflare decides to ask.
 */
interface TurnstileApi {
  render(element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void; 'expired-callback'?: () => void; appearance?: 'always' | 'execute' | 'interaction-only'; size?: 'normal' | 'compact' | 'flexible' }): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi | null> | null = null;

function load(): Promise<TurnstileApi | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve(window.turnstile ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}

/** A Turnstile token for this site key, or '' after 20 s or on any failure. */
export async function turnstileToken(sitekey: string, timeoutMs = 20_000): Promise<string> {
  const api = await load();
  if (!api) return '';
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.position = 'fixed';
    host.style.bottom = '0.5rem';
    host.style.right = '0.5rem';
    host.style.zIndex = '60';
    document.body.appendChild(host);
    let id = '';
    const finish = (token: string) => {
      clearTimeout(timer);
      try {
        if (id) api.remove(id);
      } catch {
        // already gone
      }
      host.remove();
      resolve(token);
    };
    const timer = setTimeout(() => finish(''), timeoutMs);
    try {
      id = api.render(host, { sitekey, appearance: 'interaction-only', callback: finish, 'error-callback': () => finish(''), 'expired-callback': () => finish('') });
    } catch {
      finish('');
    }
  });
}
