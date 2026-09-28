# 0006 — hosting: GitHub Pages + Actions, Worker-ready router

- The static app builds with Vite and deploys to GitHub Pages through `.github/workflows/pages.yml` on push to `main` (`upload-pages-artifact` + `deploy-pages`). `VITE_BASE=/fresh-terminal/` sets the base path; `scripts/spa-fallback.mjs` copies `index.html` to `404.html` and writes `.nojekyll` so `/box/:id` resolves.
- Pages must be switched to the "GitHub Actions" source once in repository settings; the repo never touches settings through the API.
- `VITE_ROUTER_URL` (repository variable `ROUTER_URL` in the workflow) points the Pages build at a deployed router. Without it the app still works locally (local commands, honest system lines).
- The router is Hono: `router/src/node.ts` for Node, `router/src/worker.ts` + `wrangler.toml` for Cloudflare Workers, same `createApp`. Move-out plan: point DNS elsewhere and run `node router/dist/node.mjs` (a single bundled file) or redeploy the Worker.
