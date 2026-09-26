---
title: Button
---

A button-style link: anchor root with a rich `label` carrier and a `url` link
carrier. `style` (solid|outline|link), `linkTarget`, `rel`, and `title` are
island-canonical settings — the class list, `target`, `rel`, and `title`
attributes are derived.

## Checks

- [ ] Click into the first button's label — caret lands, typing updates the text live.
- [ ] Select the first button — sidebar → Block shows "Style" with Solid pressed and "Link URL" reading `https://example.com`.
- [ ] The second button renders the outline look (border, accent text, no fill); "Style" shows Outline pressed.
- [ ] The second button's "Open in" reads New tab and "Link rel" reads `nofollow`; the wire output (⋮ → Show output) carries `target="_blank"` and `rel="noopener nofollow"`.
- [ ] Switch the second button's Style to Solid — it fills with the accent color; undo restores the outline look.
- [ ] Editing "Link URL" in the sidebar updates the anchor's `href` in the wire output.
- [ ] Select a button — the breadcrumb reads Document › Button.

## Fixture

```html
<a
  data-pb-block="button"
  data-pb-rich="label"
  data-pb-link="url"
  href="https://example.com"
  class="inline-block rounded-sm bg-[var(--color-accent,#3858e9)] px-4 py-2 font-medium text-white no-underline"
  >Get started</a
>
<a
  data-pb-block="button"
  data-pb-rich="label"
  data-pb-link="url"
  href="https://example.com/docs"
  target="_blank"
  rel="noopener nofollow"
  title="Read the docs"
  class="inline-block rounded-sm border border-current px-4 py-2 font-medium text-[var(--color-accent,#3858e9)] no-underline"
  ><script type="application/json" data-pb-settings>
    { "style": "outline", "linkTarget": "_blank", "rel": "nofollow", "title": "Read the docs" }
  </script>
  Read the docs</a
>
```
