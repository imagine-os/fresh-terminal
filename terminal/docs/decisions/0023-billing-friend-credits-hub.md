# 0023 — pass-through billing after $5, friend credits, and the hub at /hub

Date: 2026-09-29. Model: Opus 5.5. Prompt: Canon prompt 78 (Justin, 04:13:38 UTC, [message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790655218716499?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)). Canon: C-084 (billing), C-085 (friend credits), C-086 (hub). Builds on 0021 (free credits) and 0020 (domain, Clerk, D1).

## What Clerk Billing can do (read 2026-09-29, official pages only)

| Question | Answer | Source |
| --- | --- | --- |
| Subscriptions and plans | Yes: "Clerk Billing allows your customers to purchase recurring Subscriptions"; monthly or annual plans, per-seat, free trials, custom plans | https://clerk.com/docs/guides/billing/overview, https://clerk.com/billing |
| Usage or metered billing | **No.** "Does Clerk Billing support usage-based/metered billing today? Not yet, but usage-based billing is a top priority on our roadmap." Pricing page: "usage and per seat billing coming soon" | https://clerk.com/billing, https://clerk.com/pricing |
| One-off top-ups | No top-up product. Account credits exist (added by us in the Dashboard or with `POST /v1/users/{user_id}/billing/credits`) and are "applied toward future charges" such as a subscription renewal or upgrade; people cannot buy them | https://clerk.com/docs/guides/billing/account-credits, https://clerk.com/changelog/2026-06-30-account-credits |
| Needs a Stripe account | Yes. "Clerk Billing only uses Stripe for payment processing." Development instances can use Clerk's shared test gateway; production needs our own Stripe account, and a development Stripe account cannot be reused for production | https://clerk.com/docs/guides/billing/overview |
| Beta | No beta label on the overview, the billing page or the pricing page (checked for the word "beta", 2026-09-29) | same pages |
| Regions and currency | USD only. Not available in Brazil, India, Malaysia, Mexico, Singapore and Thailand; elsewhere it depends on Stripe. No tax/VAT, no refunds inside Clerk, no 3D Secure | https://clerk.com/docs/guides/billing/overview |
| Fees | 0.7% of billing volume to Clerk plus Stripe's 2.9% + $0.30: "All in 3.6% + $0.30" | https://clerk.com/billing, https://clerk.com/pricing |

## Can Clerk Billing do "pass-through after $5"? No

The requirement: after an account has used $5 of free usage it must add a payment method, and from then on it pays for its usage at cost plus our small fee. That is usage billing. Clerk Billing sells fixed-price subscriptions only; it cannot charge a variable amount per account, and its account credits only offset its own subscription charges. A "$10 prepaid plan" would be a monthly subscription, not a top-up.

## Recommendation (proposed; Justin decides)

**Stripe Checkout, one-time payments, as prepaid credit packs ($5, $10, $20, $50).** It is the smallest route that works today:

- We already meter every call in our own ledger (price = cost plus margin), so we do not need Stripe's metering. A paid Checkout session adds credit to the account, the same way a friend grant does.
- Fees: 2.9% + $0.30 per domestic card payment (https://stripe.com/pricing). One-time Checkout payments are not Stripe Billing volume, so the 0.7% Billing fee does not apply (https://stripe.com/billing/pricing counts subscriptions and invoices, and excludes one-off invoices). Cheaper than Clerk Billing by 0.7 points, and it can do what Clerk cannot.
- The Checkout session saves the card (`setup_future_usage=off_session`), so real pass-through (charge the saved card when the balance runs low) is a later, small step with no second sign-up.
- Stripe metered billing (Billing Meters) is the fallback if we ever want monthly invoices: 0.7% Billing plus card fees, and Stripe now points new usage integrations to Metronome (https://docs.stripe.com/billing/subscriptions/usage-based). More moving parts than we need.
- Clerk keeps doing sign-in. Clerk Billing can still sell a flat plan later if Justin wants one.

## Rules (built)

- **Credit limit** = min(grant, billing threshold). Grant = the $1 starter credit plus friend grants, invite codes and paid top-ups. Threshold = lifetime free usage before a payment method is needed, **$5 by default** (`accounts.billing_threshold_micro`). A credit raises the grant, and raises the threshold to at least the new grant, so a gift is always spendable.
- **The gate** is in the router's meter. Past the limit a paid call answers `402 payment_required` ("You have used your free usage. Adding a payment method is not wired yet; your key still works.") when the threshold is what binds, or `402 account_credits_exhausted` when the grant binds first. The account's `billing_state` moves `free` → `needs_payment`; a credit moves it back to `free`, a paid top-up to `active`. "Your key" calls go from the browser to OpenRouter and never reach the meter, so they are never blocked.
- **With today's $1 starter grant, free usage ends at $1, before the $5 threshold.** The threshold starts to bind when the starter grant is raised or an account gets credit. Making it $5 for everyone is one number (the `accounts.grant_micro` default, or a grant); Justin's call, because it is five times the cost per sign-up.
- **Daily caps** (C-080) apply while an account is on free usage; an `active` account spends its own money and is not capped.
- **Top up / add payment**: `POST /billing/checkout {amount_usd}` → a Stripe Checkout URL, or `501 not_wired` until both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are Worker secrets. `POST /billing/stripe/webhook` checks the `Stripe-Signature` (HMAC-SHA256, five-minute tolerance) and credits `checkout.session.completed` once per session id. The tray tile says "not wired yet" until `GET /credits` reports `billing.provider: stripe`. **Not tested against live Stripe.**

## Friend credits (C-085)

- **Admin** = a Clerk user id in the router var `ADMIN_USER_IDS`, or a verified email in the `ADMIN_EMAILS` secret (looked up through the Clerk Backend API, cached five minutes). Emails stay out of this public repo.
- `POST /admin/grant {email | user_id, amount_usd, note}` (up to $100, `ADMIN_GRANT_MAX_USD`). An email must belong to someone who has signed up; for anyone else, send an invite code.
- `POST /admin/invites {amount_usd, uses, note?, expires_days?, code?}` makes a code like `FT-7K2M-QX9P` (no 0/O/1/I/L). A signed-in friend redeems it once at `POST /credits/redeem {code}` (tray → Invite code). Used up: 410; already used by you: 409; unknown or switched off: 404.
- Every credit is a `credit_grants` row (account, amount, source, who granted it, note) and a `credit` entry on the account's ledger mirror (`ledger_entries`, id `srv_<grant>`, its own hash chain per account).
- Read back: `GET /admin/grants`, `/admin/invites`, `/admin/ledger`, `/admin/accounts`, `/admin/overview`; `POST /admin/invites/disable`, `POST /admin/account {email | user_id, billing_threshold_usd?, billing_state?}`.

## The hub (C-086)

- `https://freshterminal.ai/hub`, served by the site Worker. The page is a shell with nothing private in it. The content (`/hub/data/*.json`) and the session check (`/hub/api/session`) need `Authorization: Bearer <Clerk session>`; the site Worker asks the router's `/admin/whoami` over a service binding. No token: 401. Not an admin: 403. The data files are built by `scripts/build-hub.ts` only in the site deploy (`HUB_DATA=1`); the GitHub Pages build gets the shell and no data, because nothing guards Pages.
- Sections: every page and item with live links and status; the prompt and response library (every prompt word for word with what happened and its Slack link, the Canon, decision records and changelogs, searchable); the Canon; the wiki index; the plan as kanban; the credits panel; the secrets checklist (names, set or missing, from the deploy; never values).
- Void theme, square corners, 44 px targets, fluid type from 360 to 3840 px, keyboard reachable, `noindex` and `no-store`.

## Costs (C-070 certainty words)

- Stripe Checkout top-up: 2.9% + $0.30 each; $10 costs $0.59 (5.9%), $20 costs $0.88 (4.4%). **Sure.** With `margin_bp` at 0 in `rules.json` today, every top-up loses its card fee; a margin or a fee on top-ups is Justin's call.
- Clerk Billing, for comparison: 3.6% + $0.30. **Sure.**
- Hub, grants, invite codes: no new services; Worker requests and D1 rows inside the current Cloudflare plan. **Fairly sure.**
- Friend credit: at most the amount granted in provider cost (price is cost plus margin, so cost ≤ price). **Sure.**
- `hub-smoke` runs: no model calls (the 402 stops at the meter), Actions minutes free on a public repo. **Sure.**
