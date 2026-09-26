---
title: Policy — allowedBlocks on insertion (B2)
---

Root `allowedBlocks` gates what can be inserted (story #401 / Phase B). This
editor allows only **paragraph** and **heading**; every insertion path enforces
it (the `/` picker, the `+` inserter, pattern stamps, Enter-split). It's also
what makes `content-only` (A5) fully lock — set `"allowedBlocks": false` and the
inserter disappears entirely.

## Policy

```json
{ "allowedBlocks": ["paragraph", "heading"] }
```

## Checks

- [ ] In an empty block, type `/` — the picker lists ONLY Paragraph and Heading (no quote, list, image, etc.).
- [ ] The `+` inserter (on an empty block's row) offers the same two types only.
- [ ] Pressing Enter at the end of a paragraph still splits into a new paragraph (paragraph is allowed).
- [ ] There is no way to insert a block type outside the allowlist.
- [ ] (Try `{"allowedBlocks": false}` instead — the `/` picker and `+` inserter no longer appear at all.)

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">
  Only paragraphs and headings can be added here
</h2>
<p data-pb-block="paragraph" data-pb-rich="body">
  Type / on an empty line, or use the + — the palette is limited to the two allowed types.
</p>
<p data-pb-block="paragraph" data-pb-rich="body"></p>
```
