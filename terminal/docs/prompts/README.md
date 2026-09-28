# Prompts

Two kinds of files live here.

**Numbered files (`0001-…`)** are Justin's prompts verbatim, append-only, each with the reply summary once the work shipped.

**`starters.json`** is the seed list of sample starting prompts. Starters are records (`id, text, verb, expects, reveal, tags`) read by `shared/src/starters` and shown in the suggestion strip. They are the seed of the actions vocabulary: every new verb the product understands gets a starter here first, and the actions registry (`app/src/actions/registry.ts`) declares the matching action. Append new records at the end; never change what an existing id means. `reveal` names the CRT-beam pattern used to paint the reply in (`beam-horizontal`, `beam-radial`, `beam-diagonal`, `typewriter`, `none`).
