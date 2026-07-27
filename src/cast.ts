// cast.ts — HTML ⇄ model. Upcast is permissive by design (foreign, partial,
// or AI-written HTML always loads; unknown markup becomes raw-html
// passthrough blocks). Downcast dispatches to each block's render — the
// renderer is the downcast body. Conformance test for both directions:
// upcast(downcast(model)) must deep-equal the model (the round-trip law).

import {
  CARRIERS,
  PATTERN_ATTR,
  RAW_TYPE,
  SETTINGS_SELECTOR,
  STYLE_SELECTOR,
  classList,
  escJsonScript,
  mintId,
  readCarrier,
  scopedCarriers,
  scopedChildrenSlot,
  scopedSettingsIsland,
  str,
} from "./carriers";
import type { Block, CarrierKind, FieldValue, Model } from "./carriers";
import { getBlockType } from "./registry";
import type { BlockType, Settings } from "./registry";

// What the render receives as its settings input: the model's SPARSE island
// values over the declared defaults. undefined when the type declares none —
// the probe's conformance rule (tolerate absent settings) covers that case.
function renderSettings(def: BlockType, settings: Block["settings"]): Settings | undefined {
  if (!def.islandSettings.length) return undefined;
  const merged: Settings = {};
  for (const s of def.islandSettings) merged[s.name] = s.default;
  return Object.assign(merged, settings);
}

// The island read, normalized on load (same license as whitespace collapse:
// downcast∘upcast is semantically stable, not byte-stable): undeclared keys
// drop — the island is the DECLARED settings' canonical carrier, nothing
// else's — and values sitting at their declared default drop, keeping the
// model sparse. Malformed JSON reads as {} (permissive upcast never throws
// on content). undefined when the type declares no island settings — the
// presence convention is the TYPE's, not the document's.
function upcastSettings(el: Element, def: BlockType): Block["settings"] {
  if (!def.islandSettings.length) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(scopedSettingsIsland(el)?.textContent ?? "{}");
  } catch {
    parsed = undefined;
  }
  const settings: Record<string, unknown> = {};
  if (parsed !== null && typeof parsed === "object") {
    for (const s of def.islandSettings) {
      const value = (parsed as Record<string, unknown>)[s.name];
      if (value !== undefined && JSON.stringify(value) !== JSON.stringify(s.default))
        settings[s.name] = value;
    }
  }
  return settings;
}

// The element authored classes attach to: the render ROOT, unless the type
// declares a classTarget selector for a wrapper render (image → the inner
// <img>). Scoped to the root itself so a nested block's matching element is
// never mistaken for this block's target.
function classTargetEl(root: Element, def: BlockType): Element {
  if (!def.classTarget) return root;
  if (root.matches(def.classTarget)) return root;
  return root.querySelector(def.classTarget) ?? root;
}

// The classes the block's own render emits for these fields/settings;
// everything else in the class attribute is authored content and must survive
// round trips. Settings participate: a class the render derives from an
// island value is baseline, never authored. Style classes are NOT baseline
// since E2: the class list IS the style carrier (lenses read/patch
// block.classes, style.ts) — style utilities live in block.classes like any
// authored class, which is exactly what makes pasted Tailwind editable. The
// baseline is read from the classTarget (the wrapper's inner element for
// image), so a pasted class on that element round-trips correctly.
function baselineClasses(
  def: BlockType,
  fields: Block["fields"],
  settings: Settings | undefined,
): string[] {
  const tmp = document.createElement("div");
  try {
    tmp.innerHTML = def.render(fields, settings);
  } catch {
    return [];
  }
  const root = tmp.firstElementChild;
  return root ? classList(classTargetEl(root, def).getAttribute("class")) : [];
}

// LEGACY (pre-E2 documents): a data-pb-style island carried structured style
// values. The class list is the carrier now — the island is simply dropped on
// load (pre-release format, no value migration; the classes it derived are
// already on the element).

// Loading normalizes carried values (contract: downcast∘upcast is
// SEMANTICALLY stable, not byte-stable): whitespace runs collapse to one
// space and edges are trimmed — source-file indentation is formatting, not
// content, and carrying it verbatim makes serialized output ragged. Load
// path ONLY: the input-event path must never fight whitespace the user is
// mid-typing. Rich values collapse per TEXT NODE so attribute values stay
// untouched. Preformatted fields (carriers on/inside <pre> — code, verse)
// opt out at the call site: there, whitespace IS content.
function normalizeValue(value: FieldValue, kind: CarrierKind, carrier: Element): FieldValue {
  // Attribute-borne values (image src/alt/dims, link href) are data, not
  // prose — carried verbatim.
  if (kind === "image" || kind === "link") return value;
  if (kind !== "rich") return (value as string).replace(/\s+/g, " ").trim();
  value = value as string;
  // Re-parse inside a shallow CLONE of the carrier, not a div — fragment
  // parsing is context-sensitive, and a table section's rows (or any other
  // element that can't live in a div) would silently vanish otherwise.
  const tmp = carrier.cloneNode(false) as Element;
  tmp.innerHTML = value;
  const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT);
  for (let node: Text | null; (node = walker.nextNode() as Text | null); ) {
    node.data = node.data.replace(/\s+/g, " ");
  }
  return tmp.innerHTML.trim();
}

/** Pre-responsive Group containers lived in the settings island and their
 * semantic classes were normally supplied by render(). Pattern source can
 * contain only that island, so lift the old values into the new responsive
 * class carrier before the undeclared island keys are discarded. */
function legacyGroupContainerClasses(el: Element, type: string | null): string[] {
  if (type !== "group") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(scopedSettingsIsland(el)?.textContent ?? "{}");
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== "object") return [];
  const settings = parsed as Record<string, unknown>;
  if (settings.isContainer !== true) return [];
  const width = settings.containerWidth === "content" ? "content" : "wide";
  const bleed =
    settings.containerBleed === "left" ||
    settings.containerBleed === "right" ||
    settings.containerBleed === "both"
      ? settings.containerBleed
      : "none";
  return [
    "pbe-container--on",
    `pbe-container--${width}`,
    ...(bleed === "none" ? [] : [`pbe-container--bleed-${bleed}`]),
  ];
}

function upcastElement(el: Element): Block {
  const sourceType = el.getAttribute("data-pb-block");
  // Pre-unified container markup remains loadable, but immediately becomes
  // the one Group model with its former type represented as layout classes.
  const legacyLayout =
    !getBlockType(sourceType ?? "") &&
    (sourceType === "row" || sourceType === "stack" || sourceType === "grid")
      ? sourceType
      : null;
  const type = legacyLayout ? "group" : sourceType;
  const def = type ? getBlockType(type) : null;

  if (!type || !def) {
    const clone = el.cloneNode(true) as Element;
    clone.removeAttribute("data-pb-id"); // id is model bookkeeping, re-stamped on downcast
    return {
      type: RAW_TYPE,
      id: el.getAttribute("data-pb-id") || mintId(),
      fields: { html: clone.outerHTML },
    };
  }

  const block: Block = { type, id: el.getAttribute("data-pb-id") || mintId(), fields: {} };
  // Pattern provenance rides along when present — informational only, never
  // required or validated (hand-authored templates may include or omit it).
  const pattern = el.getAttribute(PATTERN_ATTR);
  if (pattern) block.pattern = pattern;
  for (const carrier of scopedCarriers(el)) {
    for (const { attr, kind } of CARRIERS) {
      const field = carrier.getAttribute(attr);
      if (!field) continue;
      const raw = readCarrier(carrier, kind);
      block.fields[field] = def.fields.find((f) => f.name === field)?.preformatted
        ? raw
        : normalizeValue(raw, kind, carrier);
    }
  }
  for (const f of def.fields) {
    if (!(f.name in block.fields)) block.fields[f.name] = f.default;
  }

  const settings = upcastSettings(el, def);
  if (settings) block.settings = settings;

  // The root's authored style attribute rides verbatim (the inline style
  // backend's carrier; any hand-authored inline style survives regardless).
  const css = el.getAttribute("style")?.trim();
  if (css) block.css = css;

  // Inner blocks recurse through the same permissive upcast — unknown markup
  // inside a slot degrades to raw-html children, never breaks the container.
  // The block's own islands are metadata, never a slot child (the root may
  // itself be the slot — a bare group — putting an island among slot children).
  if (def.acceptsChildren) {
    const slot = scopedChildrenSlot(el);
    block.children = slot
      ? [...slot.children]
          .filter((c) => !c.matches(SETTINGS_SELECTOR) && !c.matches(STYLE_SELECTOR))
          .map(upcastElement)
      : [];
  }

  // Authored classes come off the classTarget, not always the root: for a
  // wrapper render (image) they were pasted on the inner element (a bare
  // <img class="h-11"> — the root matches the "img" target — or the inner img
  // of an already-rendered figure).
  const baseline = new Set(baselineClasses(def, block.fields, renderSettings(def, block.settings)));
  const authoredClasses = classList(classTargetEl(el, def).getAttribute("class")).filter(
    (c) => c !== "[&>*]:flex-1" && c !== "pbe-grid--2",
  );
  for (const cls of legacyGroupContainerClasses(el, type))
    if (!authoredClasses.includes(cls)) authoredClasses.push(cls);
  if (legacyLayout === "row" && !authoredClasses.includes("flex")) authoredClasses.push("flex");
  if (legacyLayout === "row" && !authoredClasses.includes("flex-row"))
    authoredClasses.push("flex-row");
  if (legacyLayout === "stack" && !authoredClasses.includes("flex")) authoredClasses.push("flex");
  if (legacyLayout === "stack" && !authoredClasses.includes("flex-col"))
    authoredClasses.push("flex-col");
  if (legacyLayout === "grid" && !authoredClasses.includes("grid")) authoredClasses.push("grid");
  block.classes = authoredClasses.filter((c) => !baseline.has(c)).join(" ");
  return block;
}

/** Annotated HTML → model. Never throws on content. */
export function upcast(rootEl: Element): Model {
  return { blocks: [...rootEl.children].map(upcastElement) };
}

/**
 * Render one block to a detached element: render output + stamped identity.
 *
 * `ownerDocument` matters when the editor canvas lives in a same-origin
 * iframe. Creating the roots in the parent document and then adopting them
 * into the frame leaves their JavaScript wrappers in the parent realm. DOM
 * events inside the frame then fail the frame's `Element` checks, so typing
 * (including the `/` inserter trigger) never reaches the model.
 */
export function blockToElement(
  block: Block,
  ownerDocument: Document = document,
): HTMLElement | null {
  const tmp = ownerDocument.createElement("div");

  if (block.type === RAW_TYPE) {
    tmp.innerHTML = str(block.fields?.html);
    const root = tmp.firstElementChild as HTMLElement | null;
    if (root) root.setAttribute("data-pb-id", block.id);
    return root;
  }

  const def = getBlockType(block.type);
  if (!def) {
    console.warn(`PublrEditor: no registered block for "${block.type}" — dropped`);
    return null;
  }
  tmp.innerHTML = def.render(block.fields ?? {}, renderSettings(def, block.settings));
  const root = tmp.firstElementChild as HTMLElement | null;
  if (!root) return null;
  if (root.getAttribute("data-pb-block") !== block.type) {
    console.warn(
      `PublrEditor: render for "${block.type}" did not emit data-pb-block="${block.type}"`,
    );
  }
  root.setAttribute("data-pb-id", block.id);
  if (block.pattern) root.setAttribute(PATTERN_ATTR, block.pattern);
  // The island rides only when the model diverges from the defaults — the
  // sparse convention on the wire. First child of the root (upcast tolerates
  // it anywhere scoped to the root; children append after, so it stays first).
  if (block.settings && Object.keys(block.settings).length) {
    const island = ownerDocument.createElement("script");
    island.setAttribute("type", "application/json");
    island.setAttribute("data-pb-settings", "");
    island.textContent = escJsonScript(JSON.stringify(block.settings));
    root.prepend(island);
  }
  // Authored classes (which INCLUDE lens-written style utilities since E2 —
  // the class list is the style carrier) merged onto the render's baseline,
  // on the classTarget (the inner element for a wrapper render like image).
  const extra = classList(block.classes);
  if (extra.length) {
    const target = classTargetEl(root, def);
    const merged = [...classList(target.getAttribute("class"))];
    for (const c of extra) if (!merged.includes(c)) merged.push(c);
    target.setAttribute("class", merged.join(" "));
  }
  // The authored style attribute (the inline backend's carrier) — verbatim.
  if (block.css) root.setAttribute("style", block.css);
  if (block.children) {
    const slot = scopedChildrenSlot(root);
    if (slot) {
      for (const child of block.children) {
        const childEl = blockToElement(child, ownerDocument);
        if (childEl) slot.appendChild(childEl);
      }
    } else if (block.children.length) {
      console.warn(
        `PublrEditor: render for "${block.type}" emitted no data-pb-children slot — ${block.children.length} inner block(s) dropped`,
      );
    }
  }
  return root;
}

/**
 * Downcast targets. "editor" is the full wire contract (data-pb-* carriers,
 * identity, islands) — admin↔admin copy-paste fidelity. "data" is the
 * published shape: the same output with the editing vocabulary stripped;
 * data-p-* (PublrJS runtime) always survives. Data-pipeline output re-upcasts
 * as raw-html blocks — content preserved, typing gone — by permissive upcast.
 */
export type DowncastPipeline = "editor" | "data";

// The data pipeline is a post-pass over editor-pipeline output, never a
// renderer mode: the renderer stays single-path, so stripping sits inside the
// no-preview-drift guarantee. The walk covers raw-html passthroughs too —
// unknown-type blocks keep foreign data-pb-* (and settings islands) inside
// fields.html, and published output must be clean all the way down.
function stripEditingVocabulary(root: Element): void {
  // Islands first: stripping attributes would remove the markers these
  // selectors need. The universal style classes STAY (they are the published
  // form); only the structured style island (editor metadata) is dropped.
  for (const island of root.querySelectorAll(
    'script[type="application/json"][data-pb-settings], script[type="application/json"][data-pb-style]',
  )) {
    island.remove();
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    // getAttributeNames() is a static list — safe to remove while iterating
    for (const name of el.getAttributeNames()) {
      if (name.startsWith("data-pb-")) el.removeAttribute(name);
    }
  }
}

// Phantom blocks (registry `phantom` — e.g. the pattern root) exist for the
// EDITOR: identity and options with NO published output — the data pass
// unwraps them, their children take their place. Must run BEFORE the
// attribute strip (it reads data-pb-block); any hoisted islands are the
// strip's island pass's problem, which runs after.
const isPhantomEl = (el: Element): boolean => {
  const type = el.getAttribute("data-pb-block");
  return !!type && !!getBlockType(type)?.phantom;
};

function unwrapPhantoms(root: Element): void {
  // deepest-first so nested phantoms unwrap cleanly
  for (const el of [...root.querySelectorAll("[data-pb-block]")].reverse()) {
    if (isPhantomEl(el)) el.replaceWith(...el.childNodes);
  }
}

/** Model → HTML (block elements joined by newlines) via the given pipeline. */
export function downcast(model: Model, pipeline: DowncastPipeline = "editor"): string {
  return model.blocks
    .flatMap((b) => {
      const root = blockToElement(b);
      if (!root) return [];
      if (pipeline !== "data") return [root.outerHTML];
      const phantomRoot = isPhantomEl(root); // read before the strip removes the marker
      unwrapPhantoms(root);
      stripEditingVocabulary(root);
      // a phantom ROOT emits only its children — the wrapper never publishes
      return phantomRoot ? [...root.children].map((c) => c.outerHTML) : [root.outerHTML];
    })
    .filter(Boolean)
    .join("\n");
}
