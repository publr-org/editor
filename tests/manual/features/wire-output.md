---
title: Wire output — editing vs data pipeline
---

The two serializations behind the ⋮ menu: the EDITING pipeline (carriers,
ids, islands — what round-trips back into the editor) and the DATA pipeline
(the published shape). Preview opens the data downcast in a new tab.

## Checks

- [ ] ⋮ → Show output reveals both panes; they populate immediately and update live as you type.
- [ ] The editing pane carries `data-pb-*` attributes and the settings island on the drop-cap paragraph.
- [ ] The data pane is clean publish markup — no `data-pb-*` carriers or islands, but the drop cap's derived presentation (classes) survives.
- [ ] Copy buttons put each pane's exact content on the clipboard.
- [ ] Preview (top bar) opens a new tab whose body is the data-pipeline output.
- [ ] The menu item flips between Show/Hide output.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Two pipelines</h2>
<p data-pb-block="paragraph" data-pb-rich="body">
  <script type="application/json" data-pb-settings>
    { "dropCap": true }
  </script>
  Island-carrying paragraph — the island is editing-pipeline-only.
</p>
<p data-pb-block="paragraph" data-pb-rich="body">
  Plain paragraph with <strong>inline</strong> content.
</p>
```
