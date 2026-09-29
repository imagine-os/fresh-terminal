# 0016 — a playback scrubber for every step of a session; "evolve as we grow"

Source: Justin, Slack, 2026-09-29 02:29:41 UTC ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790648981706729?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)). Verbatim:

> i need a playback scrubber that then evolves to have branching and merging capability if needed to watch through every step of our interactions with a terminal session please. Everything saved beatuifully. in the future we can save video adn audio and whatever else also, for now get us started and we can evolve as we grow

And eleven seconds later ([message](https://aluzinaworkspace.slack.com/archives/C0C2YAS5TL5/p1790648992904059?thread_ts=1790634517.611669&cid=C0C2YAS5TL5)):

> "evolve as we grow" is great tagline

## Reply summary

Built as a replay of the box: press `P` (or the replay button in the top bar, or open `/box/<id>/play`). Every step already recorded by the store (session opened, each user, assistant and system line, each interface edit, each undo and redo) becomes one step on a timeline with parent ids, so branches and merges fit the same shape later. The scrubber plays, pauses, steps, jumps and drags; the transcript and the sidebar menu, layout and theme are shown as they were at that step, rebuilt by reversing later edits. The whole timeline can be saved as one JSON file. "Branch from here" is present but labelled not wired yet. The tagline became the product's: "Evolve as we grow." Decision 0019; Canon C-058 and C-059.
