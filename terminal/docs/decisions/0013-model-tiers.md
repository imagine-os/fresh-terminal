# 0013 — model tiers (verified against openrouter.ai/api/v1/models, 2026-09-28)

| tier | kind | model | price (per 1M in / out) | use |
| --- | --- | --- | --- | --- |
| fast | chat | `anthropic/claude-haiku-4.5` | $1 / $5 | answers the user; ~1.2 s to first token in the smoke test |
| careful | chat | `anthropic/claude-haiku-4.5` | $1 / $5 | same until per-tier models are confirmed |
| jev | decisions | `typesafe/jev-1.13` | $0.042 / $0 | intent → tier routing (Choice), permission yes/no (noul), "is this a pass" scores |
| tagger | tagger | `google/gemini-2.5-flash-lite` (alt `openai/gpt-4.1-nano`) | $0.10 / $0.40 | chips as JSON on keystroke pause, dev toggle |

Explicit per-request `model` allowlist (chat tiers plus `allowed_models`): `anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-4.5`, `anthropic/claude-opus-5`, `anthropic/claude-fable-5.1`, `openai/gpt-4o-mini`, `openrouter/auto`.

## Jev

- Exists on OpenRouter as `typesafe/jev-1.13` (alias `~typesafe/jev-latest`; `typesafe/jev-router` is a separate routing product). Modality `text -> decisions`; it returns typed decisions, never prose, and does not take `response_format`.
- Reached through the Decisions API, not chat completions: `POST https://openrouter.ai/api/alpha/decisions` with `{ model, state, questions }`. Question types: `noul` (probability true, with `criteria.true/false`), `choice` (`criteria: { option: description }` → `choice`, `confidence`, `probabilities`), `score` (`criteria: [rungs]` → `score`, `probabilities`). Response carries `usage.cost`.
- `router/src/jev.ts`: `decide()` (never throws; null on any failure), `routeIntent()` (Choice over the route table's intents, confidence floor 0.35, rules-only fallback), `needsOwner()` (noul permission check). The pending/501 state is gone; `OPENROUTER_JEV_MODEL` overrides the model, `ROUTER_USE_JEV=false` disables the call.
- Cost: the routing call's `usage.cost` is folded into the same call's `entry.cost_micro`; the `meta` and `done` events carry `routing` (intent, source `jev|rules`, confidence, model, cost).

## Tagger

- `POST /tag { text }` → `{ chips, model, ok, cost_micro, ref }`. JSON-schema response (`response_format: json_schema`, strict), temperature 0, chips validated by zod and checked against exact offsets before they are returned.
- The app's local heuristic tagger stays the default. The dev panel toggle "Model tagger" calls `/tag` 600 ms after the last keystroke and merges results (local chips win on overlap).

## Prices

`router/prices.json` now holds the per-token prices from the models API for all tier and allowlisted models (used only when OpenRouter omits `usage.cost`).
