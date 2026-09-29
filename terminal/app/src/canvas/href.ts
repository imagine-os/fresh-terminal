/** Relative hrefs live under the app base (GitHub Pages sets a sub-path). */
export function resolveHref(href: string): string {
  if (/^https?:\/\//.test(href) || href.startsWith('/')) {
    return href;
  }
  return `${import.meta.env.BASE_URL}${href}`;
}
