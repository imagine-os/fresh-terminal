/**
 * Links from the sales pages (/about, /pricing, /faq) open the app with an
 * intent (2026-09-29): ?signin=1 opens sign-in, ?open=key opens Settings on the
 * key. The parameter is removed from the address bar once read.
 */
export type ArrivalIntent = 'signin' | 'key';

export function arrivalIntent(search: string): { intent: ArrivalIntent | null; rest: string } {
  const params = new URLSearchParams(search);
  let intent: ArrivalIntent | null = null;
  if (params.get('signin') === '1') intent = 'signin';
  else if (params.get('open') === 'key') intent = 'key';
  params.delete('signin');
  if (params.get('open') === 'key') params.delete('open');
  const rest = params.toString();
  return { intent, rest: rest ? `?${rest}` : '' };
}

/** Reads the intent once and clears it from the URL (keeps path, other params and hash). */
export function takeArrivalIntent(want: ArrivalIntent): boolean {
  if (typeof window === 'undefined') return false;
  const { intent, rest } = arrivalIntent(window.location.search);
  if (intent !== want) return false;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest}${window.location.hash}`);
  return true;
}

/** ?open=key: open Settings once the app has mounted its listener. */
export function handleKeyArrival(): void {
  if (!takeArrivalIntent('key')) return;
  window.setTimeout(() => window.dispatchEvent(new CustomEvent('ft:open-settings')), 400);
}

const REF_KEY = 'ft.ref';

/**
 * ?ref=CODE (C-107, referrals): keep the code in this browser until the person signs in, then
 * the app claims it once (POST /me/referral) and forgets it. The parameter leaves the address bar.
 */
export function captureReferral(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('ref');
  if (!code) return null;
  params.delete('ref');
  const rest = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  if (!/^[A-Za-z0-9-]{6,16}$/.test(code)) return null;
  try {
    window.localStorage.setItem(REF_KEY, code.toUpperCase());
  } catch {
    // storage blocked: the link still opened the app
  }
  return code.toUpperCase();
}

export function storedReferral(): string | null {
  try {
    return window.localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

export function forgetReferral(): void {
  try {
    window.localStorage.removeItem(REF_KEY);
  } catch {
    // nothing to forget
  }
}
