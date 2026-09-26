---
title: Selection
---

Block selection across canvas, sidebar, tree, and breadcrumb: click, ⇧-range,
⌘-toggle — the same gesture vocabulary in the canvas and the list view.

## Checks

- [ ] Click into a paragraph — sidebar flips to the Block tab, breadcrumb shows Document › Paragraph.
- [ ] Click the image — the block gets selected (media clicks select the block, not a caret).
- [ ] ⇧-click another top-level block — a contiguous range highlights; the sidebar notes "N blocks selected".
- [ ] ⌘-click (Ctrl-click) toggles individual blocks in and out of the selection.
- [ ] Select the heading inside the group — the breadcrumb walks the full path: Document › Group › Heading.
- [ ] With a block selected, click a control in the sidebar — the selection sticks; the settings panel does not vanish mid-interaction.
- [ ] Click empty canvas space / deselect — sidebar falls back to the Document tab.
- [ ] Open list view (top-left) — the canvas selection is highlighted there; selecting a row in the tree selects the block in the canvas.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Selection playground</h2>
<p data-pb-block="paragraph" data-pb-rich="body">First target — plain paragraph.</p>
<figure data-pb-block="image">
  <img data-pb-image="image" src="https://placehold.co/480x200/png" alt="Placeholder" />
  <figcaption data-pb-rich="caption">Clicking the picture selects the block.</figcaption>
</figure>
<p data-pb-block="paragraph" data-pb-rich="body">
  Second target — use me for ⇧ ranges and ⌘ toggles.
</p>
<div data-pb-block="group" data-pb-children>
  <h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Nested heading</h3>
  <p data-pb-block="paragraph" data-pb-rich="body">
    Selecting my sibling above should breadcrumb through the Group.
  </p>
</div>
```
