# 0009 — two ways to pay

Source: Justin, Slack, 2026-09-28. Verbatim:

> consider 2 simple options for users. either use ours and we do easy pass through billing, or bring their own key. Simple.

## Reply summary

Settings (top bar key icon, shortcut `K`) offers exactly two options. **Use Fresh Terminal's key** (default): calls go through our router; the ledger charges pass-through cost plus the route rule's margin. **Bring your own OpenRouter key**: the key is stored only in the browser's localStorage and never sent to our router; calls go straight from the browser to OpenRouter (CORS allowed, `HTTP-Referer` and `X-Title` sent); the ledger still records each call with price = cost and margin 0, so balances and the hash chain stay complete. A clear "Delete my key" button removes it. Tests cover the browser-direct path with a fake fetch. Decision: `decisions/0012-two-ways-to-pay.md`. No key of any kind is in the repo.
