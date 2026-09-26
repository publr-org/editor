---
title: Inserter — block library
---

The left-rail library: the full registry grouped by category, searchable.
On pick: replace an empty paragraph, insert after a
top-level anchor, else append.

## Checks

- [ ] The + button (top-left) opens the library rail; the search field is focused.
- [ ] Shelves group by category — Text, Media, Design first; every non-internal block appears (no List item / Column / Social link / Accordion item).
- [ ] Typing filters live across type and label; nonsense shows "no results"; Enter inserts the first match.
- [ ] With the caret in the EMPTY paragraph, picking a block REPLACES it in place.
- [ ] With the caret in a filled top-level paragraph, picking inserts right AFTER it.
- [ ] With nothing selected, picking appends at the document end.
- [ ] The panel stays open after a pick; Escape / the ✕ closes it and focus returns to the + button.
- [ ] Opening list view closes the library — the left rail hosts one panel at a time.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">
  A filled paragraph — picking a block inserts after me when I hold the caret.
</p>
<p data-pb-block="paragraph" data-pb-rich="body"></p>
<p data-pb-block="paragraph" data-pb-rich="body">
  Tail paragraph, so inserts-in-the-middle are visible.
</p>
```
