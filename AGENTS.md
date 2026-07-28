# AGENTS.md — Publr Editor

This file applies to the entire repository. It is the operational guide for
coding agents working on Publr Editor. Use `README.md` for the fuller product
and architecture description, and `CLAUDE.md` as supporting project context.

## Project

Publr Editor is a standalone, provider-agnostic block editor that integrates
with any backend or CMS through its public entrypoints and adapter seams;
Publr CMS is one host among many, with no privileged path. It is built with
strict TypeScript, Vite+ (`vp`), Tailwind CSS 4, and vanilla DOM APIs. There is
no UI framework. The canvas is an uncontrolled `contenteditable` surface;
PublrJS is used for chrome state, not to render the canvas.

The deliverable is an easily embeddable library:

- ESM: `dist/publr-editor.js`
- IIFE: `dist/publr-editor.iife.js`, exposed as `window.Publr.Editor`
- Optional default chrome CSS: `dist/publr-editor.css`

## Non-Negotiable Rules

### Standalone and provider-agnostic

The editor must integrate with any backend or CMS through public APIs alone:
entrypoints (`createEditor`, `createEditorShell`, `attachInlineChrome`) and
adapter seams (`persistence`, `media`, `setCssEngine`, shell host
actions/panels).

- The built-in browser persistence (localStorage documents, OPFS media)
  exists only so the editor is self-contained standalone. Real integrations
  supply their own adapters; integration layers are the implementor's
  concern. First-party integrations may exist elsewhere — never promised,
  never special-cased here.
- If a host has to hack around the editor to integrate, an editor API is
  missing. Propose and add the missing seam (after consideration); do not
  accept or encode the workaround.
- No opinionated theme or web design ships with the editor. `DEFAULT_THEME`
  is generic sensible defaults; integrators author complete themes for the
  contexts they declare. The Hearth theme is a demo/test fixture
  (`src/demo-theme.ts`) — keep it out of `src/index.ts`, the library bundle,
  and any host-theme defaulting path (`withThemeDefaults` fills from
  `DEFAULT_THEME` only). No fixture branding or copy in `src/shell.html`
  chrome.
- No provider-specific code, branches, endpoints, or naming in this
  repository. Cross-repo glue (e.g. the Publr CMS demo-theme export) lives in
  the parent workspace `../scripts/`, never here.

### No compatibility work

This is pre-release software with zero users. There is no backward
compatibility, legacy support, migration layer, or deprecation period.

When changing a format, API, or data shape:

1. Change every producer and consumer in the same change.
2. Update tests, fixtures, demos, and documentation.
3. Delete the superseded path.

Do not add compatibility shims, legacy handlers, old-format fallbacks, dual
code paths, or dead code kept "just in case."

### Do not edit generated or vendored sources

- Never edit `vendor/theme/default-theme.ts` directly. Its source is
  `../jit/src/default-theme.zon`; regenerate it with:
  `node ../scripts/vendor-theme.mjs`.
- Never edit JavaScript under `vendor/publr/`. It is vendored from PublrJS
  with `../scripts/vendor-publr.sh`.
- The `vendor/publr/*.d.ts` files are editor-local typings and may be changed
  when the local TypeScript contract needs updating.
- Do not modify built output in `dist/` or `dist-demo/`; rebuild it.

### Preserve the wire contract

The public value is annotated HTML using `data-pb-*` attributes.

- The render is the schema: block fields are derived by probing
  `render({})`. Render functions must tolerate absent fields.
- Keep the round-trip law true:
  `upcast(downcast(model))` must deep-equal the model.
- Unannotated markup must survive as opaque `raw-html`.
- Authored classes on typed blocks must round-trip.
- Do not introduce a second declaration for information derivable from the
  rendered carriers. Explicit metadata is only for non-derivable editor UI or
  behavior.
- Every model mutation must flow through the editor's `commit()` choke point
  so history and selection semantics remain correct.
- Keep the canvas imperative and uncontrolled. Do not make reactive state the
  owner of its DOM.

## Repository Map

- `src/index.ts` — public entry point; re-exports only
- `src/editor.ts` — editor creation, canvas events, and model commits
- `src/carriers.ts` — wire-contract attributes, escaping, and carrier helpers
- `src/registry.ts` — global block registry and render probing
- `src/cast.ts` — annotated HTML/model upcast and downcast
- `src/tree.ts` — nested block traversal
- `src/history.ts` — snapshot history and coalescing
- `src/selection.ts` — block multiselection
- `src/format.ts` — in-house inline formatting; do not use `execCommand`
- `src/policy.ts` — block policy and locking rules
- `src/patterns.ts` — global pattern registry and pattern versioning
- `src/templates.ts` — templates, parts, and document slots
- `src/blocks/` — one focused module per core block
- `src/persistence-adapter.ts` — document-persistence seam (built-in
  localStorage store is the standalone default; hosts supply adapters)
- `src/media-adapter.ts` / `src/media-store.ts` — media seam and its built-in
  OPFS store
- `src/chrome-inline.ts` — optional inline toolbar, slash picker, and inserter
- `src/shell.ts` / `src/shell.html` — embeddable full editor shell
- `src/demo.ts` — full-shell demo host
- `src/fields-demo.ts` — multiple independent inline-editor instances
- `tests/` — Vitest browser tests in real Chromium
- `tests/manual/` — human QA fixtures and checklists

Keep implementation in focused modules and keep `src/index.ts` limited to the
public import/export surface. Preserve the global registry as the single
registration path for core blocks, plugins, and host code.

## Development Workflow

Install once:

```bash
npm install
npx playwright install chromium-headless-shell
```

Common commands:

```bash
npm run dev          # demo development server
npm run test         # full browser test suite in Chromium
npm run check        # format, lint, and strict type-check
npm run lint         # lint only
npm run fmt          # format
npm run build        # library ESM + IIFE + optional chrome CSS
npm run build:host   # host shell build
npm run build:demo   # demo build
```

Use the narrowest useful test while iterating, then run validation
proportionate to the change. Before handing off a source change, normally run:

```bash
npm run check
npm run test
npm run build
```

For visual or interaction changes, also exercise the relevant flow in real
Chromium using the demo or `/manual.html`. Do not substitute a DOM shim for the
browser suite; casting, selection, editing, and focus behavior intentionally
run against a real DOM.

## Testing Expectations

- Add or update automated coverage for behavior and contract changes.
- Test public behavior and serialized output, not incidental implementation
  details.
- Include round-trip assertions when changing blocks, carriers, casting,
  settings islands, templates, or patterns.
- Verify undo/redo boundaries and caret or block selection restoration for
  mutations.
- The block registry is global. Register shared test definitions deliberately
  and clean up test-specific registrations.
- Put lasting human QA scenarios in
  `tests/manual/<group>/<name>.md`. Follow `tests/manual/README.md`.
- Reported regressions belong in `tests/manual/issues/sc-<story>.md` as well
  as automated coverage when practical.

## Coding Conventions

- Write strict TypeScript and use browser-native DOM APIs.
- Do not introduce Python into this repository.
- Match the existing formatting; use the configured Vite+/Oxfmt tooling.
- Avoid adding runtime dependencies. PublrJS is intentionally the sole
  runtime dependency; `@publr/icons` is the pinned shared artwork package.
- Use the shared `@publr/icons` adapter in `src/icons.ts` for UI icons.
- Keep renderers deterministic and safe for missing fields.
- Preserve tree semantics: child content belongs in `data-pb-children` slots,
  and invalid slot content degrades safely rather than corrupting structure.
- Keep pattern instances as independent copies. Do not reintroduce implicit
  synchronization or partial instance/source merging.
- When public behavior changes, update comments and `README.md` in the same
  change; do not leave stale architecture claims.

## Scope and Project Tracking

Shortcut is the source of truth for work status. The parent
`../.claude/CLAUDE.md` contains the `short` CLI reference and workflow
conventions. Active design rationale lives under `../.claude/thoughts/`;
archived thoughts and plans are reference-only unless the user explicitly
asks for them.

Do not create local plan documents as a substitute for Shortcut. Do not create
or mass-update Shortcut items unless the user asks; when a task names a story,
read that story and keep the implementation within its acceptance criteria.

## Working in the Repository

- Inspect the current worktree before editing. Preserve unrelated user changes
  and never discard or rewrite them.
- Prefer a small, coherent change over opportunistic cleanup.
- Search for all consumers before changing public types, attributes, block
  names, settings, or serialization.
- Do not claim validation that was not run. If a check cannot run, state the
  exact command and blocker in the handoff.
