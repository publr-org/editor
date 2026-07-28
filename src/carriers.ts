// carriers.ts — wire-contract primitives shared by every layer: the carrier
// vocabulary (data-pb-* attribute ↔ field kind), carrier scoping/reading,
// HTML escaping for renders, id minting, class-list splitting.

export const RAW_TYPE = "raw-html";

/** The five carrier kinds the wire contract knows. */
export type CarrierKind = "text" | "rich" | "tag" | "image" | "link";

/**
 * The image carrier's value — the element's src/alt/width/height attributes
 * (CONTRACT.md "Field carriers"). Always exactly these four string keys;
 * empty width/height mean "no attribute". The only non-string field value
 * in the model.
 */
export interface ImageValue {
  src: string;
  alt: string;
  width: string;
  height: string;
}

/** What a field holds: plain strings everywhere except the image carrier. */
export type FieldValue = string | ImageValue;

/** Structural clone for field values — object values must never alias the
 * registry's frozen defaults (or another block). */
export const cloneValue = (v: FieldValue): FieldValue => (typeof v === "object" ? { ...v } : v);

/** Narrow a field value to its string form ("" for image objects) — for
 * renders and chrome that know the field is string-kinded. */
export const str = (v: FieldValue | undefined): string => (typeof v === "string" ? v : "");

/**
 * One block instance in the model. Plain JSON by construction (round-trip
 * law). `classes` — authored classes beyond the render's baseline — is
 * absent on raw-html passthrough blocks. `children` — inner blocks — is
 * present exactly when the block's TYPE accepts children (its render emits a
 * data-pb-children slot), empty array included; never on other blocks.
 * `settings` — island-carried values with no DOM carrier — follows the same
 * presence convention keyed on the type's declared island settings: present
 * exactly when the type declares at least one, `{}` when every value sits at
 * its declared default (the model stays SPARSE — defaults are the registry's
 * to fill at the render seam), never on other blocks. Values are plain JSON.
 * `pattern` — provenance: the pattern key this block was stamped from
 * (data-pb-pattern on the wire). INFORMATIONAL ONLY, never behavioral —
 * instances are fully decoupled from their definition (thoughts/012);
 * children stay ordinary blocks and the label may go stale after edits;
 * chrome may show the pattern's label instead of the block type's.
 */
export interface Block {
  type: string;
  id: string;
  fields: Record<string, FieldValue>;
  classes?: string;
  children?: Block[];
  settings?: Record<string, unknown>;
  pattern?: string;
  /**
   * `css` — the root's authored style ATTRIBUTE, carried verbatim (same
   * convention as `classes`; absent when the root has none). Since E2
   * (css-engine thoughts) there is no style island: the CLASS LIST is the
   * universal style carrier (lenses read/patch it, style.ts), and this
   * attribute is the INLINE backend's carrier (style-backend.ts —
   * declarations with var(--token) references). Any authored inline style
   * survives the round trip regardless of backend.
   */
  css?: string;
}

export interface Model {
  blocks: Block[];
}

export const CARRIERS: readonly { attr: string; kind: CarrierKind }[] = [
  { attr: "data-pb-text", kind: "text" },
  { attr: "data-pb-rich", kind: "rich" },
  { attr: "data-pb-tag", kind: "tag" },
  { attr: "data-pb-image", kind: "image" },
  { attr: "data-pb-link", kind: "link" },
];

export const CARRIER_SELECTOR = CARRIERS.map((c) => `[${c.attr}]`).join(",");
export const EDITABLE_SELECTOR = "[data-pb-text],[data-pb-rich]";

/** Marks the ONE element in a render where inner blocks live. */
export const CHILDREN_ATTR = "data-pb-children";

/** Pattern provenance on a block root — optional, informational (Block.pattern). */
export const PATTERN_ATTR = "data-pb-pattern";

/**
 * The settings island: the canonical carrier for model facts with no visible
 * DOM carrier (CONTRACT.md "Settings island"). Downcast emits it as the FIRST
 * child of the block root; upcast tolerates it anywhere scoped to the root.
 */
export const SETTINGS_SELECTOR = 'script[type="application/json"][data-pb-settings]';

/**
 * Make a JSON string safe as inline <script> text: `</` becomes `<\/` so a
 * hostile `</script>` payload can't break out of the island. `\/` is a valid
 * JSON escape for `/`, so the payload parses back byte-identical.
 */
export function escJsonScript(json: string): string {
  return json.replace(/<\//g, "<\\/");
}

export function escHtml(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escAttr(s: unknown): string {
  return escHtml(s).replace(/"/g, "&quot;");
}

export function mintId(): string {
  return (
    "b_" + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8)
  );
}

// Carriers belong to the nearest block root (foreign HTML may nest roots).
export function scopedCarriers(root: Element): HTMLElement[] {
  const all = [...root.querySelectorAll<HTMLElement>(CARRIER_SELECTOR)];
  if (root.matches(CARRIER_SELECTOR)) all.unshift(root as HTMLElement);
  return all.filter((el) => el.closest("[data-pb-block]") === root);
}

// The children slot follows the same scoping rule (a nested container's slot
// belongs to that container, not the outer one); the root itself may be the
// slot — the common shape for a bare group.
export function scopedChildrenSlot(root: Element): HTMLElement | null {
  const all = [...root.querySelectorAll<HTMLElement>(`[${CHILDREN_ATTR}]`)];
  if (root.matches(`[${CHILDREN_ATTR}]`)) all.unshift(root as HTMLElement);
  return all.find((el) => el.closest("[data-pb-block]") === root) ?? null;
}

// The block's own settings island follows the same rule; the island itself is
// never a block root, so the root match variant doesn't apply.
export function scopedSettingsIsland(root: Element): HTMLElement | null {
  return (
    [...root.querySelectorAll<HTMLElement>(SETTINGS_SELECTOR)].find(
      (el) => el.closest("[data-pb-block]") === root,
    ) ?? null
  );
}

export function readCarrier(el: Element, kind: CarrierKind): FieldValue {
  if (kind === "tag") return el.tagName.toLowerCase();
  if (kind === "link") return el.getAttribute("href") ?? "";
  if (kind === "image") {
    return {
      src: el.getAttribute("src") ?? "",
      alt: el.getAttribute("alt") ?? "",
      width: el.getAttribute("width") ?? "",
      height: el.getAttribute("height") ?? "",
    };
  }
  // A settings island can sit INSIDE a carrier (the block root may itself be
  // the carrier — e.g. a <pre data-pb-text> code block): the island is cast
  // metadata, never field content, so guard the read. Only the islands scoped
  // to THIS block are stripped — one nested inside a foreign block root within
  // a rich value belongs to that root and stays content here.
  let source = el;
  if (el.querySelector(SETTINGS_SELECTOR)) {
    const clone = el.cloneNode(true) as Element;
    for (const island of clone.querySelectorAll(SETTINGS_SELECTOR)) {
      const owner = island.closest("[data-pb-block]");
      if (!owner || owner === clone) island.remove();
    }
    source = clone;
  }
  return kind === "text" ? (source.textContent ?? "") : source.innerHTML;
}

export const classList = (s: string | null | undefined): string[] =>
  (s ?? "").split(/\s+/).filter(Boolean);
