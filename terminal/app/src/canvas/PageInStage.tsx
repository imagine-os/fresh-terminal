import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { resolveHref } from './Canvas';

/**
 * Shows one of our own static pages inside the stage without an iframe: the
 * HTML is fetched (same origin only) and rendered into a shadow root so its
 * styles stay isolated. Scripts do not run here; "full screen" opens the real page.
 * Cross-origin or in-app refs just show the link.
 */
export function PageInStage({ href }: { href: string }) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'external' | 'error'>('idle');

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    if (href.startsWith('route:') || href.startsWith('box:') || /^https?:\/\//.test(href)) {
      setState('external');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetch(resolveHref(href))
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((html) => {
        if (cancelled) {
          return;
        }
        const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
        const document = new DOMParser().parseFromString(html, 'text/html');
        for (const script of Array.from(document.querySelectorAll('script'))) {
          script.remove();
        }
        root.innerHTML = '';
        const wrapper = window.document.createElement('div');
        wrapper.style.cssText = 'all: initial; display: block; contain: content; max-height: 60vh; overflow: auto; border-radius: 0.5rem;';
        for (const style of Array.from(document.querySelectorAll('style'))) {
          wrapper.appendChild(style.cloneNode(true));
        }
        const body = window.document.createElement('div');
        body.innerHTML = document.body.innerHTML;
        wrapper.appendChild(body);
        root.appendChild(wrapper);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [href]);

  return (
    <div className="page-in-stage" data-state={state}>
      {state === 'external' ? <p className="canvas-meta">{href}</p> : null}
      {state === 'error' ? <p className="canvas-meta">{t('canvas.loadFailed')}</p> : null}
      <div ref={hostRef} />
    </div>
  );
}
