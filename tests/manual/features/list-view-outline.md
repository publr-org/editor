---
title: List view & outline
---

The left-rail document panel: the block tree flattened with collapse and
selection sync, and the Outline tab — stats plus heading structure
checks.

## Checks

- [ ] The list-view button (top-left) opens the panel; rows mirror the document, nested blocks indented.
- [ ] Headings show their level icon and their text as an anchor preview.
- [ ] Collapse the Group row — its children prune from the list; expand restores them.
- [ ] Click a row — the block selects in the canvas; ⇧-click ranges, ⌘-click toggles (same gestures as the canvas).
- [ ] Collapse the Group, then select its child from the CANVAS — the tree un-collapses to reveal the highlight.
- [ ] Outline tab: character/word counts and reading time look sane and update as you type.
- [ ] The empty heading is flagged "(Empty heading)" with an amber chip.
- [ ] The H2 → H4 jump is flagged as an incorrect heading level.

## Fixture

```html
<h1 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Document title</h1>
<p data-pb-block="paragraph" data-pb-rich="body">
  Some prose so the word count has something to chew on.
</p>
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">A section</h2>
<div data-pb-block="group" data-pb-children>
  <h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Nested heading</h3>
  <p data-pb-block="paragraph" data-pb-rich="body">Inside the group — collapse me away.</p>
</div>
<h4 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">
  Skipped from H3 land… wait, from H2? Flag me if I skip.
</h4>
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text"></h2>
```
