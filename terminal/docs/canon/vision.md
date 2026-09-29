# Vision

What we are building and why. Written 2026-09-29 from the #developer thread of 2026-09-28/29. Quotes are Justin Massion's, verbatim, with the UTC time he said them (his local time is CDT, five hours earlier).

## In one breath

A plain screen with a cursor. Anyone lands on it and types, or speaks. The words turn into clear symbols as you write. The box works out what you mean, sends it to the right AI, and the product changes in front of you: pages, menus, looks, even its own layout. No sign-up until you want to save. No waiting on GitHub. Underneath, the same system runs many businesses at once.

## The product: a prompt-first terminal

"Terminal" here means a screen where you type commands. Ours is meant to be smart enough that you don't need to know the commands.

- **You land and type.** The homepage is the product, like excalidraw.com. You arrive in your own box and start. (2026-09-28)
  > "excalidraw.com is a genius homepage. It lest you start and is obvious how it works. You dont signup unitl you need or want to. It also has shortcuts on the icons , and little doodles of what is what." (23:02 UTC)
- **It adapts to anyone.** A normal terminal fails if you don't know what to write. This one suggests what's possible from the first keystroke. (2026-09-28)
  > "when you start a terminal you have to know what to write other wise nothing works. We can certainly have a starting experience that starts like a simple Terminal with a spot to start typing. but this terminal is smart and adaptive to anyone." (22:46 UTC)
- **The box is a typewriter that understands you.** It grows upward as you type or speak. Verbs, places, dates, lists and things become chips (small typed symbols you can click). (2026-09-28)
  > "Imagine it being like a typwriter where the page expands up ward as you type. or speak to text. I want real time edits of what i'm writing, so that things like action verbs, locations, dates, lists, objects, variables, etc. are all properly turned into symbols, not just colored code like itelliteype." (22:46 UTC)
- **The box routes; it doesn't make you pick a model.** (2026-09-28)
  > "we will of course use the box to orchestrate from as needed. so it will route instead of just be a choose a model for yourself tool" (22:42 UTC)
- **It edits itself.** If you ask for a menu change, the product makes the change. It never tells you to go edit a settings file. (2026-09-29)
  > "Fail: if it can't edit itself than its not good enough" (01:23 UTC)
- **It gets better by trying three.** For looks, layouts, pages and copy: make three, keep the best, improve three times more, stop when it's good enough. (2026-09-29)
  > "simple, make 3 versions, choose best, make 3 upgrades, choose best, make 3 upgrade samples choose best, etc. any iteration of that type of thinking can be wow exponential for making things great. Of course set an end to the loop when appropraite." (01:28 UTC)
- **Beautiful by being simple.** Themes range from pure black with a green cursor to looking through a glass window. (2026-09-28)
  > "Remember, the brilliance is simplicity. I do however love the idea of looking into a glass window. Or even ourselves literally being the moving camera" (23:16 UTC)
- **Two ways to pay.** Use our key and pay what it costs us (pass-through), or bring your own key. (2026-09-28)
  > "either use ours and we do easy pass through billing, or bring their own key. Simple." (23:47 UTC)

## The platform: multi-tenant Playset OS on the Company OS backend

- **Multi-tenant** means one system serving many separate businesses ("tenants"), each seeing only its own data. (2026-09-28)
- Justin first built `between-gigs` as a dashboard for one business, then tried to turn it into a template for many. He decided it needs a fresh rebuild. (2026-09-28)
  > "I started building a dashboard system for one busines. and then tried building that into a template for a multi-tenant system. Now i feel like it needs a fresh re-build." (22:28 UTC)
- **Company OS** is the backend Anu built: a tested, multi-tenant Postgres system where each client is set up by data, not custom code. Its live work is on the `integration` branch. It stays the system of record (the one true copy) for business data. (2026-09-28)
- **SpacetimeDB** carries the live layer: what's on screen, who's here, drafts, the prompt box. (Decided 2026-09-28; not connected yet.)
- **One master system.** Old repos, projects and data will be imported into it later. (2026-09-28)
  > "Consider also that we need to start importing past repos, projects, data from old softwares, etc into this master system. Which we will discuss further later" (22:28 UTC)
- **Drafts and publishing live inside the product**, per tenant, not in GitHub. (2026-09-28)
  > "From within my software we will handle how drafts and deployments work across tenants and things like that." (22:28 UTC)

## Principles

1. **Live editing onto the product.** Code, components and pages are written straight onto the running product, with a few safety checks. (2026-09-28)
   > "Th key is to build in a way that ideally we can write directly onto the product in real time. That's true of writing code, components, pages, etc. With the exception of maybe some minimal safety measures." (22:28 UTC)
2. **No GitHub loop.** Git is the record, not the way work moves. Long term, git becomes a nightly export of the product. (2026-09-28)
   > "In particular i'm sick and tired of GitHub and waiting on pushes and pulls and merges etc." (22:28 UTC)
3. **Parallel agents.** Many edits across the app at the same time, visible as they build. (2026-09-28)
   > "we need a brilliant way to build in paralel. Because i'm prompting to edit features all over the app at the same time, and this is important for speed." (22:31 UTC)
   > "The goal is to make it feel like everything is real time. We can watch it build procedurally, and ask for new tools and changes more instantly." (22:31 UTC)
4. **Our own plain-language dialect.** Layout, sizes and materials described in words a child or a grandparent can read. See [glossary.md](glossary.md). (2026-09-28)
   > "a shell has a top bar, bottom bar, left and right sidebar. Its that simple. Geometry & Responsiveness has a set of words that describe it. Its that simple." (22:33 UTC)
   > "we dont need to rely on other peoples computer language, we can write our own, Even 10 Year old and 80 Year olds can understand." (22:33 UTC)
5. **Simplicity.** One folder and one instruction at the top of the repo. Every user starts a new box. (2026-09-28)
   > "Let's be smart in that there is only 1 folder and 1 instruction in the start of the repo. And, any user starts a new box (folder)" (23:00 UTC)
   > "simple easy. clean obvious. no extra complication needed" (23:07 UTC, about billing)
6. **Game-first realtime.** Build like an online game, which is harder than a business app, so business needs come for free. (2026-09-28)
   > "Game 1st is part of why i like it. MMOs demand the most realtime, and manages worlds and economies. Likely better than saas" (23:00 UTC)
7. **Tools AI is fast with.** Prefer well-known, well-documented tools agents get right the first time. (2026-09-28)
   > "Remember, i want the things that AI is incredibly fast and easy at working with" (23:04 UTC)
   > "I like that this promises something ai can get right the first time." (22:52 UTC, about SpacetimeDB)
8. **Self-editing.** Everything on screen is data the product itself can change, with undo. (2026-09-29)
9. **Money at the core.** Every transaction, down to fractions of a cent, is recorded cleanly and can be verified; users can opt in to a simple shared chain. (2026-09-28)
   > "This should be at the core of it all, all transactions including micro transactions all need to be handled cleanly. We also can make this simplest cleanest blockchain, from the perspective that each new user can agree to be on chain." (23:07 UTC)
10. **Take the idea, not the tool.** From Rive, Finsweet, Caveman and Mem Palace we keep what they achieve and build our own simpler version. (2026-09-28)
    > "I dont care about their editor i care about what it does and how tiny and multi device it figured out how to do things" (23:18 UTC, about Rive)
    > "consider how caveman and mem palace fit, but obviously our own fresh better version" (22:35 UTC)
11. **Everything lands on one canvas.** Pages and images are cards on a master canvas Justin arranges over time. (2026-09-28)
    > "This should exist on a canvas. like a card or long piece of paper. that paper is 1mm thick by default. and images can be 10mm thick by default." (23:36 UTC)

## Standing workspace rules that also apply

From this Slack workspace's admin instructions (not from the thread): a development plan with a PM viewer comes first; phone to 4K TV; keyboard, mouse, touch and pen now, TV remote and voice next; English and Spanish; anything unfinished says "not wired yet"; docs land in the repo in the same turn; every reply names the model that did the work.
