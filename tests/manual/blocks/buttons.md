---
title: Buttons
---

A flex row of button children (only `button` is allowed inside). `justify` and
`gap` are island-canonical settings — the `justify-*` and `gap-*` classes on
the row are derived.

## Checks

- [ ] Both buttons sit on one horizontal row, centered, with a medium gap between them.
- [ ] Select the row (click between/around the buttons) — sidebar → Block shows "Justification" with Center pressed and "Gap" with Medium pressed.
- [ ] Switch "Justification" to Left — the pair slides to the left edge; undo re-centers it.
- [ ] Switch "Gap" to Large — the buttons spread apart; the wire output (⋮ → Show output) island updates to `"gap":"lg"`.
- [ ] Click into a child button's label — typing edits it; the breadcrumb reads Document › Buttons › Button.
- [ ] The second child renders the outline style while the first stays solid — child settings are per-button.

## Fixture

```html
<div
  data-pb-block="buttons"
  data-pb-children
  class="flex flex-wrap items-center justify-center gap-4"
>
  <script type="application/json" data-pb-settings>
    { "justify": "center", "gap": "md" }
  </script>
  <a
    data-pb-block="button"
    data-pb-rich="label"
    data-pb-link="url"
    href="https://example.com/start"
    class="inline-block rounded-sm bg-[var(--color-accent,#3858e9)] px-4 py-2 font-medium text-white no-underline"
    >Get started</a
  >
  <a
    data-pb-block="button"
    data-pb-rich="label"
    data-pb-link="url"
    href="https://example.com/docs"
    class="inline-block rounded-sm border border-current px-4 py-2 font-medium text-[var(--color-accent,#3858e9)] no-underline"
    ><script type="application/json" data-pb-settings>
      { "style": "outline" }
    </script>
    Learn more</a
  >
</div>
```
