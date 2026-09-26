---
title: Gallery
---

A grid of image blocks (children slot restricted to `image`) plus a gallery
caption. `columns` and `imageCrop` are island-canonical; the grid and crop
classes on the inner slot are derived.

## Checks

- [ ] The first gallery lays out three images in three columns, square-cropped; its caption is editable below the grid.
- [ ] Click an image inside — the image block selects; breadcrumb reads Document › Gallery › Image, and the sidebar shows the image's own "Image" media panel.
- [ ] Each child image keeps its own editable caption ("Add caption" ghost when empty).
- [ ] The second gallery renders two columns, uncropped — sidebar shows "Columns" 2 and "Crop images to fit" OFF.
- [ ] Stepping "Columns" reflows the grid live; undo restores the previous layout and sidebar value.
- [ ] The empty image child in the second gallery shows the media placeholder card inside its grid cell; Upload / URL populates it.
- [ ] Wire output (⋮ → Show output): only the second gallery carries a settings island.

## Fixture

```html
<figure data-pb-block="gallery">
  <div
    data-pb-children
    class="grid gap-3 grid-cols-3 [&_img]:aspect-square [&_img]:w-full [&_img]:object-cover"
  >
    <figure data-pb-block="image">
      <img
        data-pb-image="image"
        src="https://placehold.co/400x400/png"
        alt="First"
        class="block h-auto max-w-full"
      />
      <figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">
        First
      </figcaption>
    </figure>
    <figure data-pb-block="image">
      <img
        data-pb-image="image"
        src="https://placehold.co/400x300/png"
        alt="Second"
        class="block h-auto max-w-full"
      />
      <figcaption
        data-pb-rich="caption"
        class="mt-1.5 text-center text-sm text-neutral-500"
      ></figcaption>
    </figure>
    <figure data-pb-block="image">
      <img
        data-pb-image="image"
        src="https://placehold.co/300x400/png"
        alt="Third"
        class="block h-auto max-w-full"
      />
      <figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">
        Third
      </figcaption>
    </figure>
  </div>
  <figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">
    A three-column gallery.
  </figcaption>
</figure>
<figure data-pb-block="gallery">
  <script type="application/json" data-pb-settings>
    { "columns": 2, "imageCrop": false }
  </script>
  <div data-pb-children class="grid gap-3 grid-cols-2">
    <figure data-pb-block="image">
      <img
        data-pb-image="image"
        src="https://placehold.co/600x300/png"
        alt="Uncropped"
        class="block h-auto max-w-full"
      />
      <figcaption
        data-pb-rich="caption"
        class="mt-1.5 text-center text-sm text-neutral-500"
      ></figcaption>
    </figure>
    <figure data-pb-block="image">
      <img data-pb-image="image" src="" alt="" class="block h-auto max-w-full" />
      <figcaption
        data-pb-rich="caption"
        class="mt-1.5 text-center text-sm text-neutral-500"
      ></figcaption>
    </figure>
  </div>
  <figcaption
    data-pb-rich="caption"
    class="mt-1.5 text-center text-sm text-neutral-500"
  ></figcaption>
</figure>
```
