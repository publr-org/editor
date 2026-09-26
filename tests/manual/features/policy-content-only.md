---
title: Policy — content-only preset (A5)
---

The `content-only` preset (alias `fixed`) — a fully locked template mode
— expands to canonical policy (story #294): root `allowedBlocks:false` +
`orderable:false`, and every block `editable`-only (movable/removable/duplicable
off). One attribute, a fully locked-but-typeable document. Explicit config still
overrides it (a `content-only` editor could un-pin one type).

Note: A2–A4 enforce editable / move / remove here. The `allowedBlocks:false`
half (no inserter) is resolved but ENFORCED in Phase B (story B2), so the `/` and
`+` inserters may still appear for now.

## Policy

```json
{ "preset": "content-only" }
```

## Checks

- [ ] Every block is editable — click in and type; text changes.
- [ ] No block shows move arrows — nothing can be reordered.
- [ ] Backspace at a block's start does NOT merge it away; multiselect + Delete removes nothing.
- [ ] Formatting still works — select text, Bold/Italic apply (content-only locks structure, not marks).
- [ ] The wire output (right rail) is content only — no `contenteditable`, no policy attributes.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">
  Locked layout — edit the words only
</h2>
<p data-pb-block="paragraph" data-pb-rich="body">
  You can retype this paragraph and format it, but you can't move, delete, or add blocks.
</p>
<blockquote data-pb-block="quote" class="border-l-2 pl-4">
  <div data-pb-rich="body">The structure is fixed; only content changes.</div>
  <cite data-pb-text="citation"></cite>
</blockquote>
```
