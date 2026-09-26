---
title: Embed
---

An iframe embed with a caption — the `media` image carrier holds the embed
URL and dimensions on the iframe, `caption` is the rich carrier below.
`responsive` is an island-canonical setting deriving the 16:9 aspect classes.
There is no oEmbed resolution: the field holds the embed URL itself.

## Checks

- [ ] The first embed's iframe fills the width at a 16:9 aspect; the second keeps its own 560×315 box.
- [ ] Click the caption — caret lands, typing updates it live; emptied, it shows the "Add caption" placeholder.
- [ ] Click the iframe area — the Embed block selects; the breadcrumb reads Document › Embed.
- [ ] Sidebar → Block shows the "Embed" media control with the YouTube embed URL, and "Responsive (16:9)" ON for the first embed.
- [ ] Select the second embed — "Responsive (16:9)" shows OFF; toggling it ON restores the aspect classes and the wire output (⋮ → Show output) drops the island.
- [ ] Undo after the toggle returns the second embed to its fixed-size state.

## Fixture

```html
<figure data-pb-block="embed">
  <iframe
    data-pb-image="media"
    src="https://www.youtube.com/embed/dQw4w9WgXcQ"
    alt="Music video"
    width="560"
    height="315"
    class="aspect-video w-full"
    loading="lazy"
    allowfullscreen
  ></iframe>
  <figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">
    A responsive video embed.
  </figcaption>
</figure>
<figure data-pb-block="embed">
  <script type="application/json" data-pb-settings>
    { "responsive": false }
  </script>
  <iframe
    data-pb-image="media"
    src="https://www.openstreetmap.org/export/embed.html?bbox=19.9,50.0,20.0,50.1"
    alt="Map of Kraków"
    width="560"
    height="315"
    loading="lazy"
    allowfullscreen
  ></iframe>
  <figcaption
    data-pb-rich="caption"
    class="mt-1.5 text-center text-sm text-neutral-500"
  ></figcaption>
</figure>
```
