// registry.ts — the GLOBAL block registry. registerBlock(type, def) is THE
// public registration surface: Publr core, plugins, and the devtools console
// all use the same call. Definitions are validated hard and frozen; the
// registry itself stays live (register/unregister at any time).
//
// The render is the schema: a definition is { label, render } plus optional
// editor-UI metadata that CANNOT be derived from markup (currently:
// `placeholder` — the ghost prompt shown while the block is empty). Fields
// are DERIVED by probing render({}) — the data-pb-* carriers in the output
// are the field declarations, the values read back are the defaults. No
// parallel field list to drift.

import {
  CARRIERS,
  CHILDREN_ATTR,
  RAW_TYPE,
  SETTINGS_SELECTOR,
  readCarrier,
  scopedCarriers,
} from "./carriers";
import type { CarrierKind, FieldValue } from "./carriers";
import { MARK_NAMES } from "./format";
import { STYLE_PROPS, blockSupportsStyle } from "./style";
import type { StyleSupports, StyleVariant } from "./style";

/** What a render receives: the block's fields, any of which may be absent. */
export type Fields = Record<string, FieldValue | undefined>;

/**
 * The second render input: island-carried setting values, declared defaults
 * filled in. Absent on blocks that declare no island settings (and in the
 * registration probe) — renders must tolerate that, same conformance rule as
 * absent fields.
 */
export type Settings = Record<string, unknown>;

/** One choice a setting control offers. */
export interface SettingOption {
  /** What picking it writes: the field value — or the block TYPE on a transform setting. */
  readonly value: string;
  readonly label: string;
  /**
   * Icon NAME the chrome resolves against its icon set (demo: src/icons.ts).
   * Chrome without the name falls back
   * to the label — icons are presentation vocabulary, never validated here.
   */
  readonly icon?: string;
}

/** The control kinds the chrome vocabulary knows. */
export type SettingControl = "toggle-group" | "toggle" | "select" | "text" | "number" | "media";

/** What kind of authored fact a control changes. Editing modes filter by role. */
export type ControlRole = "content" | "structure" | "design" | "advanced";

/** Ordered contextual-toolbar regions, matching the conventional composition model. */
export type ToolbarGroup = "parent" | "block" | "inline" | "other";

const CONTROL_ROLES: readonly ControlRole[] = ["content", "structure", "design", "advanced"];
const TOOLBAR_GROUPS: readonly ToolbarGroup[] = ["parent", "block", "inline", "other"];

/**
 * A declared sidebar control — editor-UI metadata a render can't carry
 * (a carrier declares that a field exists, not which values it may take).
 * Exactly one binding per setting:
 * - `field`: the control writes that field (editor.setField) — e.g. a
 *   heading's `level` tag carrier offering h1…h6. toggle-group, select, and text
 *   (string-kinded fields — a link/text carrier's URL or label).
 * - `transform: true`: the options are block TYPES and picking one switches
 *   the whole block (editor.transformBlock) — e.g. group ⇄ row/stack/grid.
 *   toggle-group only.
 * - `style`: the control writes a universal style property through the active
 *   responsive breakpoint (for example Group's visual layout mode).
 * - `setting`: an ISLAND-bound value name (editor.setSetting) — the value
 *   lives in the block's data-pb-settings island, not in any DOM carrier.
 *   Legal on every control kind; REQUIRES a `default` typed per kind.
 *
 * Per-kind shape (validated hard at registration):
 * - "toggle-group": options required; island binding needs a string default
 *   that is one of the option values.
 * - "toggle": boolean default; no options.
 * - "select": options required; string default that is one of the options.
 * - "text": string default; optional `placeholder`.
 * - "number": finite number default; optional finite `min`/`max`/`step`
 *   (step > 0, min ≤ max, default within [min, max]).
 * - "media": field-bound only, to an IMAGE-kinded field — the upload/URL/alt
 *   editor for {src,alt,width,height} carrier values.
 */
export interface SettingSpec {
  /** Control kind the chrome renders. The vocabulary grows as controls land. */
  readonly control: SettingControl;
  /** Accessible name for the control (chrome may render it invisibly). */
  readonly label: string;
  readonly field?: string;
  readonly transform?: boolean;
  readonly setting?: string;
  readonly style?: string;
  /** The island value when the document carries none — required with `setting`. */
  readonly default?: unknown;
  readonly options?: readonly SettingOption[];
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Content remains writable in content-only mode; every other role is hidden/refused. */
  readonly role?: ControlRole;
  /** Supporting copy rendered below the control. */
  readonly help?: string;
  /** Conditional visibility against another field or island value. */
  readonly when?: {
    readonly field?: string;
    readonly setting?: string;
    readonly style?: string;
    readonly equals?: unknown;
    readonly notEquals?: unknown;
  };
}

const CONTROLS: readonly SettingControl[] = [
  "toggle-group",
  "toggle",
  "select",
  "text",
  "number",
  "media",
];

/**
 * The predefined FLOATING-TOOLBAR controls a block type can opt into — the
 * toolbar's answer to `settings` (which drives the sidebar). Each control is a
 * ready-made widget the chrome renders; a block adds one by listing it here,
 * bound to the block's own fields/settings. The vocabulary grows as controls
 * land:
 * - "replace" — the media swap dropdown (Upload / Insert from URL / Reset).
 *   Binds an IMAGE `field` (the carrier it rewrites).
 * - "link" — the link popover (URL + open-in-new-tab). Binds a `setting` (the
 *   href island) and, optionally, a `targetSetting` (the open-in island).
 * - "caption" — the show/hide caption toggle. Binds a RICH `field` (the
 *   caption carrier) and a boolean `setting` (its visibility island).
 */
export type ToolbarControl =
  | "link"
  | "caption"
  | "replace"
  | "text-align"
  | "field-options"
  | "setting-options"
  | "transform-options"
  | "toggle-setting"
  | "toggle-style"
  | "add-child"
  | "copy"
  | "text"
  | "style-options";

/**
 * One declared toolbar control — a predefined `control` plus the bindings it
 * needs, validated hard against the block's fields/settings at registration
 * (same guarantees as SettingSpec: a control can never write a field no
 * carrier reads back or a setting the type doesn't declare).
 */
export interface ToolbarSpec {
  readonly control: ToolbarControl;
  /** Accessible name / tooltip for the control's trigger. */
  readonly label: string;
  /** Icon NAME the chrome resolves against its icon set; icon-only trigger when set. */
  readonly icon?: string;
  /** Alternate icon shown while a toggle control is active. */
  readonly activeIcon?: string;
  /** Field carrier the control targets — "replace" (image) / "caption" (rich). */
  readonly field?: string;
  /** Island setting the control writes — "link" (href) / "caption" (visibility). */
  readonly setting?: string;
  /** Second island setting for "link": the open-in-new-tab target. */
  readonly targetSetting?: string;
  /** Choice controls render these options into a toolbar dropdown. */
  readonly options?: readonly SettingOption[];
  /** Ordered toolbar region. Defaults are inferred per control for compatibility. */
  readonly group?: ToolbarGroup;
  /** Content controls survive content-only mode; other roles are filtered. */
  readonly role?: ControlRole;
  /** Child block type inserted by add-child. */
  readonly type?: string;
  /** Universal style property written by style-options. */
  readonly style?: string;
  /** Style value toggled by toggle-style. */
  readonly value?: string;
}

const TOOLBAR_CONTROLS: readonly ToolbarControl[] = [
  "link",
  "caption",
  "replace",
  "text-align",
  "field-options",
  "setting-options",
  "transform-options",
  "toggle-setting",
  "toggle-style",
  "add-child",
  "copy",
  "text",
  "style-options",
];

// Keys each toolbar control may carry beyond { control, label }.
const TOOLBAR_KEYS: Record<ToolbarControl, readonly string[]> = {
  link: ["field", "setting", "targetSetting"],
  caption: ["field", "setting"],
  replace: ["field"],
  "text-align": [],
  "field-options": ["field", "options"],
  "setting-options": ["setting", "options"],
  "transform-options": ["options"],
  "toggle-setting": ["setting"],
  "toggle-style": ["style", "value", "activeIcon"],
  "add-child": ["type"],
  copy: ["field"],
  text: ["field", "setting"],
  "style-options": ["style", "options"],
};

// Keys each control kind may carry beyond { control, label } — anything else
// is rejected, including transform bindings outside toggle-group.
const SPEC_KEYS: Record<SettingControl, readonly string[]> = {
  "toggle-group": [
    "field",
    "transform",
    "setting",
    "style",
    "default",
    "options",
    "role",
    "help",
    "when",
  ],
  toggle: ["setting", "style", "default", "role", "help", "when"],
  select: ["field", "setting", "style", "default", "options", "role", "help", "when"],
  text: ["setting", "field", "default", "placeholder", "role", "help", "when"],
  number: ["setting", "default", "min", "max", "step", "role", "help", "when"],
  media: ["field", "role", "help", "when"],
};

/** One island-bound setting derived from the specs: name + declared default. */
export interface IslandSetting {
  readonly name: string;
  readonly default: unknown;
}

/** What registerBlock accepts: label + render, plus optional editor-UI metadata. */
export interface BlockDefinition {
  label: string;
  render: (fields: Fields, settings?: Settings) => string;
  placeholder?: string;
  /** Inserter shelf the block files under (e.g. "Text", "Media", "Design"). */
  category?: string;
  /** One-liner shown on the sidebar's block card (what the block is for). */
  description?: string;
  /** Icon name for chrome surfaces (card, tree, inserters) — see SettingOption.icon. */
  icon?: string;
  /** Sidebar controls, in display order. */
  settings?: SettingSpec[];
  /**
   * Floating-toolbar controls this block type opts into, in display order —
   * the toolbar sibling of `settings`. Absent means no block-level controls;
   * inline rich-text controls are derived from the active rich carrier. Each
   * bound control references the block's own fields/settings (validated).
   */
  toolbar?: ToolbarSpec[];
  /**
   * Block types the children slot accepts (requires a slot). Gates what the
   * EDITOR puts there — insert/transform/split are refused; upcast stays
   * permissive (foreign content always loads). Absent = everything.
   */
  allowedChildren?: string[];
  /**
   * Block types seeded into the slot on fresh insert (e.g. a list starts
   * with one list-item). Requires a slot;
   * absent = the editor's defaultBlock seeding.
   */
  childTemplate?: string[];
  /**
   * Hidden from inserter chrome — the type exists only inside its parent,
   * created by templates and Enter-splitting (e.g. list-item).
   */
  internal?: boolean;
  /**
   * Offered by inserters only while the full shell is editing a page
   * template/template part. Unlike `internal`, authors may insert it there.
   */
  templateOnly?: boolean;
  /**
   * A transparent wrapper: real in the editor (identity, options, a place
   * for chrome to hang off) but NO published output — the data pipeline
   * unwraps it, its children take its place. Requires a children slot.
   * First user: the "pattern" root a stamp wraps its blocks in.
   */
  phantom?: boolean;
  /**
   * Field names that keep NATIVE Enter (no block split) — for carriers where
   * a newline is content or a split makes no sense (table sections, math).
   * Fields carried on/inside <pre> opt out automatically (FieldSpec
   * `preformatted`); this covers the rest.
   */
  noSplit?: string[];
  /**
   * Inline formats this block's rich carriers permit (the register-time home
   * for policy `allowedFormats`): absent = all marks; `[]` = plain text; a
   * subset = those marks only. Each entry must be a known mark (format.ts).
   * A createEditor per-type override intersects with this, most-restrictive.
   */
  allowedFormats?: readonly string[];
  /**
   * Universal STYLE panels this block opts into (Phase C): the editor renders
   * the matching controls (e.g. `{ typography: { fontSize: true } }`). Absent =
   * no style panels. The block author declares capabilities; the editor manages
   * values; a universal serializer (style.ts) emits the classes.
   */
  supports?: StyleSupports;
  /**
   * Named visual variants: each is a label plus a structured style recipe.
   * Values reference governed theme keys (e.g. `textColor: "foreground"`).
   */
  variants?: StyleVariant[];
  /**
   * A CSS selector (scoped to the block's own subtree) naming the element
   * authored classes attach to when the render ROOT is a wrapper. Default: the
   * root. The image block sets `"img"` — a pasted `<img class="h-11">` sizes
   * the IMG, not the caption <figure> that wraps it, so the class rides the
   * img on both upcast and downcast (fidelity for real-world templates).
   */
  classTarget?: string;
}

/** A field derived from the probe: carrier attribute → kind, value → name, read-back → default. */
export interface FieldSpec {
  readonly name: string;
  readonly type: CarrierKind;
  readonly default: FieldValue;
  /**
   * The carrier sits on/inside a <pre> — whitespace is content: the value
   * skips load normalization and Enter stays native. Derived from the probe
   * (HTML semantics), never declared. Present only when true.
   */
  readonly preformatted?: true;
}

/** A validated, frozen registry entry. */
export interface BlockType {
  readonly label: string;
  readonly render: (fields: Fields, settings?: Settings) => string;
  readonly placeholder?: string;
  readonly category?: string;
  readonly description?: string;
  readonly icon?: string;
  readonly settings?: readonly SettingSpec[];
  /** Floating-toolbar controls (see BlockDefinition.toolbar). */
  readonly toolbar?: readonly ToolbarSpec[];
  readonly allowedChildren?: readonly string[];
  readonly childTemplate?: readonly string[];
  readonly internal?: boolean;
  readonly templateOnly?: boolean;
  readonly phantom?: boolean;
  readonly noSplit?: readonly string[];
  /** Permitted inline marks (absent = all, `[]` = plain text) — see BlockDefinition. */
  readonly allowedFormats?: readonly string[];
  /** Style panels this block opts into (Phase C) — see BlockDefinition.supports. */
  readonly supports?: StyleSupports;
  /** Named visual variants — see BlockDefinition.variants. */
  readonly variants?: readonly StyleVariant[];
  /** Selector for the authored-class target when the root is a wrapper — see BlockDefinition.classTarget. */
  readonly classTarget?: string;
  readonly fields: readonly FieldSpec[];
  /**
   * The island-bound settings, derived from the specs — what cast/editor use
   * to fill defaults and decide island presence without re-walking settings.
   * Empty on blocks that declare none.
   */
  readonly islandSettings: readonly IslandSetting[];
  /** Derived from the probe: the render emits a data-pb-children slot. */
  readonly acceptsChildren: boolean;
}

const NAME = /^[a-z][a-z0-9-]*$/;

const registry = new Map<string, BlockType>();

function fail(ctx: string, msg: string): never {
  throw new Error(`PublrEditor: ${ctx}: ${msg}`);
}

export function registerBlock(type: string, def: BlockDefinition): BlockType {
  const ctx = `registerBlock("${type}")`;
  if (!NAME.test(type ?? "")) fail(ctx, "type must be a lowercase name");
  if (type === RAW_TYPE) fail(ctx, `"${RAW_TYPE}" is the reserved passthrough type`);
  if (registry.has(type)) fail(ctx, "already registered");
  if (def === null || typeof def !== "object") fail(ctx, "definition must be an object");
  for (const key of Object.keys(def)) {
    if (
      ![
        "label",
        "render",
        "placeholder",
        "category",
        "description",
        "icon",
        "settings",
        "toolbar",
        "allowedChildren",
        "childTemplate",
        "internal",
        "templateOnly",
        "phantom",
        "noSplit",
        "allowedFormats",
        "supports",
        "variants",
        "classTarget",
      ].includes(key)
    )
      fail(ctx, `unknown key "${key}"`);
  }
  if (typeof def.label !== "string" || !def.label) fail(ctx, "label is required");
  if (typeof def.render !== "function") fail(ctx, "render(fields) function is required");
  if ("placeholder" in def && typeof def.placeholder !== "string")
    fail(ctx, "placeholder must be a string");
  if ("category" in def && (typeof def.category !== "string" || !def.category))
    fail(ctx, "category must be a non-empty string");
  if ("description" in def && (typeof def.description !== "string" || !def.description))
    fail(ctx, "description must be a non-empty string");
  if ("icon" in def && (typeof def.icon !== "string" || !def.icon))
    fail(ctx, "icon must be a non-empty string");
  if ("internal" in def && typeof def.internal !== "boolean")
    fail(ctx, "internal must be a boolean");
  if ("templateOnly" in def && typeof def.templateOnly !== "boolean")
    fail(ctx, "templateOnly must be a boolean");
  if ("phantom" in def && typeof def.phantom !== "boolean") fail(ctx, "phantom must be a boolean");
  const typeList = (key: "allowedChildren" | "childTemplate" | "noSplit") => {
    if (!(key in def)) return undefined;
    const list = def[key];
    if (!Array.isArray(list) || !list.length || list.some((v) => typeof v !== "string" || !v))
      fail(ctx, `${key} must be a non-empty array of names`);
    return Object.freeze([...list]) as readonly string[];
  };
  const allowedChildren = typeList("allowedChildren");
  const childTemplate = typeList("childTemplate");
  const noSplit = typeList("noSplit");

  // allowedFormats permits an EMPTY array (plain text), so it is validated
  // apart from typeList (which forbids empties). Every entry must be a known mark.
  let allowedFormats: readonly string[] | undefined;
  if ("allowedFormats" in def) {
    if (!Array.isArray(def.allowedFormats)) fail(ctx, "allowedFormats must be an array");
    for (const m of def.allowedFormats) {
      if (typeof m !== "string" || !MARK_NAMES.includes(m as (typeof MARK_NAMES)[number]))
        fail(ctx, `allowedFormats: "${String(m)}" is not a known mark (${MARK_NAMES.join(", ")})`);
    }
    allowedFormats = Object.freeze([...def.allowedFormats]);
  }

  // supports (Phase C): style panels the block opts into. Known keys per panel,
  // each a boolean. One row per panel as controls land.
  const PANELS: Record<string, readonly string[]> = {
    typography: [
      "fontSize",
      "lineHeight",
      "letterSpacing",
      "decoration",
      "letterCase",
      "textAlign",
      "fontWeight",
      "fontStyle",
    ],
    color: ["text", "background"],
    spacing: [
      "padding",
      "paddingInline",
      "paddingBlock",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "margin",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
    ],
    dimensions: ["width", "height", "minHeight", "minWidth", "flexBasis", "aspectRatio"],
    layout: [
      "gap",
      "rowGap",
      "columnGap",
      "justifyContent",
      "alignItems",
      "flexWrap",
      "gridColumns",
      "layoutMode",
      "containerEnabled",
      "containerWidth",
      "containerBleed",
    ],
    border: ["width", "color", "radius", "style"],
  };
  let supports: StyleSupports | undefined;
  if ("supports" in def) {
    const s = def.supports;
    if (s === null || typeof s !== "object") fail(ctx, "supports must be an object");
    for (const panel of Object.keys(s)) {
      if (!(panel in PANELS)) fail(ctx, `supports: unknown panel "${panel}"`);
      const obj = (s as Record<string, unknown>)[panel];
      if (obj === null || typeof obj !== "object") fail(ctx, `supports.${panel} must be an object`);
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        if (!PANELS[panel].includes(key)) fail(ctx, `supports.${panel}: unknown key "${key}"`);
        if (typeof val === "boolean") continue;
        if (val === null || typeof val !== "object" || Array.isArray(val))
          fail(ctx, `supports.${panel}.${key} must be a boolean or capability object`);
        for (const capabilityKey of Object.keys(val)) {
          if (!["default", "values", "allowCustom"].includes(capabilityKey))
            fail(ctx, `supports.${panel}.${key}: unknown capability "${capabilityKey}"`);
        }
        const capability = val as Record<string, unknown>;
        if (capability.default != null && typeof capability.default !== "boolean")
          fail(ctx, `supports.${panel}.${key}.default must be a boolean`);
        if (capability.allowCustom != null && typeof capability.allowCustom !== "boolean")
          fail(ctx, `supports.${panel}.${key}.allowCustom must be a boolean`);
        if (
          capability.values != null &&
          (!Array.isArray(capability.values) ||
            !capability.values.length ||
            capability.values.some((value) => typeof value !== "string" || !value))
        )
          fail(ctx, `supports.${panel}.${key}.values must be non-empty strings`);
      }
    }
    supports = Object.freeze(
      Object.fromEntries(
        Object.entries(s).map(([panel, values]) => [
          panel,
          Object.freeze(
            Object.fromEntries(
              Object.entries(values as Record<string, unknown>).map(([key, value]) => [
                key,
                value && typeof value === "object"
                  ? Object.freeze({
                      ...(value as object),
                      ...(Array.isArray((value as { values?: unknown }).values)
                        ? {
                            values: Object.freeze([
                              ...((value as { values: string[] }).values ?? []),
                            ]),
                          }
                        : {}),
                    })
                  : value,
              ]),
            ),
          ),
        ]),
      ),
    ) as StyleSupports;
  }

  // Variants: named structured style recipes. Utilities are deliberately not
  // accepted here—the style system owns their private serialized form.
  let variants: readonly StyleVariant[] | undefined;
  if ("variants" in def) {
    if (!Array.isArray(def.variants) || !def.variants.length)
      fail(ctx, "variants must be a non-empty array");
    const seen = new Set<string>();
    variants = Object.freeze(
      def.variants.map((v, i) => {
        const vc = `variants[${i}]`;
        if (v === null || typeof v !== "object") fail(ctx, `${vc} must be an object`);
        if (typeof v.name !== "string" || !NAME.test(v.name))
          fail(ctx, `${vc}: name must be a lowercase name`);
        if (typeof v.label !== "string" || !v.label) fail(ctx, `${vc}: label is required`);
        if (v.styles === null || typeof v.styles !== "object" || Array.isArray(v.styles))
          fail(ctx, `${vc}: styles must be an object`);
        for (const [prop, value] of Object.entries(v.styles)) {
          if (!(prop in STYLE_PROPS)) fail(ctx, `${vc}: unknown style "${prop}"`);
          if (typeof value !== "string" || !value) {
            fail(ctx, `${vc}: style "${prop}" must be a non-empty string`);
          }
        }
        if (seen.has(v.name)) fail(ctx, `${vc}: duplicate variant "${v.name}"`);
        seen.add(v.name);
        return Object.freeze({
          name: v.name,
          label: v.label,
          styles: Object.freeze({ ...v.styles }),
        });
      }),
    );
  }

  if (allowedChildren && childTemplate) {
    for (const t of childTemplate) {
      if (!allowedChildren.includes(t))
        fail(ctx, `childTemplate type "${t}" is not in allowedChildren`);
    }
  }

  // classTarget: a selector the render must actually contain (else authored
  // classes would vanish into a non-existent element).
  let classTarget: string | undefined;
  if ("classTarget" in def) {
    if (typeof def.classTarget !== "string" || !def.classTarget)
      fail(ctx, "classTarget must be a non-empty selector string");
    classTarget = def.classTarget;
  }

  // The render output IS the schema. Probe it with empty fields: the
  // data-pb-* carriers it emits are the field declarations (attribute →
  // kind, value → name), and the values read back from them are the
  // defaults — so a declared default can never drift from the render's
  // fallback and break the round-trip law. Conformance rule this relies on:
  // render(fields) must tolerate absent fields.
  const tmp = document.createElement("div");
  try {
    tmp.innerHTML = def.render({});
  } catch (err) {
    fail(ctx, `render({}) threw — render must tolerate absent fields (${String(err)})`);
  }
  const root = tmp.firstElementChild;
  if (!root || tmp.children.length !== 1) fail(ctx, "render must produce exactly one root element");
  if (root.getAttribute("data-pb-block") !== type)
    fail(ctx, `render root must carry data-pb-block="${type}"`);
  // Islands are CAST vocabulary — downcast emits them from block.settings; a
  // render emitting its own would double-carry (and be read as this block's
  // island on upcast, shadowing the real values).
  if (root.querySelector(SETTINGS_SELECTOR))
    fail(ctx, "render must not emit a data-pb-settings island — downcast owns the island");

  const fields: FieldSpec[] = []; // in carrier DOM order — the editor's notion of "first field"
  for (const carrier of scopedCarriers(root)) {
    for (const { attr, kind } of CARRIERS) {
      const name = carrier.getAttribute(attr);
      if (!name) continue;
      if (fields.some((f) => f.name === name))
        fail(ctx, `field "${name}" is carried twice in the render output`);
      // On/inside <pre>, whitespace is content (HTML semantics) — derived
      // here so cast and Enter handling never re-probe.
      const preformatted = (kind === "text" || kind === "rich") && !!carrier.closest("pre");
      const dflt = readCarrier(carrier, kind);
      fields.push(
        Object.freeze({
          name,
          type: kind,
          default: typeof dflt === "object" ? Object.freeze(dflt) : dflt,
          ...(preformatted ? { preformatted: true as const } : {}),
        }),
      );
    }
  }
  if (noSplit) {
    for (const name of noSplit) {
      if (!fields.some((f) => f.name === name))
        fail(ctx, `noSplit field "${name}" is not carried by the render`);
    }
  }

  // The children slot is declared the same way fields are — in the render.
  // Scoped like carriers (root itself may be the slot); one per block, empty
  // in the probe (children are appended by downcast, never rendered), and
  // never doubling as a field carrier (a rich read would swallow the children).
  const slots = [...root.querySelectorAll(`[${CHILDREN_ATTR}]`)];
  if (root.matches(`[${CHILDREN_ATTR}]`)) slots.unshift(root);
  const scopedSlots = slots.filter((el) => el.closest("[data-pb-block]") === root);
  if (scopedSlots.length > 1) fail(ctx, `at most one ${CHILDREN_ATTR} slot per render`);
  const slot = scopedSlots[0];
  if (slot) {
    // A tag carrier is fine on the slot (it reads the tagName, e.g. a list's
    // ul/ol root); a text/rich read would swallow the children.
    if (slot.hasAttribute("data-pb-text") || slot.hasAttribute("data-pb-rich"))
      fail(ctx, `the ${CHILDREN_ATTR} slot cannot also be a field carrier`);
    if (slot.children.length)
      fail(ctx, `the ${CHILDREN_ATTR} slot must be empty in the probe render`);
  }
  if ((allowedChildren || childTemplate) && !slot)
    fail(ctx, "allowedChildren/childTemplate require a children slot in the render");
  if (def.phantom && !slot)
    fail(ctx, "phantom requires a children slot — a transparent wrapper exists FOR its children");

  // Settings are validated AFTER the probe: a field-bound setting must name
  // a field the render actually carries — a control writing a field no
  // carrier reads back would silently violate the round-trip law. (Island
  // values have no carrier BY DESIGN — the island is theirs.)
  let settings: readonly SettingSpec[] | undefined;
  if ("settings" in def) {
    if (!Array.isArray(def.settings)) fail(ctx, "settings must be an array");
    const islandNames = new Set<string>();
    settings = Object.freeze(
      def.settings.map((s, i) => {
        const sctx = `settings[${i}]`;
        if (s === null || typeof s !== "object") fail(ctx, `${sctx} must be an object`);
        const control = s.control as SettingControl;
        if (!CONTROLS.includes(control)) fail(ctx, `${sctx}: unknown control "${String(control)}"`);
        for (const key of Object.keys(s)) {
          if (key !== "control" && key !== "label" && !SPEC_KEYS[control].includes(key))
            fail(ctx, `${sctx}: unknown key "${key}" on a "${control}" control`);
        }
        if (typeof s.label !== "string" || !s.label) fail(ctx, `${sctx}: label is required`);
        if (s.role != null && !CONTROL_ROLES.includes(s.role))
          fail(ctx, `${sctx}: unknown role "${String(s.role)}"`);
        if (s.help != null && (typeof s.help !== "string" || !s.help))
          fail(ctx, `${sctx}: help must be a non-empty string`);
        if (s.when != null) {
          if (typeof s.when !== "object" || Array.isArray(s.when))
            fail(ctx, `${sctx}: when must be an object`);
          for (const key of Object.keys(s.when))
            if (!["field", "setting", "style", "equals", "notEquals"].includes(key))
              fail(ctx, `${sctx}.when: unknown key "${key}"`);
          if (
            Number(s.when.field != null) +
              Number(s.when.setting != null) +
              Number(s.when.style != null) !==
            1
          )
            fail(ctx, `${sctx}.when requires exactly one field, setting or style`);
          if (Number("equals" in s.when) + Number("notEquals" in s.when) !== 1)
            fail(ctx, `${sctx}.when requires exactly one equals or notEquals value`);
        }

        // Exactly one binding. Transform is toggle-group-only; fields are
        // available to controls whose value has a direct carrier form.
        const bindsField = s.field != null;
        const bindsTransform = s.transform != null;
        const bindsIsland = s.setting != null;
        const bindsStyle = s.style != null;
        if (
          Number(bindsField) + Number(bindsTransform) + Number(bindsIsland) + Number(bindsStyle) !==
          1
        )
          fail(
            ctx,
            `${sctx}: exactly one of "field", "transform", "setting" or "style" is required`,
          );
        if (bindsField) {
          const target = fields.find((f) => f.name === s.field);
          if (!target)
            fail(ctx, `${sctx}: field "${String(s.field)}" is not carried by the render`);
          // text inputs write strings — an image field's object value has no
          // string form to write back; the media control is that object's
          // dedicated editor and binds nothing else
          if (control === "text" && target.type === "image")
            fail(ctx, `${sctx}: a "text" control cannot bind an image field`);
          if (control === "media" && target.type !== "image")
            fail(ctx, `${sctx}: a "media" control requires an image-kinded field`);
        }
        if (bindsTransform && s.transform !== true) fail(ctx, `${sctx}: transform must be true`);
        if (bindsStyle && (typeof s.style !== "string" || !blockSupportsStyle(supports, s.style)))
          fail(ctx, `${sctx}: style "${String(s.style)}" is not supported by this block`);
        if (bindsStyle && "default" in s) {
          if (typeof s.default !== "string" || !s.default)
            fail(ctx, `${sctx}: a style default must be a non-empty string`);
          if (control === "toggle" && s.default !== "true" && s.default !== "false")
            fail(ctx, `${sctx}: a style toggle default must be "true" or "false"`);
        }
        if (bindsIsland) {
          if (typeof s.setting !== "string" || !s.setting)
            fail(ctx, `${sctx}: setting must be a non-empty string`);
          if (islandNames.has(s.setting)) fail(ctx, `${sctx}: duplicate setting "${s.setting}"`);
          islandNames.add(s.setting);
          if (!("default" in s)) fail(ctx, `${sctx}: island-bound settings require a default`);
        }

        // Options: the choice-based kinds require them; the rest reject the
        // key above.
        let options: readonly SettingOption[] | undefined;
        if (control === "toggle-group" || control === "select") {
          if (!Array.isArray(s.options) || !s.options.length)
            fail(ctx, `${sctx}: options must be a non-empty array`);
          const seen = new Set<string>();
          options = Object.freeze(
            s.options.map((o) => {
              if (o === null || typeof o !== "object" || typeof o.value !== "string" || !o.value)
                fail(ctx, `${sctx}: every option needs a non-empty string value`);
              if (typeof o.label !== "string" || !o.label)
                fail(ctx, `${sctx}: every option needs a non-empty string label`);
              if ("icon" in o && (typeof o.icon !== "string" || !o.icon))
                fail(ctx, `${sctx}: option icon must be a non-empty string`);
              if (seen.has(o.value)) fail(ctx, `${sctx}: duplicate option value "${o.value}"`);
              seen.add(o.value);
              return Object.freeze({
                value: o.value,
                label: o.label,
                ...(o.icon != null ? { icon: o.icon } : {}),
              });
            }),
          );
        }

        // Per-kind default typing. Island values need defaults for their sparse
        // settings carrier; style-bound controls may declare a presentation
        // fallback used when no responsive class has been authored.
        if (bindsIsland) {
          const d = s.default;
          if (control === "toggle" && typeof d !== "boolean")
            fail(ctx, `${sctx}: a "toggle" default must be a boolean`);
          if (control === "text" && typeof d !== "string")
            fail(ctx, `${sctx}: a "text" default must be a string`);
          if (control === "toggle-group" || control === "select") {
            if (typeof d !== "string" || !options!.some((o) => o.value === d))
              fail(ctx, `${sctx}: the default must be one of the option values`);
          }
          if (control === "number") {
            if (typeof d !== "number" || !Number.isFinite(d))
              fail(ctx, `${sctx}: a "number" default must be a finite number`);
            for (const key of ["min", "max", "step"] as const) {
              if (key in s && (typeof s[key] !== "number" || !Number.isFinite(s[key])))
                fail(ctx, `${sctx}: ${key} must be a finite number`);
            }
            if (s.step != null && s.step <= 0) fail(ctx, `${sctx}: step must be > 0`);
            if (s.min != null && s.max != null && s.min > s.max)
              fail(ctx, `${sctx}: min must be ≤ max`);
            if ((s.min != null && d < s.min) || (s.max != null && d > s.max))
              fail(ctx, `${sctx}: the default must sit within [min, max]`);
          }
        }
        if (
          bindsStyle &&
          "default" in s &&
          (control === "toggle-group" || control === "select") &&
          !options!.some((option) => option.value === s.default)
        )
          fail(ctx, `${sctx}: the style default must be one of the option values`);
        if (control === "text" && "placeholder" in s && typeof s.placeholder !== "string")
          fail(ctx, `${sctx}: placeholder must be a string`);

        return Object.freeze({
          control,
          label: s.label,
          ...(bindsField ? { field: s.field } : {}),
          ...(bindsTransform ? { transform: true as const } : {}),
          ...(bindsIsland ? { setting: s.setting, default: s.default } : {}),
          ...(bindsStyle
            ? {
                style: s.style,
                ...("default" in s ? { default: s.default } : {}),
              }
            : {}),
          ...(options ? { options } : {}),
          ...(control === "text" && s.placeholder != null ? { placeholder: s.placeholder } : {}),
          ...(control === "number" && s.min != null ? { min: s.min } : {}),
          ...(control === "number" && s.max != null ? { max: s.max } : {}),
          ...(control === "number" && s.step != null ? { step: s.step } : {}),
          ...(s.role != null ? { role: s.role } : {}),
          ...(s.help != null ? { help: s.help } : {}),
          ...(s.when != null
            ? {
                when: Object.freeze({
                  ...(s.when.field != null ? { field: s.when.field } : {}),
                  ...(s.when.setting != null ? { setting: s.when.setting } : {}),
                  ...(s.when.style != null ? { style: s.when.style } : {}),
                  ...("equals" in s.when ? { equals: s.when.equals } : {}),
                  ...("notEquals" in s.when ? { notEquals: s.when.notEquals } : {}),
                }),
              }
            : {}),
        });
      }),
    );
    for (const [i, setting] of settings.entries()) {
      if (!setting.when) continue;
      if (setting.when.field && !fields.some((field) => field.name === setting.when!.field))
        fail(
          ctx,
          `settings[${i}].when: field "${setting.when.field}" is not carried by the render`,
        );
      if (
        setting.when.setting &&
        !settings.some((candidate) => candidate.setting === setting.when!.setting)
      )
        fail(ctx, `settings[${i}].when: setting "${setting.when.setting}" is not declared`);
      if (setting.when.style && !blockSupportsStyle(supports, setting.when.style))
        fail(ctx, `settings[${i}].when: style "${setting.when.style}" is not supported`);
    }
  }

  // The island-bound subset, name → default: what cast/editor consult to fill
  // defaults and decide island presence.
  const islandSettings: readonly IslandSetting[] = Object.freeze(
    (settings ?? [])
      .filter((s) => s.setting != null)
      .map((s) => Object.freeze({ name: s.setting!, default: s.default })),
  );

  // Toolbar controls: validated AFTER fields + islandSettings, so every
  // binding names something the block actually carries (a field the render
  // reads back, an island setting the type declares). Same contract as
  // settings — the toolbar can never write a value with no canonical home.
  let toolbar: readonly ToolbarSpec[] | undefined;
  if ("toolbar" in def) {
    if (!Array.isArray(def.toolbar)) fail(ctx, "toolbar must be an array");
    const island = (name: unknown) => islandSettings.find((s) => s.name === name);
    const islandRole = (name: unknown): ControlRole =>
      settings?.find((s) => s.setting === name)?.role ?? "advanced";
    toolbar = Object.freeze(
      def.toolbar.map((t, i) => {
        const tctx = `toolbar[${i}]`;
        if (t === null || typeof t !== "object") fail(ctx, `${tctx} must be an object`);
        const control = t.control as ToolbarControl;
        if (!TOOLBAR_CONTROLS.includes(control))
          fail(ctx, `${tctx}: unknown control "${String(control)}"`);
        for (const key of Object.keys(t)) {
          if (
            key !== "control" &&
            key !== "label" &&
            key !== "icon" &&
            key !== "group" &&
            key !== "role" &&
            !TOOLBAR_KEYS[control].includes(key)
          )
            fail(ctx, `${tctx}: unknown key "${key}" on a "${control}" control`);
        }
        if (typeof t.label !== "string" || !t.label) fail(ctx, `${tctx}: label is required`);
        if (t.icon != null && (typeof t.icon !== "string" || !t.icon))
          fail(ctx, `${tctx}: icon must be a non-empty string`);
        if (t.activeIcon != null && (typeof t.activeIcon !== "string" || !t.activeIcon))
          fail(ctx, `${tctx}: activeIcon must be a non-empty string`);
        if (t.group != null && !TOOLBAR_GROUPS.includes(t.group))
          fail(ctx, `${tctx}: unknown group "${String(t.group)}"`);
        if (t.role != null && !CONTROL_ROLES.includes(t.role))
          fail(ctx, `${tctx}: unknown role "${String(t.role)}"`);

        if (control === "replace" || control === "caption") {
          const target = fields.find((f) => f.name === t.field);
          if (!target)
            fail(ctx, `${tctx}: field "${String(t.field)}" is not carried by the render`);
          const want = control === "replace" ? "image" : "rich";
          if (target.type !== want)
            fail(ctx, `${tctx}: a "${control}" control requires a ${want}-kinded field`);
        }
        if (control === "caption") {
          const s = island(t.setting);
          if (!s)
            fail(ctx, `${tctx}: setting "${String(t.setting)}" is not a declared island setting`);
          if (control === "caption" && typeof s.default !== "boolean")
            fail(ctx, `${tctx}: a "caption" setting must be a boolean (visibility) setting`);
        }
        if (control === "link") {
          if (Number(t.field != null) + Number(t.setting != null) !== 1)
            fail(ctx, `${tctx}: a "link" control requires exactly one field or setting`);
          if (t.field != null) {
            const target = fields.find((f) => f.name === t.field);
            if (!target || target.type !== "link")
              fail(ctx, `${tctx}: a field-bound "link" control requires a link-kinded field`);
          } else if (!island(t.setting)) {
            fail(ctx, `${tctx}: setting "${String(t.setting)}" is not a declared island setting`);
          }
        }
        if (control === "link" && t.targetSetting != null && !island(t.targetSetting))
          fail(
            ctx,
            `${tctx}: targetSetting "${String(t.targetSetting)}" is not a declared island setting`,
          );
        if (control === "copy") {
          const target = fields.find((field) => field.name === t.field);
          if (!target || target.type !== "link")
            fail(ctx, `${tctx}: a "copy" control requires a link-kinded field`);
        }
        if (control === "text") {
          if (Number(t.field != null) + Number(t.setting != null) !== 1)
            fail(ctx, `${tctx}: a "text" control requires exactly one field or setting`);
          if (t.field != null) {
            const target = fields.find((field) => field.name === t.field);
            if (!target || (target.type !== "text" && target.type !== "link"))
              fail(ctx, `${tctx}: a field-bound "text" control requires a text or link field`);
          } else {
            const target = island(t.setting);
            if (!target || typeof target.default !== "string")
              fail(ctx, `${tctx}: a setting-bound "text" control requires a string setting`);
          }
        }

        let options: readonly SettingOption[] | undefined;
        if (
          control === "field-options" ||
          control === "setting-options" ||
          control === "transform-options" ||
          control === "style-options"
        ) {
          if (!Array.isArray(t.options) || !t.options.length)
            fail(ctx, `${tctx}: options must be a non-empty array`);
          const seen = new Set<string>();
          options = Object.freeze(
            t.options.map((o) => {
              if (o === null || typeof o !== "object" || typeof o.value !== "string" || !o.value)
                fail(ctx, `${tctx}: every option needs a non-empty string value`);
              if (typeof o.label !== "string" || !o.label)
                fail(ctx, `${tctx}: every option needs a non-empty string label`);
              if (o.icon != null && (typeof o.icon !== "string" || !o.icon))
                fail(ctx, `${tctx}: option icon must be a non-empty string`);
              if (seen.has(o.value)) fail(ctx, `${tctx}: duplicate option value "${o.value}"`);
              seen.add(o.value);
              return Object.freeze({
                value: o.value,
                label: o.label,
                ...(o.icon != null ? { icon: o.icon } : {}),
              });
            }),
          );
        }

        const fieldTarget = t.field != null ? fields.find((f) => f.name === t.field) : undefined;
        const settingTarget = t.setting != null ? island(t.setting) : undefined;
        if (control === "field-options" && !fieldTarget)
          fail(ctx, `${tctx}: field "${String(t.field)}" is not carried by the render`);
        if ((control === "setting-options" || control === "toggle-setting") && !settingTarget)
          fail(ctx, `${tctx}: setting "${String(t.setting)}" is not a declared island setting`);
        if (control === "toggle-setting" && typeof settingTarget!.default !== "boolean")
          fail(ctx, `${tctx}: a "toggle-setting" control requires a boolean setting`);
        if (control === "add-child") {
          if (!slot) fail(ctx, `${tctx}: an "add-child" control requires a child slot`);
          if (typeof t.type !== "string" || !NAME.test(t.type))
            fail(ctx, `${tctx}: an "add-child" control requires a block type`);
          if (allowedChildren && !allowedChildren.includes(t.type))
            fail(ctx, `${tctx}: child type "${t.type}" is not allowed by this block`);
        }
        if (
          control === "style-options" &&
          (typeof t.style !== "string" || !blockSupportsStyle(supports, t.style))
        )
          fail(ctx, `${tctx}: style "${String(t.style)}" is not supported by this block`);
        if (
          control === "toggle-style" &&
          (typeof t.style !== "string" || !blockSupportsStyle(supports, t.style))
        )
          fail(ctx, `${tctx}: style "${String(t.style)}" is not supported by this block`);
        if (control === "toggle-style" && (typeof t.value !== "string" || !t.value))
          fail(ctx, `${tctx}: a "toggle-style" control requires a non-empty value`);

        const inferredRole: ControlRole =
          control === "text-align"
            ? "design"
            : control === "style-options"
              ? "design"
              : control === "toggle-style"
                ? "design"
                : control === "transform-options"
                  ? "structure"
                  : control === "add-child"
                    ? "structure"
                    : control === "field-options"
                      ? fieldTarget?.type === "tag"
                        ? "structure"
                        : "content"
                      : control === "setting-options" || control === "toggle-setting"
                        ? islandRole(t.setting)
                        : "content";

        return Object.freeze({
          control,
          label: t.label,
          ...(t.icon != null ? { icon: t.icon } : {}),
          ...(t.activeIcon != null ? { activeIcon: t.activeIcon } : {}),
          ...(t.field != null ? { field: t.field } : {}),
          ...(t.setting != null ? { setting: t.setting } : {}),
          ...(t.targetSetting != null ? { targetSetting: t.targetSetting } : {}),
          ...(t.type != null ? { type: t.type } : {}),
          ...(t.style != null ? { style: t.style } : {}),
          ...(t.value != null ? { value: t.value } : {}),
          ...(options ? { options } : {}),
          group: t.group ?? (control === "replace" ? "other" : "block"),
          role: t.role ?? inferredRole,
        });
      }),
    );
  }

  const frozen: BlockType = Object.freeze({
    label: def.label,
    render: def.render,
    ...(def.placeholder != null ? { placeholder: def.placeholder } : {}),
    ...(def.category != null ? { category: def.category } : {}),
    ...(def.description != null ? { description: def.description } : {}),
    ...(def.icon != null ? { icon: def.icon } : {}),
    ...(settings ? { settings } : {}),
    ...(toolbar ? { toolbar } : {}),
    ...(allowedChildren ? { allowedChildren } : {}),
    ...(childTemplate ? { childTemplate } : {}),
    ...(def.internal ? { internal: true } : {}),
    ...(def.templateOnly ? { templateOnly: true } : {}),
    ...(def.phantom ? { phantom: true } : {}),
    ...(noSplit ? { noSplit } : {}),
    ...(allowedFormats !== undefined ? { allowedFormats } : {}),
    ...(supports ? { supports } : {}),
    ...(variants ? { variants } : {}),
    ...(classTarget ? { classTarget } : {}),
    fields: Object.freeze(fields),
    islandSettings,
    acceptsChildren: !!slot,
  });
  registry.set(type, frozen);
  return frozen;
}

export function unregisterBlock(type: string): boolean {
  return registry.delete(type);
}

export const getBlockType = (type: string): BlockType | undefined => registry.get(type);

/** All registered block types in registration order: [{ type, label, fields, render }, …]. Inserter/slash-menu fodder. */
export function blockTypes(): ({ type: string } & BlockType)[] {
  return Array.from(registry, ([type, def]) => ({ type, ...def }));
}
