---
title: Heading
---

Section heading, h1–h6: one plain-text `text` carrier on the tag, the level
carried by the tag itself (`data-pb-tag="level"`). The "Level" toggle-group is
field-backed — no island, the tag is canonical.

## Checks

- [ ] Click into the first heading — caret lands, typing updates the text live.
- [ ] Enter mid-text splits the heading in two; Backspace at the start merges them back.
- [ ] The second heading renders smaller (h3); sidebar → Block shows "Level" with H3 pressed.
- [ ] Switch "Level" to H4 — the heading shrinks and the wire output (⋮ → Show output) shows an `h4` tag, no island.
- [ ] The third, empty heading shows the ghost prompt "Heading".
- [ ] Select a heading — the breadcrumb reads Document › Heading.
- [ ] Undo reverts the last edit cleanly.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Chapter one: the editor</h2>
<h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">A quieter subsection</h3>
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text"></h2>
```
