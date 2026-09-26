# Publr Editor — HTML Wire Contract (v0)

The Publr visual editor speaks **annotated HTML** — nothing else. It has no
knowledge of ZSX, Zig, `.publr` files, or how the host CMS stores content. Any
system (the Publr CMS, a static site, an AI agent writing markup by hand) that
produces HTML conforming to this contract can have its content loaded, edited,
and serialized back by the editor.

Four inputs define the editor's entire world:

1. **Annotated HTML** — `data-pb-*` attributes + JSON settings islands (this document).
2. **A block manifest** — JSON describing the available block types and their
   fields (schema + registration API: `MANIFEST.md`).
3. **A renderer** — one pluggable function `render(type, fields, settings) → html`.
4. **A theme** — a flat token map (Tailwind-v4 `@theme` naming: `color-indigo-500`,
   `text-lg`, `radius-xl`, `spacing`, …) that populates the structured style
   controls. It is a projection of the SAME theme the host's style compiler
   uses — for Publr, the JIT's `theme.zon` (`scripts/theme-json.py`). Swap the
   theme, and every control's scale follows.

## Wire format, not storage format

Annotated HTML is a **serialization** of the block model, not the model's home.
The model (a plain JSON structure, see below) is the source of truth while
editing; hosts store it however they like. The HTML must nevertheless be a
*complete* serialization — every model fact must survive a round trip:

> **The round-trip law.** `upcast(downcast(model))` must deep-equal `model`.
> This is the conformance test for the contract, for the editor, and for every
> renderer implementation.

The reverse direction (`downcast(upcast(html))`) must be **semantically
stable**: loading foreign HTML and serializing it back may normalize it (mint
missing ids, normalize the settings island, regenerate derived attributes) but
must not lose content. Normalized output re-upcasts to an identical model.

## Namespaces

| Prefix | Owner | Meaning |
|---|---|---|
| `data-pb-*` | **this contract** | Editing surface: block identity, field carriers, structure. Read by the editor, written by renderers/downcast. |
| `data-p-*` (and bare `data-p`) | **PublrJS runtime** | Runtime behavior: stores, events, bindings. To the editor these are *content* — authored via the interactions UI, carried opaquely through the model, never interpreted. |

PublrJS wires directives by exact attribute name, so the two namespaces cannot
collide. An element may legitimately carry both: `data-pb-text="title"` (the
editor may edit this text) next to `data-p-text="state.count"` (the runtime
binds this text at view time).

## Vocabulary

### Block identity

| Attribute | On | Meaning |
|---|---|---|
| `data-pb-doc` | content root | Marks the editable region. Its element children are the block sequence. Optional `data-pb-contract="0"` records the contract version. |
| `data-pb-block="<type>"` | block root | This element is a block instance of `<type>`. |
| `data-pb-id="<id>"` | block root | Stable instance id. **Minted by upcast when missing** — ids are editor bookkeeping, never an authoring requirement. |
| `data-pb-pattern="<key>"` | block root | **Optional, informational.** Provenance label naming the manifest pattern this composition came from (model key `block.pattern`; this attribute is its canonical carrier). The editor may use it for labeling only — never for interpretation. It can go stale once the composition is edited; hand-authored HTML may include or omit it freely. |

### Field carriers (canonical value locations)

| Attribute | Canonical carrier |
|---|---|
| `data-pb-text="<field>"` | The element's **text content** (plain text). |
| `data-pb-rich="<field>"` | The element's **inner HTML** (rich text). |
| `data-pb-image="<field>"` | The element's `src` + `alt` attributes. |
| `data-pb-link="<field>"` | The element's `href` attribute. |
| `data-pb-tag="<field>"` | The element's **tag name** (lowercase). For values that ARE markup structure — e.g. a heading block's `level` is carried by it literally being an `<h2>`. Renderers must whitelist the value before emitting a tag. Tag changes can't be patched in place; the block re-renders. |

One element may carry several fields (e.g. a CTA anchor with
`data-pb-text="label" data-pb-link="url"`, or a heading root with
`data-pb-tag="level" data-pb-text="text"`). Carriers belong to the **nearest
ancestor block root** — a carrier inside a nested block belongs to the inner
block. When a block root is its own `text`/`rich` carrier, a direct-child
settings island is **excluded from the value** on upcast (it is metadata, not
content).

### Slots (nesting — layout is blocks too)

```html
<div data-pb-block="columns" data-pb-id="b_1">
  <div data-pb-slot="col-1">
    <h2 data-pb-block="heading" data-pb-id="b_2" data-pb-tag="level" data-pb-text="text">Hi</h2>
  </div>
  <div data-pb-slot="col-2"></div>
</div>
```

| Attribute | Meaning |
|---|---|
| `data-pb-slot="<name>"` | Element is a slot container: its element children are **nested blocks**. Belongs to the nearest ancestor block root (a block root may itself be a slot container). |

- The manifest declares a block's slots — either names
  (`slots: ["children"]`) or constrained entries
  (`slots: [{ "name": "columns", "allow": ["column"] }]`, Gutenberg's
  `allowedBlocks`). The model carries children under `block.slots[name]`
  (always present as keys, empty array when empty — round trips stay exact).
- `allow` is **editor policy, not upcast policy**: insert/move into the slot
  is rejected for other types, but foreign HTML is read permissively —
  whatever is in the slot loads.
- Nesting is recursive: slot children are full blocks, including containers
  and `raw-html` passthroughs.
- Settings islands inside a slot container are metadata, never slot children.

### Settings island

```html
<section data-pb-block="hero" data-pb-id="b_1" class="text-center">
  <script type="application/json" data-pb-settings>{"align":"center"}</script>
  <h1 data-pb-text="title">Hello</h1>
</section>
```

A `<script type="application/json" data-pb-settings>` element that is a
**direct child of the block root** is the canonical carrier for every model
fact that has no visible DOM carrier: block settings, field bindings, style
tokens. No HTML comments — comments-as-data is the Gutenberg drift trap this
contract exists to avoid.

## The canonical-carrier rule

**Every model fact has exactly one canonical carrier in the HTML; everything
else is derived and regenerated on downcast, ignored on upcast.**

Styling has two carriers under this rule, split per class:

- **Token settings** (curated controls): the settings island carries the token
  (canonical); the classes the renderer derives from it are regenerated on
  downcast and ignored on upcast.
- **Authored classes** (arbitrary utilities): for blocks with `classes: true`
  in the manifest, the root's class attribute is itself a canonical carrier —
  see below.

The split is mechanical, never guessed: whatever the renderer emits for the
same fields/settings is derived; everything else in the attribute is authored.

## Authored classes (`classes: true`)

The editor must ingest and edit arbitrary utility classes (Tailwind-compatible;
compiled by the Publr JIT) — real templates put design in classes, per element,
with responsive and state variants. For blocks that opt in via the manifest:

```
authored  = classList(class attribute) − classList(renderer baseline)
downcast  = baseline ∪ authored          (deduped, baseline first)
```

The **baseline** is what the renderer emits for the same fields/settings —
computable by anyone holding the renderer (which is already the downcast
body). `block.classes` stores the authored list verbatim; unknown or exotic
classes are preserved, never validated (permissiveness again — the style
compiler decides what it can compile). Token settings and authored classes
coexist on one block: token-derived classes are part of the baseline, so they
stay out of `block.classes` automatically.

Structured style controls MUST be implemented as *lenses* over the authored
class list (read/patch specific utilities), never as a parallel store
(reference implementation: `src/lenses.js`). Lens rules:

- A lens owns one property: a class prefix + an accepted-value predicate over
  the theme scale (prefix alone is ambiguous — `text-lg` / `text-white` /
  `text-center` belong to three different lenses).
- Writes replace the lens's own classes **in place** (stable ordering) and
  never touch classes it doesn't own.
- Every lens offers the theme scale AND an **advanced** option that writes a
  Tailwind arbitrary value (`mt-[13px]`, `bg-[#ff0000]`, spaces encoded as
  underscores) — opting out of the scale without leaving the class model.
- v0 scope: classes carrying a variant (`sm:`, `hover:`) or a modifier
  (`bg-white/5`, `text-sm/6`) are never lens-matched; they remain editable in
  the raw class editor and survive lens writes untouched.

**Which controls a block offers is the block's declaration** (Gutenberg's
`supports`, lens-flavored): the manifest lists control groups and/or lens ids
per block type — `controls: ["typography"]` on a paragraph block,
`controls: ["spacing", "background", …]` on containers. Absent → no
structured style panel. This is UI surface only, never data policy: a leaf
block with undeclared spacing still ingests and round-trips `mt-10`
losslessly (visible in the raw class editor) — it just doesn't *offer* the
control, steering authors to wrap content in a layout block for spacing.

## Model shape

```json
{
  "blocks": [
    {
      "type": "heading",
      "id": "b_1",
      "fields": { "text": "Hello", "level": "h1" },
      "settings": {},
      "interactions": {
        "data-p-store": "local:toggle",
        "data-p-on": "click: flip",
        "data-p-class": "open -> demo-highlight"
      }
    },
    {
      "type": "columns",
      "id": "b_2",
      "fields": {},
      "settings": {},
      "interactions": {},
      "classes": "mx-auto max-w-7xl px-6 lg:px-8",
      "slots": {
        "col-1": [{ "type": "paragraph", "id": "b_3", "fields": { "body": "<p>…</p>" }, "settings": {}, "interactions": {} }],
        "col-2": []
      }
    },
    {
      "type": "raw-html",
      "id": "b_4",
      "fields": { "html": "<blockquote><p>…</p></blockquote>" }
    }
  ]
}
```

- `fields` — values whose canonical carriers are DOM carriers (or, for fields
  with no carrier in the rendered output, the settings island under a
  `"fields"` key — renderer's choice, round-trip law enforces consistency).
- `settings` — the parsed settings island.
- `pattern` — optional provenance label (see `data-pb-pattern` above and the
  Patterns section). Present only when the carrier attribute is; purely
  informational.
- `interactions` — all `data-p-*` attributes (and bare `data-p`) present on
  the **block root**. Captured verbatim on upcast, re-applied verbatim on
  downcast. v0 scope: root-level only. `data-p-*` attributes on *inner*
  elements of a typed block are renderer output (derived); inside `raw-html`
  blocks they survive verbatim as part of the html string.

## Renderer contract

```
render(type, fields, settings) → HTML string
```

- Output parses to **exactly one root element** with `data-pb-block="<type>"`.
- Every field value passed in appears in its declared carrier in the output.
- Every declared slot appears as an **empty** `data-pb-slot="<name>"`
  container — nested blocks come from the model; the downcast fills them.
- Derived presentation (classes from settings/style tokens) is the renderer's
  business; it is regenerated on every call.
- The renderer does **not** emit `data-pb-id`, the settings island, or
  interaction attributes — the downcast stamps those onto the returned root.

**The renderer is the downcast body.** In production Publr fills this slot
with the WASM ZSX transpiler + JIT (same renderer as the published page — no
preview drift). The POC fills it with JS template literals. A host could fill
it with anything; the round-trip law is the conformance test either way.

## Patterns (manifest concept — not wire vocabulary)

The manifest may declare `patterns`: named, reusable annotated-HTML fragments
(`{ label, description?, html }`) composing blocks from this same contract.
Inserting a pattern is nothing but `upcast(fragment)` — ids minted, authored
classes derived — followed by splicing the resulting blocks into the document.
From that moment they are **ordinary blocks**: a pattern is a composition, not
a schema. It adds no upcast/downcast behavior and no vocabulary beyond the
optional `data-pb-pattern` provenance label on the fragment's root (see the
block-identity table) — a pure UI hint. This is Gutenberg's
`register_block_pattern`, minus comment delimiters: the fragment is already
wire-format HTML, so patterns are authorable by anything that can write the
contract (humans, AI agents, ZSX), and "save selection as pattern" is just
`downcast(selection)`.

Shared/synced reusable content — a reference block resolved by the host, where
edits propagate to every usage — is a deliberately separate future concept
(**Components**), out of scope for this contract version.

## Upcast rules (permissive by design)

Upcast walks the element children of the content root:

1. `data-pb-block="<type>"` where `<type>` is in the manifest → typed block.
   Field values are read from carriers scoped to this root; settings from the
   island; `data-p-*` root attributes into `interactions`; declared slots
   recurse into their containers' element children (islands skipped). Carrier
   fields present in the DOM but absent from the manifest are still captured;
   manifest fields with no carrier get their manifest default.
2. `data-pb-block` with a type **not** in the manifest → `raw-html` block
   (`fields.html` = `outerHTML`). Renders verbatim, movable/deletable, not
   field-editable.
3. Any element **without** `data-pb-block` → `raw-html` block, same treatment.
4. Missing `data-pb-id` → the editor mints one (`b_` + random suffix).
   Downcast injects the id into `raw-html` roots too, so second-generation
   round trips are exact.
5. A missing or malformed settings island → `{}` (upcast never throws on
   foreign HTML).

Rules 2–4 are what make "an AI agent wrote this HTML" a supported input:
worst case, unrecognized markup loads as opaque raw blocks instead of erroring.

## Interactions authoring

Because PublrJS is attribute-driven with no build step, the editor authors
runtime behavior by **writing `data-p-*` attributes into the content** — the
authoring surface and the runtime contract are the same medium. The editor
canvas never hydrates PublrJS (editing stays inert); the preview and the
published page hydrate the same markup and the behavior simply works.

Behavior presets reference stores registered by the host page (e.g. a generic
`toggle` local-store factory shipped alongside the runtime). v0 ships one
preset: *toggle classes on click* — `data-p-store="local:toggle"`,
`data-p-on="click: flip"`, `data-p-class="open -> <classes>"`.

## Versioning

`data-pb-contract="0"` on the content root. Breaking vocabulary changes bump
the version; upcast may support older versions explicitly. Absence of the
attribute is treated as the current version (permissiveness again).
