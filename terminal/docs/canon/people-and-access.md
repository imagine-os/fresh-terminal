# People and access

Written 2026-09-29. Names of secrets only. Never put a key value in this repo, in Slack, or anywhere else.

## People

- **Justin Massion** (Slack U0C318HCW86). Founder and owner. Decides everything here. His GitHub account is `jmassion`; his Cloudflare workers subdomain is `jmassion.workers.dev`. (2026-09-28)
- **Anu**. Built Company OS, the backend (`Playset-LLC/company-os`). Their handoff: new work lands on the `integration` branch and Justin reviews and merges. (2026-09-28)
- **Claude**, two routes into the same thread (2026-09-28):
  - The channel's Claude can reach GitHub repos in `imagine-os` only.
  - Justin's own Claude session uses his GitHub access. That's how Company OS was read.
  - Model: Opus 5.5 in Justin's threads since 2026-09-29 00:49 UTC (Fable 5.1 before that).

## Repos

| Repo | What | Who can reach it |
| --- | --- | --- |
| `imagine-os/fresh-terminal` | The new product. Push to `main`. | This channel's Claude, with push access (2026-09-28) |
| `imagine-os/between-gigs` | The old single-tenant hub. Archive, import source, design reference. Live site publishes from Sites, not GitHub, since 2026-09-27. | This channel's Claude |
| `Playset-LLC/company-os` | Company OS backend. Use the `integration` branch; `main` is stale. | Only through Justin's own GitHub access. This channel's route is blocked for the Playset-LLC org. The earlier guess `Playset-LLC/Playset-Company-OS` was the wrong name. (2026-09-28) |

## Secrets that exist (names only)

In `imagine-os/fresh-terminal` → Settings → Secrets and variables → Actions (https://github.com/imagine-os/fresh-terminal/settings/secrets/actions). Added by Justin 2026-09-29 00:53 UTC.

| Name | Used for |
| --- | --- |
| `OPENROUTER_API_KEY` | The router's key for AI models. Also copied to the Cloudflare Worker as a Worker secret by the deploy. |
| `CLOUDFLARE_API_TOKEN` | Deploys the router Worker. Made from the "Edit Cloudflare Workers" template, so it can only deploy workers. |
| `CLOUDFLARE_ACCOUNT_ID` | Which Cloudflare account to deploy to. Not secret in itself, kept with the others. |

Not set, optional: `OPENAI_API_KEY` (spoken replies), `GOOGLE_API_KEY` (Gemini Live). The repository variable `ROUTER_URL` is no longer used (2026-09-29).

A user's own OpenRouter key (bring-your-own mode) is stored only in that user's browser and never reaches us.

## Leaked-key note

- 2026-09-28 23:47 UTC: an OpenRouter key was pasted into the Slack thread. The channel is readable by everyone in the workspace, so the key was exposed.
- Claude used it once for a router smoke test (charges of 46 and 214 micro-dollars) and did not store it anywhere.
- Claude asked Justin to rotate it (23:48 and again 00:49 UTC, with the link). The key was rotated on 2026-09-29, and the new one went into the repository secret.
- The old key is compromised. Never reproduce it, never use it. See open question 10 about the Slack message that still shows it.
- Rule from then on: keys go in repository secrets, never in chat.
