import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(here, 'shared/src'),
      '@docs': resolve(here, 'docs'),
      '@router': resolve(here, 'router'),
    },
  },
  test: {
    include: ['shared/**/*.test.ts', 'router/**/*.test.ts', 'app/**/*.test.ts', 'app/**/*.test.tsx', 'scripts/**/*.test.ts', 'site/**/*.test.ts'],
    environment: 'node',
  },
});
