// The editor's model: a tree of blocks, the source of truth while editing. Annotated
// HTML (docs/WIRE-CONTRACT.md) is its serialization; `upcast(downcast(model))` deep-
// equals the model. Plain data only: every value here survives structuredClone and
// JSON.

/** An image-kinded carrier's value: the four attributes it carries, always all four. */
export type ImageValue = { src: string; alt: string; width: string; height: string };

/** A field's value: text, rich HTML, a link, a tag name, or an image. */
export type FieldValue = string | ImageValue;

export type Fields = Record<string, FieldValue>;

export type Settings = Record<string, unknown>;

/** A typed block, or the `raw-html` passthrough (whose only field is `html`). */
export type Block = {
  type: string;
  id: string;
  fields: Fields;
  settings: Settings;
  /** `data-p-*` attributes on the block root, carried verbatim. */
  interactions: Record<string, string>;
  /** Authored classes: the root's classes the renderer does not emit. */
  classes: string;
  /** Nested blocks per slot; present (possibly empty) for every declared slot. */
  slots?: Record<string, Block[]>;
  /** Provenance label of the pattern this block was stamped from. */
  pattern?: string;
};

export type Model = { blocks: Block[] };

/** The type upcast mints for markup it does not recognize. */
export const RAW_TYPE = "raw-html";

/** The slot name the bare `data-pb-children` attribute stands for. */
export const CHILDREN_SLOT = "children";

export function isImageValue(value: unknown): value is ImageValue {
  return typeof value === "object" && value !== null && "src" in value;
}

export const emptyImage = (): ImageValue => ({ src: "", alt: "", width: "", height: "" });
