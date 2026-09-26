---
title: Raw HTML passthrough
---

Permissive upcast: markup without `data-pb-*` annotations loads as an opaque
`raw-html` block — nothing errors, nothing is dropped, and it round-trips
byte-preserving through serialize.

## Checks

- [ ] The document loads without errors; the un-annotated table and marquee render as-is between the real blocks.
- [ ] Clicking the raw content selects an opaque block — no carrier caret inside; the sidebar identifies it as HTML.
- [ ] The block participates in selection, list view, and delete like any other.
- [ ] Wire output (⋮ → Show output): the raw markup is byte-identical — attributes, whitespace, casing untouched.
- [ ] The data-pipeline pane keeps the raw markup too (passthrough, both pipelines).
- [ ] Delete the raw block, undo — it returns intact.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">A real paragraph above the raw content.</p>
<table class="plain-table" border="1">
  <tr>
    <td>Un-annotated</td>
    <td>plain markup</td>
  </tr>
  <tr>
    <td>upcasts to</td>
    <td>one opaque raw-html block</td>
  </tr>
</table>
<marquee behavior="alternate">Even this survives the round trip.</marquee>
<p data-pb-block="paragraph" data-pb-rich="body">And a real paragraph below.</p>
```
