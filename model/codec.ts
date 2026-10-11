// Upcast (annotated HTML → model) and downcast (model → HTML), docs/WIRE-CONTRACT.md.
// Upcast is permissive: unknown markup loads as `raw-html`, a missing id is minted, a
// broken island reads as `{}`. Downcast has two pipelines: `editing` keeps every
// carrier, id and island so the HTML loads back into the same model; `data` is what a
// page publishes, with the editor's vocabulary gone and phantom wrappers unwrapped.
import {
  BLOCK_ATTR,
  CHILDREN_ATTR,
  DOC_ATTR,
  ID_ATTR,
  PATTERN_ATTR,
  SETTINGS_SELECTOR,
  SLOT_ATTR,
  escapeHtml,
  interactionsOf,
  isElement,
  isIsland,
  isText,
  parseFragment,
  readCarrier,
  renderRoot,
  scopedCarriers,
  scopedSlots,
  carrierAttr,
} from "./carriers";
import { parsingDocument } from "./dom";
import { blockType, effectiveSettings } from "./registry";
import type { BlockType } from "./registry";
import { topLevelSegments } from "./scan";
import type { Block, Fields, Model, Settings } from "./types";
import { RAW_TYPE } from "./types";

export type Pipeline = "editing" | "data";

let minted = 0;

/** A fresh block id: `b_` and a random suffix, unique within the session. */
export function mintId(): string {
  minted = (minted + 1) % 1_679_616;
  return `b_${Math.random().toString(36).slice(2, 8)}${minted.toString(36)}`;
}

const tokens = (classes: string | null | undefined) => (classes ?? "").split(/\s+/).filter(Boolean);

const unique = (list: string[]) => [...new Set(list)];

// ── upcast ────────────────────────────────────────────────────────────────

export function upcast(html: string, options: UpcastOptions = {}): Model {
  return { blocks: upcastBlocks(html, options) };
}

export type UpcastOptions = {
  /** Plain HTML (a field written before the editor) opens as paragraphs, not raw blocks. */
  plain?: boolean;
};

/** The blocks of an HTML string: the children of its `data-pb-doc` root, else its top level. */
export function upcastBlocks(html: string, options: UpcastOptions = {}): Block[] {
  const doc = parsingDocument();
  const fragment = parseFragment(doc, html);
  if (options.plain && !html.includes(BLOCK_ATTR)) return plainBlocks(fragment);
  const root = [...fragment.querySelectorAll(`[${DOC_ATTR}]`)][0];
  if (root) return upcastChildren(root);

  // Raw markup at the top level keeps its exact source when the scan agrees with the parse.
  const nodes = [...fragment.childNodes].filter((node) => isElement(node) || (isText(node) && node.data.trim() !== ""));
  const segments = topLevelSegments(html).filter((segment) => segment.kind !== "comment" && (segment.kind === "element" || html.slice(segment.start, segment.end).trim() !== ""));
  const exact = segments.length === nodes.length;
  return nodes.map((node, index) => {
    if (isText(node)) return looseText(node.data);
    const source = exact ? html.slice(segments[index].start, segments[index].end) : undefined;
    return upcastElement(node as Element, source);
  });
}

/** Unannotated HTML as paragraphs: each block-level element's content, and loose text, one paragraph each. */
function plainBlocks(fragment: DocumentFragment): Block[] {
  const paragraph = blockType("paragraph");
  if (!paragraph?.primary) return [];
  const blocks: Block[] = [];
  let inline = "";
  const flush = () => {
    if (inline.trim()) blocks.push(fresh(paragraph, { [paragraph.primary!]: inline.trim() }));
    inline = "";
  };
  const doc = fragment.ownerDocument;
  for (const node of fragment.childNodes) {
    if (isElement(node) && /^(p|div|h[1-6]|blockquote|li|pre|section|article)$/.test(node.localName)) {
      flush();
      if (node.querySelector("p, div, li, h1, h2, h3, h4, h5, h6")) {
        const inner = doc.createDocumentFragment();
        for (const child of node.childNodes) inner.append(child.cloneNode(true));
        blocks.push(...plainBlocks(inner));
      } else if (node.innerHTML.trim()) {
        blocks.push(fresh(paragraph, { [paragraph.primary]: node.innerHTML.trim() }));
      }
    } else if (isElement(node) && /^(ul|ol)$/.test(node.localName)) {
      flush();
      for (const item of node.children) if (item.innerHTML.trim()) blocks.push(fresh(paragraph, { [paragraph.primary]: item.innerHTML.trim() }));
    } else if (isElement(node)) {
      inline += node.outerHTML;
    } else if (isText(node)) {
      inline += escapeHtml(node.data);
    }
  }
  flush();
  return blocks;
}

function upcastChildren(container: Element): Block[] {
  const blocks: Block[] = [];
  for (const node of container.childNodes) {
    if (isElement(node)) {
      if (!isIsland(node)) blocks.push(upcastElement(node));
    } else if (isText(node) && node.data.trim() !== "") {
      blocks.push(looseText(node.data));
    }
  }
  return blocks;
}

/** Text outside any element loads as a paragraph: kept, never dropped. */
function looseText(text: string): Block {
  const paragraph = blockType("paragraph");
  if (!paragraph || !paragraph.primary) return raw(escapeHtml(text.trim()), mintId());
  return fresh(paragraph, { [paragraph.primary]: escapeHtml(text.trim()) });
}

function raw(html: string, id: string): Block {
  return { type: RAW_TYPE, id, fields: { html }, settings: {}, interactions: {}, classes: "" };
}

/** One element as a block: typed when its type is registered, raw otherwise. */
export function upcastElement(element: Element, source?: string): Block {
  const name = element.getAttribute(BLOCK_ATTR);
  const type = name ? blockType(name) : null;
  if (!type) {
    const id = element.getAttribute(ID_ATTR) || mintId();
    const html = source ?? element.outerHTML;
    return raw(withoutIdAttribute(html), id);
  }

  const fields: Fields = {};
  for (const field of type.fields) fields[field.name] = structuredClone(field.default);
  for (const carrier of scopedCarriers(element)) {
    for (const field of type.fields) {
      if (carrier.getAttribute(carrierAttr(field.kind)) === field.name) fields[field.name] = readCarrier(carrier, field.kind);
    }
  }

  const block: Block = {
    type: type.type,
    id: element.getAttribute(ID_ATTR) || mintId(),
    fields,
    settings: readIsland(element),
    interactions: interactionsOf(element),
    classes: "",
  };
  const pattern = element.getAttribute(PATTERN_ATTR);
  if (pattern) block.pattern = pattern;

  if (type.slots.length > 0) {
    block.slots = {};
    const containers = scopedSlots(element);
    for (const slot of type.slots) {
      const container = containers.get(slot);
      block.slots[slot] = container ? upcastChildren(container) : [];
    }
  }

  const baseline = new Set(tokens(baselineRoot(type, block).getAttribute("class")));
  block.classes = unique(tokens(element.getAttribute("class"))).filter((name) => !baseline.has(name)).join(" ");
  return block;
}

function readIsland(element: Element): Settings {
  for (const child of element.children) {
    if (!child.matches(SETTINGS_SELECTOR)) continue;
    try {
      const value = JSON.parse(child.textContent ?? "");
      return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }
  return {};
}

function withoutIdAttribute(html: string): string {
  const open = html.indexOf(">");
  if (open < 0) return html;
  const head = html.slice(0, open).replace(/\s+data-pb-id\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/, "");
  return head + html.slice(open);
}

// ── fresh blocks ──────────────────────────────────────────────────────────

/** A new block of `type` with its defaults, optional field values and seeded slots. */
export function fresh(type: BlockType, fields: Partial<Fields> = {}, settings: Settings = {}): Block {
  const block: Block = {
    type: type.type,
    id: mintId(),
    fields: {},
    settings: { ...settings },
    interactions: {},
    classes: "",
  };
  for (const field of type.fields) block.fields[field.name] = structuredClone(fields[field.name] ?? field.default);
  if (type.slots.length > 0) {
    block.slots = {};
    for (const slot of type.slots) {
      block.slots[slot] = (type.template?.[slot] ?? []).map(seed);
    }
  }
  return block;
}

function seed(spec: string | { type: string; fields?: Partial<Fields>; settings?: Settings; slots?: Record<string, unknown[]> }): Block {
  const name = typeof spec === "string" ? spec : spec.type;
  const type = blockType(name);
  if (!type) throw new Error(`editor: template seeds unregistered block "${name}"`);
  const block = fresh(type, typeof spec === "string" ? {} : spec.fields, typeof spec === "string" ? {} : spec.settings);
  if (typeof spec !== "string" && spec.slots && block.slots) {
    for (const [slot, children] of Object.entries(spec.slots)) block.slots[slot] = children.map((child) => seed(child as never));
  }
  return block;
}

// ── downcast ──────────────────────────────────────────────────────────────

/** The render root a block's fields and settings produce, before any stamping. */
function baselineRoot(type: BlockType, block: Block): Element {
  return renderRoot(parsingDocument(), type.render(block.fields, effectiveSettings(type, block.settings)), type.type);
}

export function downcast(model: Model | Block[], pipeline: Pipeline = "editing"): string {
  const blocks = Array.isArray(model) ? model : model.blocks;
  return blocks.map((block) => downcastHtml(block, pipeline)).join("\n");
}

/** One block's HTML. */
export function downcastHtml(block: Block, pipeline: Pipeline): string {
  if (block.type === RAW_TYPE) return rawHtml(block, pipeline);
  const doc = parsingDocument();
  const holder = doc.createElement("div");
  holder.append(...downcastNodes(block, pipeline, doc));
  return holder.innerHTML;
}

function rawHtml(block: Block, pipeline: Pipeline): string {
  const html = String(block.fields.html ?? "");
  if (pipeline === "data") return html;
  const match = /^\s*<([A-Za-z][A-Za-z0-9:-]*)/.exec(html);
  if (!match) return html;
  const at = match.index + match[0].length;
  return `${html.slice(0, at)} ${ID_ATTR}="${block.id}"${html.slice(at)}`;
}

/** A block as nodes in `doc`: one root, or for a phantom in the data pipeline its children. */
export function downcastNodes(block: Block, pipeline: Pipeline, doc: Document): Node[] {
  if (block.type === RAW_TYPE) return [...parseFragment(doc, rawHtml(block, pipeline)).childNodes];
  const type = blockType(block.type);
  if (!type) throw new Error(`editor: no block "${block.type}" is registered`);
  if (type.phantom && pipeline === "data") {
    return Object.values(block.slots ?? {}).flat().flatMap((child) => downcastNodes(child, pipeline, doc));
  }
  return [downcastElement(block, type, pipeline, doc)];
}

/** A typed block's root element, its slots filled. */
export function downcastElement(block: Block, type: BlockType, pipeline: Pipeline, doc: Document): Element {
  const root = doc.importNode(baselineRoot(type, block), true) as Element;
  const baseline = tokens(root.getAttribute("class"));
  const classes = unique([...baseline, ...tokens(block.classes)]);
  if (classes.length > 0) root.setAttribute("class", classes.join(" "));
  for (const [name, value] of Object.entries(block.interactions)) root.setAttribute(name, value);

  // Slots are found before the data pipeline strips the attributes that mark them, and
  // filled after, so nested raw markup keeps whatever it carries.
  const slots = scopedSlots(root);
  if (pipeline === "data") stripVocabulary(root);
  for (const slot of type.slots) {
    const container = slots.get(slot);
    if (!container) continue;
    for (const child of block.slots?.[slot] ?? []) container.append(...downcastNodes(child, pipeline, doc));
  }

  if (pipeline === "editing") {
    root.setAttribute(ID_ATTR, block.id);
    if (block.pattern) root.setAttribute(PATTERN_ATTR, block.pattern);
    if (Object.keys(block.settings).length > 0) {
      const island = doc.createElement("script");
      island.setAttribute("type", "application/json");
      island.setAttribute("data-pb-settings", "");
      island.textContent = JSON.stringify(block.settings);
      root.prepend(island);
    }
  }
  return root;
}

/** The data pipeline: no `data-pb-*` attribute survives anywhere in a typed block's output. */
function stripVocabulary(root: Element): void {
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith("data-pb-")) element.removeAttribute(attribute.name);
    }
  }
}

export { BLOCK_ATTR, CHILDREN_ATTR, SLOT_ATTR };
