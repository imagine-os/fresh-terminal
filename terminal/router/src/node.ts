import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { createApp } from './app';
import { bindingsFromProcessEnv, loadDotEnv, routerDir } from './env';

loadDotEnv(resolve(routerDir(), '.env'));

const port = Number(process.env.PORT ?? 8787);
const app = createApp({ bindings: () => bindingsFromProcessEnv() });

serve({ fetch: app.fetch, port }, (info) => {
  const keyConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  console.log(`router listening on http://localhost:${info.port}`);
  console.log(keyConfigured ? 'OPENROUTER_API_KEY: set' : 'OPENROUTER_API_KEY: not set (POST /route returns 503)');
});
