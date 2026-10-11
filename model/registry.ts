// The block registry. `registerBlock(type, definition)` is the one registration path for
// core blocks, plugins and the console alike. The render is the schema: a block's
// fields and slots are derived by probing `render({}, defaults)` — the carriers in the
// output are the field declarations and the values read back are the defaults, so
// declared-versus-rendered drift cannot happen. Only what markup cannot say (labels,
// placeholders, setting controls, slot policy) is declared.
import {
  CARRIER_KINDS,
  carrierAttr,
  readCarrier,
  renderRoot,
  scopedCarriers,
  scopedSlots,
} from "./carriers";
import type { CarrierKind } from "./carriers";
import { parsingDocument } from "./dom";
import type { FieldValue, Fields, Settings } from "./types";
import { RAW_TYPE } from "./types";

/** One choice a setting control offers. */
export type SettingOption = { value: string; label: string; icon?: string };

export type SettingControl = "toggle-group" | "toggle" | "select" | "text" | "number" | "media" | "url";

/** What a control changes; content-only editing keeps only `content`. */
export type ControlRole = "content" | "structure" | "design" | "advanced";

/**
 * A sidebar control. Bound to exactly one of: an island `setting` (needs a `default`),
 * a carrier `field`, `transform` (options are block types the block switches to), or a
 * `style` prop (a lens over the block's classes: `layoutMode`, `containerEnabled`, ...).
 */
export type SettingSpec = {
  control: SettingControl;
  label: string;
  setting?: string;
  field?: string;
  transform?: boolean;
  style?: string;
  default?: unknown;
  options?: readonly SettingOption[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  role?: ControlRole;
  /** Shown only while this returns true for the block's settings (defaults filled in). */
  when?: (settings: Settings, fields: Fields) => boolean;
  /** A toggle that clears this field when turned off (a caption's text with its Caption toggle). */
  clears?: string;
  /** Shown only while a style prop has (or lacks) a value: `{ style: "containerEnabled", equals: "true" }`. */
  whenStyle?: { style: string; equals: string };
};

/** The floating toolbar's controls a block declares, the toolbar's answer to `settings`. */
export type ToolbarControl =
  | "text-align"
  | "field-options"
  | "setting-options"
  | "style-options"
  | "toggle-setting"
  | "toggle-style"
  | "add-child"
  | "replace"
  | "link"
  | "caption"
  | "copy"
  | "text";

export type ToolbarSpec = {
  control: ToolbarControl;
  label: string;
  field?: string;
  setting?: string;
  style?: string;
  /** add-child: the type appended to the block's slot. */
  type?: string;
  /** toggle-style: the value the toggle sets. */
  value?: string;
  /** link: the setting that holds the link's target. */
  targetSetting?: string;
  icon?: string;
  activeIcon?: string;
  options?: readonly SettingOption[];
  role?: ControlRole;
  group?: "parent" | "block" | "inline" | "other";
};

/** Per-field editor metadata a carrier cannot carry. */
export type CarrierSpec = {
  /** Ghost text while the field is empty; chrome only, never serialized. */
  placeholder?: string;
  /** `false`: Enter is a newline here, never a split. */
  split?: boolean;
  label?: string;
};

/** A block seeded into a slot on insert. */
export type SeedBlock = string | { type: string; fields?: Partial<Fields>; settings?: Settings; slots?: Record<string, SeedBlock[]> };

/** One style control a block offers: on, or offered under Advanced (`default: false`). */
export type StyleSupport = boolean | { default?: false; values?: readonly string[] };

export type StyleSupports = {
  typography?: {
    fontFamily?: StyleSupport;
    fontSize?: StyleSupport;
    lineHeight?: StyleSupport;
    letterSpacing?: StyleSupport;
    decoration?: StyleSupport;
    letterCase?: StyleSupport;
    textAlign?: StyleSupport;
    fontWeight?: StyleSupport;
    fontStyle?: StyleSupport;
  };
  color?: { text?: StyleSupport; background?: StyleSupport };
  spacing?: {
    padding?: StyleSupport;
    paddingInline?: StyleSupport;
    paddingBlock?: StyleSupport;
    paddingTop?: StyleSupport;
    paddingRight?: StyleSupport;
    paddingBottom?: StyleSupport;
    paddingLeft?: StyleSupport;
    margin?: StyleSupport;
    marginTop?: StyleSupport;
    marginRight?: StyleSupport;
    marginBottom?: StyleSupport;
    marginLeft?: StyleSupport;
  };
  border?: { width?: StyleSupport; color?: StyleSupport; radius?: StyleSupport; style?: StyleSupport };
  dimensions?: {
    width?: StyleSupport;
    height?: StyleSupport;
    minHeight?: StyleSupport;
    minWidth?: StyleSupport;
    maxWidth?: StyleSupport;
    flexBasis?: StyleSupport;
    aspectRatio?: StyleSupport;
  };
  layout?: {
    gap?: StyleSupport;
    rowGap?: StyleSupport;
    columnGap?: StyleSupport;
    justifyContent?: StyleSupport;
    alignItems?: StyleSupport;
    flexWrap?: StyleSupport;
    gridColumns?: StyleSupport;
    /** The Group's Group / Row / Stack / Grid layouts and its Container toggle. */
    layoutMode?: boolean;
  };
};

export type Variation = { name: string; label: string; classes: string };

export type BlockDefinition = {
  label: string;
  /** Icon name from the design system's icon set. */
  icon?: string;
  category?: string;
  description?: string;
  keywords?: readonly string[];
  /** Hidden from the inserters; created only through its parent's UI. */
  internal?: boolean;
  /** Renders the block's wire HTML: one root carrying `data-pb-block`. Must tolerate absent fields. */
  render(fields: Partial<Fields>, settings: Settings): string;
  settings?: readonly SettingSpec[];
  carriers?: Readonly<Record<string, CarrierSpec>>;
  /** Slot name → the only block types insert and move accept there. */
  allow?: Readonly<Record<string, readonly string[]>>;
  /** Slot name → the blocks a fresh instance starts with. */
  template?: Readonly<Record<string, readonly SeedBlock[]>>;
  /** The type an Enter split at the end creates (default: the editor's default block). */
  splitInto?: string;
  /** Splitting makes a sibling of the same type (list items). */
  splitSame?: boolean;
  /** Clicks select the block instead of placing a caret (media, separators). */
  selectOnClick?: boolean;
  supports?: StyleSupports;
  variations?: readonly Variation[];
  /** Floating-toolbar controls, in display order. */
  toolbar?: readonly ToolbarSpec[];
  /** Types this block can be converted to, keeping its fields by name. */
  transforms?: readonly string[];
  /** An editor-only wrapper the data pipeline unwraps (pattern roots). */
  phantom?: boolean;
  /** Offered and accepted only while a template is being edited (parts, slots). */
  templateOnly?: boolean;
};

export type FieldSchema = {
  name: string;
  kind: CarrierKind;
  default: FieldValue;
  placeholder?: string;
  split: boolean;
  label?: string;
};

/** A definition with what its render declares. */
export type BlockType = BlockDefinition & {
  type: string;
  fields: readonly FieldSchema[];
  slots: readonly string[];
  /** Island settings with their declared defaults. */
  defaults: Settings;
  /** The field Enter splits and Backspace merges: the first text or rich field that splits. */
  primary: string | null;
};

const definitions = new Map<string, BlockDefinition>();
const derived = new Map<string, BlockType>();
let version = 0;

const NAME = /^[a-z][a-z0-9-]*$/;

export function registerBlock(type: string, definition: BlockDefinition): void {
  if (!NAME.test(type)) throw new Error(`editor: block type "${type}" must match ${NAME}`);
  if (type === RAW_TYPE) throw new Error(`editor: "${RAW_TYPE}" is reserved`);
  if (definitions.has(type)) throw new Error(`editor: block "${type}" is already registered`);
  if (typeof definition.label !== "string" || typeof definition.render !== "function") {
    throw new Error(`editor: block "${type}" needs a label and a render`);
  }
  for (const spec of definition.settings ?? []) {
    const bindings = [spec.setting, spec.field, spec.transform, spec.style].filter((binding) => binding !== undefined);
    if (bindings.length !== 1) throw new Error(`editor: ${type} setting "${spec.label}" needs exactly one binding`);
    if (spec.setting !== undefined && spec.default === undefined) {
      throw new Error(`editor: ${type} setting "${spec.setting}" needs a default`);
    }
  }
  definitions.set(type, definition);
  derived.delete(type);
  version++;
}

export function unregisterBlock(type: string): void {
  definitions.delete(type);
  derived.delete(type);
  version++;
}

/** Bumps on every registration change, so caches keyed on it stay honest. */
export const registryVersion = () => version;

export const isRegistered = (type: string) => definitions.has(type);

/** The registered type with its derived schema, or null. */
export function blockType(type: string): BlockType | null {
  const cached = derived.get(type);
  if (cached) return cached;
  const definition = definitions.get(type);
  if (!definition) return null;
  const result = derive(type, definition);
  derived.set(type, result);
  return result;
}

export function blockTypes(): BlockType[] {
  return [...definitions.keys()].map((type) => blockType(type)!);
}

function derive(type: string, definition: BlockDefinition): BlockType {
  const defaults: Settings = {};
  for (const spec of definition.settings ?? []) {
    if (spec.setting !== undefined) defaults[spec.setting] = spec.default;
  }
  const root = renderRoot(parsingDocument(), definition.render({}, { ...defaults }), type);
  const fields: FieldSchema[] = [];
  for (const element of scopedCarriers(root)) {
    for (const kind of CARRIER_KINDS) {
      const name = element.getAttribute(carrierAttr(kind));
      if (!name || fields.some((field) => field.name === name)) continue;
      const ui = definition.carriers?.[name];
      const splits = (kind === "text" || kind === "rich") && ui?.split !== false && element.closest("pre") === null;
      fields.push({ name, kind, default: readCarrier(element, kind), placeholder: ui?.placeholder, split: splits, label: ui?.label });
    }
  }
  const slots = [...scopedSlots(root).keys()];
  const primary = fields.find((field) => field.kind === "text" || field.kind === "rich")?.name ?? null;
  return { ...definition, type, fields, slots, defaults, primary };
}

/** The block's island settings with declared defaults filled in, as its render sees them. */
export function effectiveSettings(type: BlockType, settings: Settings): Settings {
  return { ...type.defaults, ...settings };
}
