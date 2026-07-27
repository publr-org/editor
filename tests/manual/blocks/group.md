---
title: Group
---

The one layout container. Group, Row, Stack, and Grid are responsive visual
layouts of this same block; the root remains `data-pb-block="group"` and is the
children slot at every breakpoint.

## Checks

- [ ] Click into the heading and paragraph inside the group — both edit in place.
- [ ] Select the Group container — the breadcrumb reads Document › Group; a child reads Document › Group › Paragraph.
- [ ] Sidebar → Block shows Layout with Group pressed on Mobile; picking Row keeps the model a Group and adds `flex flex-row`.
- [ ] Switch to Desktop, pick Stack, then return to Mobile — Mobile remains Row while Desktop is Stack and the children never move in the model.
- [ ] The sidebar card, breadcrumb, and List View say Row or Stack at the corresponding viewport, while the wire output remains a Group.
- [ ] Grid exposes columns; Row exposes wrapping; plain Group hides controls that have no effect.
- [ ] In Layout, enable “Container” — the Group itself becomes a centered Wide container; its children keep their existing layout.
- [ ] Leave Container off on Mobile, switch to Desktop and enable Wide + Bleed right, then return to Mobile — the Group is full width on Mobile and constrained with a right bleed only on Desktop.
- [ ] For a nested text Group, enable Container on Mobile and disable it on Desktop — the text is contained only while its outer Group is full width.
- [ ] The List View row and Block card gain a visible “Container” marker while the layout name remains Group, Row, Stack, or Grid.
- [ ] Use the Group toolbar’s Container width menu — Content and Wide show their resolved theme measurements; the menu is absent when Container is off.
- [ ] Set Bleed to Left, Right, or Both — the Group keeps its container-aligned layout tracks while the corresponding outer edge block reaches the viewport. The Bleed control is absent when Container is off.
- [ ] Container width, Bleed, and alignment controls use icons in the toolbar and menus. Wrap is a single toggle whose icon changes between No wrap and Wrap; reverse wrapping remains available in the detailed inspector.
- [ ] Open Design system → Container widths, change Wide, and return — every Group using Wide updates without changing its responsive style value.
- [ ] Select the two loose paragraphs below the group and press ⌘G — they wrap in a new Group; ⇧⌘G on that group dissolves it back to loose paragraphs.
- [ ] List view nests Heading and Paragraph under Group.

## Fixture

```html
<div data-pb-block="group" data-pb-children>
  <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Grouped content</h2>
  <p data-pb-block="paragraph" data-pb-rich="body">A paragraph living inside the group's slot.</p>
</div>
<p data-pb-block="paragraph" data-pb-rich="body">
  Loose paragraph one — select me together with the next…
</p>
<p data-pb-block="paragraph" data-pb-rich="body">
  …and loose paragraph two, then ⌘G to wrap us in a group.
</p>
```
