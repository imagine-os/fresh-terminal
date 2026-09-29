# 0021 — free credits, enforced by the router

Date: 2026-09-29. Model: Opus 5.5. Prompt: Canon prompt 67 (Justin, 03:14:22 UTC, [message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790651662236069?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)). Canon: C-074. Builds on 0020.

## Rules

- **The router enforces; the browser only shows.** Paid endpoints (`POST /route`, `/tag`, `/skin/*`, `/realtime/session`) pass through a meter (`router/src/credits.ts`). The payer is a signed-in account (Clerk session) or an anonymous device. No payer: `401 device_required`.
- **Anonymous device ids** come from `POST /credits/device`: `fd1_<uuid>.<HMAC-SHA256>` signed with the Worker secret `DEVICE_SIGNING_KEY` (created once by `router-deploy`, never printed, kept across deploys). The row in D1 (`anon_devices`) holds the grant, spend, provider cost, soft prompts used, and salted SHA-256 hashes of the IP and its network (/24 for IPv4, /48 for IPv6). The browser keeps the token in localStorage and sends it as `X-FT-Device`.
- **Grant and prompts (anonymous):** 25¢ per device. When it runs out, the next call goes through with 5¢ more (plus whatever tops it back to 1¢) and the response header `X-FT-Soft-Prompt: 1/2`; the app adds a system line "Your free credits are used up; this one was on us (1 of 2). Sign in to keep going ... or use your own key (K)". The same once more (`2/2`). After that, paid calls answer `402 sign_in_required`.
- **Signed in:** $1 per account (column default in `0002_credits.sql`), then `402 account_credits_exhausted` (buying more is not wired yet; own key still works). Browser boxes move to D1 on the first sign-in through the existing sync.
- **Abuse limits:** at most 3 new devices per IP and 10 per network per 24 h get a grant; past that a device is issued with no grant and its prompts used, so it goes straight to "sign in to keep going". Paid calls are rate-limited to 30 per minute per IP and 120 per minute per network (Workers Rate Limiting bindings `RL_IP`, `RL_NET`; per Cloudflare location, a brake rather than accounting). A global cap of $2 of provider cost per UTC day across all anonymous devices (`spend_daily`); past it every anonymous paid call answers `402 daily_cap`.
- **One call's worst case (anonymous):** default models only (`403 model_needs_sign_in` for an explicit model), no escalation to the bigger model, request body at most 60 KB (`413 too_large`), at least 1¢ left to start. Charged after the call from its own ledger entry (the SSE `done` entry for `/route`, `entries` or `cost_micro` for JSON endpoints).
- **Own key (BYOK) is never blocked:** those chat calls go from the browser to OpenRouter and never reach the meter. The chip tagger still calls our `/tag`; out of credits it answers 402 and chips stay local, which never blocks typing.
- **Turnstile (added 03:45 UTC):** `infra-verify` showed the token can read Turnstile widgets (0 existed). `router-deploy` now finds or creates the invisible widget `fresh-terminal` (domains freshterminal.ai, www, imagine-os.github.io, the app's workers.dev) and pushes `TURNSTILE_SECRET` and `TURNSTILE_SITEKEY` to the Worker. When both are set, `POST /credits/device` needs a token that passes Cloudflare's siteverify (`403 turnstile_failed` otherwise), and `GET /credits` reports `turnstile: on` with the site key. The app runs the invisible widget once before asking for a device. If the token cannot create widgets, the deploy log says so and credits run without it. **Result 2026-09-29 03:48 UTC (router-deploy run 36518698920): "Turnstile widget: not created (Authentication error)"**: the token can read widgets but not create them. Not switched on. Justin adds Account → Turnstile → Edit to the token (https://dash.cloudflare.com/profile/api-tokens), then any router deploy switches it on.
- **Numbers are Worker vars**, so they change without code: `ANON_GRANT_MICRO`, `ANON_CHANCE_MICRO`, `ANON_CHANCES`, `ANON_DAILY_COST_CAP_MICRO`, `MIN_BALANCE_MICRO`, `DEVICES_PER_IP_DAY`, `DEVICES_PER_NET_DAY`, `ANON_MAX_BODY_BYTES`. `GET /health` reports the numbers in force.

## Surfaces

- `GET /credits` → `{ label, signed_in, mode: account|device|none, granted_micro, spent_micro, remaining_micro, soft_prompts_left, sign_in_required, limited, daily_cap_reached, turnstile }`.
- `POST /credits/device` → `{ device, credits }` (returns the same device when a valid one is sent).
- App: `routerFetch()` (`app/src/lib/routerFetch.ts`) adds the device id and the Clerk token to every router call; `useCredits()` (`app/src/credits`) gives the tray the same status, the last soft prompt and the last credits error.

## Names

- What people see: the router-paid mode is **free usage** (label `free usage`, or `free usage · signed in`); bring-your-own stays **your key**. Justin, 2026-09-29 ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790652625835259?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)). Internal ids (`ours`, `own`) are unchanged. Applied to the credits labels, the soft prompts and paywall lines, the settings panel and the top bar balance.

## Cost estimates (C-070 certainty words)

- One ordinary chat turn signed out: about 0.6¢ (measured live 2026-09-29, "Say hello in five words", Haiku 4.5 with the box snapshot and Jev routing: $0.0060). **Fairly sure.** So 25¢ is about 40 turns.
- Most one anonymous device can cost us: 25¢ + 2 × about 6¢ = about 37¢, plus at most one call's overshoot (about 4¢ worst case at 60 KB in, default models, one tool retry). **Fairly sure.**
- Most one IP can cost per day: 3 devices × 37¢ ≈ $1.11; one network ≈ $3.70. Both are also inside the global cap. **Sure** for the rule; the IP count is only as good as the IP (VPNs and mobile carriers share and rotate them).
- Most all anonymous use can cost per day: $2 plus the calls already running when the cap is reached (each ≤ 4¢). About $60 a month at the very most. **Sure** for the cap; **rough guess** for how quickly real traffic reaches it.
- Signed-in: $1 per account; on the Clerk development instance at most 100 accounts, so at most $100 in total. **Sure.** A production instance needs its own daily cap for accounts (not built).
