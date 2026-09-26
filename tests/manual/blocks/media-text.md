---
title: Media & Text
---

Split layout: an image carrier (`media`) in one grid column, nested content
blocks in the other. `mediaPosition`, `mediaWidth`, `stackOnMobile`,
`verticalAlignment` and `imageFill` are island-canonical; the grid template
and order classes are derived (mediaWidth snaps to 5% steps).

## Checks

- [ ] The first block shows the image left at half width, text right; clicking the image selects the block, breadcrumb reads Document › Media & Text.
- [ ] Click into the paragraph on the text side — typing edits it; breadcrumb reads Document › Media & Text › Paragraph.
- [ ] Sidebar for the first block: "Media position" Left, "Media width (%)" 50, "Stack on mobile" ON, "Vertical alignment" Center.
- [ ] Narrow the window below the md breakpoint — the two columns stack.
- [ ] The second block puts the media column on the right at 30% — "Media position" shows Right, "Media width (%)" shows 30.
- [ ] Its empty media shows the placeholder card in the media column; the sidebar "Media" panel offers Upload / URL / alt.
- [ ] Stepping "Media width (%)" resizes the media column live; undo restores width and sidebar value.
- [ ] Wire output (⋮ → Show output): only the second block carries a settings island.

## Fixture

```html
<div
  data-pb-block="media-text"
  class="grid gap-6 grid-cols-[50%_1fr] items-center max-md:grid-cols-1"
>
  <div class="min-w-0">
    <img
      data-pb-image="media"
      src="https://placehold.co/600x400/png"
      alt="Side media"
      width="600"
      height="400"
      class="block h-auto max-w-full"
    />
  </div>
  <div data-pb-children class="min-w-0">
    <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Side by side</h2>
    <p data-pb-block="paragraph" data-pb-rich="body">
      Words next to media — click around in this paragraph to test editing inside the slot.
    </p>
  </div>
</div>
<div
  data-pb-block="media-text"
  class="grid gap-6 grid-cols-[1fr_30%] items-center max-md:grid-cols-1"
>
  <script type="application/json" data-pb-settings>
    { "mediaPosition": "right", "mediaWidth": 30 }
  </script>
  <div class="min-w-0 order-2">
    <img data-pb-image="media" src="" alt="" class="block h-auto max-w-full" />
  </div>
  <div data-pb-children class="min-w-0">
    <p data-pb-block="paragraph" data-pb-rich="body">
      Media column on the right at 30% — and still empty, so the placeholder card shows.
    </p>
  </div>
</div>
```
