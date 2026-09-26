---
title: Policy — removable (A4)
---

Phase-A delete locks (story #293), applied as **editor config** (thoughts/010).
The **paragraph** type is pinned (`removable:false`): every delete path
(multiselect Backspace/Delete, and Backspace-merge at a block's start) refuses
it — they all funnel through one `dropBlock` choke point. The **heading** is
deletable, for contrast. Pinned ≠ locked: the paragraphs are still editable.

## Policy

```json
{ "blocks": { "paragraph": { "removable": false } } }
```

## Checks

- [ ] Drag-select across all three blocks and press Backspace (or Delete) — only the heading is removed; both paragraphs remain.
- [ ] Put the caret at the very START of a paragraph and press Backspace — nothing happens (it can't merge away into the block above).
- [ ] The pinned paragraphs are still editable — click in and type; text changes.
- [ ] Delete the heading alone (select just it, Backspace) — it goes; the paragraphs are unaffected.
- [ ] The wire output (right rail) is content only — no `contenteditable`, no policy attributes.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">I can be deleted</h2>
<p data-pb-block="paragraph" data-pb-rich="body">
  Pinned — I can't be deleted or merged away, but I'm still editable.
</p>
<p data-pb-block="paragraph" data-pb-rich="body">
  Also pinned — select everything and delete: only the heading goes.
</p>
```
