---
title: Patterns
---

Patterns are named block compositions stamped into the document as FULLY
DECOUPLED copies (thoughts/012, stories #388/#421) — a starting point, not a
reference: editing the library design never affects placed copies, and a
copy has NO "source" from its own point of view. They are NOT blocks: the
block pickers ("/" and the inline +) never offer them. Their home is the
rail's **Patterns tab** — group list, live-preview flyout, and the "Explore
all patterns" dialog; the LIBRARY is also where definitions are edited
(versioned publish). The `data-pb-pattern` provenance only labels chrome;
the fixture pre-loads one stamped Hero so load-side labeling is checkable
before any insert.

## Checks

- [ ] List view: the pre-stamped instance shows a "Hero" PATTERN ROOT row (its own phantom node, not a Group) with a FLAT list of its content blocks (Heading, Paragraph, Button) under it — no Group/Buttons layout rows.
- [ ] Serialize (⋮ → Show output) — the editing pane keeps the `data-pb-block="pattern"` wrapper; the DATA pane has NO wrapper at all: the pattern's children publish in its place.
- [ ] Select the stamped heading — the breadcrumb walks Document › Hero › Heading; the sidebar block card also says "Hero".
- [ ] Open the rail (+) → Patterns tab: a group list (All, Banners, Call to action, Columns, Testimonials) and an "Explore all patterns" button below — no icon grid, no patterns anywhere on the Blocks tab.
- [ ] Click "Call to action" — a preview pane opens right of the rail titled "Call to action", showing a LIVE rendered preview card (real heading/copy/button, scaled down), not an icon.
- [ ] Click the group again — the flyout folds; click "All" — every pattern previews in one list.
- [ ] Type "feature" in the Patterns search — the flyout switches to "Search results" with just Feature columns; clearing the search restores the group view.
- [ ] With the caret in the empty paragraph, click the Call to action preview — the empty paragraph is REPLACED by the stamp, and the stamp lands SELECTED as one block (highlighted, sidebar shows its card — no caret inside its heading); the flyout stays open; one ⌘Z removes the entire stamp, redo restores it.
- [ ] Insert a Group or Columns from the Blocks tab — same rule: the fresh container lands block-selected, not with the caret in its seeded paragraph.
- [ ] "Explore all patterns" opens the Patterns dialog: search + category list left, a grid of live previews right; the category picked in the rail comes pre-selected.
- [ ] In the dialog, switch categories and search — the grid filters; picking a preview inserts the stamp and closes the dialog; Esc and ✕ also close it.
- [ ] Type "/" in an empty paragraph — the quick picker lists BLOCKS ONLY (no Patterns section); the inline + grid likewise.
- [ ] Stamp Hero twice (rail → Banners), edit the first stamp's headline — the second stamp is untouched (copies, never references).
- [ ] Select a stamped pattern root — the sidebar shows the PATTERN's card: icon, label, a small "Pattern" chip, description, ONE action ("Edit pattern"), and a Content outline. The outline lists CONTENT blocks only, recursively — headings/paragraphs/quotes/media — never layout (columns, column, group) or invisible blocks (spacer, separator). No versions, no update, no reset.
- [ ] Click a Content outline row — that inner block focuses in the canvas, but the sidebar STAYS on the pattern card (the pattern selection state — a pattern is a content-editing surface here).
- [ ] Click INTO any block inside the pattern in the canvas — inline text editing works, but the Block sidebar still shows the pattern card, never the inner block's controls. Full per-block options exist only inside Edit pattern.
- [ ] List view: the pattern subtree shows as the root plus a FLAT list of its content blocks — no Columns/Column/layout rows in the main editor; the full structure appears only in Edit pattern's isolated editor.
- [ ] The floating toolbar on a pattern root shows Edit pattern plus the normal root shell/options. Its options use Convert to blocks (never Ungroup), alongside allowed duplicate/remove actions. Selecting an inner content block never shows Edit pattern and exposes content-role controls only.
- [ ] "Edit pattern" (toolbar or sidebar) opens THIS COPY in isolation: the page parks, just the copy's blocks load, banner reads "Editing pattern: … — changes apply only to this copy" with Cancel / "Apply to this copy". Full editor in-mode (rail, sidebar, list view, slash, undo/redo).
- [ ] Edit the copy in isolation and Apply — the changes land on THAT copy only (one ⌘Z reverts them); other copies and the library design are untouched. Cancel discards.
- [ ] Library editing lives in the LIBRARY: the flyout and explorer cards carry a small "Edit" affordance — it opens the definition in isolation, banner reads "— publishing updates the library design; placed copies never change", save button reads "Publish pattern".
- [ ] Publish a change to the library design — NO placed copy moves; the previews refresh; a fresh insert uses the new design. (Versions still bump behind the scenes: copy/styling/additions = minor, removals = major — future Symbol material.)
- [ ] In the definition editor, delete down to a single block and Publish — refused with an inline error; the definition survives untouched.
- [ ] Undo inside either isolation mode never walks back into the page document; Cancel restores the page exactly as it was.
- [ ] Serialize (⋮ → Show output) — the editing pane carries `data-pb-pattern="…"` on stamp roots (label only, no version attribute); the data pane carries none of it.

## Fixture

```html
<div data-pb-block="pattern" data-pb-pattern="hero" data-pb-children>
  <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="text-center">
    <h1 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Already stamped</h1>
    <p data-pb-block="paragraph" data-pb-rich="body">
      This Hero was stamped before the document was saved — the phantom root above carries the
      identity and publishes nothing.
    </p>
    <div data-pb-block="buttons" data-pb-children>
      <script type="application/json" data-pb-settings>
        { "justify": "center" }
      </script>
      <a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#">Get started</a>
    </div>
  </div>
</div>
<p data-pb-block="paragraph" data-pb-rich="body"></p>
```
