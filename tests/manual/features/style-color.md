---
title: Style — Color (C2)
---

Text + Background color (story #411; E1 #428 made the palette THEME-DRIVEN). A
block opts in via `supports.color` (paragraph: text + background; heading:
text). The swatches are the SITE THEME's `color-*` tokens (demo theme: white,
neutral-100/500/900, amber-300, brand); picking one stores the TOKEN KEY and
the serializer emits the real utility (`text-neutral-900`, `bg-brand`); raw CSS
values still become arbitrary-value utilities (`text-[#ff0000]`). Same policy
gate as C1 (`content-only` disables it).

## Checks

- [ ] Select a paragraph → the sidebar shows Text and Background color rows with swatches.
- [ ] Click a Text swatch → the paragraph text recolors; the swatch shows a ring.
- [ ] Click a Background swatch → the paragraph background fills.
- [ ] "Clear" removes a color (and its class).
- [ ] Select a heading → only a Text color row (heading supports text, not background).
- [ ] The "data" wire output carries `text-<token>`/`bg-<token>` classes (e.g. `bg-brand`) and no `data-pb-style` island.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">
  Recolor my text in the sidebar
</h2>
<p data-pb-block="paragraph" data-pb-rich="body">
  Give me a text color and a background — both live in the sidebar.
</p>
```
