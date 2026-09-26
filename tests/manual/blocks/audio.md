---
title: Audio
---

Figure wrapping an `<audio>` player (the `audio` field reuses the image
carrier) plus an always-present caption. `controls` is always emitted;
autoplay, loop and preload are island-canonical settings.

## Checks

- [ ] The first audio renders a player with controls; clicking it selects the block, breadcrumb reads Document › Audio.
- [ ] There is no "controls" toggle in the sidebar — the player always shows controls.
- [ ] Its caption is editable; when cleared it shows the "Add caption" ghost.
- [ ] The second audio's sidebar shows "Loop" ON and "Preload" set to None.
- [ ] Toggling "Loop" off drops the island key; wire output (⋮ → Show output) reflects it, undo restores.
- [ ] The third (empty) audio shows the media placeholder card; the sidebar "Audio" media panel offers Upload / URL to populate it.

## Fixture

```html
<figure data-pb-block="audio">
  <audio
    data-pb-image="audio"
    src="https://example.com/sample.mp3"
    alt=""
    controls
    class="block w-full"
  ></audio>
  <figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">
    A plain audio player.
  </figcaption>
</figure>
<figure data-pb-block="audio">
  <script type="application/json" data-pb-settings>
    { "loop": true, "preload": "none" }
  </script>
  <audio
    data-pb-image="audio"
    src="https://example.com/sample.mp3"
    alt=""
    controls
    loop
    preload="none"
    class="block w-full"
  ></audio>
  <figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">
    Looping, preload none.
  </figcaption>
</figure>
<figure data-pb-block="audio">
  <audio data-pb-image="audio" src="" alt="" controls class="block w-full"></audio>
  <figcaption
    data-pb-rich="caption"
    class="mt-1.5 text-center text-sm text-neutral-500"
  ></figcaption>
</figure>
```
