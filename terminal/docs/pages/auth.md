# Sign-in and the account window (Clerk)

Written 2026-09-29 (C-099, Opus 5.5). Builds on decision 0023 (C-084, Clerk in our look) and decision 0020 (C-065, Clerk anonymous-first). Live: https://freshterminal.ai, header **Sign in**; signed in, the avatar in the top bar opens the menu and **Manage account** opens the account window.

## What it is

- **Sign-in modal** (`SignIn`, `SignUp`): opened by the header button, `?signin=1`, the `auth.signIn` action, and the hub's sign-in button. One column.
- **Account window** (`UserProfile`): opened from the avatar (`UserButton` → Manage account) and by the `billing.open` action (Billing tab, C-093). A nav (Profile, Security, Billing) next to a page. On phones Clerk folds the nav into an "Account" menu button.
- **User menu** (`UserButton` popover): Manage account, Sign out.

## Files

- `app/src/auth/clerkAppearance.ts`: the one `appearance` object, built from the theme on screen. Global elements (square corners, our fonts and colours, 44px targets, focus) plus per-component sizes: `signIn` / `signUp` get `AUTH_CARD` (`CARD_WIDTH`), `userProfile` / `organizationProfile` get `PROFILE_ELEMENTS`.
- `app/src/auth/Account.tsx`: `ClerkProvider appearance`, `openSignIn({ appearance })`, `openUserProfile()`.
- `app/src/shell/AccountButton.tsx`: Sign in button, sync dot, `UserButton`.

## Sizes (2026-09-29, C-099)

| Surface | Width | Height |
| --- | --- | --- |
| Sign-in / sign-up | `min(100vw - 2rem, clamp(25rem, 16rem + 10vw, 46rem))`: 328 px at 360, 400 at 1280, 448 at 1920, 640 at 3840 | content; the backdrop scrolls if taller |
| Account window | `min(100vw - 2rem, max(64em, 50vw))` in the card's type: 328 at 360, 736 at 768, 1126 at 1280, 1229 at 1920, 1280 at 2560, 1920 at 3840 | `min(100dvh - 3rem, 48em)`; the page scrolls inside |

- ~~2026-09-29 04:35 UTC (C-084): the sign-in width sat on the global `cardBox`, so the account window was also ~450 px wide at 1908 px and its page was ~200 px: "Username: Set u…", "Update profile" over the avatar, emails and phones shown only as "…" and "+", bottom cut off.~~ Fixed 2026-09-29 (C-099): the width moved to `signIn` / `signUp` only; the account window has its own size, Clerk's fixed 44rem modal height follows the card, and long emails and names wrap instead of ending in "…".
- Targets: the nav buttons, "Update profile", "Add email address", the "…" menus, "Connect account", the mobile menu button and "Show password" are at least 44 px; focus is a 2 px outline in `--focus`. "Secured by Clerk" stays Clerk's small logo link (decision 0023).

## Checks

- `pnpm test`: `clerkAppearance.test.ts` fails if a width returns to the global `cardBox`, `rootBox` or `modalContent`, or the account window loses its size or 44 px targets.
- `pnpm check:clerk` (`scripts/check-clerk-modal.ts`): both windows at 360, 390, 768, 1280, 1920, 2560 and 3840 on a local build with the Clerk key. Asserts the card is inside the viewport, square, no sideways scroll, no target under 44 px, and on desktop an account page of at least 560 px with no cut-off text. Signed in with `CLERK_QA_STATE` (a saved browser state) or `CLERK_SECRET_KEY` (development only: a throwaway user and organisation, deleted at the end). Router calls are blocked, so no D1 rows.
- Workflow `clerk-modal` runs it after every successful `site-deploy` and on demand; screenshots are the `clerk-modal-screenshots` artifact.
- Screenshots: `docs/qa/clerk-profile-1280.png`, `docs/qa/clerk-profile-390.png`.

## Actions

- `auth.signIn`, `auth.signOut`, `sync.now`, `billing.open` (see `reference/surfaces.md`).

## Notes

- This Clerk instance asks every new account to set up an organisation before the session is active ("Setup your organization"). Found 2026-09-29 by the check; a signed-in check needs an organisation for its throwaway user.
- Clerk caps its own type at about 19 px, so on a 3840 screen the account window is wider but its text does not grow past that.
