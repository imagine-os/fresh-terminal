import { useCallback, useEffect, useState } from 'react';

/** Tiny history router: "/" and "/box/:id", base-aware for GitHub Pages. */
export type Route =
  | { name: 'landing' }
  | { name: 'box'; id: string }
  | { name: 'new-box'; theme: string | null; skin?: string | null; from?: string | null }
  | { name: 'canvas' }
  | { name: 'plan' }
  | { name: 'actions' }
  | { name: 'page'; id: string }
  | { name: 'play'; id: string; step: number | null };

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

function parse(pathname: string, search: string): Route {
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  if (/^\/canvas\/?$/.test(path)) {
    return { name: 'canvas' };
  }
  if (/^\/plan\/?$/.test(path)) {
    return { name: 'plan' };
  }
  if (/^\/actions\/?$/.test(path)) {
    return { name: 'actions' };
  }
  const page = /^\/page\/([^/]+)\/?$/.exec(path);
  if (page !== null && page[1]) {
    return { name: 'page', id: decodeURIComponent(page[1]) };
  }
  const play = /^\/box\/([^/]+)\/play\/?$/.exec(path);
  if (play !== null && play[1]) {
    const raw = new URLSearchParams(search).get('step');
    const step = raw === null || raw === '' || Number.isNaN(Number(raw)) ? null : Math.max(0, Math.floor(Number(raw)));
    return { name: 'play', id: decodeURIComponent(play[1]), step };
  }
  if (/^\/box\/new\/?$/.test(path)) {
    const params = new URLSearchParams(search);
    return { name: 'new-box', theme: params.get('theme'), skin: params.get('skin'), from: params.get('from') };
  }
  const match = /^\/box\/([^/]+)\/?$/.exec(path);
  if (match !== null && match[1]) {
    return { name: 'box', id: decodeURIComponent(match[1]) };
  }
  return { name: 'landing' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'box':
      return `${base}/box/${encodeURIComponent(route.id)}`;
    case 'new-box':
      return `${base}/box/new${route.theme ? `?theme=${encodeURIComponent(route.theme)}` : ''}`;
    case 'canvas':
      return `${base}/canvas`;
    case 'plan':
      return `${base}/plan`;
    case 'actions':
      return `${base}/actions`;
    case 'page':
      return `${base}/page/${encodeURIComponent(route.id)}`;
    case 'play':
      return `${base}/box/${encodeURIComponent(route.id)}/play${route.step !== null ? `?step=${route.step}` : ''}`;
    default:
      return `${base}/`;
  }
}

export function routeForPath(path: string): Route {
  return parse(`${base}${path}`, '');
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? { name: 'landing' } : parse(window.location.pathname, window.location.search),
  );

  useEffect(() => {
    const onPop = () => setRoute(parse(window.location.pathname, window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Route) => {
    window.history.pushState(null, '', hrefFor(next));
    setRoute(next);
  }, []);

  return [route, navigate];
}
