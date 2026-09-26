---
title: Style backend — inline carrier (E2a)
---

The zero-dependency backend (story #429). Open this fixture WITH the `inline`
flag: `/?inline&fixture=features/inline-backend`. Lens writes go to the root's
`style` attribute as `var(--token)` declarations; a `:root` block from the
theme document (`<style id="pbe-inline-theme">`) resolves them. No Tailwind,
no engine, publish needs no tooling. Pasted utility classes stay OPAQUE —
understanding Tailwind is the engine's job, and this backend has none.

## Checks

- [ ] Pick a Font size → the paragraph restyles; the "editor" output shows `style="font-size: var(--text-lg)"` (no new class).
- [ ] Pick a Padding step → `padding: calc(var(--spacing) * 4)` joins the style attr.
- [ ] Set a Border width → `border-width` AND `border-style: solid` ride together (self-sufficient carrier).
- [ ] The second paragraph's pasted `text-2xl` class does NOT register in the Font size control (opaque authored class) — and setting a size writes an inline declaration that wins over it (cascade: inline > utilities).
- [ ] Design tab: edit a token value → the canvas restyles live (the `:root` vars refresh — no compile step at all).
- [ ] Undo/redo moves the style attr like any other edit; the "data" output carries the style attr verbatim.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">
  Style me — everything lands in my style attribute as var() references.
</p>
<p data-pb-block="paragraph" data-pb-rich="body" class="text-2xl">
  I carry a pasted Tailwind class this backend honestly ignores.
</p>
```
