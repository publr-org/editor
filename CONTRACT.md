# Editor: the contract

What the editor promises to the outside, and what it depends on. The code is
rewritten from scratch against this; nothing is ported from the previous editor.

## 1. The wire contract (with everything that renders content)

`docs/WIRE-CONTRACT.md` and `docs/BLOCK-MANIFEST.md`. In one line: the editor's
public value is annotated HTML (`data-pb-*` carriers, a JSON settings island),
and `upcast(downcast(model))` deep-equals `model`. Corollaries the code must
keep true:

- The render is the schema: block fields are derived by probing `render({})`;
  render functions tolerate absent fields.
- Unannotated markup survives as an opaque `raw-html` block.
- Authored classes on typed blocks round-trip.
- No second declaration for anything derivable from the rendered carriers.
- Every model mutation flows through one `commit()` choke point, so history
  and selection stay correct.
- The canvas is imperative and uncontrolled; reactive state never owns its DOM.

## 2. The integration contract (with the CMS)

`docs/INTEGRATION.md`: hidden inputs in `#entry-form`, `record.save` with
`expected_version`, boot JS as an asset, sanitisation on the CMS side. The
editor depends on this document, never on the CMS repo.

## 3. Dependencies, all by relative path

| repo | used for |
|---|---|
| `../pjsx` | compiling every `.ptsx` and `.ts` file to an ES module (the `dom` target), as `../ui`'s gallery is built |
| `../ui` | the design-system components the chrome is made of |
| `../publr-js` | the runtime the compiled output calls into |
| `../icons` | `src/index.ts` |
| `../jit` | `jit_engine.wasm` for live classes on the canvas; `theme.zon` projected to TS |

No vite, no Tailwind, no npm, no bundler and no minifier on the build path: the modules
are served as they are, behind an import map. Node only for dev-time type-checking
(`pjsx canonical` + tsgo) and browser tests, untracked. The order of work and the
decisions around this contract: `../.agents/specs/editor-rewrite.md`.

## 4. Shape

```
model/    pure TypeScript, no DOM, no PJSX: the block tree, commit() and history,
          the upcast/downcast codec. Tested headless.
blocks/   the blocks, in PJSX, one component per module (docs/BLOCKS.md)
shell/    the chrome, in PJSX, on ../ui components
host/     the boot module the CMS mounts
tests/    manual/: 57 human-driven specs with fixtures (inherited; the harness
          that runs them is part of the rewrite); e2e: create → edit → publish
```

## 5. What is deliberately not here yet

The MCP server and the theme export of the previous editor. They return as part
of the rewrite when the editor they serve exists.
