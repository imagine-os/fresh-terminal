# 0003 — auth and hosting

Source: Justin, same thread, 2026-09-28. Verbatim:

> what is the best Auth? clerk? Also can we use github pages or actions as hosting? Less is more and in theory we can make it easy to move out of github hosting when needed.

## Reply summary

Hosting: the static app deploys to GitHub Pages via GitHub Actions (`.github/workflows/pages.yml`, SPA fallback `404.html`, `VITE_BASE=/fresh-terminal/`). Pages must be set to the "GitHub Actions" source once by hand. The router is Hono, so the identical code runs as a Cloudflare Worker (`wrangler.toml`) or a Node process; moving out is DNS plus one redeploy. Auth: Clerk chosen, not wired in pass one; the seam exists (`app/src/auth/`: `AuthProvider` interface, `AnonymousAuth` in use, `ClerkAuth` stub). Clerk tokens are OIDC and SpacetimeDB accepts OIDC identity tokens. Decisions: `0006-hosting.md`, `0007-auth.md`.
