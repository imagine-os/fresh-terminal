# 0005 — themes for the starting page

Source: Justin, same thread, 2026-09-28. Verbatim:

> Think up different themes and image prompts for the terminal starting page. For instance, a bezel could look like old computer monitor plastic, and the middle could feel like rounded glass, responsive to the mouse or eyes, or whatever, with the old school green or black and green blinking cursor. Or whatever. Lots of ideas please. All of them super simple. Even pure white background or Pure Black with a cursor or none could make sense. I'm open. Remember, the brilliance is simplicity. I do however love the idea of looking into a glass window. Or even ourselves literally being the moving camera

## Reply summary

A theme is a record (`shared/src/themes`) with surface, backdrop, bezel, text, cursor (shape, color, blink, glow), motion and what it responds to, plus a token override map; it is also writable in the dialect ("Stage: glass over fog, airy. Cursor: glow, green. Bezel: none."). Three ship: **Void** (pure black, phosphor-green block cursor; default), **Blank Page** (pure white, black block cursor), **Glass Window** (glass pane over drifting fog, etched text, specular highlight following the pointer). `T` cycles themes; dev mode has a picker. All theme CSS is custom properties on the shell root keyed by dialect words; no per-theme component code. Cursor blink respects reduced motion (fade instead of hard blink). Camera reflection and tilt are listed as pass-2 tasks. Decision: `0009-themes.md`.
