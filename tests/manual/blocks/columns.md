---
title: Columns
---

Horizontal layout of Column blocks — the slot accepts columns only, and a
fresh Columns starts with two. `valign`, `gap`, and `stackOnMobile` are
island-canonical on the parent; each Column carries its own `width` and
`valign` islands. This test also covers the internal Column block — it never
appears in the inserter.

## Checks

- [ ] The two columns render side by side — the first pinned to a third, the second filling the rest.
- [ ] Click into the heading and paragraphs — all edit in place inside their columns.
- [ ] Select the Columns container — sidebar → Block shows "Vertical alignment" with Center pressed, "Gap" with Large pressed, and "Stack on mobile" ON.
- [ ] Switch "Gap" to None — the columns close up; undo restores the gap.
- [ ] Select the first Column — sidebar shows "Width" with 33% pressed and "Vertical alignment" with Inherit pressed; the second Column shows Auto.
- [ ] Select a paragraph in the first column — the breadcrumb reads Document › Columns › Column › Paragraph.
- [ ] List view nests two Columns under Columns, each with its own children.

## Fixture

```html
<div data-pb-block="columns" data-pb-children class="flex items-center gap-10 max-md:flex-col">
  <script type="application/json" data-pb-settings>
    { "valign": "center", "gap": "lg" }
  </script>
  <div data-pb-block="column" data-pb-children class="min-w-0 shrink-0 basis-1/3">
    <script type="application/json" data-pb-settings>
      { "width": "33" }
    </script>
    <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Narrow column</h2>
    <p data-pb-block="paragraph" data-pb-rich="body">
      Pinned to a third of the row via the width island.
    </p>
  </div>
  <div data-pb-block="column" data-pb-children class="min-w-0 flex-1">
    <p data-pb-block="paragraph" data-pb-rich="body">
      Auto-width column — it flexes to fill whatever the narrow one leaves behind, which makes the
      center alignment visible when the two heights differ.
    </p>
    <p data-pb-block="paragraph" data-pb-rich="body">
      A second paragraph to give this column some height.
    </p>
  </div>
</div>
```
