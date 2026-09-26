---
title: Cover
---

Hero container: a background image carrier, a derived dim-overlay span, and a
children slot for nested content. `dimRatio`, `contentPosition`, `fullHeight`,
and `hasParallax` are island-canonical; minimum height uses the shared
Tailwind-native Styles control over a low-priority 430px default.

## Checks

- [ ] The first cover shows the background image edge to edge with a 50% black overlay; the heading and paragraph sit centered, in white.
- [ ] Click into the heading — typing edits it; breadcrumb reads Document › Cover › Heading.
- [ ] Sidebar for the first cover shows "Overlay opacity" 50, "Content position" center center, "Full viewport height" OFF, and "Fixed background (parallax)" OFF.
- [ ] The second cover is darker with its content pinned bottom-left — "Overlay opacity" shows 80, "Content position" bottom left.
- [ ] Stepping "Overlay opacity" updates the dim live; undo restores both the canvas and the sidebar value.
- [ ] The third (empty) cover shows the media placeholder card; the sidebar "Background image" media panel offers Upload / URL / alt.
- [ ] Wire output (⋮ → Show output): only the second cover carries a settings island.

## Fixture

```html
<div data-pb-block="cover" class="relative isolate flex overflow-hidden p-4">
  <img
    data-pb-image="image"
    src="https://placehold.co/1200x430/png"
    alt=""
    class="absolute inset-0 -z-20 h-full w-full object-cover"
  />
  <span class="absolute inset-0 -z-10 bg-black opacity-50" aria-hidden="true"></span>
  <div
    data-pb-children
    class="relative flex flex-1 flex-col gap-3 text-white justify-center items-center text-center"
  >
    <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Hero title</h2>
    <p data-pb-block="paragraph" data-pb-rich="body">Supporting copy over the image.</p>
  </div>
</div>
<div data-pb-block="cover" class="relative isolate flex overflow-hidden p-4">
  <script type="application/json" data-pb-settings>
    { "dimRatio": 80, "contentPosition": "bottom-left" }
  </script>
  <img
    data-pb-image="image"
    src="https://placehold.co/1200x430/png"
    alt=""
    class="absolute inset-0 -z-20 h-full w-full object-cover"
  />
  <span class="absolute inset-0 -z-10 bg-black opacity-80" aria-hidden="true"></span>
  <div
    data-pb-children
    class="relative flex flex-1 flex-col gap-3 text-white justify-end items-start text-left"
  >
    <p data-pb-block="paragraph" data-pb-rich="body">Pinned bottom-left under a heavy dim.</p>
  </div>
</div>
<div data-pb-block="cover" class="relative isolate flex overflow-hidden p-4">
  <img
    data-pb-image="image"
    src=""
    alt=""
    class="absolute inset-0 -z-20 h-full w-full object-cover"
  />
  <span class="absolute inset-0 -z-10 bg-black opacity-50" aria-hidden="true"></span>
  <div
    data-pb-children
    class="relative flex flex-1 flex-col gap-3 text-white justify-center items-center text-center"
  >
    <p data-pb-block="paragraph" data-pb-rich="body"></p>
  </div>
</div>
```
