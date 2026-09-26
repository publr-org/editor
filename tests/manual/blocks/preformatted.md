---
title: Preformatted
---

A pre with one rich `content` carrier — whitespace preserved like code, but
inline markup survives. Preformatted by derivation: newlines are content,
Enter never splits.

## Checks

- [ ] Indentation, aligned columns, and the blank line render exactly as written.
- [ ] The inline bold and italic render styled — this pre is rich, unlike code.
- [ ] Click in — caret lands, typing updates the text live.
- [ ] Enter inserts a newline inside the block — it never splits into two blocks.
- [ ] Select a word — the floating toolbar appears; bold applies and undoes cleanly.
- [ ] Add an indented line, click elsewhere, come back — the whitespace survives.
- [ ] Select the block — the breadcrumb reads Document › Preformatted.

## Fixture

```html
<pre data-pb-block="preformatted" data-pb-rich="content" class="whitespace-pre-wrap">
Dear reader,
    this line is indented four spaces.
Columns   line   up   when   spacing   holds.

<strong>Bold</strong> and <em>italic</em> survive in here.</pre
>
```
