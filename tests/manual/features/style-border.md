---
title: Style — Border (C4)
---

Border width, color, and radius (story #413; E1 #428 native vocabulary). A
block opts in via `supports.border` (paragraph: all three). Width steps are
the fixed v4 utilities (1 → `border`, 2/4/8 → `border-N`); radius comes from
the theme's `radius-*` tokens (`rounded-lg`); color swatches are theme tokens
(`border-brand`); custom values go arbitrary (`rounded-[5px]`,
`border-[#111]`). Same policy gate. Color controls appear only after the
selected edge or edges have a non-zero width.

## Checks

- [ ] Select a paragraph → its box model shows four border-radius corner controls and no layer-level sync buttons.
- [ ] Pick one or more border edges → the popover title reads `Border` and its subtitle names them (`Top`, `Top, Right`); selecting all four reads `All sides`.
- [ ] Pick a width (1/2/4/8) → the paragraph gets a visible border and the Color controls appear.
- [ ] Pick a border color → the border recolors.
- [ ] Pick a corner → a separate `Border Radius` popover opens; Shift-click adds corners to its subtitle and edits them in parallel rows.
- [ ] The "data" output carries `border-*` / `border-[…]` / `rounded-*` and no `data-pb-style` island.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">
  Give me a border — width, color, and rounded corners from the sidebar.
</p>
```
