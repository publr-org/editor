---
title: Style — Typography panel (C5)
---

The full typography panel (story #414): line height, letter spacing, decoration
(underline / strike), and letter case (AB / ab / Ab). A block opts in per
sub-key under `supports.typography` (paragraph: all). Each is a toggle-group;
values map to `leading-*` / `tracking-*` / `underline` / `line-through` /
`uppercase` etc. Same policy gate.

## Checks

- [ ] Select a paragraph → the Typography section shows Font size + Line height, Letter spacing, Decoration, Letter case rows (line-height/spacing options = the theme's `leading-*`/`tracking-*` tokens; E1 #428).
- [ ] Line height `relaxed` → lines space out (`leading-relaxed`).
- [ ] Letter spacing `wide` → letters space out (`tracking-wide`).
- [ ] Decoration and Letter case rows lead with a − segment that clears them.
- [ ] Decoration U → underline; S → strikethrough.
- [ ] Letter case AB → uppercase; Ab → capitalize.
- [ ] The "data" output carries the utility classes; no `data-pb-style` island.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">
  Style my line height, letter spacing, decoration, and case from the sidebar.
</p>
```
