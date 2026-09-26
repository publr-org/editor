---
title: CSS engine — live compile + the Define… loop (E3/E4)
---

The engine seam (stories #431/#433). The vendored JIT wasm (a Web Worker,
`src/wasm-engine.ts`) compiles the canvas's live class universe on every
change, injected as one `<style id="pbe-engine-css">` — no backend, works
identically in dev and on the static deploy. The Design tab shows the engine
status, edits the theme visually, and imports/exports v4 `@theme` CSS.
Unresolved utility classes surface as chips with a Define… jump.

## Checks

- [ ] Design tab → "CSS engine: live (wasm engine)" (or "none — build-time CSS only" if the wasm fails to load — everything below except live compile still works).
- [ ] Select the first paragraph → an amber "Not in your theme" chip lists `text-xxxxl`.
- [ ] Click Define… → Design tab opens with `text-xxxxl` prefilled; type `6rem` → Add token.
- [ ] The Font size control now offers xxxxl AND the paragraph's `text-xxxxl` class resolves (the control shows it active).
- [ ] Design tab: change a color value (e.g. brand) → swatches + canvas react.
- [ ] Remove a font-size token → the option disappears from the control.
- [ ] Import: paste `@theme { --text-mega: 4rem; }` → mega joins the scale. Export pane always shows the current theme as @theme CSS.
- [ ] `<style id="pbe-engine-css">` in devtools carries the compiled utilities (updates ~150ms after edits).

## Fixture

```json
{
  "tokens": {
    "spacing": "0.25rem",
    "text-sm": "0.875rem",
    "text-base": "1rem",
    "text-lg": "1.125rem",
    "color-white": "#ffffff",
    "color-neutral-900": "oklch(20.5% 0 0)",
    "color-brand": "#3858e9",
    "radius-lg": "0.5rem",
    "leading-normal": "1.5",
    "tracking-normal": "0em"
  }
}
```

```html
<p data-pb-block="paragraph" data-pb-rich="body" class="text-xxxxl">
  I arrived from a template with a class your theme doesn't know — define it.
</p>
<p data-pb-block="paragraph" data-pb-rich="body">A plain neighbour for comparison.</p>
```
