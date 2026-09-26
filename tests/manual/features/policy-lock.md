---
title: Policy — editable + allowedFormats (A2)
---

Phase-A policy enforcement (story #291), applied as **editor config** — not as
fixture markup. Policy is a runtime schema layer, never in the wire contract
(thoughts/010); the harness reads the `json` policy fence below and hands it to
`editor.setPolicy()`. Here the **heading** type is locked (`editable:false`) and
the **paragraph** type permits bold only (`allowedFormats:["bold"]`); the
**quote** is unrestricted, for contrast.

## Policy

```json
{ "blocks": { "heading": { "editable": false }, "paragraph": { "allowedFormats": ["bold"] } } }
```

## Checks

- [ ] The heading ("Locked title") can't be edited — clicking in and typing does nothing, no caret lands.
- [ ] Both paragraphs and the quote ARE editable — typing works.
- [ ] Selecting text in a paragraph shows the floating toolbar with **B** but NO italic button.
- [ ] The **B** button bolds the paragraph selection; there is no way to italicize it.
- [ ] Selecting text in the quote shows BOTH **B** and **I** (quote has no format lock).
- [ ] The wire output (right rail — "editor" and "data") contains no `contenteditable` and no policy attributes: content only.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">
  Locked title — try to edit me
</h2>
<p data-pb-block="paragraph" data-pb-rich="body">
  First paragraph — select me: Bold only, no Italic.
</p>
<p data-pb-block="paragraph" data-pb-rich="body">Second paragraph — same lock: Bold only.</p>
<blockquote data-pb-block="quote" class="border-l-2 pl-4">
  <div data-pb-rich="body">Quote — Bold AND Italic both work here (unrestricted).</div>
  <cite data-pb-text="citation"></cite>
</blockquote>
```
