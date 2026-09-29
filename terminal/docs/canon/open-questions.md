# Open questions

Things not decided yet. Written 2026-09-29. When one is decided, move it to [decisions.md](decisions.md) with a date and delete it here.

1. ~~**Domain: freshterminal.ai or .net?**~~ Decided 2026-09-29: freshterminal.ai, bought on Cloudflare for 2 years. See C-045 in [decisions.md](decisions.md).
2. **Final product name.** Justin doesn't like "terminal" but accepts it for now (2026-09-28 23:02). saything.app was suggested as the plain future name (23:06). Other free ideas then: typeandgo.app, plainwords.app, blinkline.app, plainbox.app. The name is one constant, so a rename is cheap.
3. **Importing old repos, projects and data.** Justin: "Which we will discuss further later" (2026-09-28 22:28). Not started. between-gigs is the first import source.
4. **When to connect Company OS.** It is the chosen system of record, but fresh-terminal doesn't talk to it yet. Open: when, and how the live layer and Postgres split the work. Note: Company OS lives in the Playset-LLC org, which this channel can't reach; Justin's own GitHub access can.
5. **Clerk wiring.** Clerk is chosen (2026-09-28). 2026-09-29: wiring decided (development instance keys first, C-048). Still open: waiting on Justin to create the Clerk app and add the two key secrets, and whether to keep a later move to Better Auth. It unlocks saving boxes, Stripe and Jev permission checks.
6. **Stripe.** How and when users pay for their balance. Not wired.
7. **Gemini audio.** Gemini Live has a token flow but no microphone capture or playback. Open: whether to finish it, and whether to add a `GOOGLE_API_KEY`.
8. **OpenAI key for spoken replies.** Optional. Without it, voice uses free browser speech and replies are text. Add `OPENAI_API_KEY` as a repository secret only if Justin wants the assistant to talk back in real time (2026-09-29 00:49).
9. **SpacetimeDB publishing.** Row-level security per tenant and subscription limits were not confirmed (2026-09-28). 2026-09-29: account data goes to Cloudflare D1 first (C-047), so publishing waits for multiplayer. Open: SpacetimeDB sign-in, or Cloudflare Durable Objects instead (C-049).
10. **The old key's message in Slack.** The OpenRouter key pasted at 2026-09-28 23:47 UTC is still visible in the thread. It has been rotated, so it should be dead. Open: confirm at https://openrouter.ai/settings/keys that the old key is deleted, and whether to delete the Slack message.
11. **between-gigs.com sync.** Fresh Terminal is on GitHub but not on the live site until Sites syncs (2026-09-29). Open: who runs that sync and when.
12. **When Fresh Terminal replaces Slack and Claude Tag for Justin's own work.** Raised 2026-09-29 01:45 UTC: "we can do both until i no longer need slack and claude tag here and am using our own freshterminal system instead". For now both run side by side.
13. **SpacetimeDB token.** (2026-09-29 02:07 UTC, C-050) Waiting on Justin: run `spacetime login`, then `spacetime login show --token`, and save it as the Actions secret `SPACETIMEDB_TOKEN`. Open with it: publish SpacetimeDB now (C-050) or keep account data in D1 first (C-047).
14. **The proposals from 02:07–02:11 UTC.** Media in R2 (C-051), streamed browsers (C-052), the integration ladder and what we expose (C-053), recipes (C-054). Answered in Slack; Justin has not decided.
