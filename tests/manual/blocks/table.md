---
title: Table
---

Table root with four rich carriers holding section markup directly: `caption`,
`head`, `body`, `foot`. The sections are noSplit — Enter belongs to the cells.
"Fixed width table cells" is island-canonical; the `table-fixed` class is
derived.

## Checks

- [ ] The first table renders bordered cells, a bold header row, and the caption below the table.
- [ ] Click into a body cell — caret lands, typing updates it live.
- [ ] Enter inside a cell stays inside the table — the block never splits in two.
- [ ] The caption is editable; typing updates it live.
- [ ] Select the second table — sidebar → Block shows "Fixed width table cells" OFF; its columns size to content while the first table's columns stay equal.
- [ ] Toggling "Fixed width table cells" back ON adds `table-fixed` in the wire output (⋮ → Show output) and drops the island.
- [ ] Select a table — the breadcrumb reads Document › Table; undo reverts the last edit.

## Fixture

```html
<table
  data-pb-block="table"
  class="w-full border-collapse table-fixed [&_:is(td,th)]:border [&_:is(td,th)]:p-2"
>
  <caption data-pb-rich="caption" class="caption-bottom text-sm">
    Quarterly totals
  </caption>
  <thead data-pb-rich="head" class="font-semibold">
    <tr>
      <th>Quarter</th>
      <th>Revenue</th>
    </tr>
  </thead>
  <tbody data-pb-rich="body">
    <tr>
      <td>Q1</td>
      <td>1,200</td>
    </tr>
    <tr>
      <td>Q2</td>
      <td>1,850</td>
    </tr>
  </tbody>
  <tfoot data-pb-rich="foot">
    <tr>
      <td>Total</td>
      <td>3,050</td>
    </tr>
  </tfoot>
</table>
<table
  data-pb-block="table"
  class="w-full border-collapse [&_:is(td,th)]:border [&_:is(td,th)]:p-2"
>
  <script type="application/json" data-pb-settings>
    { "fixedLayout": false }
  </script>
  <caption data-pb-rich="caption" class="caption-bottom text-sm">
    Auto-width columns
  </caption>
  <thead data-pb-rich="head" class="font-semibold">
    <tr>
      <th>Key</th>
      <th>A much longer description column</th>
    </tr>
  </thead>
  <tbody data-pb-rich="body">
    <tr>
      <td>a</td>
      <td>Columns size to their content here</td>
    </tr>
    <tr>
      <td>b</td>
      <td>Because fixed layout is off</td>
    </tr>
  </tbody>
  <tfoot data-pb-rich="foot"></tfoot>
</table>
```
