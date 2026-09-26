---
title: Style — Font Size (C1)
---

The universal style system's first control (story #410, thoughts/011; E1 #428
made the scale THEME-DRIVEN). A block opts into a style panel via `supports`
(paragraph + heading declare `typography.fontSize`); the sidebar renders the
size options the SITE THEME's `text-*` tokens define (demo theme: sm–2xl);
picking one writes the utility CLASS onto the block (`text-lg`, custom →
`text-[…]`) — since E2 the class list IS the storage (lens read/replace, no
island), so a pasted `text-xl` registers in the control and gets replaced.

Policy gates it: a `content-only` field shows the control disabled (structure
AND style locked, text still editable) — see the second fixture below.

## Checks

- [ ] Select a paragraph → the sidebar shows a "Font size" row with sm base lg xl 2xl.
- [ ] Click 2xl → the paragraph grows (gets `text-2xl`); the segment shows active.
- [ ] Click the active size again → it clears (back to default), no class.
- [ ] Both wire outputs carry the `text-*` class on the element — no `data-pb-style` island anywhere (retired in E2).
- [ ] Undo/redo moves the font size like any other edit.
- [ ] A block that doesn't support it (e.g. a separator) shows no Font size row.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">
  Pick a size for me in the sidebar
</h2>
<p data-pb-block="paragraph" data-pb-rich="body">
  And me — try sm through 2xl; re-click the active one to clear it.
</p>
```
