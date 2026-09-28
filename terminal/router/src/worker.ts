import { createApp, type RouterBindings } from './app';

/**
 * Cloudflare Worker entry. Secrets come from `wrangler secret put OPENROUTER_API_KEY`.
 * Moving out later means: point DNS somewhere else and run node.ts there.
 */
const app = createApp({ bindings: (env) => (env ?? {}) as RouterBindings });

export default app;
