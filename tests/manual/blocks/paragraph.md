---
title: Paragraph
---

The basic narrative block: one rich `body` carrier. `dropCap` and `direction`
are island-canonical settings — the class list and `dir` attribute in the
markup are derived presentation.

## Checks

- [ ] Click into the first paragraph — caret lands, typing updates the text live.
- [ ] Enter mid-text splits the block in two; Backspace at the start merges them back.
- [ ] Select a word — the floating toolbar appears; bold and italic apply and undo cleanly.
- [ ] The second paragraph renders its drop cap (large floated first letter); sidebar → Block shows the "Drop cap" toggle ON.
- [ ] Toggling "Drop cap" off removes the big letter; the wire output (⋮ → Show output) drops the island.
- [ ] The third paragraph reads right-to-left; "Text direction" shows RTL pressed. Switching to Auto removes `dir`.
- [ ] Select the third paragraph — the breadcrumb reads Document › Paragraph.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">
  A plain paragraph with <em>emphasis</em>, <strong>strong text</strong>, and enough words to click
  around in.
</p>
<p data-pb-block="paragraph" data-pb-rich="body">
  <script type="application/json" data-pb-settings>
    { "dropCap": true }
  </script>
  Drop cap opens this paragraph — the setting rides the wire as an island, the first-letter styling
  is derived.
</p>
<p data-pb-block="paragraph" data-pb-rich="body" dir="rtl">
  <script type="application/json" data-pb-settings>
    { "direction": "rtl" }
  </script>
  هذه الفقرة تُقرأ من اليمين إلى اليسار.
</p>
```
