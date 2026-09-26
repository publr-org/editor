---
title: Theme — token scales drive the controls (E1)
---

The style controls derive their options from the SITE THEME (story #428) — no
hardcoded scales. This fixture ships its own tiny theme via the ```json fence
below (a fence with a `tokens`key is a theme; any other is policy): 4 font
sizes **including the invented`text-xxxxl`\*\*, a 3-color palette, one radius.
Compare with the main demo (no fixture), whose curated DEMO_THEME offers 5
sizes and 7 colors.

## Checks

- [ ] Select the paragraph → Font size offers exactly: sm, base, lg, **xxxxl** — the control GREW from the theme token.
- [ ] Color rows offer exactly 3 swatches (white, neutral-900, brand) — shrunk from the demo's 7.
- [ ] Pick xxxxl → the editing output carries `text-xxxxl`. (It renders unstyled for now — the class resolves when the CSS engine lands in E3; token membership is what E1 proves.)
- [ ] Pick lg → the paragraph visibly grows (`text-lg` is in the demo build's CSS).
- [ ] Pick brand as text color → output carries `text-brand` and the text turns blue.
- [ ] Border radius offers only `lg`.
- [ ] Reload without `?fixture=` → the main demo is back on its own theme (5 sizes, 7 colors).

## Fixture

```json
{
  "tokens": {
    "spacing": "0.25rem",
    "text-sm": "0.875rem",
    "text-base": "1rem",
    "text-lg": "1.125rem",
    "text-xxxxl": "4.5rem",
    "color-white": "#ffffff",
    "color-neutral-900": "oklch(20.5% 0 0)",
    "color-brand": "#3858e9",
    "radius-lg": "0.5rem",
    "leading-tight": "1.25",
    "leading-normal": "1.5",
    "leading-relaxed": "1.625",
    "tracking-tight": "-0.025em",
    "tracking-normal": "0em",
    "tracking-wide": "0.025em"
  }
}
```

```html
<p data-pb-block="paragraph" data-pb-rich="body">
  My style options come from the theme document — including the made-up XXXXL size.
</p>
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">
  Headings share the same theme
</h2>
```
