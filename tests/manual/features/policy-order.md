---
title: Policy — movable + orderable (A3)
---

Phase-A reorder locks (story #292), applied as **editor config** (thoughts/010).
The **heading** type is pinned (`movable:false`): it shows no move arrows and
`moveBlock` refuses it, while paragraphs reorder freely. (Set the whole editor
immovable instead with root `"orderable": false` — then nothing reorders.)

The pinned heading sits **between** two paragraphs on purpose: were it movable
it would show both arrows here, so "no arrows" is unmistakable.

## Policy

```json
{ "blocks": { "heading": { "movable": false } } }
```

## Checks

- [ ] Select the **heading** — its floating toolbar has NO up/down move arrows.
- [ ] Select a **paragraph** — its toolbar HAS up/down arrows.
- [ ] The paragraph arrows reorder it (e.g. move "Paragraph one" down past the heading).
- [ ] There is no way to move the heading up or down — it stays pinned in place.
- [ ] The wire output (right rail) is content only — no `contenteditable`, no policy attributes.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">Paragraph one — I have move arrows.</p>
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">
  Pinned title — no move arrows, can't be reordered
</h2>
<p data-pb-block="paragraph" data-pb-rich="body">Paragraph two — I have move arrows.</p>
```
