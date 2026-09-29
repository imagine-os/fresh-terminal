# 0019 — the sign-in should match our style

Source: Justin, Slack, 2026-09-29 04:10:00 UTC ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790655000670529?thread_ts=1790634517.611669&cid=C0C2YAS5TL5), ts 1790655000.670529). The part this file covers, verbatim:

> By the way, signin system should match style.

The rest of that message (the correspondence review and the mobile start) is Canon prompt 77 and C-080 / C-081. The coordinator turned this line into a brief for the infra session (Opus 5.5): theme Clerk through `appearance` from our design tokens (square corners, our fonts with mono for meta text, background and foreground from the theme, the accent on the primary button, no heavy card shadow, follow Void, Blank Page and Glass Window), hide or minimise what we control, keep visible focus and 44px targets, before and after screenshots at 390, 1280 and 3840, and list the Clerk settings Justin still has to change.

## Reply summary

- Shipped as Canon C-084, decision 0023, changelog 0013 (Opus 5.5).
- `app/src/auth/clerkAppearance.ts` reads the active theme's tokens off the shell and gives Clerk plain values; the sign-in, sign-up and user menu now follow the theme on screen.
- "Secured by Clerk" and the "Development mode" notice stay: the first is a Clerk plan setting, the second goes away only with a production instance.
- Still Justin's, in the Clerk dashboard: turn off **username** and **phone number** as required sign-up fields (User & authentication), and, if wanted, remove the Clerk branding (Settings → Branding; free on the development instance, a paid plan on production).
