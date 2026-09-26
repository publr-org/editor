---
title: Media — upload, URL, alt
---

The sidebar Media control over image-carrier fields: OPFS uploads served by
the `/media/*` service worker, URL entry, alt text. The carrier value is one
fact — src/alt/width/height write together.

## Checks

- [ ] Select the empty image block — the canvas shows the media placeholder; sidebar → Block shows the Media panel with an Add/Upload affordance (upload requires the service worker — first load may need one reload).
- [ ] Upload a file — the image appears in the canvas; the wire output src points at `/media/…` and width/height are filled from the file.
- [ ] Paste an external URL instead — the image swaps; width/height clear (intrinsic dims unknown).
- [ ] Set alt text — it lands on the `<img>` in the wire output.
- [ ] Replace the populated image via the sidebar — thumbnail and canvas both update.
- [ ] Remove the media — back to the placeholder; the field carries empty src/alt/dims.
- [ ] Reload the fixture after an upload — a previously uploaded `/media/*` URL still resolves (OPFS persists).
- [ ] Undo walks the media changes back step by step.

## Fixture

```html
<figure data-pb-block="image">
  <img data-pb-image="image" src="" alt="" class="block h-auto max-w-full" />
  <figcaption data-pb-rich="caption"></figcaption>
</figure>
<figure data-pb-block="image">
  <img
    data-pb-image="image"
    src="https://placehold.co/600x300/png"
    alt="Pre-filled placeholder"
    class="block h-auto max-w-full"
  />
  <figcaption data-pb-rich="caption">Starts populated — replace or remove me.</figcaption>
</figure>
```
