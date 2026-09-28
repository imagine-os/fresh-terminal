# 0004 — pass-through billing and the simplest chain

Source: Justin, same thread, 2026-09-28. Verbatim:

> integrate simple clean dialect for pass through billing now. This should be at the core of it all, all transactions including micro transactions all need to be handled cleanly. We also can make this simplest cleanest blockchain, from the perspective that each new user can agree to be on chain. simple easy. clean obvious. no extra complication needed

## Reply summary

A ledger is at the core: `entry` rows with integer micro-dollars (never floats), one `charge` per model call from OpenRouter's `usage` (`usage.include: true`; a price table is the fallback), a margin in basis points from the route rule (default 0 = pass-through). Every entry is hash-linked to the owner's previous entry (`hash = sha256(prev_hash + canonical JSON)`); owners who opt in ("on chain") also link into a shared chain. Anyone can verify with `pnpm -C terminal verify:chain` or the dev panel's "Verify chain". No tokens, wallets or consensus: it is an append-only, verifiable ledger. A billing dialect with fixed words (charge, credit, balance, price, cost, margin, settle, pass-through, on chain) has a parser and tests. The top bar shows "$x used" live. Stripe settlement is not wired. Decision: `0008-ledger.md`.
