import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// VITE_BASE is "/fresh-terminal/" on GitHub Pages and "/" everywhere else.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  root: here,
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': resolve(here, '../shared/src'),
      '@docs': resolve(here, '../docs'),
      '@router': resolve(here, '../router'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [resolve(here, '..')] },
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: { port: 4173 },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
  },
});
