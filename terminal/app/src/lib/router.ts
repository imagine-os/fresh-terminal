import { useCallback, useEffect, useState } from 'react';

/** Tiny history router: "/" and "/box/:id", base-aware for GitHub Pages. */
export type Route =
  | { name: 'landing' }
  | { name: 'box'; id: string }
  | { name: 'new-box'; theme: string | null }
  | { name: 'canvas' }
  | { name: 'plan' };

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

function parse(pathname: string, search: string): Route {
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  if (/^\/canvas\/?$/.test(path)) {
    return { name: 'canvas' };
  }
  if (/^\/plan\/?$/.test(path)) {
    return { name: 'plan' };
  }
  if (/^\/box\/new\/?$/.test(path)) {
    return { name: 'new-box', theme: new URLSearchParams(search).get('theme') };
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
