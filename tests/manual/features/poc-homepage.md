---
title: POC homepage — pattern composition
wide: true
---

The Hearth & Home page assembled from the demo theme's registered patterns.
The pattern list is resolved by the fixture loader at runtime, so this page
always uses the live pattern definitions rather than copied HTML.

## Checks

- [ ] The editable homepage content renders in this order: hero, giveaway,
      steps, community callout, and categories.
- [ ] List view shows five top-level Pattern instances with their registered
      labels.
- [ ] Editing one instance does not change its registered source pattern.
- [ ] Inserting another pattern from the explorer creates an independent copy.
- [ ] The plain editor at `/` opens the same homepage composition as its
      seed (persisted edits win; ⋮ → Reset demo data returns to the seed).

## Fixture

```json
{
  "patterns": ["home-hero", "home-giveaway", "home-steps", "home-community", "home-categories"]
}
```

```html
<!-- Populated from the registered patterns declared above. -->
```
