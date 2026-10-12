// One editor session: the model's editor, its canvas, and the rules the chrome follows
// (where an inserted block goes, what the toolbar offers, which blocks the list view
// shows). Plain TypeScript the PTSX chrome calls; the chrome's own state lives in its
// family store and is fed from here through `onUpdate`.
import { Publr } from "publr-jsx";
import { Canvas, canvasFrame, canvasPage } from "../canvas/canvas";
import type { CanvasEvent } from "../canvas/canvas";
import type { ThemeToken } from "../canvas/engine";
import { downcast, fresh, upcastBlocks } from "../model/codec";
import { applyColorContext } from "../model/contexts";
import { contentOf, getPattern, isContent, patternBlocks, publishPattern, stampPattern } from "../model/patterns";
import { Editor } from "../model/editor";
import type { EditorOptions, Place } from "../model/editor";
import type { MarkName } from "../model/format";
import { plainText } from "../model/format";
import { blockType, blockTypes } from "../model/registry";
import type { BlockType } from "../model/registry";
import { Theme } from "../model/theme";
import type { TextStyle } from "../model/theme";
import { LAYOUT_LABELS, readLayout } from "../model/layout";
import type { Device } from "../model/layout";
import { SLOT_LABELS, partsOf, slotsOf } from "../model/templates";
import type { TemplateHost } from "../model/templates";
import { flatten } from "../model/tree";
import type { Block, ImageValue } from "../model/types";
import { RAW_TYPE } from "../model/types";

export type SessionOptions = EditorOptions & {
  /** URL of the canvas stylesheet. */
  canvasStylesheet: string;
  siteStyles?: readonly string[];
  theme?: readonly ThemeToken[];
  /** The theme's named text styles, offered by the Typography panel. */
  textStyles?: readonly TextStyle[];
  wide?: boolean;
  inline?: boolean;
  /** Where the document's template and its parts come from and are saved. */
  templates?: TemplateHost;
  /** The host's media library: uploads go through it, picking opens it. */
  media?: MediaHost;
  /** A pattern's library design was published (the host stores it). */
  onPatternPublished?: (name: string) => void;
  /** What the host knows about the document: its name, status, actions, featured image. */
  document?: DocumentHost;
};

/** The document as its host presents it in the Document tab. */
export type DocumentHost = {
  /** The document's name. */
  title(): string;
  /** The title as the document holds it (empty for a new one), when it can be typed in its
   * template's title slot; `setTitle` writes it. */
  titleValue?(): string;
  setTitle?(text: string): void;
  /** Where it stands (a record's status), or null when the host has no workflow. */
  status?(): DocumentStatus | null;
  /** What can be done with it: the ⋮ menu, and the primary one as the panel's button. */
  actions?(): DocumentAction[];
  run?(id: string): void;
  /** Present when the document has a featured image; null while it has none. */
  featuredImage?(): ImageValue | null;
  setFeaturedImage?(value: ImageValue | null): void;
  /** Announces a change the host made (a save, a publish). */
  onChange?(listener: () => void): () => void;
  /** The languages the document is written in, the main one first with an empty code, and
   * the one shown; `setLanguage` switches the canvas to another's content. */
  languages?(): { code: string; label: string }[];
  language?(): string;
  setLanguage?(code: string): void;
};

export type DocumentStatus = { label: string; tone: "success" | "neutral" | "warning"; note: string; changed: boolean; hint: string };

export type DocumentAction = { id: string; label: string; destructive?: boolean; primary?: boolean };

/** Media through the host: an upload returns the stored file's carrier value. */
export type MediaHost = {
  upload(file: File): Promise<{ src: string; alt: string; width: string; height: string }>;
  /** Opens the host's library; resolves with the picked file, or null. */
  pick?(kind: "image" | "video" | "audio" | "file"): Promise<{ src: string; alt: string; width: string; height: string } | null>;
};

export type Update = { kind: "model" | "selection" | "caret" | "slash" | "boundary" | "scroll" | "focus" | "part"; event?: CanvasEvent };

/** A row of the list view. */
export type TreeRow = {
  id: string;
  depth: number;
  label: string;
  icon: string;
  /** A heading's text, after the name. */
  detail: string;
  /** "Container" on a container group. */
  tag: string;
  type: string;
  identity: "plain" | "pattern" | "part";
  hasChildren: boolean;
  expanded: boolean;
  draggable: boolean;
};

/** A heading in the Outline tab. */
export type OutlineRow = { id: string; level: string; guide: number; text: string; empty: boolean; badLevel: boolean; flagged: boolean };

/** Where a list-view drag would land: the final place and the drop line's depth. */
export type TreeDrop = { parent: string | null; slot: string | null; index: number; depth: number };

/** The slash picker's and inline inserter's resting shelf. */
export const MOST_USED = ["paragraph", "heading", "image", "quote", "list", "group"];
export const QUICK_LIMIT = 5;

/** A block type as the inserters show it. */
export type InserterItem = { type: string; label: string; icon: string; category: string; description: string };

export const CATEGORY_ORDER = ["text", "media", "design", "layout", "widgets"];

export const CATEGORY_LABELS: Record<string, string> = {
  text: Publr.t("Text"),
  media: Publr.t("Media"),
  design: Publr.t("Design"),
  layout: Publr.t("Layout"),
  widgets: Publr.t("Widgets"),
};

/** An isolated editing mode: one pattern copy, a pattern's library design, a template or a part. */
export type Isolation = {
  kind: "copy" | "definition" | "template" | "part";
  /** The block (copy) or name (definition, template, part) being edited. */
  target: string;
  title: string;
  /** What is edited, without the lead ("Home", "Site header"). */
  label: string;
  note: string;
  save: string;
  error: string;
};

type Parked = { editor: Editor; isolation: Isolation; saveHook: ((html: string) => string | null) | null };

/**
 * A library design being edited: its variants as drafts (none, or two and more), the one
 * on the canvas, and the color settings. Publishing hands it all to the library at once.
 */
export type PatternDraft = {
  name: string;
  variants: { name: string; label: string; description: string; html: string }[];
  defaultVariant: string;
  /** The variant on the canvas; "" while the base design (no variants) is. */
  active: string;
  /** A variant other than the default is open ("Save variant" returns to the default). */
  editingVariant: boolean;
  defaultColorContext: string;
  disabledColorContexts: string[];
};

export class Session {
  /** The page document. In isolation it is parked and `editor` is the isolated one. */
  readonly main: Editor;
  editor: Editor;
  isolation: Isolation | null = null;
  canvas: Canvas | null = null;
  /** The canvas frame is loading its page; the canvas is drawn once it has. */
  private mounting = false;
  private ended = false;
  private options: SessionOptions;
  private listeners = new Set<(update: Update) => void>();
  /** Rows the list view shows open; everything starts closed. */
  expanded = new Set<string>();
  /** The device the canvas previews; responsive controls read and write its breakpoint. */
  device: Device = "desktop";

  /** The site's stylesheets, for previews outside the canvas. */
  get siteStyles(): readonly string[] {
    return this.options.siteStyles ?? [];
  }

  /** The canvas's own stylesheet, for frames drawn like the canvas. */
  get canvasStylesheet(): string {
    return this.options.canvasStylesheet;
  }

  /** The site theme the canvas compiles against and the style controls read their scales from. */
  theme: Theme;

  constructor(options: SessionOptions) {
    this.options = options;
    this.theme = new Theme(options.theme ?? [], options.textStyles ?? []);
    this.main = new Editor(options);
    this.editor = this.main;
    this.watch(this.main);
  }

  private watch(editor: Editor): void {
    editor.subscribe((change) => {
      if (editor === this.editor) this.notify({ kind: change.kind === "selection" ? "selection" : "model" });
    });
  }

  /** Swaps the editor the canvas and chrome work on. */
  private use(editor: Editor): void {
    this.editor = editor;
    this.canvas?.setEditor(editor);
    this.canvas?.root.toggleAttribute("data-canvas-isolated", !!this.isolation);
    this.notify({ kind: "model" });
  }

  // ── isolation ───────────────────────────────────────────────────────────

  /** Isolations opened inside the current one (a part from its template), innermost last. */
  private parked: Parked[] = [];

  private isolate(blocks: Block[], isolation: Isolation, save: ((html: string) => string | null) | null = null): void {
    const editor = new Editor({ content: downcast(blocks, "editing"), policy: this.main.policy.config, defaultBlock: this.main.defaultBlock });
    this.watch(editor);
    if (this.isolation) this.parked.push({ editor: this.editor, isolation: this.isolation, saveHook: this.saveHook });
    this.saveHook = save;
    this.isolation = isolation;
    this.use(editor);
  }

  /** The editing hierarchy, outermost first: shown while isolations nest. */
  hierarchy(): { kind: Isolation["kind"]; label: string }[] {
    if (!this.isolation || this.parked.length === 0) return [];
    return [...this.parked.map((entry) => entry.isolation), this.isolation].map((isolation) => ({ kind: isolation.kind, label: isolation.label }));
  }

  /** Returns to an outer level of the hierarchy, discarding the levels inside it. */
  returnTo(depth: number): void {
    while (this.isolation && this.parked.length > depth) this.leave();
  }

  /** Edit pattern: this copy alone, applied back to it, never to the library or other copies. */
  editPatternCopy(rootId: string): void {
    const root = this.main.getBlock(rootId);
    if (!root?.slots) return;
    const label = (root.pattern && getPattern(root.pattern)?.label) || Publr.t("Pattern");
    this.isolate(root.slots.children ?? [], { kind: "copy", target: rootId, title: Publr.t("Editing pattern: {name}", { name: label }), label, note: Publr.t("Changes apply only to this copy"), save: Publr.t("Apply to this copy"), error: "" });
  }

  /** Edits a pattern's library design; publishing never moves a placed copy. */
  editPatternDefinition(name: string): void {
    const pattern = getPattern(name);
    if (!pattern) return;
    this.isolate(patternBlocks(name), { kind: "definition", target: name, title: Publr.t("Editing pattern: {name}", { name: pattern.label }), label: pattern.label, note: Publr.t("Publishing updates the library design; placed copies never change"), save: Publr.t("Publish pattern"), error: "" });
    this.draft = {
      name,
      variants: (pattern.variants ?? []).map((variant) => ({ name: variant.name, label: variant.label, description: variant.description ?? "", html: variant.html })),
      defaultVariant: pattern.defaultVariant ?? "",
      active: pattern.defaultVariant ?? "",
      editingVariant: false,
      defaultColorContext: pattern.defaultColorContext ?? "default",
      disabledColorContexts: [...(pattern.disabledColorContexts ?? [])],
    };
    this.draftChanged();
  }

  /** The library design being edited, while one is. */
  draft: PatternDraft | null = null;

  private draftChanged(): void {
    this.notify({ kind: "model" });
  }

  /** Keeps what the canvas shows in its variant's draft. */
  private captureVariant(): void {
    const draft = this.draft;
    const variant = draft?.variants.find((candidate) => candidate.name === draft.active);
    if (variant) variant.html = this.editor.serialize("editing");
  }

  private showVariant(name: string): void {
    const draft = this.draft!;
    draft.active = name;
    draft.editingVariant = name !== draft.defaultVariant;
    if (this.isolation) this.isolation.save = draft.editingVariant ? Publr.t("Save variant") : Publr.t("Publish pattern");
    this.editor.load(draft.variants.find((variant) => variant.name === name)?.html ?? "");
    this.draftChanged();
  }

  /** Adds a variant (the first add makes Default and Variant 2) and opens it. */
  addVariant(): void {
    const draft = this.draft;
    if (!draft) return;
    this.captureVariant();
    const source = this.editor.serialize("editing");
    if (draft.variants.length === 0) {
      draft.variants = [
        { name: "default", label: "Default", description: "", html: source },
        { name: "variant-2", label: "Variant 2", description: "", html: source },
      ];
      draft.defaultVariant = "default";
      draft.active = "default";
    } else {
      const used = new Set(draft.variants.map((variant) => variant.name));
      let number = draft.variants.length + 1;
      while (used.has(`variant-${number}`)) number++;
      draft.variants.push({ name: `variant-${number}`, label: `Variant ${number}`, description: "", html: source });
    }
    this.showVariant(draft.variants[draft.variants.length - 1].name);
  }

  editVariant(name: string): void {
    if (!this.draft?.variants.some((variant) => variant.name === name)) return;
    this.captureVariant();
    this.showVariant(name);
  }

  /** Back to the default variant, keeping (or dropping) the open variant's edits. */
  closeVariant(keep: boolean): void {
    const draft = this.draft;
    if (!draft?.editingVariant) return;
    if (keep) this.captureVariant();
    this.showVariant(draft.defaultVariant);
  }

  setDefaultVariant(name: string): void {
    const draft = this.draft;
    if (!draft?.variants.some((variant) => variant.name === name)) return;
    this.captureVariant();
    draft.defaultVariant = name;
    if (!draft.editingVariant) this.showVariant(name);
    else {
      draft.editingVariant = draft.active !== name;
      if (this.isolation) this.isolation.save = draft.editingVariant ? Publr.t("Save variant") : Publr.t("Publish pattern");
      this.draftChanged();
    }
  }

  renameVariant(name: string, label: string): void {
    const variant = this.draft?.variants.find((candidate) => candidate.name === name);
    if (!variant || !label.trim() || label.trim() === variant.label) return;
    variant.label = label.trim();
    this.draftChanged();
  }

  describeVariant(name: string, description: string): void {
    const variant = this.draft?.variants.find((candidate) => candidate.name === name);
    if (!variant || description.trim() === variant.description) return;
    variant.description = description.trim();
    this.draftChanged();
  }

  /** Removes a variant; down to one, the pattern has no variants any more. */
  deleteVariant(name: string): void {
    const draft = this.draft;
    if (!draft) return;
    const index = draft.variants.findIndex((variant) => variant.name === name);
    if (index < 0) return;
    this.captureVariant();
    draft.variants.splice(index, 1);
    if (draft.variants.length === 1) {
      const remaining = draft.variants[0];
      draft.variants = [];
      draft.defaultVariant = "";
      draft.active = "";
      draft.editingVariant = false;
      if (this.isolation) this.isolation.save = Publr.t("Publish pattern");
      this.editor.load(remaining.html);
      this.draftChanged();
      return;
    }
    if (draft.defaultVariant === name) draft.defaultVariant = draft.variants[0].name;
    if (draft.active === name) this.showVariant(draft.variants[Math.min(index, draft.variants.length - 1)].name);
    else this.draftChanged();
  }

  /** The default color context of the design: the canvas wears it. */
  setDefaultColorContext(context: string): void {
    const draft = this.draft;
    if (!draft || draft.disabledColorContexts.includes(context)) return;
    draft.defaultColorContext = context;
    const blocks = structuredClone(this.editor.model.blocks);
    if (applyColorContext(blocks, context, this.theme)) this.editor.load(downcast(blocks, "editing"));
    this.draftChanged();
  }

  toggleColorContext(context: string): void {
    const draft = this.draft;
    if (!draft || context === draft.defaultColorContext) return;
    const disabled = new Set(draft.disabledColorContexts);
    if (!disabled.delete(context)) disabled.add(context);
    draft.disabledColorContexts = [...disabled];
    this.draftChanged();
  }

  /** Isolates arbitrary blocks with a save hook (templates and parts use this). */
  editBlocks(blocks: Block[], isolation: Omit<Isolation, "error">, save: (html: string) => string | null): void {
    this.isolate(blocks, { ...isolation, error: "" }, save);
  }

  private saveHook: ((html: string) => string | null) | null = null;

  /** Applies the isolated edit; returns false (with the reason on the isolation) when refused. */
  applyIsolation(): boolean {
    const isolation = this.isolation;
    if (!isolation) return false;
    const blocks = structuredClone(this.editor.model.blocks);
    if (isolation.kind === "copy") {
      this.leave();
      this.editor.setBlockChildren(isolation.target, "children", blocks);
      return true;
    }
    if (isolation.kind === "definition") {
      const draft = this.draft;
      if (draft?.editingVariant) {
        this.closeVariant(true);
        return false;
      }
      this.captureVariant();
      const result = publishPattern(isolation.target, downcast(blocks, "editing"), draft ? {
        variants: draft.variants.map((variant) => ({ name: variant.name, label: variant.label, description: variant.description, html: variant.html })),
        defaultVariant: draft.variants.length ? draft.defaultVariant : undefined,
        defaultColorContext: draft.defaultColorContext,
        disabledColorContexts: draft.disabledColorContexts,
      } : undefined);
      if (!result.ok) {
        isolation.error = result.error;
        this.notify({ kind: "model" });
        return false;
      }
      this.options.onPatternPublished?.(isolation.target);
      this.leave();
      return true;
    }
    const error = this.saveHook?.(downcast(blocks, "editing")) ?? null;
    if (error) {
      isolation.error = error;
      this.notify({ kind: "model" });
      return false;
    }
    this.leave();
    return true;
  }

  cancelIsolation(): void {
    if (this.isolation?.kind === "definition" && this.draft?.editingVariant) {
      this.closeVariant(false);
      return;
    }
    if (this.isolation) this.leave();
  }

  private leave(): void {
    if (this.isolation?.kind === "definition") this.draft = null;
    const outer = this.parked.pop();
    if (outer) {
      this.isolation = outer.isolation;
      this.saveHook = outer.saveHook;
      this.use(outer.editor);
      return;
    }
    this.isolation = null;
    this.saveHook = null;
    this.use(this.main);
    if (this.showingTemplate) this.canvas?.setTemplate(this.templates?.template()?.html ?? null);
  }

  // ── templates ───────────────────────────────────────────────────────────

  get media(): MediaHost | null {
    return this.options.media ?? null;
  }

  get templates(): TemplateHost | null {
    return this.options.templates ?? null;
  }

  get document(): DocumentHost | null {
    return this.options.document ?? null;
  }

  /** Whether the document is shown inside its template: on by default when it has one. */
  showingTemplate = false;

  toggleTemplate(on = !this.showingTemplate): void {
    const template = this.templates?.template();
    this.showingTemplate = on && !!template;
    this.selectedSlot = "";
    if (!this.isolation) this.canvas?.setTemplate(this.showingTemplate ? template!.html : null);
    this.notify({ kind: "model" });
  }

  /** The template slot picked in the Document tab ("" none). */
  selectedSlot = "";

  /** The template's slots the document fills, as the Document tab lists them. */
  templateSlots(): { name: string; label: string; icon: string }[] {
    const template = this.templates?.template();
    if (!template || !this.showingTemplate) return [];
    const icons: Record<string, string> = { content: "group", title: "heading", "featured-image": "image" };
    return [...new Set(slotsOf(template.html))].map((name) => ({ name, label: SLOT_LABELS[name] ?? name, icon: icons[name] ?? "group" }));
  }

  selectSlot(name: string): void {
    this.selectedSlot = name;
    if (name) this.editor.select({ blocks: [], caret: null });
    this.canvas?.markSlot(name);
    this.notify({ kind: "model" });
  }

  /** The featured image, when the document has one. */
  setFeaturedImage(value: ImageValue | null): void {
    this.options.document?.setFeaturedImage?.(value);
    if (this.showingTemplate && !this.isolation) this.canvas?.setTemplate(this.templates?.template()?.html ?? null);
    this.notify({ kind: "model" });
  }

  /** The host changed something it presents (status, title): the chrome redraws. */
  hostChanged(): void {
    this.notify({ kind: "model" });
  }

  /** Edits the template in isolation: parts and slots insertable, saved through the host. */
  editTemplate(): void {
    const host = this.templates;
    const template = host?.template();
    if (!host || !template) return;
    this.canvas?.setTemplate(null);
    this.editBlocks(upcastBlocks(template.html), { kind: "template", target: template.label, title: Publr.t("Editing template: {name}", { name: template.label }), label: template.label, note: Publr.t("Every page using this template changes"), save: Publr.t("Save template") }, (html) => host.saveTemplate(html));
    this.editor.setPolicy({ ...this.main.policy.config, template: true });
  }

  /** Edits a part's original in isolation; every template placing it follows. */
  editPart(name: string): void {
    const host = this.templates;
    const part = host?.part(name);
    if (!host || !part) return;
    this.canvas?.setTemplate(null);
    this.editBlocks(upcastBlocks(part.html), { kind: "part", target: name, title: Publr.t("Editing template part: {name}", { name: part.label }), label: part.label, note: Publr.t("Every template placing it changes"), save: Publr.t("Save template part") }, (html) => host.savePart(name, html));
  }

  /** The parts the template places. */
  templateParts(): { name: string; label: string; overridden: boolean }[] {
    const template = this.templates?.template();
    if (!template) return [];
    return partsOf(template.html).map((name) => {
      const part = this.templates!.part(name);
      return { name, label: part?.label ?? name, overridden: part?.overridden ?? false };
    });
  }

  // ── patterns ────────────────────────────────────────────────────────────

  /** The pattern root at or above a block, in the page document (none in isolation). */
  patternRootOf(id: string | null): Block | null {
    if (!id || this.isolation) return null;
    return [...this.editor.path(id)].reverse().find((block) => block.type === "pattern") ?? null;
  }

  patternLabel(root: Block): string {
    return (root.pattern && getPattern(root.pattern)?.label) || Publr.t("Pattern");
  }

  /** Stamps a pattern: over an empty default block it replaces it; it lands selected. */
  insertPattern(name: string, place?: Place | null): string | null {
    const block = stampPattern(name);
    const context = getPattern(name)?.defaultColorContext;
    if (context && context !== "default" && applyColorContext(block.slots?.children ?? [], context, this.theme)) block.settings = { ...block.settings, colorContext: context };
    const active = this.activeBlock;
    if (!place && active && this.isEmptyDefault(active)) return this.editor.replaceWith(active.id, [block], "block")[0] ?? null;
    const target = place ?? this.insertionPlace() ?? this.editor.placeAtEnd();
    return this.editor.insertBlocks([block], target, { select: "block" })[0] ?? null;
  }

  /** Draws the canvas in `host` once its frame has loaded the canvas page, then `ready`. */
  mount(host: HTMLElement, ready?: (canvas: Canvas) => void): void {
    if (this.canvas || this.mounting) return;
    const frame = canvasFrame(host, canvasPage(this.options.canvasStylesheet));
    this.mounting = true;
    frame.addEventListener("load", () => {
      this.mounting = false;
      if (!frame.isConnected || this.ended) return;
      this.draw(host, frame);
      if (this.canvas) ready?.(this.canvas);
    }, { once: true });
  }

  private draw(host: HTMLElement, frame: HTMLIFrameElement): void {
    this.canvas = new Canvas(host, this.editor, {
      frameElement: frame,
      stylesheet: this.options.canvasStylesheet,
      siteStyles: this.options.siteStyles,
      theme: this.options.theme,
      wide: this.options.wide,
      inline: this.options.inline,
      onEvent: (event) => this.onCanvas(event),
      part: (name) => this.options.templates?.part(name)?.html ?? null,
      title: () => this.options.document?.titleValue?.() ?? this.options.document?.title() ?? this.options.templates?.title?.() ?? "",
      setTitle: this.options.document?.setTitle ? (text) => this.options.document!.setTitle!(text) : undefined,
      featured: () => this.options.document?.featuredImage?.() ?? null,
      frame: () => this.options.templates?.frame?.() ?? null,
    });
    this.options.document?.onChange?.(() => this.hostChanged());
    // A document with a template opens inside it.
    if (this.templates?.template()) this.toggleTemplate(true);
  }

  /** The page as it publishes, for a preview frame: the data pipeline, inside its template. */
  previewHtml(): string {
    const content = this.editor.serialize("data");
    const template = this.templates?.template();
    if (this.isolation || !this.showingTemplate || !template) return content;
    const holder = document.createElement("template");
    holder.innerHTML = downcast(upcastBlocks(template.html), "data");
    const around = this.templates?.frame?.();
    if (around) {
      const page = document.createElement("template");
      page.innerHTML = around;
      const marker = page.content.querySelector("[data-publr-template-frame]");
      if (marker) {
        marker.replaceWith(holder.content);
        holder.content.append(page.content);
      }
    }
    for (const part of holder.content.querySelectorAll("[data-publr-template-part]")) {
      const html = this.templates?.part(part.getAttribute("data-publr-template-part") ?? "")?.html;
      part.innerHTML = html ? downcast(upcastBlocks(html), "data") : "";
    }
    for (const slot of holder.content.querySelectorAll("[data-publr-slot]")) {
      const name = slot.getAttribute("data-publr-slot");
      if (name === "content") slot.innerHTML = content;
      else if (name === "title") slot.textContent = this.options.document?.title() ?? this.options.templates?.title?.() ?? "";
      else if (name === "featured-image") {
        const image = this.options.document?.featuredImage?.();
        slot.innerHTML = image?.src ? `<img src="${image.src.replace(/"/g, "&quot;")}" alt="${image.alt.replace(/"/g, "&quot;")}">` : "";
      }
    }
    return holder.innerHTML;
  }

  /** A changed theme: the canvas recompiles, the controls redraw. */
  setTheme(theme: Theme): void {
    this.theme = theme;
    this.canvas?.setTheme(theme.tokens);
    this.notify({ kind: "model" });
  }

  /** Whether the canvas's engine can turn a class into CSS under the current theme. */
  resolves(name: string): boolean {
    return this.canvas?.watcher.resolves(name) ?? true;
  }

  destroy(): void {
    this.ended = true;
    this.canvas?.destroy();
    this.canvas = null;
    this.listeners.clear();
  }

  onUpdate(listener: (update: Update) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(update: Update): void {
    for (const listener of this.listeners) listener(update);
  }

  private onCanvas(event: CanvasEvent): void {
    const kinds: Record<CanvasEvent["type"], Update["kind"]> = { caret: "caret", slash: "slash", boundary: "boundary", scroll: "scroll", focus: "focus", part: "part" };
    this.notify({ kind: kinds[event.type], event });
  }

  // ── reading ─────────────────────────────────────────────────────────────

  get activeBlock(): Block | null {
    const id = this.editor.activeId;
    return id ? this.editor.getBlock(id) : null;
  }

  typeOf(block: Block | null): BlockType | null {
    return block ? blockType(block.type) : null;
  }

  labelOf(block: Block): string {
    if (block.type === RAW_TYPE) return "HTML";
    if (block.type === "pattern") return this.patternLabel(block);
    if (block.type === "group") return LAYOUT_LABELS[readLayout(block.classes, this.device).mode];
    if (block.type === "template-part") return this.templates?.part(String(block.settings.part ?? ""))?.label ?? blockType(block.type)?.label ?? block.type;
    return blockType(block.type)?.label ?? block.type;
  }

  iconOf(block: Block): string {
    if (block.type === RAW_TYPE) return "html";
    return blockType(block.type)?.icon ?? "components";
  }

  /** A short preview of a block's text, for the list view and outlines. */
  previewOf(block: Block): string {
    if (block.type === "group" && readLayout(block.classes, this.device).container) return Publr.t("Container");
    const type = blockType(block.type);
    if (!type?.primary) return "";
    return plainText(String(block.fields[type.primary] ?? "")).trim().slice(0, 60);
  }

  /** The breadcrumb: Document, then each block from the top to the active one. */
  breadcrumb(): Block[] {
    const id = this.editor.activeId;
    if (!id) return [];
    const path = this.editor.path(id);
    // Inside a pattern copy the layout between its root and the block is the pattern's business.
    const root = this.patternRootOf(id);
    if (!root) return path;
    const at = path.findIndex((block) => block.id === root.id);
    return root.id === id ? path : [...path.slice(0, at + 1), path[path.length - 1]];
  }

  /** The list view's icon for a block: a heading's level, a group's layout. */
  treeIcon(block: Block): string {
    if (block.type === "heading") return `heading-level-${String(block.fields.level ?? "h2").replace(/\D/g, "") || "2"}`;
    if (block.type === "group") return readLayout(block.classes, this.device).mode;
    return this.iconOf(block);
  }

  private treeRow(block: Block, depth: number, hasChildren: boolean, expanded: boolean): TreeRow {
    const root = this.patternRootOf(block.id);
    const movable = this.editor.policy.canMove(this.editor.model, block) && (!root || root.id === block.id);
    return {
      id: block.id,
      depth,
      label: this.labelOf(block),
      icon: this.treeIcon(block),
      detail: block.type === "heading" ? plainText(String(block.fields.text ?? "")).trim() : "",
      tag: block.type === "group" && readLayout(block.classes, this.device).container ? Publr.t("Container") : "",
      type: block.type,
      identity: block.type === "pattern" ? "pattern" : block.type === "template-part" ? "part" : "plain",
      hasChildren,
      expanded,
      draggable: movable,
    };
  }

  /** The list view's rows: the tree flattened, closed subtrees pruned. A copy lists its content flat. */
  treeRows(): TreeRow[] {
    const rows: TreeRow[] = [];
    const visit = (blocks: Block[], depth: number) => {
      for (const block of blocks) {
        if (block.type === "pattern" && !this.isolation) {
          const content = contentOf(block);
          const open = content.length > 0 && this.expanded.has(block.id);
          rows.push(this.treeRow(block, depth, content.length > 0, open));
          if (open) for (const inner of content) rows.push({ ...this.treeRow(inner, depth + 1, false, false), draggable: false });
          continue;
        }
        const children = Object.values(block.slots ?? {}).flat();
        const open = children.length > 0 && this.expanded.has(block.id);
        rows.push(this.treeRow(block, depth, children.length > 0, open));
        if (open) visit(children, depth + 1);
      }
    };
    const nodes = this.templateNodes();
    if (nodes.length === 0) {
      visit(this.editor.model.blocks, 0);
      return rows;
    }
    // Shown in its template, the document sits in the template's content slot, between its parts.
    for (const node of nodes) {
      const content = node.kind === "slot" && node.name === "content";
      const hasChildren = content && this.editor.model.blocks.length > 0;
      const open = hasChildren && !this.closedTemplateNodes.has(node.id);
      rows.push({ id: node.id, depth: 0, label: node.label, icon: node.icon, detail: "", tag: "", type: node.kind === "part" ? "template-part" : "template-slot", identity: node.kind === "part" ? "part" : "plain", hasChildren, expanded: open, draggable: false });
      if (open) visit(this.editor.model.blocks, 1);
    }
    return rows;
  }

  /** Template rows the list view shows closed; the content slot starts open. */
  closedTemplateNodes = new Set<string>();

  /** The template's parts and slots in order, while the document is shown in it. */
  templateNodes(): { id: string; kind: "part" | "slot"; name: string; label: string; icon: string }[] {
    const template = this.templates?.template();
    if (!template || !this.showingTemplate || this.isolation) return [];
    const icons: Record<string, string> = { content: "group", title: "heading", "featured-image": "image" };
    return [...template.html.matchAll(/data-publr-(template-part|slot)="([^"]+)"/g)].map((match, index) => {
      const part = match[1] === "template-part";
      const name = match[2];
      return { id: `template:${index}:${name}`, kind: part ? "part" : "slot", name, label: part ? (this.templates?.part(name)?.label ?? name) : (SLOT_LABELS[name] ?? name), icon: part ? "pattern" : (icons[name] ?? "group") };
    });
  }

  /** Every row of the tree, open or not (the pattern overview's Blocks list). */
  allTreeRows(): TreeRow[] {
    const rows: TreeRow[] = [];
    const visit = (blocks: Block[], depth: number) => {
      for (const block of blocks) {
        const children = Object.values(block.slots ?? {}).flat();
        rows.push(this.treeRow(block, depth, children.length > 0, children.length > 0));
        visit(children, depth + 1);
      }
    };
    visit(this.editor.model.blocks, 0);
    return rows;
  }

  /** Opens every ancestor of a block, so its row is visible. */
  reveal(id: string): boolean {
    let changed = false;
    const content = this.templateNodes().find((node) => node.kind === "slot" && node.name === "content");
    if (content && this.closedTemplateNodes.delete(content.id)) changed = true;
    for (const ancestor of this.editor.path(id).slice(0, -1)) {
      if (!this.expanded.has(ancestor.id)) {
        this.expanded.add(ancestor.id);
        changed = true;
      }
    }
    return changed;
  }

  toggleCollapsed(id: string): void {
    if (id.startsWith("template:")) {
      if (!this.closedTemplateNodes.delete(id)) this.closedTemplateNodes.add(id);
      return;
    }
    if (!this.expanded.delete(id)) this.expanded.add(id);
  }

  /** A template row picked in the list view: a slot is marked, a part is selected in the canvas' sense. */
  selectTemplateNode(id: string): string | null {
    const node = this.templateNodes().find((candidate) => candidate.id === id);
    if (!node) return null;
    this.selectedTemplateNode = id;
    if (node.kind === "slot") this.selectSlot(node.name);
    else {
      this.editor.select({ blocks: [], caret: null });
      this.notify({ kind: "model" });
    }
    return node.kind === "part" ? node.name : null;
  }

  /** The template row picked in the list view; a block selection clears it. */
  selectedTemplateNode = "";

  /**
   * Where a dragged row lands, from the row under the pointer: its middle half inside a
   * container (at the end), its top or bottom half before or after it; pulling left
   * through the indentation climbs out to an ancestor's level. Refused places climb out
   * until one takes the block.
   */
  treeDrop(dragged: string, target: string, ratio: number, intendedDepth: number, visibleDepth: number): TreeDrop | null {
    const editor = this.editor;
    const at = editor.locate(target);
    const source = editor.locate(dragged);
    if (!at || !source) return null;
    const after = ratio >= 0.5;
    const candidate = (parent: string | null, slot: string | null, raw: number): TreeDrop | null => {
      const place = { parent, slot, index: raw };
      if (parent && (parent === dragged || editor.path(parent).some((block) => block.id === dragged))) return null;
      if (!editor.policy.canMove(editor.model, source.block) || !editor.canPlace(place, [source.block.type])) return null;
      const depth = (parent ? editor.path(parent).length : 0) + (this.templateNodes().length > 0 ? 1 : 0);
      return { parent, slot, index: raw, depth };
    };
    const beside = (id: string) => {
      const location = editor.locate(id)!;
      return candidate(location.parent?.id ?? null, location.slot, location.index + (after ? 1 : 0));
    };
    if (intendedDepth < visibleDepth) {
      let cursor = at.block.id;
      for (let level = visibleDepth; level > intendedDepth; level--) {
        const parent = editor.locate(cursor)?.parent;
        if (!parent) break;
        cursor = parent.id;
      }
      const outside = cursor !== at.block.id ? beside(cursor) : null;
      if (outside) return outside;
    }
    const slots = Object.keys(at.block.slots ?? {});
    if (ratio >= 0.25 && ratio <= 0.75 && slots.length > 0 && at.block.type !== "pattern") {
      const slot = slots[0];
      const inside = candidate(at.block.id, slot, at.block.slots![slot].length);
      if (inside) return inside;
    }
    let cursor: string | null = at.block.id;
    while (cursor) {
      const found = beside(cursor);
      if (found) return found;
      cursor = editor.locate(cursor)?.parent?.id ?? null;
    }
    return null;
  }

  /** Whether a drop would leave the block where it is. */
  isOrigin(dragged: string, drop: TreeDrop): boolean {
    const source = this.editor.locate(dragged);
    if (!source || (source.parent?.id ?? null) !== drop.parent || source.slot !== drop.slot) return false;
    return drop.index === source.index || drop.index === source.index + 1;
  }

  /** Moves a dragged block to its drop; the destination opens. One undo step. */
  dropAt(dragged: string, drop: TreeDrop): boolean {
    if (drop.parent) this.expanded.add(drop.parent);
    return this.editor.moveTo([dragged], { parent: drop.parent, slot: drop.slot, index: drop.index });
  }

  // ── inserting ───────────────────────────────────────────────────────────

  /** Every block type the inserters offer at a place (all of them when none is given). */
  inserterItems(place?: Place | null): InserterItem[] {
    const target = place ?? this.insertionPlace();
    return blockTypes()
      .filter((type) => !type.internal && !type.phantom)
      .filter((type) => !target || this.editor.canPlace(target, [type.type]))
      .map((type) => ({ type: type.type, label: type.label, icon: type.icon ?? "components", category: type.category ?? "other", description: type.description ?? "" }));
  }

  /** Inserter items grouped by category, known categories first. */
  inserterShelves(query: string, place?: Place | null): { category: string; label: string; items: InserterItem[] }[] {
    const items = this.filterItems(this.inserterItems(place), query);
    const categories = [...new Set(items.map((item) => item.category))].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return categories.map((category) => ({ category, label: CATEGORY_LABELS[category] ?? category, items: items.filter((item) => item.category === category) }));
  }

  filterItems(items: InserterItem[], query: string): InserterItem[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    const keywords = (type: string) => blockType(type)?.keywords ?? [];
    return items.filter((item) => item.type.includes(needle) || item.label.toLowerCase().includes(needle) || keywords(item.type).some((word) => word.includes(needle)));
  }

  /** Whether a block is an empty default block (what picking from an inserter replaces). */
  isEmptyDefault(block: Block | null): boolean {
    if (!block || block.type !== this.editor.defaultBlock) return false;
    const type = blockType(block.type);
    return !!type?.primary && plainText(String(block.fields[type.primary] ?? "")).trim() === "" && !/<(img|svg|br)/i.test(String(block.fields[type.primary] ?? ""));
  }

  /**
   * Where a picked block goes: replacing an empty default block at the caret, after the
   * caret's (or selected) block, else at the end of the document.
   */
  insertionPlace(): Place | null {
    const active = this.activeBlock;
    if (active) return this.editor.placeBeside(active.id, true);
    return this.editor.placeAtEnd();
  }

  /** Inserts a block type the way the library and inline inserters do. */
  insert(type: string, place?: Place | null): string | null {
    const editor = this.editor;
    const active = this.activeBlock;
    if (!place && active && this.isEmptyDefault(active)) {
      const location = editor.locate(active.id);
      if (location && editor.policy.canInsert(editor.model, location.parent?.id ?? null, location.slot, type)) return editor.replaceBlock(active.id, type);
    }
    const target = place ?? this.insertionPlace();
    if (!target) return null;
    return editor.insertType(type, target);
  }

  /** The resting shelf of the slash picker and the inline inserter: the most used first. */
  quickItems(items: InserterItem[]): InserterItem[] {
    const picks = MOST_USED.map((type) => items.find((item) => item.type === type)).filter((item): item is InserterItem => !!item);
    for (const item of items) {
      if (picks.length >= QUICK_LIMIT) break;
      if (!picks.includes(item)) picks.push(item);
    }
    return picks.slice(0, QUICK_LIMIT);
  }

  /** The slash picker's list for what follows the slash: the shelf, or matches by type and name. */
  slashItems(blockId: string, query: string): InserterItem[] {
    const place = this.editor.placeBeside(blockId, false);
    const items = this.inserterItems(place);
    const needle = query.trim().toLowerCase();
    const list = needle ? items.filter((item) => item.type.includes(needle) || item.label.toLowerCase().includes(needle)) : this.quickItems(items);
    return list.slice(0, QUICK_LIMIT);
  }

  /** The inline inserter's grid: the shelf at rest, every match while searching. */
  boundaryItems(place: Place, query: string): InserterItem[] {
    const items = this.inserterItems(place);
    const needle = query.trim().toLowerCase();
    if (!needle) return this.quickItems(items);
    const quick = this.quickItems(items);
    const ordered = [...quick, ...items.filter((item) => !quick.includes(item))];
    return ordered.filter((item) => item.type.includes(needle) || item.label.toLowerCase().includes(needle));
  }

  /** The slash picker's pick: the empty block becomes the picked type. */
  pickFromSlash(blockId: string, type: string): string | null {
    return this.editor.replaceBlock(blockId, type);
  }

  /** Stamps an annotated-HTML fragment (a pattern) as fresh blocks. */
  stamp(html: string, place?: Place | null): string[] {
    const blocks = upcastBlocks(html);
    const active = this.activeBlock;
    if (!place && active && this.isEmptyDefault(active)) return this.editor.replaceWith(active.id, blocks, "block");
    const target = place ?? this.insertionPlace() ?? this.editor.placeAtEnd();
    return this.editor.insertBlocks(blocks, target, { select: "block" });
  }

  // ── the toolbar ─────────────────────────────────────────────────────────

  format(mark: MarkName, href?: string): void {
    const caret = this.editor.selection.caret;
    if (!caret || caret.start === caret.end) return;
    this.editor.format(caret.block, caret.field, caret.start, caret.end, mark, href);
    this.canvas?.restoreSelection();
  }

  /** The text alignment classes as a toggle: one of left, center, right, or none. */
  alignment(block: Block): string {
    for (const align of ["left", "center", "right", "justify"]) if (block.classes.split(" ").includes(`text-${align}`)) return align;
    return "";
  }

  setAlignment(block: Block, align: string): void {
    const kept = block.classes.split(" ").filter((name) => name && !/^text-(left|center|right|justify)$/.test(name));
    if (align) kept.push(`text-${align}`);
    this.editor.setClasses(block.id, kept.join(" "));
  }

  /** The selected blocks, or the caret's block. */
  targetIds(): string[] {
    const { blocks, caret } = this.editor.selection;
    return blocks.length > 0 ? blocks : caret ? [caret.block] : [];
  }

  // ── outline ─────────────────────────────────────────────────────────────

  /** The Outline tab: counts and the heading outline, flagged where it breaks. */
  outline(): { characters: string; words: string; readTime: string; rows: OutlineRow[] } {
    let characters = 0;
    let words = 0;
    const count = (text: string) => {
      characters += text.length;
      words += (text.match(/\S+/g) ?? []).length;
    };
    const rows: OutlineRow[] = [];
    let previous = 0;
    for (const block of flatten(this.editor.model.blocks)) {
      if (block.type === RAW_TYPE) {
        count(plainText(String(block.fields.html ?? "")));
        continue;
      }
      for (const field of blockType(block.type)?.fields ?? []) {
        if (field.kind === "text" || field.kind === "rich") count(plainText(String(block.fields[field.name] ?? "")));
      }
      if (block.type === "heading") {
        const level = Number(String(block.fields.level ?? "h2").replace(/\D/g, "")) || 2;
        const text = plainText(String(block.fields.text ?? "")).trim();
        const badLevel = previous > 0 && level > previous + 1;
        previous = level;
        rows.push({ id: block.id, level: `H${level}`, guide: (level - 1) * 20, text: text || Publr.t("(Empty heading)"), empty: !text, badLevel, flagged: !text || badLevel });
      }
    }
    const minutes = Math.round(words / 189);
    return { characters: String(characters), words: String(words), readTime: minutes < 1 ? Publr.t("< 1 minute") : Publr.tn("{count} minute", "{count} minutes", minutes), rows };
  }

  /** Document statistics for the Outline tab. */
  stats(): { characters: number; words: number; minutes: number; headings: { id: string; level: number; text: string; empty: boolean; skipped: boolean }[] } {
    let text = "";
    const headings: { id: string; level: number; text: string; empty: boolean; skipped: boolean }[] = [];
    let previous = 0;
    for (const block of flatten(this.editor.model.blocks)) {
      const type = blockType(block.type);
      for (const field of type?.fields ?? []) {
        if (field.kind === "text") text += ` ${block.fields[field.name]}`;
        if (field.kind === "rich") text += ` ${plainText(String(block.fields[field.name] ?? ""))}`;
      }
      if (block.type === "heading") {
        const level = Number(String(block.fields.level ?? "h2").slice(1)) || 2;
        const body = plainText(String(block.fields.text ?? "")).trim();
        headings.push({ id: block.id, level, text: body, empty: body === "", skipped: previous > 0 && level > previous + 1 });
        previous = level;
      }
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    const characters = text.replace(/\s+/g, " ").trim().length;
    return { characters, words, minutes: Math.max(1, Math.round(words / 230)), headings };
  }
}

export { fresh, isContent };
