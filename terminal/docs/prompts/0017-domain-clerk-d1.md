# 0017 — freshterminal.ai, Clerk sign-in and D1 accounts

Source: Justin, Slack, 2026-09-29 02:28:23 UTC ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790648903521149?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), ts 1790648903.521149). Verbatim:

> i already did cloudflare clerk,  I dont need open ai. are we gonna use livekit or openrouter for voice? benchmarks should show who has best voice at the moment for model, livekit looks cool, eleven labs popular but expensive, google realtime and openairealtime just shipped recently. so look up very rcent best practices, but dont let that slow you down from updating the prompt for my browser ai

Context: the Cloudflare token scopes (Zone DNS Edit, Zone Read, Account D1 Edit, all zones) and the Clerk app with `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` were the two open items from Canon C-046 and C-048. "i already did cloudflare clerk" unblocked the wiring decided there (C-045 to C-048).

## Reply summary

- Voice was answered in Slack at 02:29:54 UTC ([reply](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790648994220409?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)): LiveKit is the pipe and agent runtime, OpenRouter carries text only; Gemini Live over LiveKit is the default proposal, OpenAI Realtime becomes optional.
- The updated browser-AI prompt (Cloudflare, Clerk and OpenAI removed) was posted at 02:29:27 UTC.
- This pass wires what the message unblocked (Opus 5.5): the checks in `.github/workflows/infra-verify.yml`, the app on freshterminal.ai (`terminal/site`, `site-deploy.yml`), the router on api.freshterminal.ai with D1 and Clerk verification (`router-deploy.yml`), and anonymous-first sign-in in the app. See decision 0020 and changelog 0007.
