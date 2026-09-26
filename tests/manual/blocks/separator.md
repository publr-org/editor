---
title: Separator
---

A horizontal rule between sections — a bare `hr` root with no carriers and no
settings.

## Checks

- [ ] A thin horizontal line renders between the two paragraphs.
- [ ] Click the separator — it selects (selection outline appears) and the breadcrumb reads Document › Separator.
- [ ] The separator takes no caret — clicking it never starts a text edit.
- [ ] Delete the selected separator — the paragraphs close up; undo brings the line back.
- [ ] The wire output (⋮ → Show output) is a single `<hr data-pb-block="separator">` with no settings island.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">The first idea ends here.</p>
<hr data-pb-block="separator" class="border-0 border-t border-neutral-300" />
<p data-pb-block="paragraph" data-pb-rich="body">A new idea starts here.</p>
```
