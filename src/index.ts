// PublrEditor — public entry point. Re-exports only; the implementation
// lives in focused modules:
//
//   carriers.ts   wire-contract primitives (carrier vocabulary, escaping, scoping)
//   registry.ts   global block registry + the probe (render({}) → derived fields)
//   cast.ts       upcast / downcast — annotated HTML ⇄ block model
//   history.ts    snapshot stacks + coalescing + reactive canUndo/canRedo
//   editor.ts     createEditor — canvas, events, the commit() choke point
//
// Speaks the HTML wire contract v0 (data-pb-* attributes + permissive upcast;
// same contract as editor/CONTRACT.md, new implementation). Current scope:
// block tree (data-pb-children slots — tree.ts holds the traversal),
// text/rich/tag carriers, contenteditable canvas, undo/redo, group/ungroup.
// No settings islands, no chrome — features land one at a time.
//
// Architecture (thoughts/visual-builder/007):
// - GLOBAL registry: registerBlock(type, def) is THE public registration
//   surface — Publr core, plugins, and the devtools console all use the same
//   call. The render is the schema: fields are derived by probing render({}).
// - Every model mutation flows through one commit() choke point where history
//   is recorded; native browser undo is disowned inside the canvas.
// - The canvas is an uncontrolled contenteditable surface: model → DOM only
//   via explicit renders, DOM → model only via input events. Reactivity
//   drives chrome (the history store), never the canvas.

import {
  CHILDREN_ATTR,
  PATTERN_ATTR,
  RAW_TYPE,
  cloneValue,
  escAttr,
  escHtml,
  str,
} from "./carriers";
import {
  PATTERN_ROOT_TYPE,
  bumpPatternVersion,
  comparePatternVersions,
  diffPatternContent,
  getPattern,
  getPatternContent,
  isPatternContentBlock,
  patternContentBlocks,
  patternTypes,
  publishPattern,
  registerPattern,
  unregisterPattern,
} from "./patterns";
import {
  TEMPLATE_PART_TYPE,
  TEMPLATE_SLOT_TYPE,
  TEMPLATE_SLOTS,
  getTemplate,
  getTemplatePart,
  hydrateTemplateParts,
  publishTemplate,
  publishTemplatePart,
  registerTemplate,
  registerTemplatePart,
  renderTemplate,
  renderTemplateContent,
  resolveTemplate,
  templatePartTypes,
  templateTypes,
  unregisterTemplate,
  unregisterTemplatePart,
} from "./templates";
import { blockTypes, getBlockType, registerBlock, unregisterBlock } from "./registry";
import { CORE_PATTERNS, registerCoreBlocks, registerCorePatterns } from "./blocks";
import { blockToElement, downcast, upcast } from "./cast";
import { createEditor } from "./editor";
import { attachInlineChrome } from "./chrome-inline";
import { createEditorShell } from "./shell";
import { DEFAULT_BLOCK_POLICY, resolveBlockPolicy, resolveRootPolicy } from "./policy";
import { ICONS, iconRef, iconSvg, mountIconSprite } from "./icons";
import {
  ALIGN_ITEMS,
  BREAKPOINT_CONFIGURATION_TOKEN,
  BORDER_STYLES,
  DECORATIONS,
  FONT_STYLES,
  FONT_WEIGHTS,
  FLEX_WRAPS,
  JUSTIFY_CONTENT,
  LETTER_CASES,
  STYLE_PROPS,
  STYLE_BREAKPOINTS,
  TEXT_ALIGNMENTS,
  blockSupportsStyle,
  patchStyleClasses,
  readStyleClass,
  responsiveContainerCss,
  styleBreakpoints,
  styleClasses,
  unresolvedUtilities,
  variantClasses,
  variationClasses,
} from "./style";
import { classesBackend, inlineBackend } from "./style-backend";
import { collectClasses, httpCssEngine, probeCssEngine } from "./css-engine";
import {
  BORDER_WIDTH_STEPS,
  CONTAINER_WIDTH_DEFAULTS,
  DEFAULT_THEME,
  HEARTH_THEME,
  SITE_TYPOGRAPHY_DEFAULTS,
  TAILWIND_COMPAT_THEME,
  DEFAULT_SPACING_TOKENS,
  SPACING_STEPS,
  activeTheme,
  colorContexts,
  colors,
  containerWidths,
  semanticColorRoles,
  semanticColors,
  fontSizes,
  hasToken,
  isTailwindCompatibilityColor,
  leadings,
  paletteTokens,
  radii,
  setActiveTheme,
  spacingBase,
  spacings,
  themeBaseCss,
  themeFromCssText,
  themeFromTokens,
  themeToCssText,
  tokenValue,
  trackings,
  withHearthDefaults,
  withTailwindCompatibility,
} from "./theme";
import { flattenBlocks, locateBlock, pathToBlock } from "./tree";
import {
  MEDIA_PREFIX,
  deleteMedia,
  getMedia,
  listMedia,
  mediaStoreSupported,
  putMedia,
  registerMediaWorker,
} from "./media-store";

export {
  CHILDREN_ATTR,
  PATTERN_ATTR,
  RAW_TYPE,
  cloneValue,
  str,
  blockTypes,
  escAttr,
  escHtml,
  getBlockType,
  registerBlock,
  unregisterBlock,
  // The core block/pattern sets, bundled so the library artifact is
  // batteries-included for embedders (CMS admin, plain <script> hosts).
  // Registration is still the host's explicit call — no side effects.
  CORE_PATTERNS,
  registerCoreBlocks,
  registerCorePatterns,
  // Patterns — named block compositions stamped as independent copies
  // (editor.insertPattern / replaceWithPattern; registerBlock's sibling).
  PATTERN_ROOT_TYPE,
  registerPattern,
  unregisterPattern,
  getPattern,
  patternTypes,
  // The pattern instance's editable units — the content-editing surface the
  // main editor exposes (isolation edits the full structure).
  isPatternContentBlock,
  patternContentBlocks,
  // Definition versioning (thoughts/012 — instances are DECOUPLED copies;
  // versions serve the future Symbol "Update from Source" flow):
  // publishPattern archives superseded content per version, the bump derives
  // from the structural diff, getPatternContent retrieves any version.
  publishPattern,
  getPatternContent,
  comparePatternVersions,
  bumpPatternVersion,
  diffPatternContent,
  // Templates — shared page structure, shared template-part references, and
  // document-value slots. Unlike patterns these are never stamped copies.
  TEMPLATE_PART_TYPE,
  TEMPLATE_SLOT_TYPE,
  TEMPLATE_SLOTS,
  registerTemplate,
  unregisterTemplate,
  getTemplate,
  templateTypes,
  publishTemplate,
  resolveTemplate,
  renderTemplate,
  renderTemplateContent,
  registerTemplatePart,
  unregisterTemplatePart,
  getTemplatePart,
  templatePartTypes,
  publishTemplatePart,
  hydrateTemplateParts,
  blockToElement,
  downcast,
  upcast,
  createEditor,
  attachInlineChrome,
  // The FULL harness (page chrome: topbar, rails, sidebar, patterns
  // explorer) as a library API — hosts drop it into a container and bring
  // their own document actions/panels (src/shell.ts).
  createEditorShell,
  resolveRootPolicy,
  resolveBlockPolicy,
  DEFAULT_BLOCK_POLICY,
  flattenBlocks,
  locateBlock,
  pathToBlock,
  // Publr's own icon set (hand-authored in src/icons.ts):
  // chrome layers resolve declared icon NAMES against it, inline (iconSvg) or
  // as a bindable sprite (mountIconSprite + iconRef).
  ICONS,
  iconSvg,
  iconRef,
  mountIconSprite,
  // In-browser media persistence (OPFS + /media/* service worker) — the
  // media control's storage; hosts with a real media library skip it.
  MEDIA_PREFIX,
  mediaStoreSupported,
  putMedia,
  getMedia,
  listMedia,
  deleteMedia,
  registerMediaWorker,
  // Universal style system (Phase C) + the theme document (E1, css-engine):
  // structured values → Tailwind classes against the site theme; control
  // scales DERIVE from theme tokens (src/theme.ts). The vendored default is
  // generated from the jit's default-theme.zon — never hand-edited.
  styleClasses,
  blockSupportsStyle,
  DECORATIONS,
  LETTER_CASES,
  TEXT_ALIGNMENTS,
  FONT_WEIGHTS,
  FONT_STYLES,
  FLEX_WRAPS,
  JUSTIFY_CONTENT,
  ALIGN_ITEMS,
  BREAKPOINT_CONFIGURATION_TOKEN,
  BORDER_STYLES,
  STYLE_PROPS,
  STYLE_BREAKPOINTS,
  responsiveContainerCss,
  styleBreakpoints,
  // Lenses over the class carrier + the pluggable style backends (E2).
  readStyleClass,
  patchStyleClasses,
  unresolvedUtilities,
  variantClasses,
  variationClasses,
  classesBackend,
  inlineBackend,
  // The CSS engine seam (E3): compile(classes, theme) → css + diagnostics.
  collectClasses,
  httpCssEngine,
  probeCssEngine,
  CONTAINER_WIDTH_DEFAULTS,
  SITE_TYPOGRAPHY_DEFAULTS,
  DEFAULT_THEME,
  HEARTH_THEME,
  TAILWIND_COMPAT_THEME,
  activeTheme,
  setActiveTheme,
  themeFromTokens,
  themeFromCssText,
  themeToCssText,
  tokenValue,
  hasToken,
  isTailwindCompatibilityColor,
  paletteTokens,
  fontSizes,
  colors,
  containerWidths,
  colorContexts,
  semanticColorRoles,
  semanticColors,
  radii,
  leadings,
  trackings,
  spacings,
  spacingBase,
  themeBaseCss,
  DEFAULT_SPACING_TOKENS,
  SPACING_STEPS,
  BORDER_WIDTH_STEPS,
  withHearthDefaults,
  withTailwindCompatibility,
};

export type { Block, CarrierKind, FieldValue, ImageValue, Model } from "./carriers";
export type {
  TemplateDefinition,
  TemplatePartDefinition,
  TemplatePartType,
  TemplateSlotValues,
  TemplateSlotName,
  TemplateType,
} from "./templates";
export type {
  StyleCapability,
  StyleBreakpoint,
  StyleBreakpointDefinition,
  StyleSupport,
  StyleSupports,
  StyleValues,
  StyleVariant,
  StyleVariation,
  UnresolvedUtility,
} from "./style";
export type { StyleBackend, StyleScope } from "./style-backend";
export type { CssEngine, CssEngineResult } from "./css-engine";
export type {
  ColorOption,
  ColorContextDefinition,
  ContainerWidths,
  ScaleOption,
  SemanticColorRoleDefinition,
  SemanticColorOption,
  Theme,
  ThemeTemplateDefinition,
  ThemeTemplatePartDefinition,
  ThemePatternDefinition,
  ThemeToken,
} from "./theme";
export type { DowncastPipeline } from "./cast";
export type {
  BlockDefinition,
  BlockType,
  ControlRole,
  FieldSpec,
  Fields,
  SettingOption,
  SettingSpec,
  ToolbarControl,
  ToolbarGroup,
  ToolbarSpec,
} from "./registry";
export type { EditingMode, Editor, EditorOptions } from "./editor";
export type { MediaAdapter, MediaValue } from "./media-adapter";
export type {
  EditorShell,
  EditorShellOptions,
  ShellAction,
  ShellDocumentAction,
  ShellDocumentActions,
  ShellDocumentConfig,
  ShellDocumentRenameAction,
  ShellPanel,
} from "./shell";
export type { PatternDefinition, PatternType, PatternVariantDefinition } from "./patterns";
export type { BlockPolicy, EditorPolicy, PolicyConfig, RootPolicy } from "./policy";
export type { InlineChromeOptions, InlineInsertionPlacement } from "./chrome-inline";
export type { HistoryFlags } from "./history";
export type { SelectionState } from "./selection";
export type { LocatedBlock, SiblingRun } from "./tree";

declare global {
  interface Window {
    Publr?: import("../vendor/publr/publr.js").PublrGlobal;
  }
}

// Console access is a supported input (blocks can be registered straight from
// devtools), so the API hangs off the one global PublrJS already claims —
// window.Publr, set by the runtime import above (import order guarantees it
// exists here) — instead of minting a clash-prone global of its own. Editor
// INSTANCES are the host's business; the demo exposes its one as Publr.editor.
if (typeof window !== "undefined" && window.Publr) {
  window.Publr.Editor = {
    RAW_TYPE,
    escHtml,
    escAttr,
    registerBlock,
    unregisterBlock,
    getBlockType,
    blockTypes,
    registerCoreBlocks,
    registerCorePatterns,
    registerPattern,
    unregisterPattern,
    getPattern,
    patternTypes,
    isPatternContentBlock,
    patternContentBlocks,
    TEMPLATE_PART_TYPE,
    TEMPLATE_SLOT_TYPE,
    TEMPLATE_SLOTS,
    registerTemplate,
    unregisterTemplate,
    getTemplate,
    templateTypes,
    publishTemplate,
    resolveTemplate,
    renderTemplate,
    renderTemplateContent,
    registerTemplatePart,
    unregisterTemplatePart,
    getTemplatePart,
    templatePartTypes,
    publishTemplatePart,
    hydrateTemplateParts,
    upcast,
    downcast,
    blockToElement,
    createEditor,
    attachInlineChrome,
    createEditorShell,
  };
}
