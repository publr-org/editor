# Publr Editor — Block Manifest (v0)

The manifest is the editor's **input #2** (see `CONTRACT.md` — annotated HTML,
manifest, renderer, theme): a JSON-shaped description of the block types the
editor can create, edit, and offer to authors, plus the reusable patterns that
compose them. It is the vocabulary the wire contract's `data-pb-*` attributes
are resolved against — `data-pb-block="heading"` means whatever
`manifest.blocks.heading` says it means.

Unlike annotated HTML — which is **untrusted content** and parsed permissively —
the manifest is **trusted host input**, so it is validated **strictly**: the
registration API (`src/manifest.js`) rejects unknown keys, wrong value types,
dangling references, and patterns that would degrade to `raw-html`, and it
deep-freezes the result. A manifest bug should fail loudly at registration,
never surface later as silent round-trip corruption.

```js
import { defineManifest } from "./src/manifest.js";

const m = defineManifest({ defaultBlock: "paragraph" });
m.registerBlock("heading", { label: "Heading", fields: [ /* … */ ] });
m.registerPattern("badge", { label: "Badge", html: `…` });
export const manifest = m.build(); // cross-checks + deep-freeze
```

## Top-level shape

```json
{
  "defaultBlock": "paragraph",
  "blocks":   { "<type>": { … } },
  "patterns": { "<key>":  { … } }
}
```

| Key | Kind | Meaning |
|---|---|---|
| `defaultBlock` | editor-UI | The block type Enter-splitting creates (Gutenberg's "default block"). Optional; when absent, Enter never splits. Must reference a registered block type. |
| `blocks` | — | Map of block type → block definition. Type keys are lowercase names (`/^[a-z][a-z0-9-]*$/`). `raw-html` is **reserved** — it is the editor's built-in passthrough type and cannot be registered. |
| `patterns` | editor-UI | Map of pattern key → pattern definition (same key rules). Optional. |

## Contract-facing vs editor-UI keys

Two strata, and the line between them matters for every consumer (the editor,
the CMS manifest generator, any future host):

- **Contract-facing keys** change what upcast/downcast *do* — they define how
  annotated HTML maps to the model and back. Changing one changes the meaning
  of existing wire HTML. These are: **`fields`** (name+type bind DOM carriers;
  `default` fills absent carriers), **`slots`** (names define the model's
  `block.slots` shape; `allow` is editor insert/move policy — upcast stays
  permissive per the contract), and **`classes`** (opts the root's class
  attribute in as a canonical carrier).
- **Editor-UI keys** shape chrome and authoring behavior only; wire HTML and
  the model are identical with or without them. These are: `label`,
  `category`, `placeholder`, `controls`, `split`, `template`, `internal`,
  `defaultBlock`, and the whole `patterns` map (a pattern is insertion sugar —
  `upcast(fragment)` + splice — never wire vocabulary).

## Block definition (`blocks.<type>`)

| Key | Stratum | Required | Type | Semantics |
|---|---|---|---|---|
| `label` | UI | yes | string | Human name shown in the inserter, tree, and sidebar. |
| `category` | UI | no | string | Inserter grouping. The demo orders `text`, `media`, `design`, `layout`; unknown categories group under themselves ("other" bucket ordering is host chrome). Open vocabulary. |
| `internal` | UI | no | boolean | Hidden from the inserter/slash menu; created only through its parent's UI (e.g. `column` via the columns block's "+ Add column"). Data policy is unaffected — internal blocks upcast and round-trip like any other. |
| `classes` | contract | no | boolean | `true` opts the block into **authored classes**: the root's class attribute becomes a canonical carrier (`authored = classAttr − renderer baseline`; downcast emits `baseline ∪ authored`). See CONTRACT.md "Authored classes". |
| `controls` | UI | no | string[] | Structured-style panel declaration: lens group names and/or lens ids (see `src/lenses.js` `CONTROL_GROUPS`), resolved by the host UI. UI surface only, never data policy — undeclared classes still ingest and round-trip via the raw class editor. `[]` = no panel (same as absent). Values are not validated against the lens set: lenses are theme/host-side and may vary per host. |
| `fields` | contract | no | field[] | Editable values with DOM carriers — see **Fields**. Defaults to none. |
| `settings` | contract* | no | setting[] | Values canonical in the settings island — see **Settings**. (*The island itself is contract vocabulary; the setting *types* only drive UI controls.) |
| `slots` | contract | no | (string \| {name, allow})[] | Nesting containers — see **Slots**. |
| `template` | UI | no | string[] | Block types seeded into the **first** slot when a fresh instance is created in the editor (Gutenberg's innerBlocks template — e.g. `quote` starts with one empty `paragraph`). Requires `slots`; every type must be registered and pass the first slot's `allow`. Never applied on upcast — foreign HTML's slot content is whatever it is. |

### Fields

A field binds a name to a DOM carrier kind (the carrier table in CONTRACT.md
is the other half of this contract):

| Field `type` | Canonical carrier (wire) | `default` must be |
|---|---|---|
| `text` | element text content (`data-pb-text`) | string |
| `rich` | element inner HTML (`data-pb-rich`) | string (HTML) |
| `image` | `src`/`alt`/`width`/`height` attributes (`data-pb-image`) | object with **exactly** the string keys `{ src, alt, width, height }` — upcast always reads all four, so a partial default would violate the round-trip law |
| `link` | `href` attribute (`data-pb-link`) | string |
| `tag` | the element's tag name (`data-pb-tag`) | string, ∈ `options` |

| Field key | Required | Applies to | Semantics |
|---|---|---|---|
| `name` | yes | all | Field name — the value of the carrier attribute in wire HTML. Unique within the block. |
| `type` | yes | all | One of the five carrier kinds above. |
| `default` | yes | all | Value applied on upcast when the carrier is absent from the DOM, and on fresh insert. Must match the type per the table. |
| `options` | tag: yes | `tag` only | Whitelist of tag names the field may take (lowercase). Renderers **must** whitelist before emitting a tag (injection guard); the editor UI offers exactly this list. |
| `placeholder` | no | `text`, `rich` | Ghost text shown in the canvas while the field is empty. Editor chrome only — never serialized. |
| `split` | no | `text`, `rich` | `false` disables Enter-splitting inside this field (list items, code) — Enter stays a native newline. Default: splitting enabled. |

### Settings

Settings are model facts with **no visible DOM carrier** — canonical in the
block's settings island (CONTRACT.md "Settings island"). The manifest declares
them so the editor can render controls and seed defaults on insert; the
renderer derives presentation from them (whitelisted token → class, never
string interpolation).

| Setting `type` | Control | `default` must be | `options` |
|---|---|---|---|
| `toggle` | checkbox | boolean | forbidden |
| `buttons` | segmented buttons | string ∈ options | required, non-empty string[] |
| `select` | dropdown | string ∈ options | required, non-empty string[] |
| `text` | text input | string | forbidden |
| `number` | number input | finite number, within `min`/`max` when declared | forbidden |

Keys per setting: `name` (required, unique within the block), `type`,
`default` (required), `options` (per the table); `text` settings may carry
`placeholder` (string, editor chrome only); `number` settings may carry
`min` / `max` / `step` (finite numbers; `step` > 0; `min` ≤ `max`) — UI
constraints for the control, not upcast policy. Upcast is permissive about
island *content* — unknown settings load verbatim; declared types gate only
the editor's controls and the renderer's whitelists.

### Slots

```js
slots: ["children"]                                // shorthand
slots: [{ name: "columns", allow: ["column"] }]    // constrained
```

Each entry declares a nesting container the renderer must emit as an (empty)
`data-pb-slot="<name>"` element. Slot names are lowercase, unique within the
block. The model carries children under `block.slots[<name>]` — keys always
present, empty array when empty, so round trips stay exact.

`allow` (optional) is **editor policy, not upcast policy** (Gutenberg's
`allowedBlocks`): insert/move into the slot is rejected for other types, but
foreign HTML is read permissively. Every `allow` entry must reference a
registered block type.

## Patterns (`patterns.<key>`)

| Key | Required | Type | Semantics |
|---|---|---|---|
| `label` | yes | string | Name in the inserter. |
| `description` | no | string | Tooltip / secondary text. |
| `html` | yes | string | An **annotated-HTML fragment** in this same contract, composing registered blocks. Inserting it is `upcast(fragment)` + splice; from then on its blocks are ordinary blocks. |

Registration enforces the composition rule that used to live only in the demo
test suite: the fragment must upcast to **registered block types only** — an
element that would degrade to `raw-html` (unknown type, missing
`data-pb-block`) fails `build()`. The fragment's root conventionally carries
`data-pb-pattern="<key>"` as an informational provenance label (optional per
the contract — labeling only, never interpretation).

## Validation summary (what throws, when)

At `registerBlock` / `registerPattern` (per-definition):

- unknown keys at any level (manifest, block, field, setting, slot, pattern)
- bad names: block types / pattern keys / slot names / tag options not
  matching `/^[a-z][a-z0-9-]*$/`; registering the reserved `raw-html`
- field `type` outside `text|rich|image|link|tag`; setting `type` outside
  `toggle|buttons|select`
- missing/mistyped `label`, `default`, `options`; `default` not matching its
  declared type (including the exact-four-keys image rule); enum defaults not
  in `options`
- misplaced keys: `options` on non-tag fields, `placeholder`/`split` off
  text/rich, `options` on toggles, `template` without `slots`
- duplicate field/setting/slot names, duplicate registrations

At `build()` (cross-references, needs the full block set):

- `defaultBlock`, `template` entries, and slot `allow` entries referencing
  unregistered types; `template` types violating the first slot's `allow`
- pattern fragments that upcast to anything but registered block types

`build()` deep-freezes and returns the plain manifest object; later
registration or mutation throws. Call it once.

## Versioning

- **Manifest v0 pairs with wire-contract v0** (`data-pb-contract="0"`). The
  schema versions with the contract: a breaking contract bump revisits this
  document; the manifest has no separate version field of its own in v0.
- Every key in this document is **introduced in v0**. New keys must be added
  to these tables with the version they appeared in — this file is the
  registry.
- The strictness stance is the versioning mechanism: because unknown keys are
  **rejected** (not ignored), a manifest written against a future schema fails
  loudly on an old editor instead of silently dropping semantics. Additive
  evolution therefore means: add the key to this spec + validator first, then
  emit it. Generators must emit only spec'd keys.
- Carrier kinds (`FIELD_TYPES`) and setting types (`SETTING_TYPES`) are
  exported by `src/manifest.js` as the machine-readable version of the tables
  above.

## The manifest-generation seam (design note for CMS integration, #218)

In production the manifest is **generated, not hand-written**. This section
settles the seam so #218 can be mechanical.

**A ZSX block component's `pb-*` attributes ARE its field declarations.** ZSX
sugar collapses to prepending `data-` (`pb-text=` → `data-pb-text=`), so the
transpiler already sees, at build time, exactly the facts the manifest's
contract-facing keys encode:

- `pb-text="title"` on an element ⇒ `{ name: "title", type: "text" }` — the
  carrier attribute name gives the field type, its value the field name (same
  mapping for `pb-rich`/`pb-image`/`pb-link`/`pb-tag`).
- `pb-slot="children"` ⇒ `slots: ["children"]`.
- The component's root carrying `data-pb-block="<type>"` names the block type.

The transpiled component itself fills the contract's `render(type, fields,
settings)` slot (WASM ZSX + JIT — #218's other half), which is what makes the
generated manifest and the renderer definitionally consistent: they are two
projections of the same template. This is the same build-time
template-evaluation pass the JIT already uses for class collection — no file
scanners, no runtime reflection.

**Editor-UI keys cannot be derived from markup** — `label`, `category`,
`controls`, `placeholder`, field defaults, `settings` declarations,
`template`, `internal`, `defaultBlock` are authorial intent. They come from
explicit component metadata (a comptime-exported decl / frontmatter on the
block component), merged with the derived contract-facing keys at generation
time. Patterns are annotated-HTML fragments and can be authored directly as
`.publr` snippets or emitted by rendering a composition.

**The seam itself:** the CMS emits one JSON document in exactly the top-level
shape above (`{ defaultBlock, blocks, patterns }`) — at theme build or CMS
boot — and the editor bundle boots with
`defineManifest(generatedJson).build()`. The JS API is the **same shape the
generator targets**; there is no second schema. Hard validation runs on the
generated JSON identically to hand-written manifests, so a generator bug is
an editor-boot error with a named key path, never a silent authoring or
round-trip defect.
