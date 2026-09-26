---
title: Grouping
---

⌘G wraps the selection in a Group block; ⇧⌘G (or the toolbar's ungroup)
dissolves one, splicing its children back in place.

## Checks

- [ ] Select the two adjacent paragraphs (⇧-click), press ⌘G — they wrap in a single Group; list view shows the new nesting.
- [ ] Undo — the group dissolves back to two top-level paragraphs.
- [ ] Redo, then select the group and press ⇧⌘G — children splice back at the group's position, in order.
- [ ] Ungroup via the floating toolbar button does the same as ⇧⌘G.
- [ ] Group the already-grouped section with a paragraph — groups nest; the breadcrumb walks Document › Group › Group › Paragraph.
- [ ] Serialize (⋮ → Show output) — the group is a `div` with `data-pb-children`, children unchanged inside.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">
  Candidate one — select me and my sibling, then ⌘G.
</p>
<p data-pb-block="paragraph" data-pb-rich="body">Candidate two.</p>
<div data-pb-block="group" data-pb-children>
  <h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Pre-grouped section</h3>
  <p data-pb-block="paragraph" data-pb-rich="body">Use ⇧⌘G here to dissolve, or group me deeper.</p>
</div>
```
