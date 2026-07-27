---
title: Slash picker & inline inserter
---

The in-canvas insertion affordances every embedder gets from
`attachInlineChrome`: "/" in an empty block opens the quick picker; hovering
any boundary before, between, or after sibling blocks reveals a blue insertion
line whose centered + opens the inline inserter.

## Checks

- [ ] Type "/" in the empty paragraph — the quick picker opens at the block.
- [ ] Keep typing to filter ("/hea"); ArrowUp/Down move the highlight; Enter applies — the paragraph TRANSFORMS into the picked block.
- [ ] Escape closes the picker and the "/" text remains editable.
- [ ] Hover above, between, and below sibling blocks — each boundary shows the same full-width blue line and centered + without reserving document space.
- [ ] Click an internal boundary's + — the mini inserter opens; picking inserts at that exact boundary without first creating an empty paragraph.
- [ ] "Browse all" hands off to the left library rail, and picking there preserves the exact before/after placement.
- [ ] "/" mid-text in a FILLED paragraph does not open the picker — it's an empty-block affordance.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">
  Filled paragraph — "/" here should just type a slash.
</p>
<p data-pb-block="paragraph" data-pb-rich="body"></p>
```
