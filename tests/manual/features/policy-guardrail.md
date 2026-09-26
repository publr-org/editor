---
title: Policy — template-authoritative guardrail (A8)
---

The editor's policy is **config-authoritative** (story #297): it comes from
`createEditor({ policy })` / `setPolicy`, never from loaded content. This fixture
is deliberately **hostile** — the saved HTML carries `data-pb-lock`,
`contenteditable="true"`, and a `data-pb-allowed` on the doc wrapper, all trying
to loosen the lock. The config applies `content-only`; the content's claims are
ignored (upcast keeps only carriers/classes/children — policy-looking attributes
are dropped, thoughts/010).

This is the security property: a stale row, a copy-paste, or AI-written HTML can
never unlock a field the template meant to lock.

## Policy

```json
{ "preset": "content-only" }
```

## Checks

- [ ] Despite `contenteditable="true"` in the source, blocks are editable ONLY because content-only permits editing — try to move/delete: you can't.
- [ ] Despite `data-pb-lock` in the source, nothing behaves differently from the plain content-only fixture — the attribute is inert.
- [ ] No block can be moved or deleted (content-only wins over the "unlock" attributes).
- [ ] The wire output (right rail) is clean — the `data-pb-lock` / `contenteditable` / `data-pb-allowed` from the source are gone.

## Fixture

```html
<div data-pb-doc data-pb-allowed="everything">
  <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" data-pb-lock="">
    Hostile heading — its data-pb-lock is ignored
  </h2>
  <p data-pb-block="paragraph" contenteditable="true" data-pb-lock="none" data-pb-rich="body">
    This paragraph's contenteditable and data-pb-lock are dropped on load — policy comes from
    config.
  </p>
</div>
```
