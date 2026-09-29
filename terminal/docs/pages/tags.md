# Page: Tags (`/tags`)

**Purpose.** Everything the tagger and the person have tagged, on its own page next to Actions. Justin, 2026-09-29 06:04 UTC: "in addition to the actions views, we should have a nother page they can go to, to see their tags as table list board, timeline, and probably graph by default. with some good view options in the graph." ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790661869088339?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)). Built in C-100 (Fable 5.1, Justin's session).

**Where.** Tray → Tags, the stage menu's seeded "Tags" item on new stages, the intent "open my tags", or `/tags`. Spanish: "Etiquetas".

**Rows.** One row per distinct tag across the lines the person sent (`app/src/tags-view/rows.ts`, `tagRows()`): kind, text as first written, normalised value when the tagger had one, how many lines carry it, first and last use, every use (line, stage, time), the stages it appeared in, who set it last (tagger, model, glossary, the person) and whether it was part of a list. Same kind and same text, case-insensitive, fold into one row; twice on one line counts once. Replies carry no tags and are not counted.

**Links.** Two tags are linked when they appear on the same line; the weight is the number of such lines (`tagLinks()`).

**Controls.** One row: the view (Graph, Table, List, Board, Timeline), a word filter (matches the text, the value and the kind's name in the reader's language), kind, stage ("All stages" or one; starts on the stage you came from) and sort (most used, newest, oldest, A to Z, by kind). Clicking any tag pill or graph node puts its text in the filter, so every view narrows to it; clicking again clears. The graph adds its own row of options.

**Graph (default).** A node per tag, radius by uses (or equal), one hue per kind (`kindHue`, the kind's index around the wheel), an icon in the middle, a label under it with "×n" when used more than once. Lines between linked tags, thicker the heavier. Options, remembered per browser in `fresh-terminal.tags.graph`: layout (pulled together by shared lines, or grouped by kind on a ring), size, links (every shared line, twice or more, three or more), labels (all, busiest twelve, none). Hover or focus a node to dim everything it is not linked to; Enter or click picks it. The legend under the graph lists the kinds present and narrows by kind. The layout is `layoutGraph()`: a short synchronous force simulation seeded from the tag and link counts, so the same tags always land in the same places, clamped inside the 960×600 box.

**Table.** Tag, kind, reads-as (the value, or "in a list"), uses, first, last, stage. **List.** Last use, tag, kind, uses. **Board.** One column per kind present, most used kinds first. **Timeline.** Rows by first use, a bar from first to last use in the kind's colour and a dot per use.

**Empty.** "Your tags show up here as you type." / "Tus etiquetas aparecen aquí mientras escribes." With filters that match nothing: "Nothing matches these filters."

**Not yet.** A tag's own page (every line it appears on, with the reply); renaming or merging tags from here; the graph on the stage itself; parts of speech as a kind (C-096 proposal).
