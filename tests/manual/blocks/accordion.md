---
title: Accordion
---

A vertical stack of collapsible sections. The accordion itself is just a
children slot restricted to `accordion-item` blocks; this test also covers the
internal accordion-item — native `details`/`summary` with a rich `title`
carrier, a nested children slot, and an island-canonical "Open by default"
toggle.

## Checks

- [ ] Two items stack vertically; where they touch, the shared border does not double up.
- [ ] The first item loads open (its content visible); select it — sidebar → Block shows "Open by default" ON.
- [ ] The second item loads closed; toggling its "Open by default" ON adds `open` in the wire output (⋮ → Show output).
- [ ] Click into a summary title — caret lands, typing updates it live.
- [ ] Click into the paragraph inside the first item — the breadcrumb reads Document › Accordion › Accordion item › Paragraph.
- [ ] Accordion item does not appear in the block inserter — it is internal, created only inside an accordion.
- [ ] Undo after editing a title restores the previous text.

## Fixture

```html
<div
  data-pb-block="accordion"
  data-pb-children
  class="flex flex-col [&>details+details]:border-t-0"
>
  <details data-pb-block="accordion-item" class="border border-neutral-300 px-4 py-3" open>
    <script type="application/json" data-pb-settings>
      { "openByDefault": true }
    </script>
    <summary data-pb-rich="title" class="cursor-pointer font-semibold">
      What is a block editor?
    </summary>
    <div data-pb-children class="mt-2">
      <p data-pb-block="paragraph" data-pb-rich="body">
        A document made of typed, structured pieces you edit in place.
      </p>
    </div>
  </details>
  <details data-pb-block="accordion-item" class="border border-neutral-300 px-4 py-3">
    <summary data-pb-rich="title" class="cursor-pointer font-semibold">
      Why native details/summary?
    </summary>
    <div data-pb-children class="mt-2">
      <p data-pb-block="paragraph" data-pb-rich="body">
        Disclosure behavior comes free from the browser — no scripting on the wire.
      </p>
    </div>
  </details>
</div>
```
