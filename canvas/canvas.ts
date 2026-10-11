// The canvas: the document drawn in a same-origin frame, edited in place. It is
// imperative and uncontrolled: reactive state never owns this DOM. Blocks are drawn
// from the model one at a time and redrawn only when their own facts change; typing
// edits the DOM first and the model follows, so a redraw never fights the caret. Every
// node here is made by the frame's own document, and elements are told apart by node
// type, never `instanceof`.
import { downcast, downcastElement, upcastBlocks } from "../model/codec";
import {
  BLOCK_ATTR,
  ID_ATTR,
  carrierAttr,
  isElement,
  isIsland,
  parseFragment,
  readCarrier,
  scopedCarriers,
  scopedSlots,
} from "../model/carriers";
import type { CarrierKind } from "../model/carriers";
import type { Change, Editor } from "../model/editor";
import { linkIn, linkTargetIn, marksIn } from "../model/format";
import type { MarkName } from "../model/format";
import type { Caret, Selection } from "../model/history";
import { blockType } from "../model/registry";
import type { BlockType } from "../model/registry";
import { commonLevel, locate, siblingRange } from "../model/tree";
import type { Block } from "../model/types";
import { RAW_TYPE, isImageValue } from "../model/types";
import { Watcher } from "./engine";
import type { ThemeToken } from "./engine";
import { offsetOf, selectOffsets, textLengthOf, visiblyEmpty } from "./text";

/** What the canvas tells the chrome. */
export type CanvasEvent =
  | { type: "caret" }
  | { type: "slash"; open: boolean; block: string; query: string }
  | { type: "boundary"; boundary: Boundary | null }
  | { type: "scroll" }
  | { type: "focus"; inside: boolean }
  | { type: "part"; name: string };

/** An insertion point between siblings, for the inline inserter. */
export type Boundary = { parent: string | null; slot: string | null; index: number; top: number; left: number; width: number };

/** Keys the chrome claims first (the slash picker's arrows and Enter). */
export type KeyClaim = (event: KeyboardEvent) => boolean;

export type CanvasOptions = {
  /** URL of the canvas stylesheet (placeholders, selection). */
  stylesheet: string;
  /** Stylesheets the site's pages load, applied in the frame. */
  siteStyles?: readonly string[];
  /** The site's theme tokens the frame's classes compile against. */
  theme?: readonly ThemeToken[];
  /** A full-bleed document (templates, wide pages) rather than a reading column. */
  wide?: boolean;
  /** One field in a form: no reading column, and the frame grows with its content. */
  inline?: boolean;
  onEvent?: (event: CanvasEvent) => void;
  /** A template part's content, for drawing the parts a template places. */
  part?: (name: string) => string | null;
  /** The document title a projected `title` slot shows. */
  title?: () => string;
  /** The document's title can be written from its slot: typing there sets it. */
  setTitle?: (text: string) => void;
  /** The page around the template (its layout), the template's place marked. */
  frame?: () => string | null;
  /** The document's featured image a projected `featured-image` slot shows. */
  featured?: () => { src: string; alt: string } | null;
};

type Drawn = { element: Element; key: string };

const blockKey = (block: Block) =>
  JSON.stringify([block.type, block.fields, block.settings, block.classes, block.interactions, block.pattern ?? null]);

export class Canvas {
  readonly frame: HTMLIFrameElement;
  readonly doc: Document;
  readonly root: HTMLElement;
  editor: Editor;
  readonly watcher: Watcher;
  private drawn = new Map<string, Drawn>();
  private options: CanvasOptions;
  private unsubscribe: () => void;
  private keyClaims = new Set<KeyClaim>();
  private slash: { block: string; query: string } | null = null;
  private slashDismissed: string | null = null;
  private drag: { from: string; moved: boolean } | null = null;
  private anchor: string | null = null;
  private restoring = false;
  /** Blocks the canvas shows but are not part of the document being edited. */
  hidden = new Set<string>();

  constructor(host: HTMLElement, editor: Editor, options: CanvasOptions) {
    this.editor = editor;
    this.options = options;
    const doc = host.ownerDocument;
    this.frame = doc.createElement("iframe");
    this.frame.title = "Editor canvas";
    this.frame.style.display = "block";
    this.frame.style.width = "100%";
    this.frame.style.height = "100%";
    this.frame.style.border = "0";
    host.append(this.frame);

    this.doc = this.frame.contentDocument!;
    const head = this.doc.head;
    const meta = this.doc.createElement("meta");
    meta.setAttribute("name", "viewport");
    meta.setAttribute("content", "width=device-width, initial-scale=1");
    head.append(meta);
    for (const href of [...(options.siteStyles ?? []), options.stylesheet]) {
      const link = this.doc.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL(href, doc.baseURI).href;
      head.append(link);
    }
    this.root = this.doc.createElement("div");
    this.root.setAttribute("data-canvas-root", "");
    this.root.tabIndex = -1;
    if (options.wide) this.root.setAttribute("data-canvas-wide", "");
    if (options.inline) this.root.setAttribute("data-canvas-inline", "");
    this.doc.body.append(this.root);
    if (options.inline) {
      const view = this.doc.defaultView!;
      const fit = () => {
        this.frame.style.height = `${Math.max(40, this.root.scrollHeight)}px`;
      };
      new view.ResizeObserver(fit).observe(this.root);
      fit();
    }
    this.watcher = new Watcher(this.doc, options.theme ?? []);

    this.listen();
    this.unsubscribe = editor.subscribe((change) => this.onChange(change));
    this.render();
  }

  /** Shows another editor's document (isolation): a full redraw, nothing reused. */
  setEditor(editor: Editor): void {
    this.unsubscribe();
    this.editor = editor;
    for (const drawn of this.drawn.values()) drawn.element.remove();
    this.drawn.clear();
    this.root.replaceChildren();
    this.unsubscribe = editor.subscribe((change) => this.onChange(change));
    this.render();
    this.restoreSelection();
  }

  destroy(): void {
    this.unsubscribe();
    this.watcher.disconnect();
    this.frame.remove();
  }

  private emit(event: CanvasEvent): void {
    this.options.onEvent?.(event);
  }

  claimKeys(claim: KeyClaim): () => void {
    this.keyClaims.add(claim);
    return () => this.keyClaims.delete(claim);
  }

  setTheme(tokens: readonly ThemeToken[]): void {
    this.watcher.setTheme(tokens);
  }

  setWide(wide: boolean): void {
    this.root.toggleAttribute("data-canvas-wide", wide);
  }

  // ── drawing ─────────────────────────────────────────────────────────────

  private onChange(change: Change): void {
    if (change.kind === "selection") {
      this.paintSelection();
      this.restoreSelection();
      return;
    }
    if (change.source === "input") {
      // The DOM already shows the edit: only the record of what is drawn moves.
      for (const id of change.ids) {
        const block = this.editor.getBlock(id);
        const drawn = this.drawn.get(id);
        if (block && drawn) drawn.key = blockKey(block);
      }
      this.emit({ type: "caret" });
      return;
    }
    this.render();
    this.restoreSelection();
  }

  /** Brings the frame's DOM in line with the model, redrawing only blocks whose facts changed. */
  render(): void {
    const alive = new Set<string>();
    this.reconcile(this.editor.model.blocks, this.root, alive);
    for (const [id, drawn] of this.drawn) {
      if (!alive.has(id)) {
        drawn.element.remove();
        this.drawn.delete(id);
      }
    }
    this.paintSelection();
    this.emit({ type: "caret" });
  }

  private reconcile(blocks: Block[], container: Element, alive: Set<string>): void {
    const wanted: Element[] = [];
    for (const block of blocks) {
      alive.add(block.id);
      wanted.push(this.draw(block, alive));
    }
    // Put the wanted elements in order; anything else in the container that was a drawn
    // block goes away (renderer chrome inside slot containers stays untouched).
    let cursor: ChildNode | null = container.firstChild;
    for (const element of wanted) {
      while (cursor && cursor !== element && !(isElement(cursor) && cursor.hasAttribute("data-canvas-block"))) cursor = cursor.nextSibling;
      if (cursor === element) {
        cursor = cursor.nextSibling;
        continue;
      }
      container.insertBefore(element, cursor);
    }
    for (const child of [...container.children]) {
      if (child.hasAttribute("data-canvas-block") && !wanted.includes(child)) child.remove();
    }
  }

  private draw(block: Block, alive: Set<string>): Element {
    const key = blockKey(block);
    const previous = this.drawn.get(block.id);
    let element: Element;
    if (previous && previous.key === key) {
      element = previous.element;
    } else {
      element = this.build(block);
      if (previous) previous.element.replaceWith(element);
      this.drawn.set(block.id, { element, key });
    }
    if (block.slots) {
      const slots = scopedSlots(element);
      for (const [name, children] of Object.entries(block.slots)) {
        const container = slots.get(name);
        if (container) this.reconcile(children, container, alive);
      }
    }
    element.toggleAttribute("data-canvas-hidden", this.hidden.has(block.id));
    return element;
  }

  /** One block's element as the canvas shows it: editing markup, no island, carriers editable. */
  private build(block: Block): Element {
    if (block.type === RAW_TYPE) {
      const fragment = parseFragment(this.doc, String(block.fields.html ?? ""));
      let element = [...fragment.childNodes].find(isElement) as Element | undefined;
      if (!element || [...fragment.childNodes].filter(isElement).length !== 1) {
        element = this.doc.createElement("div");
        element.append(fragment);
      }
      element.setAttribute(ID_ATTR, block.id);
      element.setAttribute("data-canvas-block", "");
      element.setAttribute("data-canvas-raw", "");
      element.setAttribute("contenteditable", "false");
      return element;
    }
    const type = blockType(block.type);
    if (!type) throw new Error(`editor: no block "${block.type}" is registered`);
    const empty: Block = { ...block, slots: block.slots ? Object.fromEntries(Object.keys(block.slots).map((name) => [name, []])) : undefined };
    const element = downcastElement(empty, type, "editing", this.doc);
    for (const child of [...element.children]) if (isIsland(child)) child.remove();
    element.setAttribute("data-canvas-block", "");
    if (type.selectOnClick) element.setAttribute("data-select-on-click", "");
    const editable = this.editor.policy.isEditable(block);
    this.makeEditable(element, block, type, editable);
    if (block.type === "template-part") this.fillPart(element);
    return element;
  }

  /** Draws a part's own content inside its reference, inert: parts are edited in their original. */
  private fillPart(element: Element): void {
    const name = element.getAttribute("data-publr-template-part") ?? "";
    const html = this.options.part?.(name);
    element.setAttribute("data-canvas-part", name);
    if (!html) return;
    const holder = this.doc.createElement("div");
    holder.setAttribute("contenteditable", "false");
    holder.setAttribute("data-canvas-part-content", "");
    holder.append(...downcastNodesFor(html, this.doc));
    element.append(holder);
  }

  // ── a document shown in its template ────────────────────────────────────

  private frameWrapper: HTMLElement | null = null;

  /**
   * Shows the document inside its template (or with null, alone): the template drawn
   * inert around it, its parts filled, the document's blocks in the content slot.
   */
  setTemplate(html: string | null): void {
    this.frameWrapper?.remove();
    this.frameWrapper = null;
    if (html === null) {
      this.doc.body.append(this.root);
      this.root.removeAttribute("data-canvas-in-template");
      return;
    }
    const wrapper = this.doc.createElement("div");
    wrapper.setAttribute("data-canvas-template", "");
    wrapper.append(...downcastNodesFor(html, this.doc));
    // The page around the template (its layout) takes the template in its marked place.
    const around = this.options.frame?.();
    if (around) {
      const page = this.doc.createElement("template");
      page.innerHTML = around;
      const marker = page.content.querySelector("[data-publr-template-frame]");
      if (marker) {
        marker.replaceWith(...wrapper.childNodes);
        wrapper.append(...this.doc.importNode(page.content, true).childNodes);
      }
    }
    for (const part of wrapper.querySelectorAll("[data-publr-template-part]")) {
      const content = this.options.part?.(part.getAttribute("data-publr-template-part") ?? "");
      part.setAttribute("data-canvas-part", part.getAttribute("data-publr-template-part") ?? "");
      if (content) part.append(...downcastNodesFor(content, this.doc));
    }
    for (const title of wrapper.querySelectorAll<HTMLElement>('[data-publr-slot="title"]')) {
      title.textContent = this.options.title?.() ?? "";
      title.setAttribute("data-canvas-title", "");
      const setTitle = this.options.setTitle;
      if (!setTitle) continue;
      // The title is the record's own field, typed in place: plain text, one line.
      title.contentEditable = "true";
      title.spellcheck = true;
      title.setAttribute("data-placeholder", "Add title");
      title.addEventListener("input", () => setTitle((title.textContent ?? "").replace(/\s+/g, " ").trim()));
      title.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.preventDefault();
      });
      title.addEventListener("paste", (event) => {
        event.preventDefault();
        const text = (event.clipboardData?.getData("text/plain") ?? "").replace(/\s+/g, " ");
        this.doc.execCommand("insertText", false, text);
      });
    }
    for (const slot of wrapper.querySelectorAll('[data-publr-slot="featured-image"]')) {
      const image = this.options.featured?.();
      slot.replaceChildren();
      if (image?.src) {
        const img = this.doc.createElement("img");
        img.src = image.src;
        img.alt = image.alt;
        slot.append(img);
      }
    }
    const slot = wrapper.querySelector('[data-publr-slot="content"]');
    this.doc.body.append(wrapper);
    this.frameWrapper = wrapper;
    if (slot) {
      slot.append(this.root);
      this.root.setAttribute("data-canvas-in-template", "");
    }
  }

  /** A projected template part's box in the chrome's viewport coordinates. */
  partRect(name: string): DOMRect | null {
    const part = this.frameWrapper?.querySelector(`[data-canvas-part="${CSS.escape(name)}"]`);
    return part ? this.toPage(part.getBoundingClientRect()) : null;
  }

  /** How tall the drawn document is, for a sheet sized to its content. */
  contentHeight(): number {
    return Math.ceil(this.root.scrollHeight);
  }

  /** Outlines a projected template's slot (the Document tab picked it), or none. */
  markSlot(name: string): void {
    for (const slot of this.doc.querySelectorAll("[data-canvas-slot-selected]")) slot.removeAttribute("data-canvas-slot-selected");
    if (!name || !this.frameWrapper) return;
    const slot = this.frameWrapper.querySelector(`[data-publr-slot="${CSS.escape(name)}"]`);
    slot?.setAttribute("data-canvas-slot-selected", "");
    slot?.scrollIntoView({ block: "nearest" });
  }

  /** The part name under a point in a projected template, for "Edit original". */
  partAt(target: EventTarget | null): string | null {
    const element = target as Element | null;
    const part = element?.closest?.("[data-canvas-part]");
    if (!part || this.root.contains(part)) return null;
    return part.getAttribute("data-canvas-part");
  }

  private makeEditable(element: Element, block: Block, type: BlockType, editable: boolean): void {
    const carriers = scopedCarriers(element);
    const slotContainers = new Set(scopedSlots(element).values());
    let anyEditable = false;
    for (const carrier of carriers) {
      for (const field of type.fields) {
        if (carrier.getAttribute(carrierAttr(field.kind)) !== field.name) continue;
        if (field.kind === "text" || field.kind === "rich") {
          if (slotContainers.has(carrier)) continue;
          carrier.setAttribute("contenteditable", editable ? (field.kind === "text" ? "plaintext-only" : "true") : "false");
          carrier.setAttribute("data-canvas-field", field.name);
          carrier.setAttribute("data-canvas-kind", field.kind);
          if (field.placeholder) carrier.setAttribute("data-placeholder", field.placeholder);
          if (editable) anyEditable = true;
          if (visiblyEmpty(carrier)) carrier.replaceChildren();
        } else if (field.kind === "image") {
          const value = block.fields[field.name];
          if (isImageValue(value) && value.src === "") carrier.setAttribute("data-canvas-media-empty", "");
        }
      }
    }
    // The root is never itself an editing host unless it is a carrier: a block's own
    // chrome (a file's anchor, an image's figure) stays inert.
    if (!element.hasAttribute("contenteditable")) element.setAttribute("contenteditable", "false");
    if (!anyEditable && !editable) element.setAttribute("data-canvas-locked", "");
    // Links and media in the canvas never navigate or play on click.
    for (const anchor of element.querySelectorAll("a[href]")) anchor.setAttribute("draggable", "false");
  }

  // ── geometry for the chrome ─────────────────────────────────────────────

  elementOf(id: string): Element | null {
    return this.drawn.get(id)?.element ?? null;
  }

  /** A rect inside the frame as page coordinates of the frame's own document. */
  private toPage(rect: DOMRect): DOMRect {
    const frame = this.frame.getBoundingClientRect();
    // The chrome may scale the frame to fit its pane: frame pixels are then smaller.
    const scale = this.frame.offsetWidth ? frame.width / this.frame.offsetWidth : 1;
    return new DOMRect(frame.left + rect.left * scale, frame.top + rect.top * scale, rect.width * scale, rect.height * scale);
  }

  /** A block's box in the chrome's viewport coordinates. */
  rectOf(id: string): DOMRect | null {
    const element = this.elementOf(id);
    return element ? this.toPage(element.getBoundingClientRect()) : null;
  }

  /** The caret's (or text selection's) box in the chrome's viewport coordinates. */
  caretRect(): DOMRect | null {
    const selection = this.doc.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    let rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      const host = isElement(range.startContainer) ? range.startContainer : range.startContainer.parentElement;
      if (!host) return null;
      rect = host.getBoundingClientRect();
    }
    return this.toPage(rect);
  }

  frameRect(): DOMRect {
    return this.frame.getBoundingClientRect();
  }

  // ── selection ───────────────────────────────────────────────────────────

  /** The carrier element for a field of a block. */
  carrierOf(id: string, field: string): HTMLElement | null {
    const element = this.elementOf(id);
    if (!element) return null;
    for (const carrier of [element, ...element.querySelectorAll("[data-canvas-field]")]) {
      if (carrier.getAttribute("data-canvas-field") === field && this.blockIdOf(carrier) === id) return carrier as HTMLElement;
    }
    return null;
  }

  /** The id of the block an element belongs to. */
  blockIdOf(node: Node | null): string | null {
    let current: Node | null = node;
    while (current && !isElement(current)) current = current.parentNode;
    const block = current ? (current as Element).closest("[data-canvas-block]") : null;
    return block?.getAttribute(ID_ATTR) ?? null;
  }

  /** The caret in model terms, read off the frame's DOM selection. */
  readCaret(): Caret | null {
    const selection = this.doc.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const start = isElement(range.startContainer) ? range.startContainer : range.startContainer.parentElement;
    const carrier = start?.closest("[data-canvas-field]");
    if (!carrier || !this.root.contains(carrier)) return null;
    const block = this.blockIdOf(carrier);
    const field = carrier.getAttribute("data-canvas-field");
    if (!block || !field) return null;
    const a = offsetOf(carrier, range.startContainer, range.startOffset);
    const b = carrier.contains(range.endContainer) || carrier === range.endContainer ? offsetOf(carrier, range.endContainer, range.endOffset) : textLengthOf(carrier);
    return { block, field, start: Math.min(a, b), end: Math.max(a, b) };
  }

  private paintSelection(): void {
    const selected = new Set(this.editor.selection.blocks);
    for (const [id, drawn] of this.drawn) drawn.element.toggleAttribute("data-canvas-selected", selected.has(id));
  }

  /** Puts the frame's DOM selection where the model's selection says. */
  restoreSelection(): void {
    const { caret, blocks } = this.editor.selection;
    const selection = this.doc.getSelection();
    if (caret) {
      const carrier = this.carrierOf(caret.block, caret.field);
      if (!carrier) return;
      const current = this.readCaret();
      if (current && current.block === caret.block && current.field === caret.field && current.start === caret.start && current.end === caret.end) return;
      this.restoring = true;
      carrier.focus({ preventScroll: true });
      const length = textLengthOf(carrier);
      selectOffsets(carrier, Math.min(caret.start, length), Math.min(caret.end, length));
      this.restoring = false;
      carrier.scrollIntoView({ block: "nearest" });
    } else if (blocks.length > 0) {
      this.restoring = true;
      selection?.removeAllRanges();
      this.root.focus({ preventScroll: true });
      this.restoring = false;
      this.elementOf(blocks[blocks.length - 1])?.scrollIntoView({ block: "nearest" });
    }
  }

  /** Focuses the canvas with the caret at the model's selection (or the first block). */
  focus(): void {
    this.frame.contentWindow?.focus();
    if (!this.editor.selection.caret && this.editor.selection.blocks.length === 0) {
      const first = this.editor.model.blocks[0];
      if (first) this.editor.select(this.editor.caretAtEnd(first));
    } else {
      this.restoreSelection();
    }
  }

  /** The marks over the caret's range in its rich field, and its link. */
  formatState(): { marks: Set<MarkName>; link: string | null; linkTarget?: string; kind: CarrierKind } | null {
    const caret = this.editor.selection.caret;
    if (!caret) return null;
    const block = this.editor.getBlock(caret.block);
    const type = block ? blockType(block.type) : null;
    const field = type?.fields.find((candidate) => candidate.name === caret.field);
    if (!block || !field) return null;
    const html = String(block.fields[caret.field] ?? "");
    if (field.kind !== "rich") return { marks: new Set(), link: null, kind: field.kind };
    return { marks: marksIn(html, caret.start, caret.end), link: linkIn(html, caret.start, caret.end), linkTarget: linkTargetIn(html, caret.start, caret.end), kind: field.kind };
  }

  // ── input ───────────────────────────────────────────────────────────────

  private listen(): void {
    const doc = this.doc;
    doc.addEventListener("input", (event) => this.onInput(event));
    doc.addEventListener("beforeinput", (event) => this.onBeforeInput(event as InputEvent));
    doc.addEventListener("keydown", (event) => this.onKeyDown(event), true);
    doc.addEventListener("selectionchange", () => this.onSelectionChange());
    doc.addEventListener("mousedown", (event) => this.onMouseDown(event), true);
    doc.addEventListener("mousemove", (event) => this.onMouseMove(event));
    doc.addEventListener("mouseup", () => this.onMouseUp());
    doc.addEventListener("mouseleave", () => this.emit({ type: "boundary", boundary: null }));
    doc.addEventListener("click", (event) => this.onClick(event), true);
    doc.addEventListener("paste", (event) => this.onPaste(event));
    doc.addEventListener("dragstart", (event) => event.preventDefault());
    doc.addEventListener("scroll", () => this.emit({ type: "scroll" }));
    this.frame.contentWindow?.addEventListener("focus", () => this.emit({ type: "focus", inside: true }));
    this.frame.contentWindow?.addEventListener("blur", () => this.emit({ type: "focus", inside: false }));
  }

  /** Writes a carrier's DOM back into its block's field. */
  private sync(carrier: Element): void {
    const id = this.blockIdOf(carrier);
    const field = carrier.getAttribute("data-canvas-field");
    const kind = carrier.getAttribute("data-canvas-kind") as CarrierKind | null;
    if (!id || !field || !kind) return;
    if (visiblyEmpty(carrier) && carrier.childNodes.length > 0) carrier.replaceChildren();
    const value = readCarrier(carrier, kind, true);
    this.editor.setField(id, field, value, { source: "input" });
  }

  private onInput(event: Event): void {
    const target = event.target as Node | null;
    const element = target && (isElement(target) ? target : target.parentElement);
    const carrier = element?.closest("[data-canvas-field]");
    if (!carrier) return;
    this.sync(carrier);
    const caret = this.readCaret();
    this.editor.trackCaret(caret);
    this.checkSlash(carrier);
  }

  private onBeforeInput(event: InputEvent): void {
    // Native undo is disowned: the model's history is the only one.
    if (event.inputType === "historyUndo") {
      event.preventDefault();
      this.editor.undo();
    } else if (event.inputType === "historyRedo") {
      event.preventDefault();
      this.editor.redo();
    } else if (event.inputType.startsWith("format")) {
      event.preventDefault();
    }
  }

  private onSelectionChange(): void {
    if (this.restoring || this.drag?.moved) return;
    this.syncCaret();
  }

  /**
   * Takes the DOM caret into the model. A selectionchange is a task the browser queues,
   * and it can land after the mouseup or the next keydown; a click into a carrier then
   * left the model on the earlier block selection and the keys were swallowed. The
   * gestures that depend on the caret take it themselves.
   */
  private syncCaret(quiet = false): void {
    const caret = this.readCaret();
    if (!caret) return;
    const current = this.editor.selection;
    if (current.caret?.block !== caret.block || current.blocks.length > 0) {
      this.editor.select({ blocks: [], caret });
    } else {
      this.editor.trackCaret(caret);
      if (!quiet) this.emit({ type: "caret" });
    }
    this.anchor = caret.block;
  }

  private checkSlash(carrier: Element): void {
    const id = this.blockIdOf(carrier);
    if (!id) return;
    const block = this.editor.getBlock(id);
    const type = block ? blockType(block.type) : null;
    const text = carrier.textContent ?? "";
    const isPrimary = type?.primary === carrier.getAttribute("data-canvas-field");
    const open = !!block && isPrimary && block.type === this.editor.defaultBlock && /^\/[^\s/]*$/.test(text) && this.editor.policy.canInsertAny(this.editor.model, this.editor.locate(id)?.parent?.id ?? null);
    if (open && this.slashDismissed !== `${id}:${text}`) {
      this.slash = { block: id, query: text.slice(1) };
      this.emit({ type: "slash", open: true, block: id, query: text.slice(1) });
    } else if (this.slash) {
      this.slash = null;
      this.emit({ type: "slash", open: false, block: id, query: "" });
    }
    if (!/^\//.test(text)) this.slashDismissed = null;
  }

  /** The chrome closed the slash picker without picking: leave the text, stop offering. */
  dismissSlash(): void {
    if (!this.slash) return;
    const carrier = this.carrierOf(this.slash.block, blockType(this.editor.getBlock(this.slash.block)?.type ?? "")?.primary ?? "");
    this.slashDismissed = `${this.slash.block}:${carrier?.textContent ?? ""}`;
    const block = this.slash.block;
    this.slash = null;
    this.emit({ type: "slash", open: false, block, query: "" });
  }

  get slashOpen() {
    return this.slash !== null;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.drag?.moved) this.syncCaret(true);
    for (const claim of this.keyClaims) {
      if (claim(event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const editor = this.editor;

    if (mod && !event.altKey && (key === "z" || key === "y")) {
      event.preventDefault();
      if (key === "y" || event.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if (mod && key === "g") {
      event.preventDefault();
      if (event.shiftKey) {
        const id = editor.activeId;
        if (id) editor.ungroup(id);
      } else {
        const ids = editor.selection.blocks.length > 0 ? editor.selection.blocks : editor.activeId ? [editor.activeId] : [];
        if (ids.length > 0) editor.group(ids);
      }
      return;
    }

    const blocks = editor.selection.blocks;
    if (blocks.length > 0 && !editor.selection.caret) {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        editor.removeBlocks(blocks);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        editor.select({ blocks: [], caret: null });
        return;
      }
      if (event.key === "Enter" && blocks.length === 1) {
        event.preventDefault();
        const block = editor.getBlock(blocks[0]);
        const type = block ? blockType(block.type) : null;
        const field = block && type ? editor.firstEditableField(block, type) : null;
        if (block && field) editor.select({ blocks: [], caret: { block: block.id, field, start: 0, end: 0 } });
        else {
          const place = editor.placeBeside(blocks[0]);
          if (place) editor.insertType(editor.defaultBlock, place);
        }
        return;
      }
      if (!mod && event.key.length === 1) event.preventDefault();
      return;
    }

    const caret = this.readCaret();
    if (!caret) return;
    const carrier = this.carrierOf(caret.block, caret.field);
    if (!carrier) return;
    const block = editor.getBlock(caret.block);
    const type = block ? blockType(block.type) : null;
    if (!block || !type) return;
    const schema = type.fields.find((field) => field.name === caret.field);

    if (mod && (key === "b" || key === "i" || key === "u")) {
      event.preventDefault();
      if (caret.start === caret.end) return;
      this.sync(carrier);
      editor.format(caret.block, caret.field, caret.start, caret.end, key === "b" ? "bold" : key === "i" ? "italic" : "underline");
      return;
    }
    if (mod && key === "a") {
      const length = textLengthOf(carrier);
      if (caret.start === 0 && caret.end === length) {
        event.preventDefault();
        editor.selectBlocks(editor.model.blocks.map((candidate) => candidate.id));
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      editor.selectBlocks([caret.block]);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      if (schema?.split) {
        event.preventDefault();
        this.sync(carrier);
        editor.split(caret.block, caret.field, caret.end);
        return;
      }
      if (carrier.closest("pre")) {
        event.preventDefault();
        this.doc.execCommand("insertText", false, "\n");
      }
      return;
    }

    const collapsed = caret.start === caret.end;
    if (event.key === "Backspace" && collapsed && caret.start === 0 && caret.field === type.primary) {
      event.preventDefault();
      this.sync(carrier);
      editor.mergeBackward(caret.block);
      return;
    }
    if (event.key === "Delete" && collapsed && caret.end === textLengthOf(carrier) && caret.field === type.primary) {
      event.preventDefault();
      this.sync(carrier);
      editor.mergeForward(caret.block);
      return;
    }
    if (collapsed && (event.key === "ArrowUp" || event.key === "ArrowLeft") && caret.start === 0 && (event.key === "ArrowLeft" || this.onFirstLine(carrier))) {
      if (this.moveCaret(carrier, -1)) event.preventDefault();
      return;
    }
    if (collapsed && (event.key === "ArrowDown" || event.key === "ArrowRight") && caret.end === textLengthOf(carrier) && (event.key === "ArrowRight" || this.onLastLine(carrier))) {
      if (this.moveCaret(carrier, 1)) event.preventDefault();
    }
  }

  private onFirstLine(carrier: Element): boolean {
    const caret = this.caretRect();
    return !caret || caret.top - this.toPage(carrier.getBoundingClientRect()).top < caret.height;
  }

  private onLastLine(carrier: Element): boolean {
    const caret = this.caretRect();
    return !caret || this.toPage(carrier.getBoundingClientRect()).bottom - caret.bottom < caret.height;
  }

  /** Moves the caret to the previous or next editable carrier in the canvas. */
  private moveCaret(from: Element, direction: -1 | 1): boolean {
    const carriers = [...this.root.querySelectorAll('[data-canvas-field][contenteditable]:not([contenteditable="false"])')].filter((candidate) => !candidate.closest("[data-canvas-hidden]"));
    const index = carriers.indexOf(from);
    const target = carriers[index + direction];
    if (!target) return false;
    const block = this.blockIdOf(target);
    const field = target.getAttribute("data-canvas-field");
    if (!block || !field) return false;
    const offset = direction < 0 ? textLengthOf(target) : 0;
    this.editor.select({ blocks: [], caret: { block, field, start: offset, end: offset } });
    return true;
  }

  private onPaste(event: ClipboardEvent): void {
    const target = event.target as Node | null;
    const element = target && (isElement(target) ? target : target.parentElement);
    const carrier = element?.closest("[data-canvas-field]");
    if (!carrier || !event.clipboardData) return;
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const kind = carrier.getAttribute("data-canvas-kind");
    if (kind === "rich") {
      const html = event.clipboardData.getData("text/html");
      const clean = html ? inlineHtml(this.doc, html) : null;
      if (clean) this.doc.execCommand("insertHTML", false, clean);
      else this.doc.execCommand("insertText", false, text);
    } else {
      this.doc.execCommand("insertText", false, carrier.closest("pre") ? text : text.replace(/\s*\n\s*/g, " "));
    }
  }

  // ── pointer ─────────────────────────────────────────────────────────────

  /** The deepest drawn block at an event target. */
  private blockAt(target: EventTarget | null): string | null {
    return this.blockIdOf(target as Node | null);
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    const target = event.target as Element;
    const id = this.blockAt(target);
    const editor = this.editor;
    const part = this.partAt(target);
    if (part) {
      event.preventDefault();
      this.emit({ type: "part", name: part });
      return;
    }
    if (!id) {
      // Empty canvas: deselect.
      if (target === this.root || target === this.doc.body || target === this.doc.documentElement) {
        event.preventDefault();
        editor.select({ blocks: [], caret: null });
      }
      return;
    }
    const mod = event.metaKey || event.ctrlKey;
    if (mod) {
      event.preventDefault();
      const current = editor.selection.blocks.length > 0 ? editor.selection.blocks : editor.selection.caret ? [editor.selection.caret.block] : [];
      const next = current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id];
      editor.select({ blocks: next, caret: null });
      this.anchor = id;
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      const from = this.anchor ?? editor.activeId;
      if (!from) {
        editor.selectBlocks([id]);
      } else {
        const level = commonLevel(editor.model, from, id);
        editor.selectBlocks(level ? siblingRange(level.list, level.from, level.to) : [id]);
      }
      return;
    }
    const carrier = target.closest('[data-canvas-field][contenteditable]:not([contenteditable="false"])');
    if (!carrier || this.blockIdOf(carrier) !== id) {
      // A surface click owns the gesture: no phantom caret parks in a neighbour. Inside a
      // pattern copy the copy is the surface: its root is what a surface click selects.
      event.preventDefault();
      this.frame.contentWindow?.focus();
      const root = [...editor.path(id)].reverse().find((block) => block.type === "pattern");
      const target = root?.id ?? id;
      editor.selectBlocks([target]);
      this.anchor = target;
      this.drag = { from: target, moved: false };
      return;
    }
    this.drag = { from: id, moved: false };
  }

  private onMouseMove(event: MouseEvent): void {
    if (this.drag && event.buttons === 1) {
      const id = this.blockAt(event.target);
      if (id && id !== this.drag.from) {
        const level = commonLevel(this.editor.model, this.drag.from, id);
        if (level) {
          this.drag.moved = true;
          this.doc.getSelection()?.removeAllRanges();
          this.editor.select({ blocks: siblingRange(level.list, level.from, level.to), caret: null });
        }
      }
      return;
    }
    this.emit({ type: "boundary", boundary: this.boundaryAt(event.clientX, event.clientY) });
  }

  private onMouseUp(): void {
    if (this.drag?.moved) this.root.focus({ preventScroll: true });
    else if (this.drag) this.syncCaret();
    this.drag = null;
  }

  private onClick(event: MouseEvent): void {
    const target = event.target as Element;
    // Links never navigate; summaries never toggle their details while being edited.
    if (target.closest("a[href]")) event.preventDefault();
    if (target.closest("summary")) event.preventDefault();
  }

  /** The gap between sibling blocks nearest the pointer, within a few pixels. */
  private boundaryAt(x: number, y: number): Boundary | null {
    const reach = 10;
    let best: Boundary | null = null;
    let distance = reach;
    const consider = (list: Block[], parent: string | null, slot: string | null) => {
      const rects = list.map((block) => this.elementOf(block.id)?.getBoundingClientRect() ?? null);
      for (let index = 0; index <= list.length; index++) {
        const before = rects[index - 1];
        const after = rects[index];
        if (!before && !after) continue;
        // Siblings side by side (a row, columns) have no gap between them to insert into.
        if (before && after && after.top < before.bottom - 1) continue;
        const edge = before && after ? (before.bottom + after.top) / 2 : before ? before.bottom : after!.top;
        const box = (before ?? after)!;
        if (x < box.left - reach || x > box.right + reach) continue;
        const gap = Math.abs(y - edge);
        if (gap < distance) {
          distance = gap;
          const page = this.toPage(new DOMRect(box.left, edge, box.width, 0));
          best = { parent, slot, index, top: page.top, left: page.left, width: page.width };
        }
      }
      for (const block of list) {
        for (const [name, children] of Object.entries(block.slots ?? {})) consider(children, block.id, name);
      }
    };
    consider(this.editor.model.blocks.filter((block) => !this.hidden.has(block.id)), null, null);
    if (!best) return null;
    const place = best as Boundary;
    return this.editor.policy.canInsertAny(this.editor.model, place.parent) ? place : null;
  }

  /** The selection to restore after the chrome took focus (a toolbar click). */
  remember(): Selection {
    return structuredClone(this.editor.selection);
  }
}

/** Pasted HTML reduced to inline markup the format engine keeps. */
function inlineHtml(doc: Document, html: string): string | null {
  const fragment = parseFragment(doc, html);
  const allowed = new Set(["strong", "b", "em", "i", "u", "s", "del", "code", "sub", "sup", "a", "br"]);
  const out = doc.createElement("div");
  const visit = (node: Node, into: Element) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) into.append(doc.createTextNode(child.textContent ?? ""));
      else if (isElement(child)) {
        const name = child.localName;
        if (name === "script" || name === "style" || name === "meta") continue;
        if (allowed.has(name)) {
          const copy = doc.createElement(name);
          if (name === "a" && child.getAttribute("href")) copy.setAttribute("href", child.getAttribute("href")!);
          into.append(copy);
          visit(child, copy);
        } else {
          visit(child, into);
          if (/^(p|div|li|h[1-6]|tr)$/.test(name)) into.append(doc.createTextNode(" "));
        }
      }
    }
  };
  visit(fragment, out);
  const result = out.innerHTML.trim();
  return result === "" ? null : result;
}

export { BLOCK_ATTR, locate };

/** Wire HTML as inert data-pipeline nodes in `doc`. */
function downcastNodesFor(html: string, doc: Document): Node[] {
  return [...parseFragment(doc, downcast(upcastBlocks(html), "data")).childNodes];
}
