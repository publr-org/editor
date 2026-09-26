---
title: Details
---

Native disclosure: a rich `summary` carrier plus a children slot for nested
blocks. "Open by default" and "Accordion group name" are island-canonical; the
`open` and `name` attributes are derived presentation.

## Checks

- [ ] The first details renders closed, the second open with its paragraph visible.
- [ ] Click into a summary — caret lands, typing updates it live.
- [ ] The paragraph inside the open details is editable; caret there makes the breadcrumb read Document › Details › Paragraph.
- [ ] Select the second details — sidebar → Block shows "Open by default" ON and "Accordion group name" reading "faq".
- [ ] Toggle "Open by default" ON for the first details — it opens; the wire output (⋮ → Show output) gains the island and the `open` attribute.
- [ ] Both fixtures share group name "faq" — opening one via its marker closes the other (exclusive accordion).
- [ ] Undo reverts the last edit cleanly.

## Fixture

```html
<details data-pb-block="details" class="rounded-sm border px-4 py-2" name="faq">
  <script type="application/json" data-pb-settings>
    { "name": "faq" }
  </script>
  <summary data-pb-rich="summary" class="cursor-pointer font-semibold">
    What is a details block?
  </summary>
  <div data-pb-children class="mt-2">
    <p data-pb-block="paragraph" data-pb-rich="body">
      A native disclosure widget — this paragraph is a nested child block.
    </p>
  </div>
</details>
<details data-pb-block="details" class="rounded-sm border px-4 py-2" open name="faq">
  <script type="application/json" data-pb-settings>
    { "open": true, "name": "faq" }
  </script>
  <summary data-pb-rich="summary" class="cursor-pointer font-semibold">
    Why is this one already open?
  </summary>
  <div data-pb-children class="mt-2">
    <p data-pb-block="paragraph" data-pb-rich="body">
      Because its island sets <em>open</em> to true — the attribute is derived.
    </p>
  </div>
</details>
```
