---
title: Quote
---

Left-bordered blockquote with two carriers: a rich `body` in its own div and a
plain-text `citation` on the cite element. No settings.

## Checks

- [ ] The quote renders with a left border; the citation sits under the body in small non-italic text.
- [ ] Click into the body — caret lands, typing updates it live; the inline `invent` renders italic.
- [ ] Select a word in the body — the floating toolbar appears; bold applies and undoes cleanly.
- [ ] Enter mid-body splits the block in two; Backspace at the body's start merges them back.
- [ ] Click into the citation — caret lands, typing updates it live.
- [ ] Select the block — the breadcrumb reads Document › Quote.

## Fixture

```html
<blockquote data-pb-block="quote" class="border-l-2 pl-4">
  <div data-pb-rich="body">The best way to predict the future is to <em>invent</em> it.</div>
  <cite data-pb-text="citation" class="mt-1 block text-sm not-italic">Alan Kay</cite>
</blockquote>
```
