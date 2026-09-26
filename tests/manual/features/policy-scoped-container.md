---
title: Policy — scoped per-container (D2)
---

Policy is **scoped, never cascaded** (thoughts/006): a container governs its own
direct children, independent of the root. This editor pins the **root** level
(`orderable: false`) but leaves the **group's** children reorderable, and gives
the group its own insertion allowlist. Root policy does NOT leak inside.

## Policy

```json
{ "orderable": false, "slots": { "group": { "allowedBlocks": ["paragraph", "heading"] } } }
```

## Checks

- [ ] The top-level heading and group show NO move arrows — root reordering is locked.
- [ ] A paragraph INSIDE the group DOES show move arrows — the root lock did not cascade in (scoped).
- [ ] On an empty line inside the group, `/` offers only Paragraph and Heading (the group's slot allowlist).
- [ ] At the root level, insertion is unrestricted (only the group's slot is limited) — the slot rule doesn't leak out.
- [ ] The wire output (right rail) is content only — no policy attributes.

## Fixture

```html
<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">
  Pinned at the top level — no move arrows
</h2>
<div data-pb-block="group" data-pb-tag="tag" data-pb-children>
  <p data-pb-block="paragraph" data-pb-rich="body">
    Inside the group — I CAN be reordered (root's lock did not cascade in).
  </p>
  <p data-pb-block="paragraph" data-pb-rich="body">
    Type / on an empty line here — the group offers only paragraph + heading.
  </p>
</div>
```
