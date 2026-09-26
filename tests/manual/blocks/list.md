---
title: List
---

ul/ol whose root is both the tag carrier (`data-pb-tag="tag"`) and the children
slot; items are internal **list-item** blocks (one rich `content` carrier each),
covered by this test. The ol-only settings — "Reverse order", "Start value",
"Numbering style" — are island-canonical; the `reversed`/`start`/`type`
attributes and the list-style class are derived.

## Checks

- [ ] The first list shows disc bullets; the second counts down e, d, c (lowercase letters, start 5, reversed).
- [ ] Click into an item — caret lands, typing updates it live; the inline `emphasis` renders italic.
- [ ] Enter mid-item splits it into a new sibling item in the same list; Backspace at an item's start merges it into the previous item.
- [ ] With the ordered list selected, sidebar → Block shows "List style" Ordered pressed, "Reverse order" ON, "Start value" 5, "Numbering style" Lowercase letters (a b c).
- [ ] Switch "List style" to Unordered — markers become discs and the wire output (⋮ → Show output) drops the ol attributes.
- [ ] Caret inside an item — the breadcrumb reads Document › List › List item.
- [ ] Undo reverts the last edit cleanly.

## Fixture

```html
<ul data-pb-block="list" data-pb-tag="tag" data-pb-children class="list-disc pl-6">
  <li data-pb-block="list-item" data-pb-rich="content">First item, with <em>emphasis</em></li>
  <li data-pb-block="list-item" data-pb-rich="content">Second item</li>
  <li data-pb-block="list-item" data-pb-rich="content">Third item</li>
</ul>
<ol
  data-pb-block="list"
  data-pb-tag="tag"
  data-pb-children
  class="list-[lower-alpha] pl-6"
  reversed
  start="5"
  type="a"
>
  <script type="application/json" data-pb-settings>
    { "reversed": true, "start": 5, "type": "a" }
  </script>
  <li data-pb-block="list-item" data-pb-rich="content">Counts from e</li>
  <li data-pb-block="list-item" data-pb-rich="content">Down to d</li>
  <li data-pb-block="list-item" data-pb-rich="content">Ends at c</li>
</ol>
```
