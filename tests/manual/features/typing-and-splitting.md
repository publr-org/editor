---
title: Typing, splitting, merging
---

The core text-editing loop: carriers sync keystrokes to the model, Enter
splits a block, Backspace at the start merges into the previous one.

## Checks

- [ ] Type in the first paragraph — the text updates without the caret jumping.
- [ ] Enter mid-sentence splits it into two paragraphs at the caret.
- [ ] Backspace at the very start of the second paragraph merges it back — inline formatting on both sides survives.
- [ ] Enter at the end of a paragraph creates a fresh empty paragraph showing its ghost placeholder.
- [ ] Backspace in that empty paragraph removes it and puts the caret at the end of the previous block.
- [ ] Enter inside the heading splits heading → heading + paragraph? Verify the split result is sane and undo restores one block.
- [ ] The code block preserves indentation and newlines while typing — Enter inserts a literal newline, not a new block.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Splitting and merging</h2>
<p data-pb-block="paragraph" data-pb-rich="body">
  First paragraph with <em>inline</em> formatting to carry through a split and merge.
</p>
<p data-pb-block="paragraph" data-pb-rich="body">
  Second paragraph — Backspace at my start merges me up.
</p>
<pre data-pb-block="code" data-pb-rich="content">
function demo() {
  return "whitespace matters";
}</pre
>
```
