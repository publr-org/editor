---
title: Image
---

Figure with one image carrier and an always-present caption. The link wrapper
is derived from the `href`/`linkTarget` settings; `aspectRatio` and `scale`
are island-canonical and derive `[&_img]:…` classes on the root.

## Checks

- [ ] Click the first image — the block selects (no text caret); breadcrumb reads Document › Image.
- [ ] Sidebar → Block shows the "Image" media panel with the current file, URL and alt text; editing alt updates the `<img>` (check via ⋮ → Show output).
- [ ] The caption under the first image is editable; when cleared it shows the "Add caption" ghost.
- [ ] The second image renders letterboxed wide and wrapped in a link — "Aspect ratio" shows Wide (16:9), "Link URL" shows https://example.com, "Open in" shows New tab.
- [ ] Switching "Aspect ratio" back to Original removes the crop; undo restores it and the sidebar follows.
- [ ] The third (empty) image shows the media placeholder card; Upload / URL (card or sidebar "Image" panel) populates it.
- [ ] Wire output: only the second image carries a settings island; the empty image keeps its empty `src`/`alt` carriers.

## Fixture

```html
<figure data-pb-block="image">
  <img
    data-pb-image="image"
    src="https://placehold.co/600x300/png"
    alt="Placeholder banner"
    width="600"
    height="300"
    class="block h-auto max-w-full"
  />
  <figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">
    A populated image with a caption.
  </figcaption>
</figure>
<figure data-pb-block="image" class="[&_img]:aspect-video [&_img]:w-full [&_img]:object-cover">
  <script type="application/json" data-pb-settings>
    { "href": "https://example.com", "linkTarget": "_blank", "aspectRatio": "16-9" }
  </script>
  <a href="https://example.com" target="_blank" rel="noopener"
    ><img
      data-pb-image="image"
      src="https://placehold.co/800x450/png"
      alt="Wide linked placeholder"
      width="800"
      height="450"
      class="block h-auto max-w-full"
  /></a>
  <figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">
    Linked, cropped to 16:9.
  </figcaption>
</figure>
<figure data-pb-block="image">
  <img data-pb-image="image" src="" alt="" class="block h-auto max-w-full" />
  <figcaption
    data-pb-rich="caption"
    class="mt-1.5 text-center text-sm text-neutral-500"
  ></figcaption>
</figure>
```
