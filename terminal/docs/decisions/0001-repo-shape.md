# 0001 — repo shape

- The root holds exactly one instruction (`README.md`) and one folder (`terminal/`), plus what tooling requires: `.gitignore`, `.github/workflows/`, a root `package.json` that only proxies scripts, and `pnpm-workspace.yaml` naming `terminal` as the single package.
- One package inside `terminal/` with `app/`, `module/`, `router/`, `shared/`, `docs/`, `scripts/`. One `node_modules`, one vitest config, one TypeScript version. Sub-areas have their own `tsconfig.json` because they target different runtimes (browser, Node, SpacetimeDB WASM).
- Boxes per user: every visitor gets a box on first visit under an anonymous identity; more boxes on demand. A box is the unit of transcript, presence and billing.
- Push to `main`. Git is the record (prompts, decisions, changelog land in the same push as the code), not the workflow: no PR ceremony in pass 1, CI runs typecheck/test/build on push.
- Numbered doc files are append-only.
