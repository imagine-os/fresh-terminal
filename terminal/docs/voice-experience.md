# Terminal-talk: the voice experience we are building toward

Written 2026-09-29 for Justin's question: "give me a demo of how that will work, I'm very curious what the perfect voice experience is for this." Status: the switch exists in the tray (Terminal-talk); the agent behind it is the next build after SpacetimeDB. Estimate for the first working version: ~1 h of build, $1–3 of model time, likely.

## The one rule

Voice never fights the keyboard. You can talk, type, or do both in the same sentence, and the terminal treats it as one stream. Nothing you say is sent until you stop or say "go"; nothing it says talks over you.

## A 60-second demo, as a script

1. **Alt+V** (or the mic). A thin green wave appears in the prompt. No modal, no beep.
2. You say: *"make a page called travel notes, put today's date at the top"*. The words land in the prompt as you speak, already tagged: **travel notes** is an object tag, **today** is a date tag. You stop talking. After 700 ms of silence the line sends itself. (Say "wait" and it holds.)
3. The reply streams as text, as now. With Terminal-talk on, the terminal also reads the one-line summary aloud in a calm voice: *"Made the page Travel notes with today's date."* It reads the summary only, never tables, never ids.
4. You interrupt: *"no, tomorrow"*. The moment you speak, its voice stops. Your words are a new line; "no" plus a complaint about the last edit means reverse it, so the date flips and it says *"Tomorrow, then."*
5. You type **Alt+V** again or say *"stop listening"*. The wave folds away. The transcript shows every spoken line with a small mic glyph, so you can tell later what you said and what you typed.

## Drafting together (Justin, 2026-09-29 05:19 UTC)

The spoken draft is a shared object, not a hidden buffer. You watch it form in the prompt as you talk; you can stop, type into it, fix a word, drag a tag; someone else on the same stage can too. Only when it reads right does it go to the terminal. The reply is reviewed the same way: it lands on the stage, and you talk about it or edit it before it becomes the next edit. Two people and the terminal, one draft.

## What makes it feel right

- **Tags while you talk.** The same tagger runs on the live transcript. Names, dates and lists light up mid-sentence, so you see the terminal understood before it acts.
- **Silence sends, a word holds.** 700 ms of silence sends; "wait", "hold on" or "um" extend the window. Adjustable in Settings.
- **Barge-in.** Speaking while it talks cuts it off within 100 ms. No "please wait".
- **It reads only what you would read aloud.** The summary line and, if you ask, the next steps. Everything else stays on screen.
- **One voice, one speed, no personality theatre.** The voice is a tool, like the cursor.
- **Cost on the line.** Every spoken turn shows seconds and cents in the same small meta line as typed turns.
- **Phones.** Tap the mic, talk, lift your thumb. Hold-to-talk is the default there; the wave is the only feedback.

## How it is built

- **Ears:** browser speech recognition today (free, English/Spanish, needs Chrome or Edge on a normal network). Next: Gemini Live over LiveKit, which listens and speaks in one session and handles barge-in for us. OpenAI Realtime stays as the alternate.
- **Mouth:** the same session speaks the summary. Until then, the browser's built-in voice can read summaries when Terminal-talk is on.
- **Mind:** nothing changes. Spoken lines route exactly like typed lines: local commands first, then the model, then the engine that refuses no-ops.
- **Storage:** spoken lines are lines. Replay plays them back; export keeps them.

## Not yet

- The Terminal-talk switch is a preference and a demo; it does not speak yet.
- Wake words ("hey terminal") are off the table for now: they are the thing that makes voice feel creepy and expensive.
