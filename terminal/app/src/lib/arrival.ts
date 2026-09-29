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
