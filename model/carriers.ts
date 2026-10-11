// The wire vocabulary (docs/WIRE-CONTRACT.md) and how a carrier's value is read off an
// element. Works on any document's elements; nothing here touches the page's globals,
// and elements are told apart by node type, never `instanceof`.
import type { FieldValue, ImageValue } from "./types";

export type CarrierKind = "text" | "rich" | "image" | "link" | "tag";

export const CARRIER_KINDS: readonly CarrierKind[] = ["text", "rich", "image", "link", "tag"];

export const BLOCK_ATTR = "data-pb-block";
export const ID_ATTR = "data-pb-id";
export const PATTERN_ATTR = "data-pb-pattern";
export const SLOT_ATTR = "data-pb-slot";
export const CHILDREN_ATTR = "data-pb-children";
export const DOC_ATTR = "data-pb-doc";
export const SETTINGS_SELECTOR = 'script[type="application/json"][data-pb-settings]';

export const carrierAttr = (kind: CarrierKind) => `data-pb-${kind}`;

export const CARRIER_SELECTOR = CARRIER_KINDS.map((kind) => `[${carrierAttr(kind)}]`).join(",");

export const isElement = (node: Node | null | undefined): node is Element =>
  node !== null && node !== undefined && node.nodeType === 1;

export const isText = (node: Node | null | undefined): node is Text =>
  node !== null && node !== undefined && node.nodeType === 3;

/** The settings island: a direct child of a block root. */
export function isIsland(node: Node): boolean {
  return isElement(node) && node.localName === "script" && node.hasAttribute("data-pb-settings");
}

/** The nearest block root at or above `element`. */
export function blockRootOf(element: Element): Element | null {
  return element.closest(`[${BLOCK_ATTR}]`);
}

/** Whether `element` carries whitespace as content (a `pre`, or inside one). */
export function preservesWhitespace(element: Element): boolean {
  return element.closest("pre") !== null;
}

/** The carriers that belong to `root`: its own and its descendants', nested blocks excluded. */
export function scopedCarriers(root: Element): Element[] {
  const found: Element[] = [];
  if (root.matches(CARRIER_SELECTOR)) found.push(root);
  for (const element of root.querySelectorAll(CARRIER_SELECTOR)) {
    if (blockRootOf(element) === root) found.push(element);
  }
  return found;
}

/** The slot containers of `root` by slot name: `data-pb-slot` names, `data-pb-children` is `children`. */
export function scopedSlots(root: Element): Map<string, Element> {
  const slots = new Map<string, Element>();
  const consider = (element: Element) => {
    if (element !== root && blockRootOf(element) !== root) return;
    const named = element.getAttribute(SLOT_ATTR);
    if (named) slots.set(named, element);
    else if (element.hasAttribute(CHILDREN_ATTR)) slots.set("children", element);
  };
  consider(root);
  for (const element of root.querySelectorAll(`[${SLOT_ATTR}],[${CHILDREN_ATTR}]`)) consider(element);
  return slots;
}

/** Child nodes of a carrier that are content: the settings island is metadata. */
function contentNodes(element: Element): Node[] {
  return [...element.childNodes].filter((node) => !isIsland(node));
}

function textOf(element: Element): string {
  let text = "";
  for (const node of contentNodes(element)) text += node.textContent ?? "";
  return text;
}

function richOf(element: Element): string {
  const doc = element.ownerDocument;
  const holder = doc.createElement("div");
  for (const node of contentNodes(element)) holder.append(node.cloneNode(true));
  return holder.innerHTML;
}

/**
 * Reads one carrier kind's value off an element. Loaded HTML is trimmed outside `pre`
 * (its indentation is markup, not content); `exact` reads what is typed, trailing
 * space included.
 */
export function readCarrier(element: Element, kind: CarrierKind, exact = false): FieldValue {
  switch (kind) {
    case "text": {
      const text = textOf(element);
      return exact || preservesWhitespace(element) ? text : text.trim();
    }
    case "rich": {
      const html = richOf(element);
      return exact || preservesWhitespace(element) ? html : html.trim();
    }
    case "image":
      return {
        src: element.getAttribute("src") ?? "",
        alt: element.getAttribute("alt") ?? "",
        width: element.getAttribute("width") ?? "",
        height: element.getAttribute("height") ?? "",
      } satisfies ImageValue;
    case "link":
      return element.getAttribute("href") ?? "";
    case "tag":
      return element.localName;
  }
}

/** Every `data-p` / `data-p-*` attribute on an element: runtime behavior, carried verbatim. */
export function interactionsOf(element: Element): Record<string, string> {
  const found: Record<string, string> = {};
  for (const attribute of element.attributes) {
    if (attribute.name === "data-p" || attribute.name.startsWith("data-p-")) found[attribute.name] = attribute.value;
  }
  return found;
}

/** Parses a fragment of HTML in `doc`, in a template so table parts parse in place. */
export function parseFragment(doc: Document, html: string): DocumentFragment {
  const template = doc.createElement("template");
  template.innerHTML = html;
  return template.content;
}

/** The single root element a render returned, or an error naming the block. */
export function renderRoot(doc: Document, html: string, type: string): Element {
  const fragment = parseFragment(doc, html);
  const elements = [...fragment.childNodes].filter(isElement);
  if (elements.length !== 1) throw new Error(`editor: ${type}'s render must return one root element, got ${elements.length}`);
  const root = elements[0];
  if (root.getAttribute(BLOCK_ATTR) !== type) throw new Error(`editor: ${type}'s render root must carry ${BLOCK_ATTR}="${type}"`);
  return root;
}

export const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const escapeAttr = (text: string) => escapeHtml(text).replace(/"/g, "&quot;");
