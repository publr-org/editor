---
title: Verse
---

Poetry: a pre root with one rich `content` carrier, preserving line breaks and
indentation but inheriting the page's font instead of monospace. Preformatted
by derivation — Enter never splits.

## Checks

- [ ] Line breaks and the stepped indentation render exactly as written.
- [ ] The verse keeps the page's body font — not monospace like code.
- [ ] The inline `softly` renders italic — the carrier is rich.
- [ ] Click in — caret lands, typing updates the text live.
- [ ] Enter inserts a line break inside the block — it never splits into two blocks.
- [ ] Add an indented line, click elsewhere, come back — the whitespace survives.
- [ ] Select the block — the breadcrumb reads Document › Verse; undo reverts the last edit.

## Fixture

```html
<pre
  data-pb-block="verse"
  data-pb-rich="content"
  class="whitespace-pre-wrap [font-family:inherit] [font-size:inherit]"
>
The cursor blinks and waits,
    a patient metronome,
        counting drafts unsaved —
the page speaks <em>softly</em> back.</pre
>
```
