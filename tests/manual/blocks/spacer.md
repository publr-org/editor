---
title: Spacer
---

Vertical white space between blocks — an empty, `aria-hidden` div with no
carriers. `height` (S|M|L|XL, default M) is an island-canonical setting; the
`h-*` class is derived.

## Checks

- [ ] A tall gap separates the two paragraphs — the XL spacer, clearly bigger than the default one below.
- [ ] Click the first spacer — it selects and the breadcrumb reads Document › Spacer.
- [ ] Sidebar → Block shows "Height" with XL pressed for the first spacer; the second (default) shows M.
- [ ] Switch the first spacer's Height to S — the gap collapses; undo restores XL.
- [ ] The wire output (⋮ → Show output) carries `{"height":"xl"}` as an island on the first spacer and no island on the second.
- [ ] The spacer takes no caret — clicking it never starts a text edit.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">Above the extra-large spacer.</p>
<div data-pb-block="spacer" aria-hidden="true" class="block h-24">
  <script type="application/json" data-pb-settings>
    { "height": "xl" }
  </script>
</div>
<p data-pb-block="paragraph" data-pb-rich="body">Between the two spacers.</p>
<div data-pb-block="spacer" aria-hidden="true" class="block h-6"></div>
<p data-pb-block="paragraph" data-pb-rich="body">Below the default (medium) spacer.</p>
```
