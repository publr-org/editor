---
title: Style — Variations (C6)
---

Named style variations (story #415) — a "Styles" panel. A block
declares `variations` (paragraph: Display / Subtitle / Annotation); picking one
stores the variation KEY (`block.style.variation`) and a type-aware serializer
emits the whole class-set. Switching replaces the set (single value); re-click
clears. Same policy gate.

## Checks

- [ ] Select a paragraph → the sidebar shows a "Styles" grid: Display, Subtitle, Annotation.
- [ ] Click Display → the paragraph becomes large + bold; the button shows active.
- [ ] Click Subtitle → it swaps (Display's classes are gone, Subtitle's apply).
- [ ] Re-click the active variation → it clears back to default.
- [ ] The "data" output carries the variation's class-set and no `data-pb-style` island.
- [ ] Variations combine with the other panels (e.g. Display + a text color).

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">
  Pick a named style — Display, Subtitle, or Annotation — in the sidebar.
</p>
```
