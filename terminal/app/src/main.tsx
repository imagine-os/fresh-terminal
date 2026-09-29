import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { handleKeyArrival } from './lib/arrival';
import './styles/app.css';

// A deploy replaces hashed chunks under open tabs; a lazy piece then fails to
// load and a turn used to die in silence (C-079). Reload once for the new build.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    if (sessionStorage.getItem('ft:reloaded') === null) {
      sessionStorage.setItem('ft:reloaded', String(Date.now()));
      window.location.reload();
      return;
    }
  } catch {
    // storage blocked: fall through to the fault line
  }
  window.dispatchEvent(new CustomEvent('ft:fault', { detail: { message: 'a part of this build did not load; reload the page' } }));
});
// Anything else that escapes becomes a visible line in the current box.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { message?: string } | string | undefined;
  const message = typeof reason === 'string' ? reason : reason?.message ?? 'unknown error';
  window.dispatchEvent(new CustomEvent('ft:fault', { detail: { message } }));
});
window.addEventListener('error', (event) => {
  if (event.message) window.dispatchEvent(new CustomEvent('ft:fault', { detail: { message: event.message } }));
});

const root = document.getElementById('root');
if (root === null) {
  throw new Error('#root missing');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// "Use your key" on /pricing links to ?open=key (sales site, 2026-09-29).
handleKeyArrival();
