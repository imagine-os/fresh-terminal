# Page: landing (`/`)

**Purpose.** The product itself, Excalidraw-style: the visitor lands in their most recent box (created on first visit) with the composer focused. No sign-up.

**Regions** (default dialect): top bar full everywhere (brand, tagline, balance, icons); left sidebar rail on laptop, full on desk/wall, hidden on phone/tablet (toggle summons it floating); stage full (empty state or transcript); bottom bar full (composer); right sidebar hidden unless dev mode.

**Actions** (`LANDING_ACTIONS`): `box.new` (N), `sidebar.toggle` ([), `theme.cycle` (T), `dev.toggle` (D), `lang.toggle` (L), `canvas.open` (C), `settings.open` (K), `library.open` (B), `auth.signIn`, `auth.signOut`, `sync.now` (2026-09-29; the Sign in button is marked not wired yet when the build has no Clerk key), `composer.send`, `composer.speak`, `composer.suggest`, plus the starter verbs.

**States.** Empty box: headline (one line), three-item how-it-works row, doodle hints, footer with version/source/docs, suggestion strip on focus. After first send: doodles fade, transcript replaces the empty state. Router unreachable / key missing / pending tier: a system line says exactly which. Streaming: assistant line shows a blinking block until `done`.

**i18n keys.** `landing.*`, `topbar.*`, `sidebar.*`, `composer.*`, `suggest.*`, `doodle.*`, `system.*`, `footer.*`, `notWired*`.
