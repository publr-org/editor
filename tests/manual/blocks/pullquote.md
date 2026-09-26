---
title: Pullquote
---

Centered figure between horizontal rules: one rich `value` carrier (in its own
div inside the blockquote) plus a plain-text `citation` on the cite element.
No settings.

## Checks

- [ ] The pullquote renders centered and large, ruled above and below, citation in small non-italic text.
- [ ] Click into the quote — caret lands, typing updates it live; the inline `much` renders italic.
- [ ] Select a word in the quote — the floating toolbar appears; bold applies and undoes cleanly.
- [ ] Enter mid-quote splits the block in two; Backspace at the start merges them back.
- [ ] Click into the citation — caret lands, typing updates it live.
- [ ] Select the block — the breadcrumb reads Document › Pullquote.

## Fixture

```html
<figure data-pb-block="pullquote" class="border-y py-6 text-center">
  <blockquote class="text-2xl">
    <div data-pb-rich="value">One test is worth <em>much</em> speculation.</div>
  </blockquote>
  <cite data-pb-text="citation" class="mt-2 block text-sm not-italic">Unknown engineer</cite>
</figure>
```
