# Manual tests

Human-driven QA scenarios for the editor. Open the harness with `npm run dev`,
then visit `/manual.html`: a collapsible sidebar of tests on the left, the full
demo shell on the right. Selecting a test loads its fixture into a pristine
editor (`/?fixture=<group>/<name>` — the same URL works standalone and is
shareable in issue reports).

## Anatomy of a test

One markdown file per test, `tests/manual/<group>/<name>.md`:

````markdown
---
title: Human-readable name
---

A sentence or two: what this exercises and why it matters.

## Checks

- [ ] One observable behavior per line — imperative, verifiable by eye.
- [ ] Ticks persist per test in localStorage, so a QA pass survives reloads.

## Fixture

```html
<p data-pb-block="paragraph" data-pb-rich="body">The document the editor loads.</p>
```
````

The **first ` ```html ` fence is the fixture** — carrier markup exactly as the
block's `render()` emits it (see `src/blocks/`). Block settings ride in as
islands: `<script type="application/json" data-pb-settings>{…}</script>` first
inside the block root. Un-annotated markup is also legal — it upcasts to an
opaque `raw-html` block by design.

## Groups

- `blocks/` — one test per non-internal block. Internal, parent-scoped blocks
  (`list-item`, `column`, `accordion-item`) are covered by their
  parent's test.
- `features/` — cross-block behaviors: selection, history, grouping, casting…
- `issues/` — one test per reported issue, named after the Shortcut story
  (e.g. `issues/sc-402.md`), so every regression keeps a living repro.

Adding a file is the whole registration — the harness discovers tests by glob.
