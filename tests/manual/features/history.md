---
title: Undo / redo
---

History across typing, structure edits, and settings. The top-bar arrows bind
straight to the core history store — they enable/disable reactively.

## Checks

- [ ] On load both top-bar arrows are disabled.
- [ ] Type a few words — undo (⌘Z) walks the typing back in sensible chunks, not per-keystroke.
- [ ] Redo (⇧⌘Z, or ⌘Y) replays what undo removed; the arrows mirror availability the whole time.
- [ ] Split a paragraph with Enter, then undo — the blocks merge back into one.
- [ ] Delete a block (select + Backspace), undo — it returns in place with its content.
- [ ] Toggle a sidebar setting (e.g. the paragraph's Drop cap), undo — the setting reverts and the sidebar control follows.
- [ ] Make an edit after undoing — redo becomes unavailable (the future is discarded).
- [ ] After undoing everything, the undo arrow disables again.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">History</h2>
<p data-pb-block="paragraph" data-pb-rich="body">
  Edit me, split me, delete me — then walk it all back.
</p>
<p data-pb-block="paragraph" data-pb-rich="body">
  A second block so structure edits have a neighbor.
</p>
```
