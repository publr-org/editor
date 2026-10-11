// What the chrome shows, computed from the session as plain data. The document lives in
// the editor's model, outside any reactive store (the canvas is uncontrolled), so the
// chrome never reads it: after every change the session announces, the shell writes
// these views into its store and the parts render store values only. No model object
// goes in; every view is a copy.
import { Publr } from "publr-jsx";
import { contentOf, getPattern, patternCategories, searchPatterns, allPatterns } from "../model/patterns";
import type { Place } from "../model/editor";
import { blockType } from "../model/registry";
import type { Block } from "../model/types";
import { RAW_TYPE } from "../model/types";
import { colorContexts, contextSwatch } from "../model/contexts";
import type { Session, InserterItem, TreeRow } from "./session";
import { inspectorView, paneView, patternContexts, toolbarControls } from "./styles";
import type { InspectorInputs, InspectorView, PaneView, PatternContextView, ToolbarControlView } from "./styles";

/** The active block as its card, toolbar and breadcrumb show it. */
export type ActiveView = {
  id: string;
  type: string;
  label: string;
  icon: string;
  description: string;
  raw: boolean;
};

export type PatternView = { name: string; label: string };

/** A group row of the Patterns tab and the explorer: "All", then each category. */
export type PatternGroupView = { name: string; count: number; selected: boolean };

/** The library design being edited: its variants and color schemes, as the Pattern tab shows them. */
export type DraftView = {
  name: string;
  variants: { name: string; label: string; description: string; selected: boolean; isDefault: boolean }[];
  editingVariant: boolean;
  schemes: { key: string; label: string; isDefault: boolean; disabled: boolean; surface: string; foreground: string; accent: string; selectLabel: string; availabilityLabel: string; statusLabel: string; statusShown: boolean }[];
  /** The selector shows when the theme has more than one context. */
  schemesShown: boolean;
  defaultColorContext: string;
  blocks: (TreeRow & { selected: boolean })[];
};

export type DocumentView = {
  title: string;
  status: { label: string; tone: string; note: string; changed: boolean; hint: string } | null;
  primary: { id: string; label: string } | null;
  actions: { id: string; label: string; destructive: boolean }[];
  /** The document has a featured image to set (the host keeps one). */
  hasFeatured: boolean;
  featuredSrc: string;
  featuredAlt: string;
  /** The template slot picked in the Document tab, as the breadcrumb names it. */
  slotLabel: string;
  /** The document's languages, the one shown marked; fewer than two: no switch. */
  languages: { code: string; label: string; current: boolean }[];
  /** The language shown, by name. */
  languageLabel: string;
};

export type Views = {
  canUndo: boolean;
  canRedo: boolean;
  active: ActiveView | null;
  selectedCount: number;
  breadcrumb: { id: string; label: string }[];
  rows: (TreeRow & { selected: boolean })[];
  shelves: { category: string; label: string; items: InserterItem[] }[];
  slashItems: InserterItem[];
  boundaryItems: InserterItem[];
  stats: { characters: number; words: number; minutes: number; headings: { id: string; level: number; text: string; empty: boolean; skipped: boolean }[] };
  toolbar: { shown: boolean; top: number; left: number };
  slashAt: { top: number; left: number };
  marks: string[];
  formats: string[];
  /** The caret spans text (links need a range). */
  textSelected: boolean;
  /** The block's declared controls include Replace / Link, which step aside while text is selected. */
  toolbarOwnsText: boolean;
  movable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  alignment: string;
  supportsAlign: boolean;
  canUngroup: boolean;
  inspector: InspectorView;
  toolbarControls: ToolbarControlView[];
  unknownClasses: string[];
  pane: PaneView;
  tokens: { name: string; value: string }[];
  engineStatus: string;
  themeCss: string;
  patternGroups: PatternGroupView[];
  flyout: PatternView[];
  explorer: PatternView[];
  explorerGroups: PatternGroupView[];
  /** The slash picker offers its "Pattern" entry (the query still matches it). */
  slashPattern: boolean;
  /** The inline inserter offers its "Pattern" tile. */
  boundaryPattern: boolean;
  outline: { characters: string; words: string; readTime: string; rows: { id: string; level: string; guide: number; text: string; empty: boolean; badLevel: boolean; flagged: boolean }[] };
  draft: DraftView | null;
  patternCard: { id: string; label: string; description: string; content: { id: string; label: string; detail: string; icon: string; selected: boolean }[]; contexts: PatternContextView[] } | null;
  onPatternRoot: boolean;
  insidePattern: boolean;
  isolation: { kind: string; title: string; label: string; lead: string; note: string; save: string; error: string } | null;
  /** The editing hierarchy while isolations nest, outermost first. */
  hierarchy: { index: number; kind: string; label: string; current: boolean }[];
  template: {
    label: string;
    description: string;
    overridden: boolean;
    showing: boolean;
    parts: { name: string; label: string; overridden: boolean }[];
    slots: { name: string; label: string; icon: string; selected: boolean }[];
  } | null;
  document: DocumentView;
  interaction: { on: boolean; classes: string };
  outputEditing: string;
  outputData: string;
  canPickMedia: boolean;
};

/** The chrome's own inputs the views depend on. */
export type Inputs = {
  query: string;
  slashOpen: boolean;
  slashBlock: string;
  slashQuery: string;
  boundary: Place | null;
  boundaryQuery: string;
  libraryPlace: Place | null;
  inspector: InspectorInputs;
  patternGroup: string;
  patternQuery: string;
  explorerCategory: string;
  explorerQuery: string;
  /** The left panel open ("inserter" or "list") and its tab, for the flyout. */
  left: string;
  leftTab: string;
  output: boolean;
  /** The canvas area's box, the floating chrome's origin. */
  origin: DOMRect | null;
};

const patternView = (pattern: { name: string; label: string }): PatternView => ({ name: pattern.name, label: pattern.label });

export function buildViews(session: Session, inputs: Inputs): Views {
  const editor = session.editor;
  const block = session.activeBlock;
  const type = block ? blockType(block.type) : null;
  const selected = new Set(editor.selection.blocks);
  const caretBlock = editor.selection.caret?.block ?? null;
  const root = session.patternRootOf(editor.activeId);
  const pattern = root?.pattern ? getPattern(root.pattern) : null;
  const path = block ? editor.path(block.id) : [];

  return {
    canUndo: editor.history.canUndo,
    canRedo: editor.history.canRedo,
    active: block ? activeView(session, block) : null,
    selectedCount: editor.selection.blocks.length,
    breadcrumb: session.breadcrumb().map((step) => ({ id: step.id, label: session.labelOf(step) })),
    rows: session.treeRows().map((row) => ({ ...row, selected: selected.has(row.id) || caretBlock === row.id || (row.id.startsWith("template:") && row.id === session.selectedTemplateNode && !editor.activeId) })),
    shelves: session.inserterShelves(inputs.query, inputs.libraryPlace),
    slashItems: inputs.slashOpen ? session.slashItems(inputs.slashBlock, inputs.slashQuery) : [],
    boundaryItems: inputs.boundary ? session.boundaryItems(inputs.boundary, inputs.boundaryQuery) : [],
    slashPattern: allPatterns().length > 0 && (!inputs.slashQuery.trim() || "patterns".includes(inputs.slashQuery.trim().toLowerCase())),
    boundaryPattern: allPatterns().length > 0 && (!inputs.boundaryQuery.trim() || "pattern".includes(inputs.boundaryQuery.trim().toLowerCase())),
    outline: session.outline(),
    draft: draftOf(session),
    stats: session.stats(),
    toolbar: toolbarAt(session, block, inputs),
    slashAt: slashAt(session, inputs),
    marks: [...(session.canvas?.formatState()?.marks ?? [])],
    formats: formatsOf(session, block),
    textSelected: !!editor.selection.caret && editor.selection.caret.start !== editor.selection.caret.end,
    toolbarOwnsText: !!type?.toolbar?.some((spec) => spec.control === "replace" || spec.control === "link"),
    movable: !!block && editor.policy.canMove(editor.model, block),
    canMoveUp: !!block && editor.canMove(block.id, -1),
    canMoveDown: !!block && editor.canMove(block.id, 1),
    alignment: block ? session.alignment(block) : "",
    supportsAlign: !!type && !!type.primary && !type.selectOnClick && !editor.policy.designLocked,
    canUngroup: !!block && (block.type === "group" || block.type === "pattern") && !!block.slots,
    inspector: inspectorView(editor, block, session.theme, inputs.inspector.device, inputs.inspector, path),
    toolbarControls: toolbarControls(block, session.theme, inputs.inspector.device, editor.policy.designLocked),
    unknownClasses: block ? block.classes.split(/\s+/).filter((name) => name && !session.resolves(name)) : [],
    pane: paneView(block, session.theme, inputs.inspector, path),
    tokens: session.theme.tokens.map((token) => ({ name: token.name, value: token.value })),
    engineStatus: session.canvas && session.canvas.watcher.compiled !== "" ? "live (wasm engine)" : "none — build-time CSS only",
    themeCss: session.theme.toCss(),
    patternGroups: groupsOf(inputs.patternGroup),
    flyout: flyoutOf(inputs).map(patternView),
    explorer: searchPatterns(inputs.explorerQuery, inputs.explorerCategory && inputs.explorerCategory !== "All" ? inputs.explorerCategory : undefined).map(patternView),
    explorerGroups: groupsOf(inputs.explorerCategory || "All"),
    patternCard: root
      ? {
          id: root.id,
          label: session.patternLabel(root),
          description: pattern?.description ?? Publr.t("A copy of a pattern."),
          content: contentOf(root).map((inner) => ({ id: inner.id, label: session.labelOf(inner), detail: session.previewOf(inner), icon: session.iconOf(inner), selected: inner.id === editor.activeId || caretBlock === inner.id })),
          contexts: patternContexts(root, session.theme),
        }
      : null,
    onPatternRoot: block?.type === "pattern" && !session.isolation,
    insidePattern: !!block && block.type !== "pattern" && !!root,
    isolation: session.isolation
      ? {
          kind: session.isolation.kind,
          title: session.isolation.title,
          label: session.isolation.label,
          lead: ISOLATION_LEADS[session.isolation.kind],
          note: session.isolation.note,
          save: session.isolation.save,
          error: session.isolation.error,
        }
      : null,
    hierarchy: session.hierarchy().map((crumb, index, all) => ({ index, kind: crumb.kind, label: crumb.label, current: index === all.length - 1 })),
    template: templateOf(session),
    document: documentOf(session),
    interaction: interactionOf(block),
    outputEditing: inputs.output ? editor.serialize("editing") : "",
    outputData: inputs.output ? editor.serialize("data") : "",
    canPickMedia: !!session.media?.pick,
  };
}

function activeView(session: Session, block: Block): ActiveView {
  const type = blockType(block.type);
  return {
    id: block.id,
    type: block.type,
    label: session.labelOf(block),
    icon: session.iconOf(block),
    description: block.type === RAW_TYPE ? Publr.t("Markup the editor keeps as it is.") : type?.description ?? "",
    raw: block.type === RAW_TYPE,
  };
}

/** "All" leads, then every category, each with its count. */
function groupsOf(selected: string): PatternGroupView[] {
  const patterns = allPatterns();
  return ["All", ...patternCategories()].map((name) => ({
    name,
    count: name === "All" ? patterns.length : patterns.filter((pattern) => pattern.category === name).length,
    selected: name === selected,
  }));
}

function draftOf(session: Session): DraftView | null {
  const draft = session.draft;
  if (!draft || session.isolation?.kind !== "definition") return null;
  const contexts = colorContexts(session.theme);
  const disabled = new Set(draft.disabledColorContexts);
  return {
    name: draft.name,
    variants: draft.variants.map((variant) => ({ name: variant.name, label: variant.label, description: variant.description, selected: variant.name === draft.active, isDefault: variant.name === draft.defaultVariant })),
    editingVariant: draft.editingVariant,
    schemes: contexts.map((context) => {
      const isDefault = context.key === draft.defaultColorContext;
      const off = disabled.has(context.key);
      return {
        key: context.key,
        label: context.label,
        isDefault,
        disabled: off,
        ...contextSwatch(session.theme, context.key),
        selectLabel: off ? Publr.t("Enable {name} before making it the default pattern style", { name: context.label }) : Publr.t("Use {name} as the default pattern style", { name: context.label }),
        availabilityLabel: off ? Publr.t("Enable {name}", { name: context.label }) : Publr.t("Disable {name}", { name: context.label }),
        statusLabel: off ? Publr.t("Disabled") : Publr.t("Default"),
        statusShown: off || isDefault,
      };
    }),
    schemesShown: contexts.length > 1,
    defaultColorContext: draft.defaultColorContext,
    blocks: session.allTreeRows().map((row) => ({ ...row, selected: session.editor.selection.blocks.includes(row.id) || session.editor.selection.caret?.block === row.id })),
  };
}

function flyoutOf(inputs: Inputs) {
  const open = (inputs.left === "inserter" && inputs.leftTab === "patterns") || (inputs.left === "list" && inputs.leftTab === "patterns");
  if (!open) return [];
  if (inputs.patternQuery.trim()) return searchPatterns(inputs.patternQuery);
  if (inputs.patternGroup === "All") return allPatterns();
  if (inputs.patternGroup) return searchPatterns("", inputs.patternGroup);
  return [];
}

/** Above the active block when there is room, else under it: never over its first line. */
function toolbarAt(session: Session, block: Block | null, inputs: Inputs): { shown: boolean; top: number; left: number } {
  const canvas = session.canvas;
  const origin = inputs.origin;
  if (!block || !canvas || !origin || inputs.slashOpen) return { shown: false, top: 0, left: 0 };
  const rect = canvas.rectOf(block.id);
  if (!rect) return { shown: false, top: 0, left: 0 };
  const frame = canvas.frameRect();
  const above = rect.top - origin.top - 48;
  const top = above >= frame.top - origin.top + 4 ? above : rect.bottom - origin.top + 8;
  return { shown: rect.bottom > frame.top && rect.top < frame.bottom, top, left: Math.max(8, rect.left - origin.left) };
}

function slashAt(session: Session, inputs: Inputs): { top: number; left: number } {
  const rect = inputs.slashOpen ? session.canvas?.rectOf(inputs.slashBlock) : null;
  if (!rect || !inputs.origin) return { top: 0, left: 0 };
  return { top: rect.bottom - inputs.origin.top + 6, left: rect.left - inputs.origin.left };
}

function formatsOf(session: Session, block: Block | null): string[] {
  const caret = session.editor.selection.caret;
  if (!block || !caret) return [];
  const field = blockType(block.type)?.fields.find((candidate) => candidate.name === caret.field);
  if (field?.kind !== "rich" || !session.editor.policy.isEditable(block)) return [];
  return [...session.editor.policy.formats(block)];
}

const ISOLATION_LEADS: Record<string, string> = { copy: Publr.t("Editing pattern:"), definition: Publr.t("Editing pattern:"), template: Publr.t("Editing template:"), part: Publr.t("Editing template part:") };



function templateOf(session: Session): Views["template"] {
  const source = session.templates?.template();
  if (!source) return null;
  return {
    label: source.label,
    description: source.description ?? "",
    overridden: source.overridden,
    showing: session.showingTemplate,
    parts: session.templateParts(),
    slots: session.templateSlots().map((slot) => ({ ...slot, selected: slot.name === session.selectedSlot })),
  };
}

function documentOf(session: Session): DocumentView {
  const host = session.document;
  const actions = host?.actions?.() ?? [];
  const primary = actions.find((action) => action.primary) ?? null;
  const featured = host?.featuredImage?.() ?? null;
  const slot = session.templateSlots().find((candidate) => candidate.name === session.selectedSlot);
  return {
    title: host?.title() ?? session.templates?.title?.() ?? Publr.t("Document"),
    status: host?.status?.() ?? null,
    primary: primary ? { id: primary.id, label: primary.label } : null,
    actions: actions.filter((action) => !action.primary).map((action) => ({ id: action.id, label: action.label, destructive: !!action.destructive })),
    hasFeatured: !!host?.setFeaturedImage,
    featuredSrc: featured?.src ?? "",
    featuredAlt: featured?.alt ?? "",
    slotLabel: slot?.label ?? "",
    ...languagesOf(host),
  };
}

function languagesOf(host: Session["document"]): Pick<DocumentView, "languages" | "languageLabel"> {
  const shown = host?.language?.() ?? "";
  const languages = (host?.languages?.() ?? []).map((language) => ({ ...language, current: language.code === shown }));
  return { languages, languageLabel: languages.find((language) => language.current)?.label ?? "" };
}

function interactionOf(block: Block | null): { on: boolean; classes: string } {
  const interactions = block?.interactions ?? {};
  const on = interactions["data-p-store"] === "local:toggle";
  return { on, classes: on ? (interactions["data-p-class"] ?? "").replace(/^open\s*->\s*/, "") : "" };
}
