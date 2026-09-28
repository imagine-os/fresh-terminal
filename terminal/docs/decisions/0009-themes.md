# 0009 — themes as records in the dialect

- A theme is a record: id, name, scheme (light/dark), surface material, backdrop (none/fog/grain/stars), spacing, bezel (none/plastic/metal/paper/glass), text (ink/chalk/phosphor/etched/amber), cursor {shape block/caret/dot, color, blink, glow}, motion (none/drift/parallax), respondsTo (none/pointer/tilt/camera), tokens (CSS custom property overrides).
- Text form, same parser style as the layout dialect: `Stage: glass over fog, airy. Bezel: none. Text: etched. Cursor: caret, mint, blink, glow. Motion: drift. Responds to: pointer.` `printTheme` round-trips the seeds.
- Three themes in pass 1: **Void** (default; pure black, phosphor-green block cursor, monospace), **Blank Page** (pure white, black block cursor), **Glass Window** (glass over a slowly drifting fog, etched text, a specular highlight that follows the pointer via `--pointer-x/--pointer-y`). Camera and tilt responses exist in the vocabulary and are not wired.
- The old dark/light toggle is now the theme switcher: `T` cycles; dev mode shows a picker with the record printed in the dialect.
- Implementation rule: theme tokens are applied as custom properties on the shell root; CSS is keyed on dialect words (`data-backdrop`, `data-material`, `data-bezel`, `data-text`, `data-motion`, `data-responds`), never on a theme id. No per-theme component code.
- The cursor is a themed element in the composer's mirror layer (the native caret is hidden while focused); blink is a CSS animation that becomes a soft fade under `prefers-reduced-motion`.
- Pass 2: camera reflection (opt-in, never uploaded), tilt window on phone, 13 more themes.
