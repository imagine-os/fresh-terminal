# 0026 — credits first with a 10% markup, pay what you want, the $5 welcome credit once per person, referrals

Date: 2026-09-29. Model: Opus 5.5 (research, design, build, tests, docs). Prompts: Canon 95 (ts 1790660079.788909), 98 (ts 1790661612.925139), 99 (ts 1790661727.324539). Canon C-103, C-105, C-106, C-107 (C-104, the hub pictures, shipped in the same pass).

## The money model

- **Credits first** (C-103). People buy credits before they spend them, through Clerk Billing refill plans that renew automatically (C-093). Charging a card afterwards is not the model.
- **Markup** (C-103, C-105). Model spend past the starter kit costs model cost plus the account's markup: 10% by default (`margin_bp` 1000 in `router/rules.json`), anything from 5% to 100% by the person's choice (`accounts.markup_bp`, Settings → Your markup). The starter kit's spend and the signed-out trial run at model cost; a call that crosses the $5 line is split. Your key never reaches the router, so it never has a markup. Credit lines and storage have none.
- **Why after the starter kit:** the $5 is a gift; marking it up only shrinks the gift. The markup on bought credits is what pays the card fees Justin named.
- **Where it shows:** each ledger charge line holds cost and price (the markup is price minus cost, inside the hash chain); the reply line ("$0.0110 (incl. $0.0010 markup, 10%)"); the counter tooltip; `GET /credits` → `markup`; `GET /health` → `credits.markup`, `credits.purchase`; the hub's private totals (a Markup column) and the average markup across accounts.

## The $5 welcome credit, once per person (C-106)

| Check | Rule | What the person sees when it fails |
| --- | --- | --- |
| Email | verified in Clerk (Backend API) | "The $5 welcome credit is added once your email is verified." (retried on the next request) |
| Disposable | not a listed throwaway domain | "Disposable email addresses do not get the $5 welcome credit." |
| Aliases | the normalised email (lowercase, no `+tag`, no Gmail dots) is not claimed | "This device or email already used the $5 welcome credit." |
| Device | the signed browser device is not claimed by another account | same line |
| Network | at most 5 welcome credits per /24 (or /48) per UTC day | "Too many new accounts from this network today, so the $5 welcome credit was not added." |

The first account to claim an email or device keeps it (`welcome_claims`). A blocked sign-up keeps its account. The reason code is stored internally (`accounts.starter_reason`) and appears only as counts in the hub. Accounts from before the rule are `legacy` and keep their credit.

## Referrals (C-107)

| | Default |
| --- | --- |
| Link | `freshterminal.ai/?ref=CODE` for every account (8 letters and digits) |
| Friend | $5 extra ($10 in all), if a first-time sign-up under C-106, claimed within 7 days |
| Referrer | $5 once the friend has spent their free $5 or bought any credits, whichever comes first |
| Ongoing | 50% of our markup on the friend's paid usage for 12 months, as credit (paid out once it reaches 1¢) |
| Cap | 50 rewards per referrer per UTC month |
| Self-referral | refused: same account, same normalised email, a device the referrer's welcome credit used; same payment method once payments are wired |
| Refund | the friend's refunded payment reverses the reward and paid shares |
| Cash-out | not wired yet |

Admin invite codes (C-087) stay for Justin; one field takes either kind of code.

## The numbers for a $10 refill (to verify against live pricing)

| | |
| --- | --- |
| The person pays | $10.00 and gets $10.00 of credit |
| Model use it buys at 10% | $9.09 |
| Our markup | $0.91 |
| Stripe (2.9% + $0.30) | $0.59 |
| Clerk Billing (0.7%) | $0.07 |
| Left before hosting | about $0.25 (2.5%) |
| OpenRouter's card fee on buying its credit (5.5% when last checked, not re-verified) | about $0.50, which would leave about −$0.25 |
| Break-even markup with all three | about 13% |

Open question 20 records it.

## Not done here

- Buying credits is still not wired (the Clerk plans and `CLERK_WEBHOOK_SIGNING_SECRET` are Justin's to create). Refund events have not been seen from live Clerk or Stripe.
- A refunded top-up does not yet take the refunded credit back off the payer (only the referral is reversed).
