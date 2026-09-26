---
title: Custom HTML
---

A deliberate authoring surface for arbitrary markup: one rich `content`
carrier on a plain div, chosen from the inserter — unlike the reserved
`raw-html` passthrough that permissive upcast mints for unrecognized markup.
No settings.

## Checks

- [ ] The block renders its markup live — the definition list and inline code display styled, not as escaped source.
- [ ] Click into the content — caret lands, typing updates it live.
- [ ] Delete all the content — the "Write HTML…" placeholder shows.
- [ ] Select a word — the floating toolbar appears; bold applies and undoes cleanly.
- [ ] Select the block — the breadcrumb reads Document › Custom HTML.
- [ ] The wire output (⋮ → Show output) shows the inner markup intact inside the carrier div, with no islands.

## Fixture

```html
<div data-pb-block="html" data-pb-rich="content">
  <dl>
    <dt><code>data-pb-block</code></dt>
    <dd>Names the block type on its root element.</dd>
    <dt><code>data-pb-rich</code></dt>
    <dd>Marks an element as a rich-text carrier.</dd>
  </dl>
</div>
```
