---
title: Video
---

Figure wrapping a `<video>` that reuses the image carrier (`video` field) plus
an always-present caption. Playback facts — controls, autoplay, loop, muted,
play inline, preload, poster — are island-canonical; the attributes on the
`<video>` are derived.

## Checks

- [ ] The first video renders a player with browser controls; clicking it selects the block, breadcrumb reads Document › Video.
- [ ] Its caption is editable; when cleared it shows the "Add caption" ghost.
- [ ] The second video shows its poster frame — sidebar toggles "Loop" and "Muted" are ON, "Playback controls" ON, "Poster image URL" holds the placehold.co URL.
- [ ] Toggling "Playback controls" off removes the controls bar from the player; undo brings it back.
- [ ] The third (empty) video shows the media placeholder card; the sidebar "Video" media panel offers Upload / URL to populate it.
- [ ] Wire output (⋮ → Show output): only the second video carries a settings island; derived attrs (`loop muted poster`) match it.

## Fixture

```html
<figure data-pb-block="video">
  <video
    data-pb-image="video"
    src="https://example.com/sample.mp4"
    alt=""
    controls
    class="block w-full"
  ></video>
  <figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">
    A plain video with default playback settings.
  </figcaption>
</figure>
<figure data-pb-block="video">
  <script type="application/json" data-pb-settings>
    { "loop": true, "muted": true, "poster": "https://placehold.co/640x360/png" }
  </script>
  <video
    data-pb-image="video"
    src="https://example.com/sample.mp4"
    alt=""
    controls
    loop
    muted
    poster="https://placehold.co/640x360/png"
    class="block w-full"
  ></video>
  <figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">
    Looping, muted, with a poster.
  </figcaption>
</figure>
<figure data-pb-block="video">
  <video data-pb-image="video" src="" alt="" controls class="block w-full"></video>
  <figcaption
    data-pb-rich="caption"
    class="mt-1.5 text-center text-sm text-neutral-500"
  ></figcaption>
</figure>
```
