// Bundles src/main.js (three.js tree-shaken) into ../../app/public/pages/koi.js
import { build, context } from 'esbuild';
const opts = {
  entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: ['es2020'],
  outfile: new URL('../../app/public/pages/koi.js', import.meta.url).pathname,
  legalComments: 'eof', logLevel: 'info',
};
if (process.argv.includes('--watch')) { const c = await context(opts); await c.watch(); } else { await build(opts); }
