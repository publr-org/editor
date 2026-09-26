---
title: Style — Dimensions (C3)
---

Padding + Margin (story #412). A block opts in via `supports.spacing`
(paragraph: both). The box-model values open a focused pane whose snapping
points come from the active theme's named `spacing-*` tokens. Themes that only
define Tailwind's numeric `--spacing` multiplier can still render existing
numeric values, while the author-facing scale stays named; custom values
remain available as arbitrary utilities (`p-[12px]`).

## Checks

- [ ] Select a paragraph -> the sidebar shows the Margin/Padding box model.
- [ ] Click a value in the box model -> the spacing pane opens in its fixed slot beside the sidebar.
- [ ] Click the same box-model value again -> the pane closes.
- [ ] A side click targets only that side; Shift-click adds or removes arbitrary sides of the same kind.
- [ ] Shift-clicking a margin while padding is active (or vice versa) starts a new single-kind selection.
- [ ] Pair sync targets top/bottom or left/right, with its own directional icon.
- [ ] Full sync targets all four sides and writes the shorthand.
- [ ] Every targeted value is highlighted in the box-model preview.
- [ ] The pane title names exactly the selected kind and sides; an all-side selection uses only "Padding" or "Margin".
- [ ] The pane marker icon depicts every selected side, including arbitrary two- and three-side combinations.
- [ ] The pane's snapping points match the named spacing tokens in Design settings.
- [ ] The starter scale reads None, 2XS, XS, S, M, L, XL, 2XL.
- [ ] The custom-value button switches to a number, px/%/em/rem/vw/vh unit, and continuous slider.
- [ ] Ordered dimension and gap tokens use a discrete slider; custom CSS remains editable.
- [ ] Pick a Padding step → the paragraph gains inner spacing (`p-*`).
- [ ] Pick a Margin step → outer spacing changes (`m-*`).
- [ ] Re-click the active step → it clears.
- [ ] The "data" output carries `p-*` / `m-*` and no `data-pb-style` island.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">
  Give me padding and margin from the sidebar — steps 0 through 16.
</p>
<p data-pb-block="paragraph" data-pb-rich="body">A neighbour, so the margin is visible.</p>
```
