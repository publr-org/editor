---
title: Icon
---

Inline span whose rich `svg` carrier holds SVG markup. Rotation and flips are
island-canonical settings deriving transform utilities; `noSplit` on the svg
carrier means Enter never splits the block.

## Checks

- [ ] The first icon renders the inline circle SVG at text size; clicking it selects the block, breadcrumb reads Document › Icon.
- [ ] The second icon (arrow) appears rotated 90° and flipped — sidebar shows "Rotation" 90° and "Flip horizontally" ON, "Flip vertically" OFF.
- [ ] Changing "Rotation" re-orients the arrow live; undo restores both the canvas and the sidebar value.
- [ ] Toggling "Flip vertically" mirrors the arrow; the transforms compose (rotation stays applied).
- [ ] Enter with the icon selected never splits it into two blocks (noSplit).
- [ ] Wire output (⋮ → Show output): only the second icon carries a settings island; the SVG markup round-trips inside the span.

## Fixture

```html
<span data-pb-block="icon" data-pb-rich="svg" class="inline-block"
  ><svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5">
    <circle cx="10" cy="10" r="8"></circle></svg
></span>
<span data-pb-block="icon" data-pb-rich="svg" class="inline-block rotate-90 -scale-x-100">
  <script type="application/json" data-pb-settings>
    { "rotation": "90", "flipHorizontal": true }
  </script>
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5">
    <path d="M6 4l8 6-8 6z"></path>
  </svg>
</span>
```
