// shell.ts — the FULL editor harness (page chrome) as a library API.
//
// createEditorShell({ container, ... }) injects the shell markup
// (src/shell.html — topbar, list-view rail, inserter, canvas column,
// settings sidebar, patterns explorer), hydrates it as one PublrJS island
// (local:chrome), boots the editor + inline chrome inside it, and returns
// the instance plus a small control surface. This is the same harness the
// demo (src/demo.ts) runs — the demo is just another host of this API.
//
// HOST SEAMS — the shell is embeddable-first (thoughts/007: the editor is a
// standalone product; a CMS drops it in and brings its own document
// actions):
//   options.actions  → buttons in the topbar's right group (Save, Publish,
//                      any host action; `primary` gets the filled style).
//   options.panels   → extra right sidebars, one topbar icon toggle each —
//                      the host mounts arbitrary UI (version history, SEO,
//                      …) via panel.mount(el, editor).
//   options.content  → initial wire HTML (loadHtml); onChange fires on every
//                      committed change for the host's persistence.
//   options.cssEngine/setCssEngine → the pluggable class compiler (wasm JIT,
//                      dev bridge, CMS-native) — the shell never generates
//                      CSS itself.
//
// ONE SHELL PER PAGE: the chrome island's store factory closes over module
// state (exactly as the demo always did). Multiple simultaneous shells are
// not supported — embed multiple bare editors (attachInlineChrome) instead.

import shellHtml from "./shell.html?raw";
import tokenScaleHtml from "./components/token-scale.html?raw";
import previewCss from "./chrome.css?inline";
import { createEditor } from "./editor";
import { attachInlineChrome } from "./chrome-inline";
import type { InlineInsertionPlacement } from "./chrome-inline";
import { targetsInteractiveControl } from "./selection";
import { blockTypes, getBlockType } from "./registry";
import type { ControlRole } from "./registry";
import {
  ALIGN_ITEMS,
  BREAKPOINT_CONFIGURATION_TOKEN,
  BORDER_STYLES,
  DECORATIONS,
  FLEX_WRAPS,
  FONT_STYLES,
  FONT_WEIGHTS,
  JUSTIFY_CONTENT,
  LETTER_CASES,
  STYLE_BREAKPOINTS,
  STYLE_PROPS,
  TEXT_ALIGNMENTS,
  blockSupportsStyle,
  responsiveContainerCss,
  styleBreakpoints,
  unresolvedUtilities,
  variantClasses,
} from "./style";
import type { StyleBreakpoint } from "./style";
import {
  BORDER_WIDTH_STEPS,
  CONTAINER_WIDTH_DEFAULTS,
  SITE_TYPOGRAPHY_DEFAULTS,
  SPACING_STEPS,
  activeTheme,
  colorContexts,
  containerWidths,
  fontSizes,
  isTailwindCompatibilityColor,
  leadings,
  paletteTokens,
  radii,
  resolveThemeValue,
  semanticColorRoles,
  semanticColors,
  spacingBase,
  spacings,
  themeBaseCss,
  themeFromCssText,
  themeToCssText,
  tokenValue,
  trackings,
  withHearthDefaults,
} from "./theme";
import type { SemanticColorRoleDefinition, Theme, ThemeToken } from "./theme";
import { collectClasses } from "./css-engine";
import type { CssEngine } from "./css-engine";
import {
  PATTERN_ROOT_TYPE,
  getPattern,
  patternContentBlocks,
  patternTypes,
  publishPattern,
  registerPattern,
  unregisterPattern,
} from "./patterns";
import {
  TEMPLATE_PART_TYPE,
  TEMPLATE_SLOTS,
  getTemplate,
  getTemplatePart,
  hydrateTemplateParts,
  publishTemplate,
  publishTemplatePart,
  registerTemplate,
  registerTemplatePart,
  renderTemplate,
  templatePartTypes,
  templateTypes,
  unregisterTemplate,
  unregisterTemplatePart,
} from "./templates";
import { flattenBlocks, locateBlock, pathToBlock } from "./tree";
import { iconRef, mountIconSprite } from "./icons";
import { downcast, upcast } from "./cast";
import { resolveMediaAdapter, toDocumentMediaValue, toImageValue } from "./media-adapter";
import type { MediaAdapter, MediaValue, ResolvedMediaAdapter } from "./media-adapter";
import type { Block, FieldValue, ImageValue } from "./carriers";
import type { Editor } from "./editor";
import type { PolicyConfig } from "./policy";
import { inlineBackend } from "./style-backend";
import type { StyleBackend } from "./style-backend";
import { Publr, destroy, effect, hydrate } from "./publr-runtime";
import { position } from "../vendor/publr/publr-position.js";

// --- host-facing option/handle types -----------------------------------------

/** A host document action rendered into the topbar's right group. */
export interface ShellAction {
  id: string;
  label: string;
  /** Filled (primary) button style; default is the quiet outline style. */
  primary?: boolean;
  title?: string;
  /** The DOM event rides along so menu tools can manage their own
   * dismissal (e.g. stopPropagation on an arming click keeps the ⋮ menu
   * open for a two-step confirm). */
  onClick: (editor: Editor, ev: MouseEvent) => void;
}

/** A host panel: an extra right sidebar with a topbar icon toggle. */
export interface ShellPanel {
  id: string;
  title: string;
  /** Inline SVG markup for the topbar toggle; defaults to a letter badge. */
  icon?: string;
  /** Start open? Default closed. */
  open?: boolean;
  /** Mount host UI into the panel body. Optional cleanup return. */
  mount: (el: HTMLElement, editor: Editor) => void | (() => void);
}

export type ShellDocumentAction = (editor: Editor, ev: MouseEvent) => void | Promise<void>;
export type ShellDocumentRenameAction = (title: string, editor: Editor) => void | Promise<void>;

export interface ShellDocumentActions {
  view?: ShellDocumentAction;
  /** The shell owns the rename dialog; the host persists the accepted title. */
  rename?: ShellDocumentRenameAction;
  /** Host capability only (for example a CMS page model). Omit in a
   * standalone editor, where "homepage" has no meaning. */
  setAsHomepage?: ShellDocumentAction;
  trash?: ShellDocumentAction;
}

/** Host-owned document metadata rendered by the shell's Document tab.
 * Content remains editor-owned block HTML; these values deliberately do not
 * enter the block model or its undo history. */
export interface ShellDocumentConfig {
  title: string;
  featuredImage?: MediaValue;
  onFeaturedImageChange?: (value: MediaValue, editor: Editor) => void | Promise<void>;
  /** Shared page template selected by this document. The definition must be
   * registered with registerTemplate before shell creation. */
  template?: {
    name: string;
    /** Persist a template definition after editor validation. */
    onSave?: (name: string, content: string, editor: Editor) => void | Promise<void>;
    /** Persist a shared template part after editor validation. */
    onSavePart?: (name: string, content: string, editor: Editor) => void | Promise<void>;
  };
  actions?: ShellDocumentActions;
}

export interface EditorShellOptions {
  /** The element the shell takes over (its innerHTML is replaced). */
  container: HTMLElement;
  /** Initial wire HTML — loaded after boot (history starts clean). */
  content?: string;
  defaultBlock?: string;
  groupBlock?: string;
  theme?: Theme;
  /** Template-level content boundary. Unlike a Group marked as a container,
   * this constrains the document canvas without creating or mutating a block.
   * "full" preserves full-bleed page templates. */
  templateWidth?: "content" | "wide" | "full";
  /** Optional host-rendered page frame. The editor mounts only its document
   * canvas into `slotSelector`; surrounding template markup remains locked
   * and never enters either serialization pipeline. */
  frame?: {
    html: string;
    slotSelector?: string;
  };
  styleBackend?: StyleBackend;
  policy?: PolicyConfig;
  placeholder?: string;
  debug?: boolean;
  /** Shell chrome appearance. "dark" (default) applies the editor's own
   * scoped dark skin; "light" resolves the host page's light tokens. Hosts
   * with a theme toggle call shell.setAppearance on change. */
  appearance?: "dark" | "light";
  /** Show the shell-owned Light mode checkbox in the ⋮ menu. Defaults to
   * true. Hosts with a global appearance control can hide the duplicate. */
  showAppearanceToggle?: boolean;
  /** Media persistence (see media-adapter.ts). true (default) = the built-in
   * OPFS `/media/*` store (service worker); false = no uploads (URL insertion
   * stays); a MediaAdapter plugs the host's own upload()/browse() — browse()
   * surfaces "Media Library" buttons across the media surfaces. */
  media?: boolean | MediaAdapter;
  /** The class compiler for authored utilities (E3). Null = build-time CSS
   * only; hosts can install one later via shell.setCssEngine. */
  cssEngine?: CssEngine | null;
  engineLabel?: string;
  /** CSS prepended to the Preview export (typically a preflight/reset). */
  baseCss?: string;
  /** The host site's compiled authored-content stylesheet. Pattern preview
   * iframes receive this explicitly, so their fidelity never depends on
   * global host/admin styles or on a live CSS engine being available. */
  siteCss?: string;
  onChange?: (editor: Editor) => void;
  /** Called whenever the shell applies a theme (design tab edits) — hosts
   * with theme-dependent CSS outside the engine refresh it here. */
  onThemeCss?: () => void;
  /** Complete site-design mutation signal. Hosts own persistence. */
  onSiteDesignChange?: (theme: Theme) => void;
  /** Persist/reset commands for a dedicated host Design destination. When
   * omitted, Publish simply marks the standalone in-memory design clean. */
  saveSiteDesign?: (theme: Theme, editor: Editor) => void | Promise<void>;
  resetSiteDesign?: (editor: Editor) => void | Promise<void>;
  /** Redirect the integrated Design affordance to a host destination. */
  openSiteDesign?: (editor: Editor, ev?: MouseEvent) => void;
  /** Leave a dedicated host Design destination. Without this callback the
   * standalone workspace closes back onto its document editor. */
  closeSiteDesign?: (editor: Editor) => void;
  /** Full embedded editors can keep Design in their host navigation/menu
   * instead of showing the prominent palette button. Defaults to true. */
  showSiteDesignButton?: boolean;
  /** "theme-only" makes the active Theme document the complete pattern
   * library. The default "merge" keeps separately registered patterns too. */
  patternLibrary?: "merge" | "theme-only";
  /** Dedicated design hosts can boot directly into the workspace. */
  initialDesignOpen?: boolean;
  /** Host-owned title, featured image, and page-level actions for the
   * Document tab. Omit when the host has no document metadata surface. */
  document?: ShellDocumentConfig;
  actions?: ShellAction[];
  /** Extra entries for the topbar's ⋮ Tools menu (host tools — e.g. the
   * CMS's "Reset to default content"). Same shape as actions. */
  tools?: ShellAction[];
  panels?: ShellPanel[];
  /** Host preview seam. A function replaces the built-in quick preview (the
   * self-contained new-tab export) — hosts with a real rendering pipeline
   * (the CMS) drive preview themselves. `false` hides the preview button. */
  preview?: ((editor: Editor) => void) | false;
}

export interface EditorShell {
  editor: Editor;
  container: HTMLElement;
  /** Install/replace the class compiler (e.g. after an async wasm probe). */
  setCssEngine: (engine: CssEngine | null, label?: string) => void;
  /** Recompile the live class universe now (e.g. after a host loadHtml). */
  refreshCss: () => void;
  /** True while a pattern or template isolation editor is open (the page
   * document is parked; serialize() would return the isolated fragment).
   * Hosts must not persist while this is true. */
  isIsolated: () => boolean;
  /** Re-derive the design tab after a host-side setActiveTheme. */
  syncDesignPanel: () => void;
  /** The theme-mutation choke point (install + re-render + refresh). */
  applyTheme: (theme: Theme | ThemeToken[]) => void;
  getSiteDesign: () => Theme;
  hasSiteDesignChanges: () => boolean;
  markSiteDesignSaved: () => void;
  openSiteDesign: () => void;
  /** Flip the shell chrome between its dark skin and host-light tokens. */
  setAppearance: (mode: "dark" | "light") => void;
  /** Toggle a host panel (true/false, or undefined to flip). */
  openPanel: (id: string, open?: boolean) => void;
  /** Refresh host-owned document values after an external rename/update.
   * This does not call onFeaturedImageChange. */
  updateDocument: (document: Partial<Pick<ShellDocumentConfig, "title" | "featuredImage">>) => void;
  destroy: () => void;
}

// --- module state the chrome-store factory closes over -----------------------
// (one shell per page — see the header note)

let shellOptions: EditorShellOptions | null = null;
let siteDesignSavedJson = "";
const installedThemePatterns = new Set<string>();
const installedThemeTemplates = new Set<string>();
const installedThemeTemplateParts = new Set<string>();

function syncThemePatterns(theme: Theme): void {
  const desired = new Map((theme.patterns ?? []).map((pattern) => [pattern.name, pattern]));
  for (const name of installedThemePatterns) {
    if (desired.has(name)) continue;
    unregisterPattern(name);
    installedThemePatterns.delete(name);
  }
  for (const [name, pattern] of desired) {
    const { name: _name, ...definition } = pattern;
    const existing = getPattern(name);
    if (existing) {
      const same =
        existing.label === pattern.label &&
        existing.content === pattern.content &&
        existing.version === (pattern.version ?? "1.0") &&
        existing.category === pattern.category &&
        existing.description === pattern.description &&
        existing.icon === pattern.icon &&
        existing.defaultColorContext === pattern.defaultColorContext &&
        JSON.stringify(existing.disabledColorContexts ?? []) ===
          JSON.stringify(pattern.disabledColorContexts ?? []);
      if (!same && !installedThemePatterns.has(name))
        throw new Error(
          `PublrEditor: theme pattern "${name}" conflicts with an already registered pattern`,
        );
      if (!same && installedThemePatterns.has(name)) {
        unregisterPattern(name);
        registerPattern(name, definition);
      }
      if (!installedThemePatterns.has(name)) continue;
    } else {
      registerPattern(name, definition);
    }
    installedThemePatterns.add(name);
  }
}

function syncThemeTemplates(theme: Theme): void {
  const desiredParts = new Map((theme.templateParts ?? []).map((part) => [part.name, part]));
  for (const name of installedThemeTemplateParts) {
    if (desiredParts.has(name)) continue;
    unregisterTemplatePart(name);
    installedThemeTemplateParts.delete(name);
  }
  for (const [name, part] of desiredParts) {
    const { name: _name, ...definition } = part;
    const existing = getTemplatePart(name);
    if (existing && !installedThemeTemplateParts.has(name))
      throw new Error(
        `PublrEditor: theme template part "${name}" conflicts with a registered part`,
      );
    if (existing) unregisterTemplatePart(name);
    registerTemplatePart(name, definition);
    installedThemeTemplateParts.add(name);
  }

  const desiredTemplates = new Map(
    (theme.templates ?? []).map((template) => [template.name, template]),
  );
  for (const name of installedThemeTemplates) {
    if (desiredTemplates.has(name)) continue;
    unregisterTemplate(name);
    installedThemeTemplates.delete(name);
  }
  for (const [name, template] of desiredTemplates) {
    const { name: _name, ...definition } = template;
    const existing = getTemplate(name);
    if (existing && !installedThemeTemplates.has(name))
      throw new Error(`PublrEditor: theme template "${name}" conflicts with a registered template`);
    if (existing) unregisterTemplate(name);
    registerTemplate(name, definition);
    installedThemeTemplates.add(name);
  }
}

// Media persistence seam (media-adapter.ts) — gates the media control's
// upload/browse affordances; URL input works regardless. Initialized per
// createEditorShell (options.media).
let mediaAdapter: ResolvedMediaAdapter = resolveMediaAdapter(false);

// The E3 injection target for engine-compiled canvas CSS.
let engineTag: HTMLStyleElement | null = null;
let cssEngine: CssEngine | null = null;
let baseCss = "";
let siteCss = "";
let currentEngineCss = "";

// Runtime CSS belongs to authored content. The engine emits ordinary global
// utility selectors (for example `.border-border`), which deliberately share
// names with some shell utilities. Keep those rules inside the canvas so a
// site's palette can never restyle the editor chrome. Pattern cards carry the
// unscoped result inside their own iframe document.
const scopeEngineCss = (css: string): string =>
  `@scope (#canvas) {\n${css}\n}\n` +
  `@scope ([data-pbe-template-surface]) to (.pbe-frame-wrap) {\n${css}\n}`;

// Tailwind's standalone preflight declares only `base,utilities`, while the
// complete site sheet also owns `theme,components`. If preflight is inlined
// first without a complete order, CSS creates `components` *after*
// `utilities`; component defaults such as `.pbe-grid--2` then beat responsive
// authored utilities such as `lg:grid-cols-4`. The canvas does not suffer
// because its complete site sheet establishes the four-layer order at load.
// Establish it explicitly for every isolated/published document before any
// supplied CSS is parsed so Preview and canvas share one cascade.
export const CONTENT_CSS_LAYER_ORDER = "@layer theme, base, components, utilities;";

export function composeContentCss(parts: readonly string[]): string {
  return [CONTENT_CSS_LAYER_ORDER, ...parts.filter(Boolean)].join("\n");
}

// Handles captured during the chrome store's setup() for the shell object.
interface ShellRefs {
  editor?: Editor;
  refreshCss?: () => void;
  isIsolated?: () => boolean;
  syncDesignPanel?: () => void;
  applyTheme?: (theme: Theme | ThemeToken[]) => void;
  getSiteDesign?: () => Theme;
  hasSiteDesignChanges?: () => boolean;
  markSiteDesignSaved?: () => void;
  openSiteDesign?: () => void;
  setEngine?: (engine: CssEngine | null, label?: string) => void;
  syncAppearance?: () => void;
  updateDocument?: (
    document: Partial<Pick<ShellDocumentConfig, "title" | "featuredImage">>,
  ) => void;
}
const refs: ShellRefs = {};

// PublrJS auto-hydrates once on its own (DOMContentLoaded, or a microtask
// after import when the document is already complete). The shell must inject
// its markup strictly AFTER that pass — otherwise the auto pass would wire
// the injected subtree a second time (duplicate listeners). publr.js is
// imported above (before this module evaluates), so its listener/microtask
// is always queued ahead of ours.
//
// readyState nuance: at "interactive" DOMContentLoaded may ALREADY have
// fired (e.g. this bundle was fetch-injected between DOMContentLoaded and
// load — the CMS admin does exactly that), so a DOMContentLoaded listener
// alone can wait forever. Listen for load as well and settle on whichever
// fires first; publr's own pending listener (if any) is older, so it still
// runs before us.
const autoHydrateDone: Promise<void> =
  typeof document === "undefined"
    ? Promise.resolve()
    : new Promise((resolve) => {
        if (document.readyState === "complete") {
          queueMicrotask(() => queueMicrotask(() => resolve()));
          return;
        }
        const done = () => queueMicrotask(() => resolve());
        document.addEventListener("DOMContentLoaded", done, { once: true });
        window.addEventListener("load", done, { once: true });
      });

type Dataset = { [key: string]: string | undefined };

type ViewportDevice = "mobile" | "tablet" | "desktop";
type ViewportMode = StyleBreakpoint | "full";
type IsolationMode = "definition" | "instance" | "page-template" | "template-part";
type IsolationKind = "pattern" | "template" | "template-part";

interface IsolationScope {
  label: string;
  kind: IsolationKind;
}

interface IsolationBreadcrumb extends IsolationScope {
  index: number;
  current: boolean;
}

const VIEWPORT_DEVICE_META: readonly {
  key: ViewportDevice;
  label: string;
  icon: string;
}[] = [
  {
    key: "mobile",
    label: "Mobile",
    icon: iconRef("device-mobile"),
  },
  {
    key: "tablet",
    label: "Tablet",
    icon: iconRef("device-tablet"),
  },
  {
    key: "desktop",
    label: "Desktop",
    icon: iconRef("device-desktop"),
  },
];

const DEFAULT_BREAKPOINT_DEVICES: Readonly<Partial<Record<StyleBreakpoint, ViewportDevice>>> = {
  base: "mobile",
  sm: "tablet",
  md: "tablet",
  lg: "desktop",
  xl: "desktop",
  "2xl": "desktop",
};

const breakpointDeviceToken = (breakpoint: StyleBreakpoint): string =>
  `publr-breakpoint-${breakpoint}-device`;

const breakpointDevice = (
  breakpoint: StyleBreakpoint,
  theme: Theme = activeTheme(),
): ViewportDevice => {
  if (breakpoint === "base") return "mobile";
  const configured = tokenValue(theme, breakpointDeviceToken(breakpoint));
  return configured === "mobile" || configured === "tablet" || configured === "desktop"
    ? configured
    : (DEFAULT_BREAKPOINT_DEVICES[breakpoint] ?? "desktop");
};

const viewportDevices = (theme: Theme = activeTheme()) =>
  VIEWPORT_DEVICE_META.map((device) => {
    const breakpoints = styleBreakpoints(theme)
      .filter((breakpoint) => breakpointDevice(breakpoint.key, theme) === device.key)
      .map((breakpoint) => breakpoint.key);
    return {
      ...device,
      defaultMode: breakpoints[0] ?? "base",
      breakpoints,
      disabled: breakpoints.length === 0,
    };
  });

const viewportDeviceForMode = (mode: ViewportMode, theme: Theme = activeTheme()): ViewportDevice =>
  breakpointDevice(mode, theme);

const defaultViewportBreakpoint = (theme: Theme = activeTheme()): StyleBreakpoint =>
  viewportDevices(theme).find((device) => device.key === "desktop")?.breakpoints[0] ??
  styleBreakpoints(theme)[0].key;

const viewportSelectorDevices = (
  activeBreakpoint: StyleBreakpoint | null,
  selections: Partial<Record<ViewportDevice, StyleBreakpoint>> = {},
  hasValues: Partial<Record<StyleBreakpoint, boolean>> = {},
  theme: Theme = activeTheme(),
) => {
  const activeDevice = activeBreakpoint ? breakpointDevice(activeBreakpoint, theme) : null;
  const breakpoints = styleBreakpoints(theme);
  return viewportDevices(theme).map((device) => {
    const selected =
      device.key === activeDevice
        ? activeBreakpoint
        : device.breakpoints.includes(selections[device.key] ?? "")
          ? selections[device.key]!
          : device.defaultMode;
    const current = breakpoints.find((breakpoint) => breakpoint.key === selected) ?? breakpoints[0];
    return {
      ...device,
      pressed: device.key === activeDevice,
      currentBreakpoint: current.key,
      currentViewport: current.viewport,
      multiple: device.breakpoints.length > 1,
      hasValue: device.breakpoints.some((key) => !!hasValues[key]),
      endpoints: device.breakpoints.map((key) => {
        const breakpoint = breakpoints.find((option) => option.key === key)!;
        return {
          key,
          label: breakpoint.label,
          viewport: breakpoint.viewport,
          pressed: device.key === activeDevice && key === current.key,
          hasValue: !!hasValues[key],
        };
      }),
    };
  });
};

const cssLengthPx = (value: string): number | null => {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(px|rem|em)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2] === "px" ? amount : amount * 16;
};

const RESPONSIVE_PREVIEW_WIDTH = 360;
const responsivePreviewScale = (width: number): number =>
  Math.min(1, RESPONSIVE_PREVIEW_WIDTH / Math.max(1, width));

/** Materialize the implicit starter collection on the first breakpoint edit.
 * From then on the theme owns the exact collection, including an intentionally
 * empty one. */
const breakpointMutationTokens = (): ThemeToken[] => {
  const tokens = activeTheme().tokens;
  if (tokens.some((token) => token.name === BREAKPOINT_CONFIGURATION_TOKEN)) return tokens;
  if (tokens.some((token) => token.name.startsWith("breakpoint-")))
    return [...tokens, { name: BREAKPOINT_CONFIGURATION_TOKEN, value: "1" }];
  return [
    ...tokens,
    ...STYLE_BREAKPOINTS.map((breakpoint) => ({
      name: breakpoint.token ?? `breakpoint-${breakpoint.key}`,
      value: breakpoint.viewport,
    })),
    { name: BREAKPOINT_CONFIGURATION_TOKEN, value: "1" },
  ];
};

// --- pattern previews ---------------------------------------------------------
//
// A preview is the pattern's fragment run through the SAME cast pipeline a
// document uses (upcast → downcast: baseline classes, islands, defaults all
// applied), then rendered in a sandboxed iframe with the SAME canvas CSS.
// The iframe is important: neither the admin UI nor a host website can leak
// selectors into the pattern, and pattern CSS cannot leak back out.

// A stable desktop viewport makes responsive patterns preview their intended
// composition rather than reflowing at each card's narrow display width.
const PREVIEW_WIDTH = 1200;

const previewCache = new Map<string, string>();
function copyComputedCustomProperties(source: Element | null, target: HTMLElement): void {
  if (!source) return;
  const computed = getComputedStyle(source);
  for (const name of computed) {
    if (!name.startsWith("--")) continue;
    const value = computed.getPropertyValue(name).trim();
    if (value) target.style.setProperty(name, value);
  }
}

const CHROME_TOKEN_NAMES: Readonly<Record<string, string>> = {
  background: "background",
  foreground: "foreground",
  popover: "popover",
  "popover-foreground": "popover-foreground",
  primary: "primary",
  "primary-foreground": "primary-foreground",
  muted: "muted",
  "muted-foreground": "muted-foreground",
  accent: "ui-accent",
  "accent-foreground": "accent-foreground",
  border: "border",
  input: "input",
  ring: "ring",
};

function copyShellChromeTokens(source: Element | null, ...targets: HTMLElement[]): void {
  if (!source) return;
  const computed = source.ownerDocument.defaultView!.getComputedStyle(source);
  for (const [privateName, rawName] of Object.entries(CHROME_TOKEN_NAMES)) {
    const value = computed.getPropertyValue(`--${rawName}`).trim();
    for (const target of targets) {
      const property = `--pbe-chrome-${privateName}`;
      if (value) target.style.setProperty(property, value);
      else target.style.removeProperty(property);
    }
  }
}
function patternPreviewHtml(name: string): string {
  let html = previewCache.get(name);
  if (html == null) {
    const tmp = document.createElement("div");
    tmp.innerHTML = getPattern(name)?.content ?? "";
    html = downcast(upcast(tmp));
    previewCache.set(name, html);
  }
  return html;
}

function resetPatternPreviews(name?: string): void {
  const selector = name ? `[data-pattern-preview="${CSS.escape(name)}"]` : "[data-pattern-preview]";
  for (const holder of document.querySelectorAll<HTMLElement>(selector)) {
    delete holder.dataset.filled;
    holder.replaceChildren();
    holder.style.height = "";
    holder.style.backgroundColor = "";
  }
  requestAnimationFrame(fillPatternPreviews);
}

// Fill every empty preview shell in the document (flyout + explorer share the
// same data-pattern-preview vocabulary). Each card is a non-interactive,
// scaled iframe: the isolated pattern sees canvas CSS only.
function fillPatternPreviews(): void {
  for (const holder of document.querySelectorAll<HTMLElement>("[data-pattern-preview]")) {
    if (holder.dataset.filled) continue;
    const name = holder.dataset.patternPreview;
    if (!name || !holder.clientWidth) continue; // hidden panes measure 0 — fill on next open
    holder.dataset.filled = "1";
    const content = document.createElement("div");
    content.innerHTML = patternPreviewHtml(name);
    // The canvas stamps pbe-container on every container at render time.
    for (const el of content.querySelectorAll("[data-pb-children]"))
      el.classList.add("pbe-container");

    const frame = document.createElement("iframe");
    frame.title = `${getPattern(name)?.label ?? "Pattern"} preview`;
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.style.cssText = `display:block;width:${PREVIEW_WIDTH}px;height:1px;border:0;transform-origin:top left;pointer-events:none`;
    frame.addEventListener(
      "load",
      () => {
        const doc = frame.contentDocument;
        if (!doc || !holder.isConnected) return;
        const base = doc.createElement("base");
        base.href = document.baseURI;
        doc.head.appendChild(base);

        // Mirror the live editor document's ACTUAL stylesheet order. Some
        // hosts provide a JIT, some ship a built site bundle, and some do both.
        // Copying only one path made cards silently lose arbitrary colors and
        // responsive utilities. These copies live inside the sandboxed iframe,
        // so none can reach the theme-editor chrome or the host document.
        let resizePreview = () => {};
        for (const source of document.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
          'style,link[rel="stylesheet"]',
        )) {
          const copy = source.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
          if (copy instanceof HTMLLinkElement)
            copy.addEventListener("load", () => resizePreview(), {
              once: true,
            });
          doc.head.appendChild(copy);
        }
        for (const sheet of document.adoptedStyleSheets ?? []) {
          try {
            const adopted = doc.createElement("style");
            adopted.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
            doc.head.appendChild(adopted);
          } catch {
            // Cross-origin sheets cannot expose cssRules. Their corresponding
            // <link> above is still cloned and loads through <base>.
          }
        }
        const css = doc.createElement("style");
        // Explicit host seams and the current raw JIT are appended last. They
        // cover non-DOM stylesheet providers and preserve active-theme wins.
        css.textContent = composeContentCss([
          baseCss,
          themeBaseCss(),
          previewCss,
          siteCss,
          responsiveContainerCss(),
          currentEngineCss,
          `html,body{margin:0!important;min-height:0!important;overflow:hidden!important;background:transparent!important}#canvas{display:flow-root;width:${PREVIEW_WIDTH}px;font-size:15px;line-height:1.6}`,
        ]);
        doc.head.appendChild(css);
        const canvas = doc.createElement("main");
        canvas.id = "canvas";
        // Stylesheets cross the document boundary above; inherited custom
        // properties do not. Copy the RESOLVED variable environment from the
        // real editor canvas as well as the token document. This covers hosts
        // that define theme/context variables in :root CSS instead of passing
        // them through EditorShellOptions.theme.
        for (const token of activeTheme().tokens)
          canvas.style.setProperty(`--${token.name}`, token.value);
        copyComputedCustomProperties(document.documentElement, canvas);
        copyComputedCustomProperties(
          document
            .querySelector<HTMLIFrameElement>("#editor-frame")
            ?.contentDocument?.querySelector("#canvas") ?? null,
          canvas,
        );
        canvas.innerHTML = content.innerHTML;
        doc.body.appendChild(canvas);

        resizePreview = () => {
          if (!holder.isConnected) return;
          const square = holder.dataset.patternPreviewShape === "square";
          if (!square) {
            const rootBackground = canvas.firstElementChild
              ? getComputedStyle(canvas.firstElementChild).backgroundColor
              : "transparent";
            holder.style.backgroundColor =
              rootBackground === "rgba(0, 0, 0, 0)" || rootBackground === "transparent"
                ? ""
                : rootBackground;
          }
          const height = Math.max(48, canvas.scrollHeight, doc.body.scrollHeight);
          const scale = holder.clientWidth / PREVIEW_WIDTH;
          frame.style.height = `${height}px`;
          frame.style.transform = `scale(${scale})`;
          // Preserve the fractional transformed height. Rounding up exposed a
          // 1px strip of the holder's white loading background above dark card
          // footers on brand/inverse patterns.
          if (!square) holder.style.height = `${height * scale}px`;
        };
        requestAnimationFrame(resizePreview);
        for (const image of doc.images)
          image.addEventListener("load", resizePreview, { once: true });
        void doc.fonts?.ready.then(resizePreview);
      },
      { once: true },
    );
    frame.srcdoc = "<!doctype html><html><head></head><body></body></html>";
    holder.replaceChildren(frame);
  }
}

// --- pattern content model ------------------------------------------------------
//
// Inside the MAIN editor a pattern instance is a CONTENT-EDITING surface
// (thoughts/012): only content-bearing blocks are surfaced —
// layout containers (tag-only fields) and invisible utility blocks (spacer,
// separator) stay out of sight, and a content block is the editable UNIT
// (no descending into a cover's innards). The full structure is Edit
// pattern's isolation editor's business.

/** One option button inside a rendered setting control. */
/** One color swatch: key = the STORED value (token key, "red-500"); css = the
 * token's raw value (fills the swatch). */
interface Swatch {
  key: string;
  css: string;
  label: string;
  pressed: boolean;
}

/** One palette family row for the grid form (big palettes: 22 families × 11). */
interface SwatchFamily {
  family: string;
  swatches: Swatch[];
}

/** A color control row (text / background / border color). Flat swatch row for
 * curated palettes; family grid when the palette is big. */
interface ColorRow {
  prop: string;
  label: string;
  contextLabel: string;
  value: string; // effective token key, "" = unset
  explicitValue: string;
  valueLabel: string;
  currentCss: string;
  inherited: boolean;
  inheritedLabel: string;
  empty: boolean;
  pickerOpen: boolean;
  popoverTop: string;
  popoverLeft: string;
  grid: boolean;
  swatches: Swatch[];
  families: SwatchFamily[];
}

/** A scale control row. Segmented toggle-group normally; a <select> when the
 * scale outgrows segments (the Tailwind default has 13 font sizes). */
interface ScaleRow {
  prop: string;
  kind: "";
  side: "";
  label: string;
  options: {
    key: string;
    label: string;
    value?: string;
    icon?: string;
    pressed: boolean;
    active: boolean;
  }[];
  isSelect: boolean;
  isRange: boolean;
  isSegmented: boolean;
  rangeIndex: number;
  rangeMax: number;
  thumbPosition: string;
  scaleIcon: string;
  scaleIcons: string[];
  hasScaleIcon: boolean;
  value: string; // effective value; "" = unset
  explicitValue: string;
  valueLabel: string;
  emptyLabel: string;
  inherited: boolean;
  inheritedLabel: string;
  allowCustom: boolean;
  showCustomDisclosure: boolean;
  customOpen: boolean;
  customParsed: boolean;
  customNumber: string;
  customUnit: BoxSpacingUnit;
  customMin: number;
  customMax: number;
  customStep: number;
  customRangeValue: number;
  customTrackFill: string;
  customThumbPosition: string;
  responsive: boolean;
  responsiveSummary: string;
  responsiveChanges: string;
  responsiveRanges: ResponsiveValueRange[];
  responsivePoints: ResponsiveValuePoint[];
}

type BoxSpacingSide = "Top" | "Right" | "Bottom" | "Left";
type BoxSpacingKind = "padding" | "margin" | "border";
type BoxSpacingUnit = "px" | "%" | "em" | "rem" | "vw" | "vh";
type BorderRadiusCornerProp =
  | "borderTopLeftRadius"
  | "borderTopRightRadius"
  | "borderBottomRightRadius"
  | "borderBottomLeftRadius";
type BorderColorTier = "recommended" | "semantic" | "tokens" | "custom";

interface BoxSpacingRow {
  prop: string;
  kind: BoxSpacingKind;
  side: BoxSpacingSide;
  label: string;
  value: string;
  valueLabel: string;
  rangeIndex: number;
  rangeMax: number;
  snapped: boolean;
  thumbPosition: string;
  scaleIcon: string;
  scaleIcons: string[];
  hasScaleIcon: boolean;
  inherited: false;
  responsive: false;
  customOpen: boolean;
  customParsed: boolean;
  customNumber: string;
  customUnit: BoxSpacingUnit;
  customMin: number;
  customMax: number;
  customStep: number;
  customRangeValue: number;
  customTrackFill: string;
  customThumbPosition: string;
  options: { key: string; label: string; active: boolean }[];
}

interface OptionalStyleControl {
  prop: string;
  label: string;
  enabled: boolean;
}

/** One token row in the Design tab (E4). */
interface DesignRow {
  name: string; // full token name (text-lg)
  key: string; // the scale key (lg)
  value: string;
  isColor: boolean; // renders a swatch preview next to the value input
  previewValue: string;
}

/** One namespace section in the Design tab. */
interface DesignSection {
  ns: string;
  label: string;
  rows: DesignRow[];
  isPalette: boolean;
  isText: boolean;
  isWeight: boolean;
  isSpacing: boolean;
  isRadius: boolean;
  isLeading: boolean;
  isTracking: boolean;
}

interface DesignColorShadeRow {
  index: number;
  name: string;
  key: string;
  label: string;
  value: string;
}

interface DesignColorFamilyRow {
  id: string;
  key: string;
  label: string;
  namespace: "color" | "color-palette";
  sourceLabel: string;
  isRamp: boolean;
  shades: DesignColorShadeRow[];
  mainLabel: string;
  mainValue: string;
}

interface DesignColorShadeDraft {
  index: number;
  originalName: string;
  key: string;
  value: string;
}

/** A semantic color role in the full theme workspace. These are still regular
 * Tailwind `color-*` theme tokens; the richer row is a product/UI projection
 * over that portable document, not a second theme format. */
interface DesignSemanticRow {
  key: string;
  name: string;
  label: string;
  description: string;
  value: string;
  resolved: string;
  contextLabel: string;
  open: boolean;
  choices: {
    name: string;
    label: string;
    value: string;
    reference: string;
    selected: boolean;
  }[];
}

interface DesignColorContextRow {
  key: string;
  label: string;
  surfaceCss: string;
  selected: boolean;
  removable: boolean;
  removeLabel: string;
}

interface DesignPrimitiveRow {
  type: string;
  label: string;
  category: string;
  description: string;
  icon: string;
  letter: string;
  selected: boolean;
}

interface DesignGlyphRow {
  id: string;
  glyph: string;
  label: string;
  active: boolean;
}

interface DesignFontRow {
  name: string;
  label: string;
  value: string;
}

interface DesignBreakpointRow {
  key: StyleBreakpoint;
  label: string;
  token: string;
  width: string;
  numeric: number;
  device: ViewportDevice;
  mediaQuery: boolean;
  locked: boolean;
  dragLabel: string;
  removeLabel: string;
}

interface DesignBreakpointDeviceRow {
  key: ViewportDevice;
  label: string;
  icon: string;
  description: string;
  rows: DesignBreakpointRow[];
  adding: boolean;
}

interface DesignContainerWidthRow {
  key: "content" | "wide" | "gutter";
  label: string;
  token: string;
  width: string;
  numeric: number;
  rangeValue: number;
  min: number;
  max: number;
  step: number;
  description: string;
}

interface DesignTypographyDefaultRow {
  token: string;
  label: string;
  value: string;
  numeric: number;
  rangeValue: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  control: "font" | "size" | "lineHeight" | "weight" | "spacing";
  property: string;
  description: string;
}

interface DesignTypographyDefaultSection {
  key: "body" | "headings" | "spacing";
  label: string;
  description: string;
  rows: DesignTypographyDefaultRow[];
}

type DesignTypographyElement = "text" | "links" | "headings" | "captions" | "buttons";

interface DesignTypographyElementRow {
  key: DesignTypographyElement;
  label: string;
  sample: string;
  selected: boolean;
}

interface DesignTypographyChoiceRow {
  key: string;
  label: string;
  value: string;
  selected: boolean;
  fontFamily: string;
  fontWeight: string;
  fontSize: string;
  color: string;
}

interface PatternContextRow {
  key: string;
  label: string;
  surface: string;
  foreground: string;
  surfaceCss: string;
  foregroundCss: string;
  accentCss: string;
  pressed: boolean;
}

interface PatternSchemeRow extends PatternContextRow {
  default: boolean;
  disabled: boolean;
  enabled: boolean;
  availabilityShown: boolean;
  availabilityLabel: string;
  selectLabel: string;
  selectDisabled: boolean;
  statusLabel: string;
  statusShown: boolean;
}

interface SettingOptionRow {
  value: string;
  label: string;
  icon: string; // sprite ref ("#pbe-i-…") — "" renders the label as text
  pressed: boolean; // the block's current value — drives aria-pressed styling
}

interface ResponsiveValueRange {
  key: StyleBreakpoint;
  span: string;
  changed: boolean;
  resettable: boolean;
  resetDisabled: boolean;
  resetLabel: string;
  movable: boolean;
  index: string;
  minIndex: string;
  maxIndex: string;
  props: string;
  label: string;
  color: string;
}

interface ResponsiveValuePoint {
  key: StyleBreakpoint;
  pointKey: string;
  viewport: string;
  active: boolean;
  changed: boolean;
  movable: boolean;
  index: string;
  minIndex: string;
  maxIndex: string;
  props: string;
  label: string;
  color: string;
}

/** One sidebar setting: a registry SettingSpec joined with the selected block. */
interface SettingRow {
  key: string; // blockId:index — settings re-key when the selection moves
  id: string; // the block the control writes
  label: string; // accessible name (rendered as aria-label)
  mode: "field" | "transform" | "setting" | "style"; // which editor primitive the control calls
  field: string; // field name ("" unless field-bound)
  setting: string; // island setting name ("" unless island-bound)
  style: string; // universal style prop ("" unless style-bound)
  options: SettingOptionRow[]; // choice kinds ([] on the rest)
  value: string; // current value driving text/number inputs and the select ("" elsewhere)
  pressed: boolean; // toggle kind: the current boolean
  placeholder: string; // text kind ("" removes the attribute)
  min: number | null; // number kind — null removes the attribute
  max: number | null;
  step: number | null;
  error: string;
  invalid: boolean;
  // Template branch flags — data-p-show switches on booleans, not equality,
  // so the control kind is precomputed here (state stays dumb-template-ready).
  isChoice: boolean;
  isToggle: boolean;
  isSelect: boolean;
  isText: boolean;
  isNumber: boolean;
  isMedia: boolean;
  mediaSrc: string; // media kind: the carried src ("" = empty state)
  mediaAlt: string;
  hasMedia: boolean; // thumbnail + Replace/Remove vs the Add button
  showAdd: boolean; // empty AND uploads available (URL insertion lives in the canvas card)
  addLabel: string; // "Add image" — the empty-state sidebar affordance
  canUpload: boolean; // OPFS + service worker available
  section: string;
  sectionRole: string;
  sectionStyle: string;
  sectionKey: string;
  sectionExpanded: boolean;
  showSection: boolean;
  help: string;
  responsive: boolean;
  responsiveSummary: string;
  responsiveChanges: string;
  responsiveRanges: ResponsiveValueRange[];
  responsivePoints: ResponsiveValuePoint[];
}

interface BlockItem {
  type: string;
  label: string;
  icon: string; // sprite ref — "" falls back to the letter badge
  letter: string;
}

/** One patterns-tab group row (also the explorer's category list). */
interface PatternGroupRow {
  name: string;
  count: number;
  selected: boolean;
}

/** One pattern the previews render: name keys the card, label captions it. */
interface PatternItem {
  name: string;
  label: string;
}

interface DesignPatternItem extends PatternItem {
  category: string;
}

interface DesignPatternCategoryRow {
  name: string;
  count: number;
  selected: boolean;
}

/** One row of a pattern instance's Content outline (its direct blocks). */
interface PatternContentRow {
  id: string;
  icon: string; // sprite ref — "" falls back to the letter badge
  letter: string;
  label: string;
  anchor: string; // content preview (heading text)
  selected: boolean; // the unit holding the canvas selection/caret
}

/** One outline row: a heading anywhere in the document, level-indented. */
interface OutlineRow {
  id: string;
  level: string; // chip text: H1…H6
  guide: string; // indent-guide width — proportional to the heading level
  text: string;
  empty: boolean; // "(Empty heading)" — italic text
  badLevel: boolean; // skipped a level vs the previous heading — "(Incorrect heading level)" note
  flagged: boolean; // empty ∨ badLevel — the chip goes amber
}

/** One list-view row: the recursive block tree flattened for data-p-for. */
interface TreeRow {
  id: string;
  depth: number;
  pad: string; // depth as padding — recursion lives in state, not templates
  icon: string; // sprite ref — "" falls back to the letter badge
  letter: string;
  label: string;
  anchor: string; // content preview (heading text)
  container: boolean; // Group explicitly marked as a semantic container
  pattern: boolean;
  templatePart: boolean;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  movable: boolean;
  draggable: "true" | "false";
}

interface DocumentTemplateSlotRow {
  id: string;
  name: string;
  label: string;
  icon: string;
  selected: boolean;
}

interface DocumentTemplateNode {
  id: string;
  kind: "part" | "slot";
  name: string;
  label: string;
  icon: string;
  templatePart: boolean;
}

const colorRolesBySpecificity = (theme: Theme = activeTheme()) =>
  semanticColorRoles(theme).sort((a, b) => b.key.length - a.key.length);

function colorContextKey(value: string): string | null {
  const role = colorRolesBySpecificity().find(
    (candidate) => value === candidate.key || value.endsWith(`-${candidate.key}`),
  );
  if (!role) return null;
  return value === role.key ? "default" : value.slice(0, -(role.key.length + 1));
}

function colorRoleKey(value: string): string | null {
  return (
    colorRolesBySpecificity().find(
      (candidate) => value === candidate.key || value.endsWith(`-${candidate.key}`),
    )?.key ?? null
  );
}

function colorContextLabel(key: string, theme: Theme = activeTheme()): string {
  return (
    colorContexts(theme).find((context) => context.key === key)?.label ??
    key
      .split("-")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function themeColorContexts(theme: Theme): PatternContextRow[] {
  return colorContexts(theme).flatMap((context) => {
    const prefix = context.key === "default" ? "" : `${context.key}-`;
    const surface = `${prefix}surface`;
    const foreground = `${prefix}foreground`;
    const accent = `${prefix}accent-surface`;
    const resolvedColor = (name: string) => {
      const value = tokenValue(theme, name);
      return value ? resolveThemeValue(theme, value) : undefined;
    };
    const surfaceCss = resolvedColor(`color-${surface}`);
    const foregroundCss = resolvedColor(`color-${foreground}`);
    const accentCss = resolvedColor(`color-${accent}`);
    return surfaceCss && foregroundCss && accentCss
      ? [
          {
            key: context.key,
            label: context.label,
            surface,
            foreground,
            pressed: false,
            surfaceCss,
            foregroundCss,
            accentCss,
          },
        ]
      : [];
  });
}

// --- the dropdown behavior: a host-registered PublrJS store ------------------
//
// The dropdown MARKUP (data-p-store="local:dropdown" + data-p-on/-show/-bind/
// -portal + data-publr-part) is the whole component contract; the core
// framework wires it, and this factory supplies the actions the attributes
// name. No design-system assets needed — core publr.js + publr-position.js
// (both already vendored) carry everything.

Publr.store("dropdown", () => {
  const state = Publr.reactive({ open: false });
  let root: HTMLElement | null = null;
  let content: HTMLElement | null = null;
  let anchor: HTMLElement | null = null;
  let detachDismiss: (() => void) | null = null;

  const items = (): HTMLButtonElement[] =>
    content
      ? [...content.querySelectorAll<HTMLButtonElement>('[data-publr-part="item"]')].filter(
          (el) =>
            !el.disabled &&
            !el.hidden &&
            !el.classList.contains("hidden") &&
            el.getAttribute("aria-disabled") !== "true",
        )
      : [];

  const focusItem = (list: HTMLButtonElement[], i: number) => {
    list.forEach((el, j) => (el.tabIndex = j === i ? 0 : -1));
    list[i]?.focus();
  };

  return {
    state,
    actions: {
      toggle: () => (state.open = !state.open),
      toggleFromViewport: (_d: Dataset, ctx: { event: Event }) => {
        // This runs before the chrome action changes device state, so the
        // presence flag describes the click's starting state: first click
        // selects, subsequent clicks toggle that device's menu.
        anchor = ctx.event.currentTarget as HTMLElement;
        state.open =
          anchor.hasAttribute("data-selected") && anchor.hasAttribute("data-multiple")
            ? !state.open
            : false;
      },
      openMenu: (_d: unknown, ctx: { event: Event }) => {
        ctx.event.preventDefault();
        state.open = true;
      },
      close: () => (state.open = false),
      navKeys: (_d: unknown, ctx: { event: KeyboardEvent }) => {
        const e = ctx.event;
        const list = items();
        if (!list.length) return;
        const cur = list.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          focusItem(list, cur < list.length - 1 ? cur + 1 : 0);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          focusItem(list, cur > 0 ? cur - 1 : list.length - 1);
        } else if (e.key === "Home") {
          e.preventDefault();
          focusItem(list, 0);
        } else if (e.key === "End") {
          e.preventDefault();
          focusItem(list, list.length - 1);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (cur >= 0) {
            list[cur].click();
            state.open = false;
          }
        } else if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          state.open = false;
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const m = list.find((it) =>
            it.textContent?.trim().toLowerCase().startsWith(e.key.toLowerCase()),
          );
          if (m) focusItem(list, list.indexOf(m));
        }
      },
      itemClick: (_d: unknown, ctx: { event: Event }) => {
        const target = ctx.event.target;
        const item =
          target instanceof Element
            ? target.closest<HTMLButtonElement>('[data-publr-part="item"]')
            : null;
        if (item && !item.disabled && item.getAttribute("aria-disabled") !== "true")
          state.open = false;
      },
    },
    setup: ({ el }: { el: HTMLElement }) => {
      root = el;
      content = el.querySelector<HTMLElement>('[data-publr-part="content"]');
      Publr.effect(() => {
        if (state.open) {
          // Portals leave #editor-shell, so they also leave its appearance
          // token scope. Rehydrate the floating surface from its trigger
          // before positioning it; host/site colors must never become the
          // editor menu's theme.
          const shellSurface = root?.closest<HTMLElement>("#editor-shell") ?? null;
          if (content && shellSurface) {
            copyComputedCustomProperties(shellSurface, content);
            copyShellChromeTokens(shellSurface, content);
            content.classList.toggle("dark", shellSurface.classList.contains("dark"));
          }
          requestAnimationFrame(() => {
            if (!state.open || !content || !root) return;
            position(content, anchor ?? root, {
              placement: content.getAttribute("data-publr-placement") || "bottom-start",
              offset: 8,
            });
            // panels with a search field autofocus it; menus focus the first item
            const auto = content.querySelector<HTMLElement>("[data-publr-autofocus]");
            if (auto) auto.focus();
            else {
              const list = items();
              if (list.length) focusItem(list, 0);
            }
          });
          if (!detachDismiss) {
            const onDown = (ev: MouseEvent) => {
              if (
                !(ev.target instanceof Node) ||
                (!root?.contains(ev.target) && !content?.contains(ev.target))
              )
                state.open = false;
            };
            document.addEventListener("mousedown", onDown, true);
            detachDismiss = () => document.removeEventListener("mousedown", onDown, true);
          }
        } else {
          detachDismiss?.();
          detachDismiss = null;
        }
      });
    },
  };
});

// --- the chrome store: the entire harness as one reactive island -------------
//
// State is the single source of truth for everything the shell shows; the
// markup in index.html binds to it. Actions are what the markup can DO. The
// setup() bridges the editor's own reactive stores (history, selection) and
// its onChange into chrome state, and measures canvas geometry — the one
// place where imperative DOM reads are the point.

Publr.store("chrome", () => {
  const initialDocument = shellOptions?.document;
  const initialDocumentTemplate = initialDocument?.template
    ? getTemplate(initialDocument.template.name)
    : undefined;
  const initialFeaturedImage = initialDocument?.featuredImage;
  const initialDocumentActions = initialDocument?.actions;
  const state = Publr.reactive({
    // top bar (undo/redo state is NOT here — that's core: markup binds to the
    // shared "editor" store's history.canUndo/canRedo directly)
    inserterOpen: false,
    // wire-output panes (behind the ⋮ menu; the item label is a conditional
    // literal in the markup — $outputShown->'Hide…'~'Show…')
    outputShown: false,
    wireEditing: "",
    wireData: "",
    // sidebar
    sidebarOpen: true,
    sidebarTab: "document",
    blockSelected: false,
    blockLabel: "",
    blockIcon: "",
    blockLetter: "",
    blockDescription: "",
    blockHeaderSettings: [] as SettingRow[],
    blockSettings: [] as SettingRow[],
    blockInspectorTab: "settings",
    blockHasStyles: false,
    settingSectionOpen: {} as Record<string, boolean>,
    settingErrors: {} as Record<string, string>,
    // media rows with an adapter upload/browse in flight (key = row key,
    // value = spinner label) — the row swaps its actions for a spinner
    mediaBusy: {} as Record<string, string>,
    // Host-owned document metadata. It is intentionally parallel to the
    // block inspector: title/featured image never enter the block model.
    documentShown: !!initialDocument,
    documentTitle: initialDocument?.title ?? "",
    documentTemplateShown: !!initialDocumentTemplate,
    documentTemplateName: initialDocument?.template?.name ?? "",
    documentTemplateLabel: initialDocumentTemplate?.label ?? "",
    documentTemplateDescription: initialDocumentTemplate?.description ?? "",
    documentTemplateVisible: !!initialDocumentTemplate,
    documentTemplateSlots: [] as DocumentTemplateSlotRow[],
    documentTemplateSlotsShown: false,
    selectedTemplateNodeId: "",
    siteDesignSaving: false,
    siteDesignStatus: "Saved locally",
    siteDesignPublishLabel: "Publish theme",
    siteDesignCanReset: !!shellOptions?.resetSiteDesign,
    documentHasActions: !!(
      initialDocumentActions?.view ||
      initialDocumentActions?.rename ||
      initialDocumentActions?.setAsHomepage ||
      initialDocumentActions?.trash
    ),
    documentCanView: !!initialDocumentActions?.view,
    documentCanRename: !!initialDocumentActions?.rename,
    documentCanSetHomepage: !!initialDocumentActions?.setAsHomepage,
    documentCanTrash: !!initialDocumentActions?.trash,
    documentFeaturedImageId: initialFeaturedImage?.id ?? "",
    documentFeaturedImageSrc: initialFeaturedImage?.src ?? "",
    documentFeaturedImageAlt: initialFeaturedImage?.alt ?? "",
    documentFeaturedImageWidth: initialFeaturedImage?.width ?? "",
    documentFeaturedImageHeight: initialFeaturedImage?.height ?? "",
    documentHasFeaturedImage: !!initialFeaturedImage?.src,
    documentFeaturedButtonLabel: initialFeaturedImage?.src
      ? "Replace featured image"
      : "Set featured image",
    documentFeaturedBusy: false,
    documentFeaturedBusyLabel: "",
    documentFeaturedError: "",
    documentFeaturedUrlOpen: false,
    documentCanUpload: mediaAdapter.uploadAvailable(),
    documentCanBrowse: !!mediaAdapter.browse,
    documentRenameOpen: false,
    documentRenameDraft: initialDocument?.title ?? "",
    documentRenameBusy: false,
    documentRenameError: "",
    styleHasValues: false,
    styleBreakpoint: "base" as StyleBreakpoint,
    canvasViewportMode: "full" as ViewportMode,
    canvasViewportFull: true,
    canvasViewportFit: false,
    canvasResponsiveCompare: false,
    canvasViewportScale: 1,
    canvasViewportZoom: "1",
    canvasViewportHeight: "100%",
    canvasViewportLabel: "Full canvas",
    styleBreakpointLabel: "Mobile",
    canvasViewportWidth: "100%",
    canvasViewportPixelWidth: 0,
    canvasViewportCustomWidth: null as number | null,
    canvasViewportResizing: false,
    canvasViewportResizeLabel: "Resize canvas",
    styleViewportDevices: viewportSelectorDevices(null),
    styleViewportMenuLabel: "Desktop breakpoints",
    styleViewportMenuEndpoints: [] as {
      key: StyleBreakpoint;
      label: string;
      viewport: string;
      pressed: boolean;
      hasValue: boolean;
    }[],
    styleResponsiveAvailable: true,
    styleOptionalOpen: false,
    styleOptional: {} as Record<string, boolean>,
    styleSidesLinked: {} as Record<string, boolean>,
    optionalStyleControls: [] as OptionalStyleControl[],
    // Universal STYLE controls (Phase C / E1) — shown per the block's
    // `supports`, disabled when policy isn't `stylable`. Options DERIVE from
    // the site THEME (src/theme.ts) — no hardcoded scales. Values are
    // Tailwind-native token keys ("lg", "red-500", spacing names "medium"). Scales
    // adapt: ordered token scales render as discrete rails, categorical
    // choices render segmented or as a select, and big palettes use a grid.
    styleFontSizeShown: false,
    styleDisabled: false,
    fontSizeOptions: [] as { key: string; label: string; pressed: boolean }[],
    fontSizeIsSelect: false,
    fontSizeValue: "", // select binding; "" = unset
    fontSizeValueLabel: "Default",
    fontSizeInherited: false,
    fontSizeInheritedLabel: "",
    // Style variations (C6): the "Styles" panel — named class-sets.
    variationOptions: [] as { name: string; label: string; pressed: boolean }[],
    // Color (C2): text/background rows. Swatch key = the stored value
    // (token key, e.g. "red-500"); css = the token's raw value (the fill).
    colorRows: [] as ColorRow[],
    colorPickerOpen: "",
    colorPopoverTop: "0px",
    colorPopoverLeft: "0px",
    // Dimensions (C3): padding/margin rows over the active theme's spacing scale.
    dimensionRows: [] as ScaleRow[],
    dimensionPanelShown: false,
    spacingBoxShown: false,
    boxResponsive: false,
    boxResponsiveSummary: "",
    boxResponsiveChanges: "",
    boxResponsiveRanges: [] as ResponsiveValueRange[],
    boxResponsivePoints: [] as ResponsiveValuePoint[],
    textSpacingResetShown: false,
    boxPaddingShown: false,
    boxMarginShown: false,
    boxBorderShown: false,
    boxPaddingTop: "",
    boxPaddingRight: "",
    boxPaddingBottom: "",
    boxPaddingLeft: "",
    boxMarginTop: "",
    boxMarginRight: "",
    boxMarginBottom: "",
    boxMarginLeft: "",
    boxBorderTop: "",
    boxBorderRight: "",
    boxBorderBottom: "",
    boxBorderLeft: "",
    boxBorderRadiusTopLeft: "",
    boxBorderRadiusTopRight: "",
    boxBorderRadiusBottomRight: "",
    boxBorderRadiusBottomLeft: "",
    boxSpacingOptions: [] as { key: string; label: string; value: string }[],
    boxEditorOpen: false,
    boxEditorTargetId: "",
    boxEditorPopoverTop: "0px",
    boxEditorPopoverLeft: "0px",
    boxEditorTitle: "Padding",
    boxEditorSourceLabel: "Top",
    boxEditorSyncShown: true,
    boxEditorRadiusSyncShown: false,
    boxEditorMultipleRows: false,
    boxEditorBorderColorShown: false,
    boxEditorSelectedSides: ["Top"] as BoxSpacingSide[],
    boxEditorSelectionIcon: iconRef("spacing-sides-top"),
    boxEditorSelectionIcons: [iconRef("spacing-sides-top")],
    boxEditorPairLabel: "Sync top and bottom",
    boxEditorPairIcon: iconRef("spacing-sync-top-bottom"),
    boxEditorPairPressed: false,
    boxEditorAllPressed: false,
    boxEditorRadiusAllPressed: false,
    boxEditorCustomOpen: false,
    boxEditorCustomNumber: "0",
    boxEditorCustomUnit: "px" as BoxSpacingUnit,
    boxEditorCustomMin: 0,
    boxEditorCustomMax: 300,
    boxEditorCustomStep: 1,
    boxEditorCustomRangeValue: 0,
    boxEditorCustomTrackFill: "0%",
    boxEditorRows: [] as BoxSpacingRow[],
    boxEditorRadiusRows: [] as BoxSpacingRow[],
    boxEditorRadiusShown: false,
    boxEditorRadiusOnly: false,
    boxEditorSelectedCorners: ["borderTopLeftRadius"] as BorderRadiusCornerProp[],
    boxTargetPaddingTop: false,
    boxTargetPaddingRight: false,
    boxTargetPaddingBottom: false,
    boxTargetPaddingLeft: false,
    boxTargetPaddingAll: false,
    boxTargetMarginTop: false,
    boxTargetMarginRight: false,
    boxTargetMarginBottom: false,
    boxTargetMarginLeft: false,
    boxTargetMarginAll: false,
    boxTargetBorderTop: false,
    boxTargetBorderRight: false,
    boxTargetBorderBottom: false,
    boxTargetBorderLeft: false,
    boxTargetBorderAll: false,
    boxTargetRadiusTopLeft: false,
    boxTargetRadiusTopRight: false,
    boxTargetRadiusBottomRight: false,
    boxTargetRadiusBottomLeft: false,
    boxBorderRadiusShown: false,
    boxActiveKind: "padding",
    boxActiveSide: "Top",
    boxActiveKey: "padding-Top",
    boxActiveLabel: "Padding top",
    boxActiveValue: "",
    paddingLinkAvailable: false,
    paddingSidesLinked: true,
    paddingSidesLabel: "Separate sides",
    marginLinkAvailable: false,
    marginSidesLinked: true,
    marginSidesLabel: "Separate sides",
    borderSidesLabel: "Edit border properties",
    layoutRows: [] as ScaleRow[],
    tokenScaleCustom: {} as Record<string, boolean>,
    // Border (C4): width + radius scale rows + a border-color swatch row.
    borderShown: false,
    borderWidthRows: [] as ScaleRow[],
    borderRadiusRows: [] as ScaleRow[],
    borderStyleOptions: [] as {
      key: string;
      label: string;
      pressed: boolean;
    }[],
    borderColorShown: false,
    borderColorTier: "recommended" as BorderColorTier,
    borderColorTierRecommended: true,
    borderColorTierSemantic: false,
    borderColorTierTokens: false,
    borderColorTierCustom: false,
    borderColorChoicesShown: true,
    borderColorCustomValue: "#000000",
    borderColorCustomText: "",
    borderColorGrid: false,
    borderColorValue: "",
    borderColorSwatches: [] as Swatch[],
    borderColorFamilies: [] as SwatchFamily[],
    // Typography extras (C5): line-height / letter-spacing / decoration / case.
    typographyRows: [] as ScaleRow[],
    // Unresolved utility chips (E4): utility-shaped classes on the selected
    // block whose token the theme lacks — claimed at the panel level; the
    // Define… click jumps to the Design tab prefilled.
    unresolvedChips: [] as {
      cls: string;
      suffix: string;
      ns: string;
      label: string;
    }[],
    // CSS engine status (E3) + the Design tab (E4).
    engineActive: false,
    engineLabel: "probing…",
    designModeActive: false,
    designWorkspaceOpen: false,
    designWorkspacePage: "foundations",
    designWorkspaceHome: true,
    designWorkspaceSidebarShown: false,
    designPrimitiveEditing: false,
    designPrimitiveItems: [] as DesignPrimitiveRow[],
    designPrimitiveType: "paragraph",
    designPrimitiveLabel: "Paragraph",
    designPrimitiveDescription: "",
    designPrimitiveStatus: "Live draft",
    designPrimitiveToast: "",
    designPreviewContext: "default",
    designPreviewContextLabel: "Default",
    designColorContexts: [] as DesignColorContextRow[],
    designSemanticRoleSummary: "9 semantic roles",
    designContextSummary: "1 color context",
    designContextListSummary: "Default",
    designContextFormOpen: false,
    designRoleFormOpen: false,
    designColorDefinitionError: "",
    designSemanticRows: [] as DesignSemanticRow[],
    designSemanticOpen: "",
    designPreviewSurface: "#ffffff",
    designPreviewForeground: "#18181b",
    designPreviewMuted: "#f4f4f5",
    designPreviewMutedForeground: "#3f3f46",
    designPreviewMutedBorder: "#d4d4d8",
    designPreviewAccent: "#3858e9",
    designPreviewAccentForeground: "#ffffff",
    designPreviewAccentBorder: "#2947ce",
    designPreviewBorder: "#e4e4e7",
    designPreviewFont: "ui-sans-serif, system-ui, sans-serif",
    designAiStatus: "",
    designAssetManagerOpen: false,
    designFontFormOpen: false,
    designAssetGlyphs: [] as string[],
    designAssetCatalog: [
      { id: "external", glyph: "↗", label: "External link", active: true },
      { id: "arrow-right", glyph: "→", label: "Arrow right", active: true },
      { id: "arrow-left", glyph: "←", label: "Arrow left", active: true },
      { id: "plus", glyph: "＋", label: "Plus", active: true },
      { id: "minus", glyph: "−", label: "Minus", active: true },
      { id: "check", glyph: "✓", label: "Check", active: true },
      { id: "diamond", glyph: "◇", label: "Diamond", active: true },
      { id: "circle", glyph: "○", label: "Circle", active: true },
      { id: "activity", glyph: "⌁", label: "Activity", active: true },
      { id: "search", glyph: "⌕", label: "Search", active: true },
      { id: "home", glyph: "⌂", label: "Home", active: true },
      { id: "sun", glyph: "☼", label: "Sun", active: true },
      { id: "loader", glyph: "◌", label: "Loader", active: true },
      { id: "refresh", glyph: "↻", label: "Refresh", active: true },
      { id: "command", glyph: "⌘", label: "Command", active: true },
      { id: "spark", glyph: "✦", label: "Spark", active: true },
    ] as DesignGlyphRow[],
    designFontRows: [] as DesignFontRow[],
    designBreakpointDevices: [] as DesignBreakpointDeviceRow[],
    designBreakpointAdding: "" as "" | ViewportDevice,
    designDraggedBreakpoint: "",
    designBreakpointError: "",
    designBreakpointOrderValid: true,
    designContainerWidths: [] as DesignContainerWidthRow[],
    designContainerError: "",
    designTypographyDefaults: [] as DesignTypographyDefaultSection[],
    designTypographyError: "",
    designTypographyElement: "text" as DesignTypographyElement,
    designTypographyElements: [] as DesignTypographyElementRow[],
    designTypographyHeadingLevel: "h1",
    designTypographyHeadingLevels: [] as {
      key: string;
      label: string;
      selected: boolean;
    }[],
    designTypographyFontToken: "",
    designTypographyWeightToken: "",
    designTypographySizeToken: "",
    designTypographyLineHeightToken: "",
    designTypographyLetterSpacingToken: "",
    designTypographyTransformToken: "",
    designTypographyColorToken: "",
    designTypographyDecorationToken: "",
    designTypographyFontOptions: [] as DesignTypographyChoiceRow[],
    designTypographyWeightOptions: [] as DesignTypographyChoiceRow[],
    designTypographySizeOptions: [] as DesignTypographyChoiceRow[],
    designTypographyCaseOptions: [] as DesignTypographyChoiceRow[],
    designTypographyColorOptions: [] as DesignTypographyChoiceRow[],
    designTypographyDecorationOptions: [] as DesignTypographyChoiceRow[],
    designTypographyLineHeightValue: "1.6",
    designTypographyLetterSpacingValue: "0",
    designTypographyLetterSpacingUnit: "em",
    designTypographyDecorationShown: false,
    designTypeBodyFontFamily: "",
    designTypeBodyFontSize: "",
    designTypeBodyLineHeight: "",
    designTypeParagraphSpacing: "",
    designTypeHeadingFontFamily: "",
    designTypeHeadingFontWeight: "",
    designTypeHeadingLineHeight: "",
    designTypeHeadingSpacingBefore: "",
    designTypeHeadingSpacingAfter: "",
    designTypeHeading1Size: "",
    designTypeHeading2Size: "",
    designTypeHeading3Size: "",
    designTypeHeading4Size: "",
    designTypeListSpacing: "",
    designTypeListItemSpacing: "",
    designTypeDefinitionListSpacing: "",
    designTypeDefinitionTermSpacing: "",
    designTypeDefinitionDescriptionSpacing: "",
    designTypeDefinitionTermWeight: "",
    designTypeBlockquoteSpacing: "",
    designTypeRuleSpacing: "",
    designPatternItems: [] as DesignPatternItem[],
    designPatternCategory: "All",
    designPatternCategories: [] as DesignPatternCategoryRow[],
    designSections: [] as DesignSection[],
    designScaleSections: [] as DesignSection[],
    designColorFamilies: [] as DesignColorFamilyRow[],
    designColorFamilyOpen: false,
    designColorFamilyId: "",
    designColorFamilyNamespace: "color-palette" as "color" | "color-palette",
    designColorFamilyName: "",
    designColorFamilyOriginalNames: [] as string[],
    designColorFamilyShades: [] as DesignColorShadeDraft[],
    designColorFamilyMainLabel: "",
    designColorFamilyMainValue: "#000000",
    designColorFamilyError: "",
    designSpacing: "",
    designTokenTransferShown: false,
    designTokenLibraryShown: false,
    designExport: "",
    designImportError: "",
    designImportStatus: "",
    defineShown: false,
    defineName: "",
    cssImportShown: false, // E5: engine.classesFromCss present
    cssImportResult: "",
    blockIsPattern: false, // pattern instance selected → pattern card + Edit pattern
    blockIsTemplatePart: false,
    blockTemplatePartName: "",
    blockTemplatePartLabel: "",
    blockIsContainer: false,
    blockPattern: "", // its definition name
    blockPatternRoot: "", // the instance root id (inner selections remap here)
    blockPatternContent: [] as PatternContentRow[], // the copy's CONTENT blocks (Content outline)
    blockPatternContexts: [] as PatternContextRow[],
    blockPatternContextShown: false,
    blockPatternActiveContext: "default",
    patternColorSchemesShown: false,
    patternStyleSelectorShown: false,
    patternColorSchemes: [] as PatternSchemeRow[],
    patternDefaultColorContext: "default",
    patternDisabledColorContexts: [] as string[],
    patternLegacyColorContexts: [] as string[],
    patternDefinitionMode: false,
    patternSchemeTitle: "Default pattern style",
    patternSchemeNote: "",
    patternOverviewRows: [] as TreeRow[],
    // isolation editing modes: the page document parks, the SAME full editor
    // takes the isolated content. "definition" = library edit (Save =
    // versioned publish); "instance" = a placed copy's Edit pattern (Save =
    // apply to that copy only). thoughts/012.
    templateMode: false as
      | false
      | "definition"
      | "instance"
      | "primitive"
      | "page-template"
      | "template-part",
    templateLabel: "",
    templateIsInstance: false, // scope copy + save label switch on this
    templateIsPrimitive: false,
    templateIsPattern: false, // patterns use the blue isolation identity
    templateCanvasShown: false, // patterns/template parts use a centered sheet on the gray stage
    templateChromeShown: false, // topbar morphs into the isolation scope (Cancel/commit)
    templateLead: "Editing pattern:",
    templateHelp: "",
    templateSaveLabel: "Publish pattern",
    templateError: "",
    isolationBreadcrumbsShown: false,
    isolationBreadcrumbs: [] as IsolationBreadcrumb[],
    emptyNote: "No block selected.",
    breadcrumb: "Document",
    // list view (left rail, exclusive with the inserter)
    docEpoch: 0, // bumped by onChange — the model's change signal FOR EFFECTS (the model itself is not reactive)
    treeOpen: false,
    treeTab: "list",
    treeRows: [] as TreeRow[],
    // containers (patterns included) are COLLAPSED by default — a row is
    // open only after an explicit toggle or a selection-reveal
    treeExpanded: {} as Record<string, boolean>,
    // outline tab: document stats + heading outline
    outlineRows: [] as OutlineRow[],
    outlineEmpty: true,
    docChars: "0",
    docWords: "0",
    docReadTime: "< 1 minute",
    // block library (left rail)
    inserterTab: "blocks",
    query: "",
    libraryEpoch: 0, // bumped on open → shelves re-derive from the live registry
    shelves: [] as { name: string; blocks: BlockItem[] }[],
    noResults: false,
    // patterns tab (left rail): group list → flyout preview pane; the
    // explorer dialog is the full-library escalation
    patternQuery: "",
    patternGroup: "", // "" = no group selected (flyout closed unless searching)
    patternGroups: [] as PatternGroupRow[],
    patternFlyoutOpen: false,
    patternFlyoutTitle: "",
    patternItems: [] as PatternItem[],
    patternNoResults: false,
    explorerOpen: false,
    explorerQuery: "",
    explorerGroup: "All",
    explorerGroups: [] as PatternGroupRow[],
    explorerItems: [] as PatternItem[],
    explorerNoResults: false,
  });

  // Wired by setup(); the actions close over them.
  let editor: ReturnType<typeof createEditor>;
  let canvasEl: HTMLElement;
  let wrapEl: HTMLElement;
  let canvasFrame: HTMLIFrameElement;
  let canvasDocument: Document;
  let responsiveContainerStyle: HTMLStyleElement;
  let templateNodeToolbar: HTMLElement | null = null;
  let editorContentEl: HTMLElement;
  let responsiveDeckEl: HTMLElement;
  let responsiveCanonicalSurface: HTMLElement;
  const responsivePreviewSurfaces = new Map<
    StyleBreakpoint,
    {
      surface: HTMLElement;
      viewport: HTMLElement;
      frame: HTMLIFrameElement;
    }
  >();
  let viewportFitObserver: ResizeObserver | null = null;
  let isolationCanvasObserver: ResizeObserver | null = null;
  let inserterAnchorId: string | null = null;
  let inserterPlacement: InlineInsertionPlacement | null = null;
  let primitiveType: string | null = null;
  let boxLayerPreview: HTMLElement | null = null;
  const primitiveDrafts = new Map<string, string>(
    Object.entries(shellOptions?.theme?.blockDefaults ?? {}),
  );
  let primitiveToastTimer: ReturnType<typeof setTimeout> | null = null;
  let returnToDesignWorkspace: "components" | "patterns" | null = null;
  let variationPreview: HTMLElement | null = null;
  let shellRootEl: HTMLElement | null = null;
  let boxEditorAnchorTop = 12;
  let boxEditorAnchorLeft = 12;
  let boxEditorPositionFrame = 0;
  let responsiveBoundaryClickSuppressedUntil = 0;
  let cancelResponsiveBoundaryDrag: (() => void) | null = null;
  const viewportDeviceSelections: Partial<Record<ViewportDevice, StyleBreakpoint>> = {};

  const clearVariationPreview = (): void => {
    if (!variationPreview) return;
    variationPreview.remove();
    variationPreview = null;
  };

  const clearBoxLayerPreview = (): void => {
    boxLayerPreview?.remove();
    boxLayerPreview = null;
  };

  const showBoxLayerPreview = (kind: BoxSpacingKind): void => {
    clearBoxLayerPreview();
    const id = panelTarget();
    const target = id
      ? canvasDocument?.querySelector<HTMLElement>(`[data-pb-id="${CSS.escape(id)}"]`)
      : null;
    const view = canvasDocument?.defaultView;
    if (!target || !view) return;

    const rect = target.getBoundingClientRect();
    const style = view.getComputedStyle(target);
    const px = (value: string): number => Math.max(0, Number.parseFloat(value) || 0);
    const border = {
      top: px(style.borderTopWidth),
      right: px(style.borderRightWidth),
      bottom: px(style.borderBottomWidth),
      left: px(style.borderLeftWidth),
    };
    const padding = {
      top: px(style.paddingTop),
      right: px(style.paddingRight),
      bottom: px(style.paddingBottom),
      left: px(style.paddingLeft),
    };
    const margin = {
      top: px(style.marginTop),
      right: px(style.marginRight),
      bottom: px(style.marginBottom),
      left: px(style.marginLeft),
    };
    const layerSizes = kind === "margin" ? margin : kind === "padding" ? padding : border;
    if (Object.values(layerSizes).every((value) => value <= 0)) return;

    const outer =
      kind === "margin"
        ? {
            top: rect.top - margin.top,
            right: rect.right + margin.right,
            bottom: rect.bottom + margin.bottom,
            left: rect.left - margin.left,
          }
        : kind === "padding"
          ? {
              top: rect.top + border.top,
              right: rect.right - border.right,
              bottom: rect.bottom - border.bottom,
              left: rect.left + border.left,
            }
          : { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    const inner =
      kind === "margin"
        ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }
        : kind === "padding"
          ? {
              top: outer.top + padding.top,
              right: outer.right - padding.right,
              bottom: outer.bottom - padding.bottom,
              left: outer.left + padding.left,
            }
          : {
              top: outer.top + border.top,
              right: outer.right - border.right,
              bottom: outer.bottom - border.bottom,
              left: outer.left + border.left,
            };

    const root = canvasDocument.createElement("div");
    root.className = "pbe-box-layer-preview";
    root.dataset.pbeBoxLayerPreview = kind;
    root.setAttribute("aria-hidden", "true");
    const place = (
      side: BoxSpacingSide,
      left: number,
      top: number,
      width: number,
      height: number,
    ): void => {
      if (width <= 0 || height <= 0) return;
      const part = canvasDocument.createElement("span");
      part.className = "pbe-box-layer-preview__part";
      part.dataset.side = side.toLowerCase();
      part.style.left = `${left}px`;
      part.style.top = `${top}px`;
      part.style.width = `${width}px`;
      part.style.height = `${height}px`;
      root.appendChild(part);
    };
    const topSize = Math.max(0, inner.top - outer.top);
    const rightSize = Math.max(0, outer.right - inner.right);
    const bottomSize = Math.max(0, outer.bottom - inner.bottom);
    const leftSize = Math.max(0, inner.left - outer.left);
    place("Top", outer.left, outer.top, outer.right - outer.left, topSize);
    place("Right", outer.right - rightSize, outer.top, rightSize, outer.bottom - outer.top);
    place("Bottom", outer.left, outer.bottom - bottomSize, outer.right - outer.left, bottomSize);
    place("Left", outer.left, outer.top, leftSize, outer.bottom - outer.top);
    canvasDocument.body.appendChild(root);
    boxLayerPreview = root;
  };

  const syncIsolationCanvasHeight = () => {
    if (!state.templateCanvasShown || state.canvasResponsiveCompare || !canvasEl) return;
    const height = `${Math.max(1, Math.ceil(canvasEl.scrollHeight))}px`;
    if (state.canvasViewportHeight !== height) state.canvasViewportHeight = height;
  };

  const activeStyleBreakpoint = (): StyleBreakpoint => {
    const breakpoints = styleBreakpoints();
    return breakpoints.some((breakpoint) => breakpoint.key === state.styleBreakpoint)
      ? state.styleBreakpoint
      : breakpoints[0].key;
  };
  const syncCanvasViewportFit = () => {
    if (
      state.canvasResponsiveCompare &&
      !state.canvasViewportFull &&
      state.canvasViewportPixelWidth &&
      editorContentEl
    ) {
      const scale = responsivePreviewScale(state.canvasViewportPixelWidth);
      state.canvasViewportScale = scale;
      state.canvasViewportZoom = String(scale);
      const visualHeight = Math.max(420, editorContentEl.clientHeight - 122);
      state.canvasViewportHeight = `${Math.max(1, Math.round(visualHeight / scale))}px`;
      return;
    }
    if (
      !state.canvasViewportFit ||
      state.canvasViewportFull ||
      !state.canvasViewportPixelWidth ||
      !editorContentEl
    ) {
      state.canvasViewportScale = 1;
      state.canvasViewportZoom = "1";
      if (state.templateCanvasShown) requestAnimationFrame(syncIsolationCanvasHeight);
      else state.canvasViewportHeight = "100%";
      return;
    }
    const style = getComputedStyle(editorContentEl);
    const horizontalPadding =
      (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    const verticalPadding =
      (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    const availableWidth = Math.max(1, editorContentEl.clientWidth - horizontalPadding);
    const availableHeight = Math.max(1, editorContentEl.clientHeight - verticalPadding);
    const scale = Math.min(1, availableWidth / state.canvasViewportPixelWidth);
    state.canvasViewportScale = scale;
    state.canvasViewportZoom = String(scale);
    if (state.templateCanvasShown) requestAnimationFrame(syncIsolationCanvasHeight);
    else
      state.canvasViewportHeight =
        scale < 1 ? `${Math.max(1, Math.round(availableHeight / scale))}px` : "100%";
  };
  const syncViewportOptions = (hasValues: Partial<Record<StyleBreakpoint, boolean>> = {}) => {
    let devices;
    if (state.canvasViewportMode === "full") {
      devices = viewportSelectorDevices(null, viewportDeviceSelections, hasValues);
    } else {
      const breakpoints = styleBreakpoints();
      const active =
        breakpoints.find((breakpoint) => breakpoint.key === state.canvasViewportMode) ??
        breakpoints.find((breakpoint) => breakpoint.key === defaultViewportBreakpoint()) ??
        breakpoints[0];
      const activeDevice = viewportDeviceForMode(active.key);
      viewportDeviceSelections[activeDevice] = active.key;
      devices = viewportSelectorDevices(active.key, viewportDeviceSelections, hasValues);
    }
    state.styleViewportDevices =
      state.canvasViewportCustomWidth == null
        ? devices
        : devices.map((device) =>
            device.pressed
              ? {
                  ...device,
                  currentViewport: `${state.canvasViewportCustomWidth}px`,
                }
              : device,
          );
  };
  const syncCanvasViewport = () => {
    state.canvasViewportCustomWidth = null;
    state.canvasViewportResizing = false;
    if (state.canvasViewportMode === "full") {
      state.styleBreakpoint = "base";
      state.canvasViewportFull = true;
      state.canvasViewportWidth = "100%";
      state.canvasViewportPixelWidth = 0;
      state.canvasViewportLabel = "Full canvas";
      state.canvasViewportResizeLabel = "Resize canvas";
      state.styleBreakpointLabel = styleBreakpoints()[0]?.label ?? "Mobile";
      syncViewportOptions();
      syncCanvasViewportFit();
      return;
    }
    const breakpoints = styleBreakpoints();
    const active =
      breakpoints.find((option) => option.key === state.canvasViewportMode) ??
      breakpoints.find((option) => option.key === defaultViewportBreakpoint()) ??
      breakpoints[0];
    state.canvasViewportMode = active.key;
    state.styleBreakpoint = active.key;
    state.canvasViewportFull = false;
    state.canvasViewportWidth = active.viewport;
    state.canvasViewportPixelWidth = cssLengthPx(active.viewport) ?? 0;
    state.canvasViewportLabel = active.label;
    state.canvasViewportResizeLabel = `Resize ${active.viewport} canvas`;
    state.styleBreakpointLabel = active.label;
    syncViewportOptions();
    syncCanvasViewportFit();
  };
  const breakpointForViewportWidth = (width: number) => {
    const breakpoints = styleBreakpoints();
    let active = breakpoints[0];
    for (const breakpoint of breakpoints.slice(1)) {
      const threshold = cssLengthPx(breakpoint.viewport);
      if (threshold != null && width >= threshold) active = breakpoint;
    }
    return active;
  };
  const setCanvasViewportWidth = (width: number) => {
    const nextWidth = Math.max(1, Math.round(width));
    const previousBreakpoint = state.styleBreakpoint;
    const active = breakpointForViewportWidth(nextWidth);
    state.canvasViewportMode = active.key;
    state.styleBreakpoint = active.key;
    state.canvasViewportFull = false;
    state.canvasViewportCustomWidth = nextWidth;
    state.canvasViewportWidth = `${nextWidth}px`;
    state.canvasViewportPixelWidth = nextWidth;
    state.canvasViewportLabel = `${nextWidth}px viewport · ${active.label}`;
    state.canvasViewportResizeLabel = `Resize canvas, currently ${nextWidth}px`;
    state.styleBreakpointLabel = active.label;
    const hasValues = Object.fromEntries(
      state.styleViewportDevices.flatMap((device) =>
        device.endpoints.map((endpoint) => [endpoint.key, endpoint.hasValue]),
      ),
    );
    syncViewportOptions(hasValues);
    syncCanvasViewportFit();
    if (previousBreakpoint !== active.key) syncBlockPanel();
  };

  const responsiveComparisonHeight = (scale: number): number => {
    const visualHeight = Math.max(420, editorContentEl.clientHeight - 122);
    return Math.max(1, Math.round(visualHeight / scale));
  };

  const clearResponsiveComparison = (): void => {
    for (const preview of responsivePreviewSurfaces.values()) preview.surface.remove();
    responsivePreviewSurfaces.clear();
    if (responsiveCanonicalSurface) {
      responsiveCanonicalSurface.style.removeProperty("order");
      responsiveCanonicalSurface.style.removeProperty("width");
      responsiveCanonicalSurface.removeAttribute("data-breakpoint");
    }
  };

  const activateResponsiveBreakpoint = (breakpoint: StyleBreakpoint): void => {
    const option = styleBreakpoints().find((candidate) => candidate.key === breakpoint);
    if (!option) return;
    state.canvasViewportFit = false;
    state.canvasViewportMode = option.key;
    state.styleBreakpoint = option.key;
    viewportDeviceSelections[breakpointDevice(option.key)] = option.key;
    syncCanvasViewport();
  };

  const syncResponsivePreviewSelection = (): void => {
    const selected = new Set(editor?.selection.blocks ?? []);
    for (const preview of responsivePreviewSurfaces.values()) {
      const doc = preview.frame.contentDocument;
      if (!doc) continue;
      for (const root of doc.querySelectorAll<HTMLElement>("[data-pb-id]"))
        root.classList.toggle("pbe-selected", selected.has(root.dataset.pbId ?? ""));
    }
  };

  const responsiveSelectionTarget = (): string | null =>
    editor?.selection.active ?? editor?.selection.blocks[0] ?? null;

  const responsiveDocumentScale = (doc: Document): number => {
    const win = doc.defaultView;
    const frame = win?.frameElement;
    if (!win || !frame || !win.innerWidth) return 1;
    return frame.getBoundingClientRect().width / win.innerWidth || 1;
  };

  const responsiveBlockVisualTop = (doc: Document, id: string): number | null => {
    const root = doc.querySelector<HTMLElement>(`[data-pb-id="${CSS.escape(id)}"]`);
    return root ? root.getBoundingClientRect().top * responsiveDocumentScale(doc) : null;
  };

  const syncResponsiveBlockScroll = (
    id: string | null = responsiveSelectionTarget(),
    anchorVisualTop?: number | null,
  ): void => {
    if (!state.canvasResponsiveCompare || !id) return;
    const documents = [
      canvasDocument,
      ...[...responsivePreviewSurfaces.values()]
        .map((preview) => preview.frame.contentDocument)
        .filter((doc): doc is Document => !!doc),
    ];
    const visualTop = anchorVisualTop ?? responsiveBlockVisualTop(canvasDocument, id) ?? 0;
    for (const doc of documents) {
      const root = doc.querySelector<HTMLElement>(`[data-pb-id="${CSS.escape(id)}"]`);
      const win = doc.defaultView;
      if (!root || !win) continue;
      const desiredLocalTop = visualTop / responsiveDocumentScale(doc);
      const top = Math.max(0, win.scrollY + root.getBoundingClientRect().top - desiredLocalTop);
      win.scrollTo(win.scrollX, top);
    }
  };

  const handleResponsivePreviewPointer = (breakpoint: StyleBreakpoint, event: MouseEvent): void => {
    if (event.button !== 0) return;
    const stageScrollLeft = editorContentEl.scrollLeft;
    const target =
      event.target && typeof (event.target as Element).closest === "function"
        ? (event.target as Element)
        : null;
    const block = target?.closest<HTMLElement>("[data-pb-id]");
    const templateNode = target?.closest<HTMLElement>("[data-pbe-template-node-id]");
    if (!block && !templateNode) return;
    event.preventDefault();
    event.stopPropagation();
    const sourceDocument = block?.ownerDocument;
    activateResponsiveBreakpoint(breakpoint);
    if (block?.dataset.pbId) {
      inspectedId = block.dataset.pbId;
      editor.selectBlock(block.dataset.pbId, {
        block: true,
        toggle: event.metaKey || event.ctrlKey,
        range: event.shiftKey,
      });
      state.sidebarTab = "block";
      syncBlockPanel();
      syncBreadcrumb();
      syncTree();
    } else if (templateNode?.dataset.pbeTemplateNodeId) {
      selectTemplateNode(templateNode.dataset.pbeTemplateNodeId);
    }
    const selectedId = responsiveSelectionTarget();
    const anchorVisualTop =
      selectedId && sourceDocument ? responsiveBlockVisualTop(sourceDocument, selectedId) : null;
    requestAnimationFrame(() => {
      syncResponsiveComparison();
      // Force the order/removal/insertion changes to settle, then restore the
      // user's stage position in the same animation frame, before paint.
      // This complements overflow-anchor:none for focus-driven adjustments.
      responsiveDeckEl.getBoundingClientRect();
      editorContentEl.scrollLeft = stageScrollLeft;
      syncResponsiveBlockScroll(selectedId, anchorVisualTop);
    });
  };

  const createResponsivePreviewSurface = (
    breakpoint: StyleBreakpoint,
  ): {
    surface: HTMLElement;
    viewport: HTMLElement;
    frame: HTMLIFrameElement;
  } => {
    const surface = document.createElement("section");
    surface.className = "pbe-responsive-surface pbe-responsive-surface--preview";
    surface.dataset.breakpoint = breakpoint;
    const label = document.createElement("header");
    label.className = "pbe-responsive-surface__label";
    const viewport = document.createElement("div");
    viewport.className = "pbe-responsive-preview-viewport";
    const frame = document.createElement("iframe");
    frame.className = "pbe-responsive-preview-frame";
    frame.title = `${breakpoint} breakpoint preview`;
    viewport.appendChild(frame);
    surface.append(label, viewport);
    responsiveDeckEl.appendChild(surface);

    const doc = frame.contentDocument!;
    doc.open();
    doc.write("<!doctype html><html><head></head><body></body></html>");
    doc.close();
    doc.addEventListener(
      "mousedown",
      (event) => handleResponsivePreviewPointer(breakpoint, event),
      true,
    );
    doc.addEventListener(
      "click",
      (event) => {
        if (
          (event.target as Element | null)?.closest?.("[data-pb-id],[data-pbe-template-node-id]")
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true,
    );
    const preview = { surface, viewport, frame };
    responsivePreviewSurfaces.set(breakpoint, preview);
    return preview;
  };

  function syncResponsiveComparison(): void {
    if (
      !state.canvasResponsiveCompare ||
      !responsiveDeckEl ||
      !responsiveDeckEl.isConnected ||
      !responsiveCanonicalSurface ||
      !canvasDocument ||
      !editor
    ) {
      clearResponsiveComparison();
      return;
    }
    const breakpoints = styleBreakpoints();
    const active =
      breakpoints.find((breakpoint) => breakpoint.key === state.canvasViewportMode) ??
      breakpoints.find((breakpoint) => breakpoint.key === activeStyleBreakpoint()) ??
      breakpoints[0];
    const wanted = new Set(breakpoints.map((breakpoint) => breakpoint.key));
    for (const [key, preview] of responsivePreviewSurfaces) {
      if (key === active.key || !wanted.has(key)) {
        preview.surface.remove();
        responsivePreviewSurfaces.delete(key);
      }
    }

    const activeWidth = cssLengthPx(active.viewport) ?? 390;
    const activeScale = responsivePreviewScale(activeWidth);
    responsiveCanonicalSurface.dataset.breakpoint = active.key;
    responsiveCanonicalSurface.style.order = String(
      breakpoints.findIndex((breakpoint) => breakpoint.key === active.key),
    );
    responsiveCanonicalSurface.style.width = `${activeWidth * activeScale}px`;

    breakpoints.forEach((breakpoint, index) => {
      if (breakpoint.key === active.key) return;
      const width = cssLengthPx(breakpoint.viewport) ?? 390;
      const scale = responsivePreviewScale(width);
      const preview =
        responsivePreviewSurfaces.get(breakpoint.key) ??
        createResponsivePreviewSurface(breakpoint.key);
      preview.surface.style.order = String(index);
      preview.surface.style.width = `${width * scale}px`;
      preview.surface.dataset.breakpoint = breakpoint.key;
      preview.surface.setAttribute(
        "aria-label",
        `${breakpoint.label}, ${breakpoint.viewport} breakpoint preview`,
      );
      const label = preview.surface.querySelector<HTMLElement>(".pbe-responsive-surface__label")!;
      const name = document.createElement("span");
      name.textContent = breakpoint.label;
      const viewportLabel = document.createElement("small");
      viewportLabel.textContent = breakpoint.viewport;
      const action = document.createElement("strong");
      action.textContent = "Click to edit";
      label.replaceChildren(name, viewportLabel, action);
      preview.viewport.style.width = breakpoint.viewport;
      preview.viewport.style.height = `${responsiveComparisonHeight(scale)}px`;
      preview.viewport.style.zoom = String(scale);

      const doc = preview.frame.contentDocument!;
      const headNodes = [...canvasDocument.head.children]
        .filter((node) => node.matches("base,meta,style,link[rel='stylesheet']"))
        .map((node) => node.cloneNode(true));
      const viewportMeta = doc.createElement("meta");
      viewportMeta.name = "viewport";
      viewportMeta.content = "width=device-width, initial-scale=1";
      const projectionStyle = doc.createElement("style");
      projectionStyle.textContent =
        "html,body{margin:0!important;min-height:100%!important;background:transparent!important}" +
        "body{overflow:auto!important;cursor:default}" +
        "[contenteditable]{cursor:pointer!important}";
      doc.head.replaceChildren(viewportMeta, ...headNodes, projectionStyle);
      const body = canvasDocument.body.cloneNode(true) as HTMLBodyElement;
      for (const chrome of body.querySelectorAll(
        ".pbe-inline-chrome-layer,.pbe-ui,[data-pbe-template-node-toolbar],#output-section",
      ))
        chrome.remove();
      for (const editable of body.querySelectorAll<HTMLElement>("[contenteditable]"))
        editable.contentEditable = "false";
      for (const focusable of body.querySelectorAll<HTMLElement>("[tabindex]"))
        focusable.tabIndex = -1;
      doc.body.replaceChildren(...body.childNodes);
      doc.body.dataset.responsiveBreakpoint = breakpoint.key;
    });
    syncResponsivePreviewSelection();
    syncResponsiveBlockScroll();
  }

  const readStyle = (id: string, prop: string): string =>
    editor.getStyle(id, prop, activeStyleBreakpoint());
  const effectiveStyle = (
    id: string,
    prop: string,
  ): {
    value: string;
    explicitValue: string;
    source: StyleBreakpoint;
    inherited: boolean;
  } => {
    const breakpoints = styleBreakpoints();
    const activeIndex = breakpoints.findIndex((option) => option.key === activeStyleBreakpoint());
    const explicitValue = editor.getStyle(id, prop, activeStyleBreakpoint());
    if (explicitValue)
      return {
        value: explicitValue,
        explicitValue,
        source: activeStyleBreakpoint(),
        inherited: false,
      };
    for (let index = activeIndex - 1; index >= 0; index -= 1) {
      const source = breakpoints[index].key;
      const value = editor.getStyle(id, prop, source);
      if (value) return { value, explicitValue: "", source, inherited: true };
    }
    return { value: "", explicitValue: "", source: "base", inherited: false };
  };
  const inheritedLabel = (source: StyleBreakpoint): string =>
    styleBreakpoints().find((option) => option.key === source)?.label ?? "Mobile";
  const responsiveValueRanges = (
    id: string,
    prop: string | readonly string[],
    defaultValue: string,
  ): {
    ranges: ResponsiveValueRange[];
    points: ResponsiveValuePoint[];
    summary: string;
    changes: string;
  } => {
    const breakpoints = styleBreakpoints();
    const props = typeof prop === "string" ? [prop] : [...prop];
    const serializedProps = props.join(",");
    const activeIndex = breakpoints.findIndex((option) => option.key === activeStyleBreakpoint());
    const viewportLabel = (breakpoint: (typeof breakpoints)[number]): string => {
      const pixels = cssLengthPx(breakpoint.viewport);
      return pixels == null ? breakpoint.viewport : `${Math.round(pixels)}px`;
    };
    const inheritedValues = Object.fromEntries(
      props.map((candidate, index) => [candidate, index === 0 ? defaultValue : ""]),
    ) as Record<string, string>;
    const values = breakpoints.map((breakpoint) => {
      const explicitProps = props.filter((candidate) => {
        const explicitValue = editor.getStyle(id, candidate, breakpoint.key);
        if (explicitValue) inheritedValues[candidate] = explicitValue;
        return !!explicitValue;
      });
      return {
        value:
          props.length === 1
            ? inheritedValues[props[0]]
            : JSON.stringify(props.map((candidate) => inheritedValues[candidate])),
        explicit: explicitProps.length > 0,
      };
    });
    const groups: {
      start: number;
      end: number;
      value: string;
      changed: boolean;
    }[] = [];
    values.forEach((entry, index) => {
      const previous = groups.at(-1);
      if (previous && previous.value === entry.value) {
        previous.end = index;
        return;
      }
      groups.push({
        start: index,
        end: index,
        value: entry.value,
        changed: index > 0 && entry.explicit,
      });
    });
    const variants = [...new Set(values.map((entry) => entry.value))];
    if (variants.length < 2) return { ranges: [], points: [], summary: "", changes: "" };
    const variantColor = (value: string): string => {
      const index = variants.indexOf(value);
      const shade =
        variants.length === 1 ? 70 : Math.round(32 + (index / (variants.length - 1)) * 54);
      return `color-mix(in oklch, var(--pbe-responsive-accent) ${shade}%, var(--background))`;
    };
    const ranges = groups.map((group, groupIndex) => {
      const start = breakpoints[group.start];
      const end = breakpoints[group.end];
      const previous = groupIndex > 0 ? groups[groupIndex - 1] : undefined;
      const minIndex = previous ? previous.start + 1 : group.start;
      const maxIndex = group.end;
      const movable = group.changed && minIndex < maxIndex;
      const screenLabel =
        group.start === group.end ? start.label : `${start.label} through ${end.label}`;
      return {
        key: start.key,
        span: String(group.end - group.start + 1),
        changed: group.changed,
        resettable: group.changed,
        resetDisabled: !group.changed,
        resetLabel: group.changed
          ? `Reset changes from ${viewportLabel(start)}`
          : `${screenLabel} base variant`,
        movable,
        index: String(group.start),
        minIndex: String(minIndex),
        maxIndex: String(maxIndex),
        props: serializedProps,
        label: `${screenLabel} share one variant`,
        color: variantColor(group.value),
      };
    });
    const points = breakpoints.map((breakpoint, index) => {
      const groupIndex = groups.findIndex((group) => group.start === index && index > 0);
      const group = groupIndex >= 0 ? groups[groupIndex] : undefined;
      const previous = groupIndex > 0 ? groups[groupIndex - 1] : undefined;
      const changed = !!group;
      const minIndex = group && previous ? previous.start + 1 : index;
      const maxIndex = group?.end ?? index;
      const movable = changed && minIndex < maxIndex;
      const viewport = viewportLabel(breakpoint);
      return {
        key: breakpoint.key,
        pointKey: `point-${breakpoint.key}`,
        viewport,
        active: index === activeIndex,
        changed,
        movable,
        index: String(index),
        minIndex: String(minIndex),
        maxIndex: String(maxIndex),
        props: serializedProps,
        label: `${breakpoint.label}, ${viewport}${
          changed
            ? movable
              ? ", field changes here; drag left or right to move the boundary"
              : ", field changes here; reset another block to make room"
            : ""
        }`,
        color: variantColor(values[index].value),
      };
    });
    const changePoints = points.filter((point) => point.changed).map((point) => point.viewport);
    return {
      ranges,
      points,
      summary: `${variants.length} variants`,
      changes: `Changes at ${changePoints.join(", ")}`,
    };
  };
  const responsiveMutationProps = (raw: string | undefined): string[] =>
    (raw ?? "")
      .split(",")
      .map((prop) => prop.trim())
      .filter(Boolean);
  const resetResponsiveBoundary = (
    id: string,
    props: readonly string[],
    breakpoint: StyleBreakpoint,
  ): boolean => {
    const values = Object.fromEntries(
      props.filter((prop) => !!editor.getStyle(id, prop, breakpoint)).map((prop) => [prop, ""]),
    );
    return Object.keys(values).length > 0 && editor.setStyles(id, values, breakpoint);
  };
  const moveResponsiveBoundary = (
    id: string,
    props: readonly string[],
    source: StyleBreakpoint,
    target: StyleBreakpoint,
  ): boolean => {
    if (source === target) return false;
    const explicitValues = Object.fromEntries(
      props
        .map((prop) => [prop, editor.getStyle(id, prop, source)] as const)
        .filter(([, value]) => !!value),
    );
    if (!Object.keys(explicitValues).length) return false;
    if (!editor.setStyles(id, explicitValues, target)) return false;
    editor.setStyles(
      id,
      Object.fromEntries(Object.keys(explicitValues).map((prop) => [prop, ""])),
      source,
    );
    return true;
  };
  const writeStyle = (id: string, prop: string, value: string): void =>
    editor.setStyle(id, prop, value, activeStyleBreakpoint());
  const writeStyles = (id: string, values: Readonly<Record<string, string>>): boolean =>
    editor.setStyles(id, values, activeStyleBreakpoint());
  const spacingSides: readonly BoxSpacingSide[] = ["Top", "Right", "Bottom", "Left"];
  const boxModelResponsiveProps = [
    "padding",
    "paddingInline",
    "paddingBlock",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "margin",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "borderWidth",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderRadius",
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomRightRadius",
    "borderBottomLeftRadius",
    "borderColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "borderStyle",
  ] as const;
  const orderedSpacingSides = (sides: readonly BoxSpacingSide[]): BoxSpacingSide[] =>
    spacingSides.filter((side) => sides.includes(side));
  const sameSpacingSides = (
    left: readonly BoxSpacingSide[],
    right: readonly BoxSpacingSide[],
  ): boolean => {
    const orderedLeft = orderedSpacingSides(left);
    const orderedRight = orderedSpacingSides(right);
    return (
      orderedLeft.length === orderedRight.length &&
      orderedLeft.every((side, index) => side === orderedRight[index])
    );
  };
  const spacingSelectionIcons = (sides: readonly BoxSpacingSide[]): string[] => {
    const selected = new Set(sides);
    return spacingSides
      .filter((side) => selected.has(side))
      .map((side) => iconRef(`spacing-sides-${side.toLowerCase()}`));
  };
  const spacingKindLabel = (kind: BoxSpacingKind): string =>
    kind === "padding" ? "Padding" : kind === "margin" ? "Margin" : "Border";
  const spacingSelectionLabel = (sides: readonly BoxSpacingSide[]): string => {
    const ordered = sameSpacingSides(sides, ["Left", "Right"])
      ? (["Left", "Right"] as BoxSpacingSide[])
      : orderedSpacingSides(sides);
    return ordered.length === spacingSides.length ? "All sides" : ordered.join(", ");
  };
  const boxScaleChoices = (
    kind: BoxSpacingKind,
    spacingChoices: readonly { key: string; value: string; label: string }[],
  ): { key: string; value: string; label: string }[] =>
    kind === "border"
      ? BORDER_WIDTH_STEPS.map((key) => ({ key, value: `${key}px`, label: `${key} px` }))
      : [...spacingChoices];
  const borderEdgeProp = (prop: "borderWidth" | "borderColor", side: BoxSpacingSide): string =>
    `border${side}${prop === "borderWidth" ? "Width" : "Color"}`;
  const borderRadiusCorners: readonly {
    prop: BorderRadiusCornerProp;
    label: string;
    icon: string;
  }[] = [
    {
      prop: "borderTopLeftRadius",
      label: "Top-left radius",
      icon: "border-radius-top-left",
    },
    {
      prop: "borderTopRightRadius",
      label: "Top-right radius",
      icon: "border-radius-top-right",
    },
    {
      prop: "borderBottomRightRadius",
      label: "Bottom-right radius",
      icon: "border-radius-bottom-right",
    },
    {
      prop: "borderBottomLeftRadius",
      label: "Bottom-left radius",
      icon: "border-radius-bottom-left",
    },
  ];
  const borderCornerProps = (sides: readonly BoxSpacingSide[]): BorderRadiusCornerProp[] => {
    const selected = new Set(sides);
    const corners = new Set<BorderRadiusCornerProp>();
    if (selected.has("Top")) {
      corners.add("borderTopLeftRadius");
      corners.add("borderTopRightRadius");
    }
    if (selected.has("Right")) {
      corners.add("borderTopRightRadius");
      corners.add("borderBottomRightRadius");
    }
    if (selected.has("Bottom")) {
      corners.add("borderBottomRightRadius");
      corners.add("borderBottomLeftRadius");
    }
    if (selected.has("Left")) {
      corners.add("borderBottomLeftRadius");
      corners.add("borderTopLeftRadius");
    }
    return [...corners];
  };
  const borderRadiusCornerValue = (id: string, prop: BorderRadiusCornerProp): string =>
    effectiveStyle(id, prop).value || effectiveStyle(id, "borderRadius").value;
  const borderRadiusCornerTitle = (prop: BorderRadiusCornerProp): string =>
    borderRadiusCorners
      .find(({ prop: candidate }) => candidate === prop)!
      .label.replace("-", " ")
      .replace(" radius", "")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  const orderedBorderRadiusCorners = (
    corners: readonly BorderRadiusCornerProp[],
  ): BorderRadiusCornerProp[] =>
    borderRadiusCorners.map(({ prop }) => prop).filter((prop) => corners.includes(prop));
  const borderRadiusSelectionLabel = (corners: readonly BorderRadiusCornerProp[]): string => {
    const ordered = orderedBorderRadiusCorners(corners);
    return ordered.length === borderRadiusCorners.length
      ? "All corners"
      : ordered.map(borderRadiusCornerTitle).join(", ");
  };
  const hasBorderWidth = (value: string): boolean =>
    !!value.trim() && !/^0(?:\.0+)?(?:[a-z%]+)?$/i.test(value.trim());
  const borderRadiusValue = (id: string): string => {
    const values = borderRadiusCorners.map(({ prop }) => borderRadiusCornerValue(id, prop));
    return values.every((value) => value === values[0]) ? (values[0] ?? "") : "";
  };
  const borderValueForSide = (
    id: string,
    prop: "borderWidth" | "borderColor" | "borderRadius",
    side: BoxSpacingSide,
  ): string => {
    const base = effectiveStyle(id, prop).value;
    if (prop !== "borderRadius")
      return effectiveStyle(id, borderEdgeProp(prop, side)).value || base;
    return borderRadiusValue(id);
  };
  const spacingCustomUnits: readonly BoxSpacingUnit[] = ["px", "%", "em", "rem", "vw", "vh"];
  const spacingCustomScale = (unit: BoxSpacingUnit): { min: number; max: number; step: number } =>
    unit === "px"
      ? { min: 0, max: 300, step: 1 }
      : unit === "em" || unit === "rem"
        ? { min: 0, max: 20, step: 0.25 }
        : { min: 0, max: 100, step: 1 };
  const spacingCustomValue = (
    value: string,
    choices: readonly { key: string; value: string }[],
  ): { number: string; unit: BoxSpacingUnit } => {
    const raw = choices.find((choice) => choice.key === value)?.value ?? value;
    const match = /^(-?(?:\d+|\d*\.\d+))(px|%|em|rem|vw|vh)$/i.exec(raw.trim());
    const unit = match?.[2]?.toLowerCase();
    return {
      number: match?.[1] ?? "0",
      unit: spacingCustomUnits.includes(unit as BoxSpacingUnit) ? (unit as BoxSpacingUnit) : "px",
    };
  };
  const spacingValueForSide = (id: string, kind: BoxSpacingKind, side: BoxSpacingSide): string => {
    if (kind === "border") return borderValueForSide(id, "borderWidth", side);
    const sideValue = effectiveStyle(id, `${kind}${side}`).value;
    if (sideValue) return sideValue;
    if (kind === "padding") {
      const axis = side === "Left" || side === "Right" ? "paddingInline" : "paddingBlock";
      const axisValue = effectiveStyle(id, axis).value;
      if (axisValue) return axisValue;
    }
    return effectiveStyle(id, kind).value;
  };
  const setSpacingCustomMode = (id: string, kind: BoxSpacingKind, side: BoxSpacingSide): void => {
    const value = spacingValueForSide(id, kind, side);
    const choices = boxScaleChoices(
      kind,
      spacings(activeTheme()).map(({ key, value }) => ({ key, value, label: key })),
    );
    state.boxEditorCustomOpen = !!value && !choices.some((option) => option.key === value);
  };
  const writeBoxBorderProperty = (
    id: string,
    prop: "borderWidth" | "borderColor" | "borderRadius",
    value: string,
    selectedSides: readonly BoxSpacingSide[] = state.boxEditorSelectedSides,
  ): void => {
    const targets = orderedSpacingSides(selectedSides);
    if (!targets.length) return;
    const sideProps =
      prop === "borderRadius"
        ? borderCornerProps(spacingSides)
        : spacingSides.map((side) => borderEdgeProp(prop, side));
    const targetProps =
      prop === "borderRadius"
        ? borderCornerProps(targets)
        : targets.map((side) => borderEdgeProp(prop, side));
    const values: Record<string, string> = {};
    if (targets.length === spacingSides.length) {
      values[prop] = value;
      for (const sideProp of sideProps) values[sideProp] = "";
    } else {
      const hasSpecific = sideProps.some((sideProp) => !!readStyle(id, sideProp));
      if (!hasSpecific) {
        const base = effectiveStyle(id, prop).value;
        values[prop] = "";
        for (const sideProp of sideProps) values[sideProp] = base;
      }
      for (const targetProp of targetProps) values[targetProp] = value;
    }
    writeStyles(id, values);
  };
  const writeBoxBorderRadiusCorners = (
    id: string,
    props: readonly BorderRadiusCornerProp[],
    value: string,
  ): void => {
    const targets = orderedBorderRadiusCorners(props);
    if (!targets.length) return;
    const hasSpecific = borderRadiusCorners.some(
      ({ prop: candidate }) => !!readStyle(id, candidate),
    );
    if (hasSpecific) {
      writeStyles(id, Object.fromEntries(targets.map((prop) => [prop, value])));
      return;
    }
    const inherited = effectiveStyle(id, "borderRadius").value;
    const values: Record<string, string> = { borderRadius: "" };
    for (const { prop: candidate } of borderRadiusCorners) values[candidate] = inherited;
    for (const prop of targets) values[prop] = value;
    writeStyles(id, values);
  };
  const writeBoxSpacing = (id: string, kind: BoxSpacingKind, value: string, prop = ""): void => {
    if (kind === "border") {
      const corner = borderRadiusCorners.find(({ prop: candidate }) => candidate === prop)?.prop;
      if (corner) {
        writeBoxBorderRadiusCorners(
          id,
          state.boxEditorRadiusOnly ? state.boxEditorSelectedCorners : [corner],
          value,
        );
        return;
      }
      writeBoxBorderProperty(
        id,
        prop === "borderRadius" || prop === "borderColor" ? prop : "borderWidth",
        value,
        prop === "borderRadius" ? spacingSides : state.boxEditorSelectedSides,
      );
      return;
    }
    const stateKey = `${id}:${kind}`;
    const wasLinked = state.styleSidesLinked[stateKey] !== false;
    const targets = orderedSpacingSides(state.boxEditorSelectedSides);
    if (!targets.length) return;
    const values: Record<string, string> = {};
    if (targets.length === spacingSides.length) {
      values[kind] = value;
      for (const candidate of spacingSides) values[`${kind}${candidate}`] = "";
      if (kind === "padding") {
        values.paddingInline = "";
        values.paddingBlock = "";
      }
      state.styleSidesLinked[stateKey] = true;
    } else {
      if (wasLinked) {
        const inherited = Object.fromEntries(
          spacingSides.map((candidate) => [candidate, spacingValueForSide(id, kind, candidate)]),
        ) as Record<BoxSpacingSide, string>;
        values[kind] = "";
        if (kind === "padding") {
          values.paddingInline = "";
          values.paddingBlock = "";
        }
        for (const candidate of spacingSides) values[`${kind}${candidate}`] = inherited[candidate];
      }
      for (const candidate of targets) values[`${kind}${candidate}`] = value;
      state.styleSidesLinked[stateKey] = false;
    }
    writeStyles(id, values);
  };
  const applyBoxBorderColorValue = (id: string, value: string): void => {
    const targets = orderedSpacingSides(state.boxEditorSelectedSides);
    if (value && ["", "none"].includes(effectiveStyle(id, "borderStyle").value))
      writeStyle(id, "borderStyle", "solid");
    writeBoxBorderProperty(id, "borderColor", value, targets);
  };
  const tokenScaleRow = (d: Dataset): ScaleRow | BoxSpacingRow | undefined =>
    d.kind === "padding" || d.kind === "margin" || d.kind === "border"
      ? (state.boxEditorRows.find((row) => row.prop === (d.prop ?? "")) ??
        state.boxEditorRadiusRows.find((row) => row.prop === (d.prop ?? "")) ??
        state.boxEditorRows[0] ??
        state.boxEditorRadiusRows[0])
      : [
          ...state.dimensionRows,
          ...state.layoutRows,
          ...state.typographyRows,
          ...state.borderWidthRows,
          ...state.borderRadiusRows,
        ].find((row) => row.prop === d.prop);
  const clampBoxEditorPosition = (): void => {
    boxEditorPositionFrame = 0;
    if (!state.boxEditorOpen || !shellRootEl) return;
    const pane = shellRootEl.querySelector<HTMLElement>(".pbe-box-model__control");
    if (!pane || pane.classList.contains("hidden")) return;
    const shellView = shellRootEl.ownerDocument.defaultView ?? window;
    const viewport = shellView.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? shellView.innerWidth;
    const viewportHeight = viewport?.height ?? shellView.innerHeight;
    const rect = pane.getBoundingClientRect();
    const gutter = 12;
    const left = Math.max(
      viewportLeft + gutter,
      Math.min(boxEditorAnchorLeft, viewportLeft + viewportWidth - rect.width - gutter),
    );
    const top = Math.max(
      viewportTop + gutter,
      Math.min(boxEditorAnchorTop, viewportTop + viewportHeight - rect.height - gutter),
    );
    const nextLeft = `${Math.round(left)}px`;
    const nextTop = `${Math.round(top)}px`;
    if (state.boxEditorPopoverLeft !== nextLeft) state.boxEditorPopoverLeft = nextLeft;
    if (state.boxEditorPopoverTop !== nextTop) state.boxEditorPopoverTop = nextTop;
  };
  const scheduleBoxEditorPosition = (): void => {
    if (boxEditorPositionFrame || !shellRootEl) return;
    const shellView = shellRootEl.ownerDocument.defaultView ?? window;
    boxEditorPositionFrame = shellView.requestAnimationFrame(clampBoxEditorPosition);
  };
  const positionBoxEditor = (element: HTMLElement): void => {
    const rect =
      element.closest<HTMLElement>(".pbe-box-model")?.getBoundingClientRect() ??
      element.getBoundingClientRect();
    const shellView = element.ownerDocument.defaultView ?? window;
    const width = 286;
    const left =
      rect.left >= width + 20
        ? rect.left - width - 12
        : Math.min(shellView.innerWidth - width - 12, rect.right + 12);
    boxEditorAnchorLeft = Math.max(12, left);
    boxEditorAnchorTop = Math.max(12, rect.top);
    state.boxEditorPopoverLeft = `${boxEditorAnchorLeft}px`;
    state.boxEditorPopoverTop = `${boxEditorAnchorTop}px`;
    scheduleBoxEditorPosition();
  };

  const iconOf = (type: string) =>
    iconRef(getBlockType(type)?.icon ?? (type === "raw-html" ? "html" : undefined));
  const letterOf = (type: string) => (type[0] ?? "?").toUpperCase();
  const labelOf = (type: string) =>
    blockTypes().find((b) => b.type === type)?.label ?? (type === "raw-html" ? "HTML" : type);
  const containerPresentation = (b: Block): "group" | "row" | "stack" | "grid" | null => {
    if (b.type !== "group") return null;
    const value = effectiveStyle(b.id, "layoutMode").value;
    return value === "row" || value === "stack" || value === "grid" ? value : "group";
  };
  const presentationLabel = (b: Block): string => {
    const layout = containerPresentation(b);
    return layout ? layout[0].toUpperCase() + layout.slice(1) : labelOf(b.type);
  };
  const presentationIcon = (b: Block): string => {
    const layout = containerPresentation(b);
    return layout ? iconRef(layout) : iconOf(b.type);
  };
  const isContainerBlock = (b: Block): boolean =>
    b.type === "group" &&
    (effectiveStyle(b.id, "containerEnabled").value ||
      getBlockType(b.type)?.settings?.find((setting) => setting.style === "containerEnabled")
        ?.default) === "true";
  const stringSetting = (b: Block, name: string): string => {
    const value = b.settings?.[name];
    return typeof value === "string" ? value : "";
  };
  // Pattern provenance wins where a block IS a stamped pattern root (#239's
  // settled design: informational label, may go stale after edits — fine).
  const blockLabelOf = (b: Block): string =>
    (b.pattern && getPattern(b.pattern)?.label) ||
    (b.type === TEMPLATE_PART_TYPE && getTemplatePart(stringSetting(b, "name"))?.label) ||
    presentationLabel(b);
  const asItem = (b: { type: string; label: string }): BlockItem => ({
    type: b.type,
    label: b.label,
    icon: iconOf(b.type),
    letter: letterOf(b.type),
  });
  const matches = (b: BlockItem, q: string) =>
    !q || b.type.includes(q) || b.label.toLowerCase().includes(q);

  function syncDesignAssets(): void {
    state.designAssetGlyphs = state.designAssetCatalog
      .filter((item) => item.active)
      .map((item) => item.glyph);
    const fontTokens = activeTheme().tokens.filter(
      (token) => token.name.startsWith("font-") && !token.name.includes("--"),
    );
    state.designFontRows = fontTokens.length
      ? fontTokens.map((token) => {
          const family = token.value
            .split(",")[0]
            ?.trim()
            .replace(/^['"]|['"]$/g, "");
          const tokenLabel = token.name
            .slice(5)
            .split("-")
            .map((part) => part[0]?.toUpperCase() + part.slice(1))
            .join(" ");
          return {
            name: token.name,
            label: family && !/^(?:ui-|system-ui$)/.test(family) ? family : tokenLabel,
            value: token.value,
          };
        })
      : [
          {
            name: "font-sans",
            label: "Inter",
            value: "Inter, ui-sans-serif, system-ui, sans-serif",
          },
        ];
  }

  function syncDesignTypographyRecipe(): void {
    const theme = activeTheme();
    const elementMeta: Record<
      DesignTypographyElement,
      { label: string; sample: string; prefix: string; description: string }
    > = {
      text: {
        label: "Text",
        sample: "¶",
        prefix: "body",
        description: "Paragraphs and inherited reading text.",
      },
      links: {
        label: "Links",
        sample: "Aa",
        prefix: "link",
        description: "Inline links wherever they appear.",
      },
      headings: {
        label: "Headings",
        sample: "H1",
        prefix: "heading",
        description: "The shared heading voice and level scale.",
      },
      captions: {
        label: "Captions",
        sample: "Cc",
        prefix: "caption",
        description: "Supporting copy attached to media.",
      },
      buttons: {
        label: "Buttons",
        sample: "Aa",
        prefix: "button",
        description: "Text inside buttons and calls to action.",
      },
    };
    state.designTypographyElements = (Object.keys(elementMeta) as DesignTypographyElement[]).map(
      (key) => ({
        key,
        label: elementMeta[key].label,
        sample: elementMeta[key].sample,
        selected: key === state.designTypographyElement,
      }),
    );
    state.designTypographyHeadingLevels = ["h1", "h2", "h3", "h4"].map((key) => ({
      key,
      label: key.toUpperCase(),
      selected: key === state.designTypographyHeadingLevel,
    }));
    const meta = elementMeta[state.designTypographyElement];
    const prefix = meta.prefix;
    const token = (suffix: string) => `publr-${prefix}-${suffix}`;
    state.designTypographyFontToken = token("font-family");
    state.designTypographyWeightToken = token("font-weight");
    state.designTypographySizeToken =
      state.designTypographyElement === "headings"
        ? `publr-heading-${state.designTypographyHeadingLevel.slice(1)}-size`
        : token("font-size");
    state.designTypographyLineHeightToken = token("line-height");
    state.designTypographyLetterSpacingToken = token("letter-spacing");
    state.designTypographyTransformToken = token("text-transform");
    state.designTypographyColorToken = token("color");
    state.designTypographyDecorationToken =
      state.designTypographyElement === "links" ? token("text-decoration") : "";
    state.designTypographyDecorationShown = state.designTypographyElement === "links";

    const fallbackByToken: Record<string, string> = {
      "publr-body-font-family": SITE_TYPOGRAPHY_DEFAULTS.bodyFontFamily,
      "publr-body-font-weight": SITE_TYPOGRAPHY_DEFAULTS.bodyFontWeight,
      "publr-body-font-size": SITE_TYPOGRAPHY_DEFAULTS.bodyFontSize,
      "publr-body-line-height": SITE_TYPOGRAPHY_DEFAULTS.bodyLineHeight,
      "publr-body-letter-spacing": SITE_TYPOGRAPHY_DEFAULTS.bodyLetterSpacing,
      "publr-body-text-transform": SITE_TYPOGRAPHY_DEFAULTS.bodyTextTransform,
      "publr-body-color": SITE_TYPOGRAPHY_DEFAULTS.bodyColor,
      "publr-link-font-family": SITE_TYPOGRAPHY_DEFAULTS.linkFontFamily,
      "publr-link-font-weight": SITE_TYPOGRAPHY_DEFAULTS.linkFontWeight,
      "publr-link-font-size": SITE_TYPOGRAPHY_DEFAULTS.linkFontSize,
      "publr-link-line-height": SITE_TYPOGRAPHY_DEFAULTS.linkLineHeight,
      "publr-link-letter-spacing": SITE_TYPOGRAPHY_DEFAULTS.linkLetterSpacing,
      "publr-link-text-transform": SITE_TYPOGRAPHY_DEFAULTS.linkTextTransform,
      "publr-link-color": SITE_TYPOGRAPHY_DEFAULTS.linkColor,
      "publr-link-text-decoration": SITE_TYPOGRAPHY_DEFAULTS.linkTextDecoration,
      "publr-heading-font-family": SITE_TYPOGRAPHY_DEFAULTS.headingFontFamily,
      "publr-heading-font-weight": SITE_TYPOGRAPHY_DEFAULTS.headingFontWeight,
      "publr-heading-line-height": SITE_TYPOGRAPHY_DEFAULTS.headingLineHeight,
      "publr-heading-letter-spacing": SITE_TYPOGRAPHY_DEFAULTS.headingLetterSpacing,
      "publr-heading-text-transform": SITE_TYPOGRAPHY_DEFAULTS.headingTextTransform,
      "publr-heading-color": SITE_TYPOGRAPHY_DEFAULTS.headingColor,
      "publr-heading-1-size": SITE_TYPOGRAPHY_DEFAULTS.heading1Size,
      "publr-heading-2-size": SITE_TYPOGRAPHY_DEFAULTS.heading2Size,
      "publr-heading-3-size": SITE_TYPOGRAPHY_DEFAULTS.heading3Size,
      "publr-heading-4-size": SITE_TYPOGRAPHY_DEFAULTS.heading4Size,
      "publr-caption-font-family": SITE_TYPOGRAPHY_DEFAULTS.captionFontFamily,
      "publr-caption-font-weight": SITE_TYPOGRAPHY_DEFAULTS.captionFontWeight,
      "publr-caption-font-size": SITE_TYPOGRAPHY_DEFAULTS.captionFontSize,
      "publr-caption-line-height": SITE_TYPOGRAPHY_DEFAULTS.captionLineHeight,
      "publr-caption-letter-spacing": SITE_TYPOGRAPHY_DEFAULTS.captionLetterSpacing,
      "publr-caption-text-transform": SITE_TYPOGRAPHY_DEFAULTS.captionTextTransform,
      "publr-caption-color": SITE_TYPOGRAPHY_DEFAULTS.captionColor,
      "publr-button-font-family": SITE_TYPOGRAPHY_DEFAULTS.buttonFontFamily,
      "publr-button-font-weight": SITE_TYPOGRAPHY_DEFAULTS.buttonFontWeight,
      "publr-button-font-size": SITE_TYPOGRAPHY_DEFAULTS.buttonFontSize,
      "publr-button-line-height": SITE_TYPOGRAPHY_DEFAULTS.buttonLineHeight,
      "publr-button-letter-spacing": SITE_TYPOGRAPHY_DEFAULTS.buttonLetterSpacing,
      "publr-button-text-transform": SITE_TYPOGRAPHY_DEFAULTS.buttonTextTransform,
      "publr-button-color": SITE_TYPOGRAPHY_DEFAULTS.buttonColor,
    };
    const current = (name: string) => tokenValue(theme, name) ?? fallbackByToken[name] ?? "";
    const choice = (
      key: string,
      label: string,
      value: string,
      selected: boolean,
      preview: Partial<DesignTypographyChoiceRow> = {},
    ): DesignTypographyChoiceRow => ({
      key,
      label,
      value,
      selected,
      fontFamily: preview.fontFamily ?? "",
      fontWeight: preview.fontWeight ?? "",
      fontSize: preview.fontSize ?? "",
      color: preview.color ?? "",
    });

    const currentFamily = current(state.designTypographyFontToken);
    state.designTypographyFontOptions = state.designFontRows.map((font) => {
      const value = `var(--${font.name})`;
      return choice(
        font.name,
        font.label,
        value,
        currentFamily === value || currentFamily === font.value,
        {
          fontFamily: font.value,
        },
      );
    });

    const currentWeight = current(state.designTypographyWeightToken);
    const weightTokens = theme.tokens.filter((item) => /^font-weight-[\w-]+$/.test(item.name));
    const weights = weightTokens.length
      ? weightTokens
      : [
          { name: "font-weight-light", value: "300" },
          { name: "font-weight-normal", value: "400" },
          { name: "font-weight-medium", value: "500" },
          { name: "font-weight-semibold", value: "600" },
          { name: "font-weight-bold", value: "700" },
          { name: "font-weight-extrabold", value: "800" },
        ];
    state.designTypographyWeightOptions = weights.map((item) => {
      const value = `var(--${item.name})`;
      const label = item.name
        .replace("font-weight-", "")
        .split("-")
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ");
      return choice(
        item.name,
        label,
        value,
        currentWeight === value || currentWeight === item.value,
        {
          fontWeight: item.value,
        },
      );
    });

    const currentSize = current(state.designTypographySizeToken);
    state.designTypographySizeOptions = fontSizes(theme)
      .filter((option) => (cssLengthPx(option.value) ?? 0) <= 96)
      .map((option) => {
        const value = `var(--text-${option.key})`;
        const pixels = cssLengthPx(option.value) ?? 16;
        return choice(
          option.key,
          option.value,
          value,
          currentSize === value || currentSize === option.value,
          { fontSize: `${Math.max(10, Math.min(24, pixels * 0.55))}px` },
        );
      });

    const currentTransform = current(state.designTypographyTransformToken);
    state.designTypographyCaseOptions = [
      ["none", "—", "none"],
      ["uppercase", "AB", "uppercase"],
      ["lowercase", "ab", "lowercase"],
      ["capitalize", "Ab", "capitalize"],
    ].map(([key, label, value]) => choice(key!, label!, value!, currentTransform === value, {}));

    const currentColor = current(state.designTypographyColorToken);
    state.designTypographyColorOptions = semanticColorRoles(theme).map((role) => {
      const value = `var(--color-${role.key})`;
      return choice(
        role.key,
        role.label,
        value,
        currentColor === value || currentColor === tokenValue(theme, `color-${role.key}`),
        { color: tokenValue(theme, `color-${role.key}`) ?? role.value },
      );
    });

    const currentDecoration = current(state.designTypographyDecorationToken);
    state.designTypographyDecorationOptions = [
      choice("none", "None", "none", currentDecoration === "none"),
      choice("underline", "Underline", "underline", currentDecoration === "underline"),
    ];
    state.designTypographyLineHeightValue = current(state.designTypographyLineHeightToken);
    const tracking = current(state.designTypographyLetterSpacingToken);
    const trackingMatch = tracking.match(/^(-?\d+(?:\.\d+)?)(px|em|rem|%)$/);
    state.designTypographyLetterSpacingValue = trackingMatch?.[1] ?? "0";
    state.designTypographyLetterSpacingUnit = trackingMatch?.[2] ?? "em";
  }

  // Theme defaults are for content-facing primitives. Structural wrappers do
  // not render meaningful content of their own, while escape-hatch blocks are
  // intentionally outside a governed design system. This explicit boundary
  // can become registry metadata once plugins need to classify themselves.
  const NON_THEME_PRIMITIVES = new Set([
    "group",
    "columns",
    "column",
    "html",
    "embed",
    PATTERN_ROOT_TYPE,
  ]);

  function syncDesignPrimitives(): void {
    const available = blockTypes().filter(
      (block) => !block.internal && !NON_THEME_PRIMITIVES.has(block.type),
    );
    if (!available.some((block) => block.type === state.designPrimitiveType))
      state.designPrimitiveType = available[0]?.type ?? "paragraph";
    state.designPrimitiveItems = available.map((block) => ({
      type: block.type,
      label: block.label,
      category: block.category ?? "Text",
      description: block.description ?? "",
      icon: iconOf(block.type),
      letter: letterOf(block.type),
      selected: block.type === state.designPrimitiveType,
    }));
    const selected = available.find((block) => block.type === state.designPrimitiveType);
    state.designPrimitiveLabel = selected?.label ?? state.designPrimitiveType;
    state.designPrimitiveDescription = selected?.description ?? "";
  }

  function seedPrimitiveContent(instance: Editor, root: Block): void {
    const examples: Record<string, string> = {
      heading: "Design with confidence",
      paragraph: "Edit this block directly. Its content, toolbar, styles, and behavior are live.",
      button: "Primary action",
      quote: "Good systems make the right choices feel natural.",
      pullquote: "A strong default is a quiet form of guidance.",
      code: 'const theme = "Aster";',
      preformatted: "A precise block preview",
      verse: "Form follows meaning.",
    };
    for (const block of flattenBlocks([root])) {
      const definition = getBlockType(block.type);
      if (!definition) continue;
      for (const field of definition.fields) {
        if ((field.type !== "rich" && field.type !== "text") || block.fields[field.name]) continue;
        instance.setField(
          block.id,
          field.name,
          examples[block.type] ?? `${definition.label} preview`,
        );
      }
    }
  }

  // The block a single-selection context targets: the caret's block, or the
  // one explicitly selected block. Multi-selections yield null — chrome that
  // cares about "many" reads selection.blocks.length itself.
  const singleTarget = () =>
    editor.selection.blocks.length > 1
      ? null
      : (editor.selection.active ??
        (editor.selection.blocks.length === 1 ? editor.selection.blocks[0] : null));

  // The block panel's target is STICKY while the user works in the sidebar:
  // focusing an option input moves the caret out of the canvas (active goes
  // null), but interacting with a block's options must never make those
  // options disappear. The stick releases when the block goes away or focus
  // leaves the sidebar without yielding a real target.
  let inspectedId: string | null = null;
  const panelTarget = () => {
    const live = singleTarget();
    if (live) {
      inspectedId = live;
      return live;
    }
    const focus = document.activeElement;
    // Focus IN TRANSIT (mousedown blurs the carrier before focusin lands on
    // the sidebar button — activeElement is body for a tick): HOLD the stick.
    // Releasing here wiped the panel mid-click, so "Edit pattern" acted on
    // nothing whenever only a caret (not a block selection) sat inside.
    if (!focus || focus === document.body) {
      return inspectedId && editor.getBlock(inspectedId) ? inspectedId : null;
    }
    if (inspectedId && editor.getBlock(inspectedId) && focus.closest("[data-pbe-keep-selection]"))
      return inspectedId;
    inspectedId = null;
    return null;
  };

  const imageValue = (id: string, field: string): ImageValue => {
    const v = editor.getBlock(id)?.fields[field];
    return typeof v === "object" && v !== null
      ? {
          src: v.src ?? "",
          alt: v.alt ?? "",
          width: v.width ?? "",
          height: v.height ?? "",
        }
      : { src: "", alt: "", width: "", height: "" };
  };

  const documentImageValue = (): MediaValue => ({
    id: state.documentFeaturedImageId || undefined,
    src: state.documentFeaturedImageSrc,
    alt: state.documentFeaturedImageAlt,
    width: state.documentFeaturedImageWidth,
    height: state.documentFeaturedImageHeight,
  });

  const setDocumentImageState = (value?: Partial<MediaValue>): MediaValue => {
    const next: MediaValue = {
      id: value?.id,
      src: value?.src ?? "",
      alt: value?.alt ?? "",
      width: value?.width ?? "",
      height: value?.height ?? "",
    };
    state.documentFeaturedImageId = next.id ?? "";
    state.documentFeaturedImageSrc = next.src;
    state.documentFeaturedImageAlt = next.alt ?? "";
    state.documentFeaturedImageWidth = next.width ?? "";
    state.documentFeaturedImageHeight = next.height ?? "";
    state.documentHasFeaturedImage = !!next.src;
    state.documentFeaturedButtonLabel = next.src ? "Replace featured image" : "Set featured image";
    return next;
  };

  const documentFeaturedImageHtml = (): string => {
    const value = documentImageValue();
    if (!value.src) return "";
    const image = document.createElement("img");
    image.src = value.src;
    image.alt = value.alt ?? "";
    if (value.width) image.setAttribute("width", String(value.width));
    if (value.height) image.setAttribute("height", String(value.height));
    return image.outerHTML;
  };

  const renderDocumentHtml = (content: string): string => {
    if (!state.documentTemplateName || !getTemplate(state.documentTemplateName)) return content;
    return renderTemplate(state.documentTemplateName, {
      content,
      title: state.documentTitle,
      featuredImage: documentFeaturedImageHtml(),
    });
  };

  const templateSlotIcon = (name: string): string =>
    iconRef(name === "featured-image" ? "image" : name === "title" ? "heading" : "group");

  const documentTemplateNodes = (): DocumentTemplateNode[] =>
    !state.documentTemplateVisible
      ? []
      : [
          ...(canvasDocument?.querySelectorAll<HTMLElement>("[data-pbe-template-node-id]") ?? []),
        ].map((element) => ({
          id: element.dataset.pbeTemplateNodeId!,
          kind: element.dataset.pbeTemplateNodeKind as "part" | "slot",
          name: element.dataset.pbeTemplateNodeName ?? "",
          label: element.dataset.pbeTemplateNodeLabel ?? "Template",
          icon:
            element.dataset.pbeTemplateNodeKind === "part"
              ? iconOf(TEMPLATE_PART_TYPE)
              : templateSlotIcon(element.dataset.pbeTemplateNodeName ?? ""),
          templatePart: element.dataset.pbeTemplateNodeKind === "part",
        }));

  const removeTemplateNodeToolbar = (): void => {
    templateNodeToolbar?.remove();
    templateNodeToolbar = null;
  };

  const syncTemplateNodeSelection = (): void => {
    if (!canvasDocument) return;
    for (const element of canvasDocument.querySelectorAll<HTMLElement>(
      "[data-pbe-template-node-id]",
    )) {
      element.toggleAttribute(
        "data-pbe-template-selected",
        element.dataset.pbeTemplateNodeId === state.selectedTemplateNodeId,
      );
    }
    state.documentTemplateSlots = documentTemplateNodes()
      .filter((node) => node.kind === "slot")
      .map((node) => ({
        id: node.id,
        name: node.name,
        label: node.label,
        icon: node.icon,
        selected: node.id === state.selectedTemplateNodeId,
      }));
    state.documentTemplateSlotsShown =
      state.documentTemplateVisible && state.documentTemplateSlots.length > 0;
  };

  const showTemplateNodeToolbar = (node: DocumentTemplateNode, element: HTMLElement): void => {
    removeTemplateNodeToolbar();
    if (node.kind !== "part") return;
    const toolbar = canvasDocument.createElement("div");
    toolbar.dataset.pbeTemplateNodeToolbar = "";
    toolbar.style.cssText =
      "position:absolute;z-index:2147483000;display:flex;border:1px solid #18181b;background:#fff;color:#18181b;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 1px 2px rgb(0 0 0/.08)";
    const label = canvasDocument.createElement("span");
    label.textContent = node.label;
    label.style.cssText = "display:flex;align-items:center;padding:10px 12px";
    const edit = canvasDocument.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit original";
    edit.style.cssText =
      "appearance:none;border:0;border-left:1px solid #18181b;background:#fff;color:#18181b;padding:10px 12px;font:600 13px/1.2 system-ui,sans-serif;cursor:pointer";
    edit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDocumentTemplatePartEditor(node.name);
    });
    toolbar.append(label, edit);
    canvasDocument.body.appendChild(toolbar);
    const rect = element.getBoundingClientRect();
    toolbar.style.left = `${Math.max(0, rect.left + canvasDocument.defaultView!.scrollX)}px`;
    toolbar.style.top = `${Math.max(0, rect.bottom + canvasDocument.defaultView!.scrollY)}px`;
    templateNodeToolbar = toolbar;
  };

  const selectTemplateNode = (id: string): void => {
    const node = documentTemplateNodes().find((candidate) => candidate.id === id);
    const element = canvasDocument?.querySelector<HTMLElement>(
      `[data-pbe-template-node-id="${CSS.escape(id)}"]`,
    );
    if (!node || !element) return;
    editor.clearSelection();
    inspectedId = null;
    state.selectedTemplateNodeId = id;
    syncTemplateNodeSelection();
    showTemplateNodeToolbar(node, element);
    element.scrollIntoView({ block: "nearest" });
    state.sidebarTab = node.kind === "part" ? "block" : "document";
    syncTree();
    syncBlockPanel();
  };

  const clearTemplateNodeSelection = (): void => {
    if (!state.selectedTemplateNodeId && !templateNodeToolbar) return;
    state.selectedTemplateNodeId = "";
    removeTemplateNodeToolbar();
    syncTemplateNodeSelection();
  };

  const templateNodeFromEvent = (event: Event): HTMLElement | null => {
    const target = event.target;
    if (!(target instanceof canvasDocument.defaultView!.Element)) return null;
    if (target.closest(".pbe-frame-wrap,[data-pbe-template-node-toolbar]")) return null;
    return target.closest<HTMLElement>("[data-pbe-template-node-id]");
  };

  const onTemplateNodeClick = (event: MouseEvent): void => {
    const element = templateNodeFromEvent(event);
    if (!element?.dataset.pbeTemplateNodeId) return;
    event.preventDefault();
    event.stopPropagation();
    selectTemplateNode(element.dataset.pbeTemplateNodeId);
  };

  const onTemplateNodeKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const element = templateNodeFromEvent(event);
    if (!element?.dataset.pbeTemplateNodeId) return;
    event.preventDefault();
    selectTemplateNode(element.dataset.pbeTemplateNodeId);
  };

  const applyThemeTokensTo = (element: HTMLElement): void => {
    for (const token of activeTheme().tokens)
      element.style.setProperty(`--${token.name}`, token.value);
  };

  const neutralizeProjectedContentSlot = (slot: HTMLElement): void => {
    // A slot is replaced, not wrapped, when the template is published.
    // Template-editor placeholder utilities (including the legacy CMS
    // `px-4 py-8 text-center` marker) therefore must not participate in the
    // document projection. `all: unset` preserves inheritance from the slot's
    // real parent while removing the slot element's own layout and typography.
    slot.style.setProperty("all", "unset", "important");
    slot.style.setProperty("display", "contents", "important");
  };

  const mountBareCanvas = (): void => {
    if (!canvasDocument || !wrapEl) return;
    clearTemplateNodeSelection();
    state.documentTemplateSlots = [];
    state.documentTemplateSlotsShown = false;
    canvasDocument.body.replaceChildren(wrapEl);
  };

  const mountDocumentFrame = (): void => {
    if (!canvasDocument || !wrapEl) return;
    const usesRegisteredTemplate =
      !!state.documentTemplateName && !!getTemplate(state.documentTemplateName);
    if (
      (usesRegisteredTemplate && !state.documentTemplateVisible) ||
      (!usesRegisteredTemplate && !shellOptions?.frame?.html)
    ) {
      mountBareCanvas();
      if (editor) syncTree();
      return;
    }

    let frameHtml = shellOptions?.frame?.html ?? "";
    if (usesRegisteredTemplate) {
      const definition = getTemplate(state.documentTemplateName)!;
      const hydrated = document.createElement("div");
      hydrated.innerHTML = hydrateTemplateParts(definition.content);
      frameHtml = downcast(upcast(hydrated), "data");
    }
    if (!frameHtml) {
      mountBareCanvas();
      if (editor) syncTree();
      return;
    }

    clearTemplateNodeSelection();
    const surface = canvasDocument.createElement("div");
    surface.dataset.pbeTemplateSurface = "";
    surface.innerHTML = frameHtml;
    applyThemeTokensTo(surface);
    canvasDocument.body.replaceChildren(surface);

    if (usesRegisteredTemplate) {
      let partIndex = 0;
      for (const part of surface.querySelectorAll<HTMLElement>("[data-publr-template-part]")) {
        const name = part.dataset.publrTemplatePart ?? "";
        const label = getTemplatePart(name)?.label ?? (name || "Template part");
        part.dataset.pbeTemplateNodeId = `template:part:${partIndex++}:${name}`;
        part.dataset.pbeTemplateNodeKind = "part";
        part.dataset.pbeTemplateNodeName = name;
        part.dataset.pbeTemplateNodeLabel = label;
        part.tabIndex = 0;
      }
      let contentSlot: HTMLElement | null = null;
      let slotIndex = 0;
      for (const slot of surface.querySelectorAll<HTMLElement>("[data-publr-slot]")) {
        const rawName = slot.dataset.publrSlot ?? "content";
        const name = rawName === "entry-content" ? "content" : rawName;
        const label = TEMPLATE_SLOTS.find((candidate) => candidate.name === name)?.label ?? name;
        slot.classList.remove("pbe-template-slot");
        slot.dataset.pbeTemplateNodeId = `template:slot:${slotIndex++}:${name}`;
        slot.dataset.pbeTemplateNodeKind = "slot";
        slot.dataset.pbeTemplateNodeName = name;
        slot.dataset.pbeTemplateNodeLabel = label;
        slot.tabIndex = 0;
        if (name === "content") {
          contentSlot = slot;
          neutralizeProjectedContentSlot(slot);
          slot.replaceChildren(wrapEl);
        } else if (name === "title") {
          slot.textContent = state.documentTitle;
        } else if (name === "featured-image") {
          slot.innerHTML = documentFeaturedImageHtml();
        }
      }
      if (!contentSlot) {
        contentSlot = canvasDocument.createElement("div");
        contentSlot.dataset.pbeTemplateNodeId = `template:slot:${slotIndex}:content`;
        contentSlot.dataset.pbeTemplateNodeKind = "slot";
        contentSlot.dataset.pbeTemplateNodeName = "content";
        contentSlot.dataset.pbeTemplateNodeLabel = "Content";
        contentSlot.tabIndex = 0;
        neutralizeProjectedContentSlot(contentSlot);
        contentSlot.appendChild(wrapEl);
        surface.appendChild(contentSlot);
      }
      const contentNodeId = contentSlot.dataset.pbeTemplateNodeId;
      if (contentNodeId && !(contentNodeId in state.treeExpanded))
        state.treeExpanded[contentNodeId] = true;
    } else {
      const slot = surface.querySelector(
        shellOptions?.frame?.slotSelector ??
          '[data-publr-slot="content"],[data-publr-slot="entry-content"]',
      );
      if (slot) slot.replaceChildren(wrapEl);
      else surface.appendChild(wrapEl);
    }
    syncTemplateNodeSelection();
    if (editor) syncTree();
  };

  const commitDocumentImage = async (value: MediaValue): Promise<void> => {
    setDocumentImageState(value);
    if (!state.templateMode) mountDocumentFrame();
    state.documentFeaturedError = "";
    try {
      await shellOptions?.document?.onFeaturedImageChange?.(value, editor);
    } catch (err) {
      console.error("[publr-editor] featured image update failed:", err);
      state.documentFeaturedError = "Couldn't update the featured image.";
    }
  };

  const closeDocumentFeaturedMenu = (): void => {
    const trigger = document.querySelector<HTMLElement>(
      "#document-featured-dropdown [data-document-featured-trigger]:not(.hidden)",
    );
    // PublrJS binds boolean true as an empty attribute value, not "true".
    if (trigger && trigger.getAttribute("aria-expanded") !== "false") trigger.click();
    state.documentFeaturedUrlOpen = false;
  };

  const plainText = (html: FieldValue | undefined): string => {
    const d = document.createElement("div");
    d.innerHTML = typeof html === "string" ? html : "";
    return d.textContent ?? "";
  };

  // List view rows: the recursive block tree FLATTENED into a list — depth
  // becomes padding, collapse prunes the walk. Runs ONLY inside its effect:
  // reading docEpoch there is what subscribes it to model edits, and every
  // run re-collects the treeExpanded[id] deps for the CURRENT blocks — a
  // direct (untracked) call would freeze the dep set at whatever the model
  // looked like last.
  function syncTree() {
    void state.docEpoch;
    const selected = new Set(editor.selection.blocks);
    if (editor.selection.active) selected.add(editor.selection.active);
    const rows: TreeRow[] = [];
    const rowFor = (b: Block, depth: number, hasChildren: boolean, expanded: boolean): TreeRow => ({
      id: b.id,
      depth,
      pad: `${4 + depth * 20}px`,
      // headings show their level's icon (H2); every
      // pattern instance leads with the ONE shared pattern icon — the
      // definition's icon is inserter metadata, not tree identity
      icon:
        b.type === "heading"
          ? iconRef(`heading-level-${plainText(b.fields.level).replace(/\D/g, "") || "2"}`)
          : b.pattern && getPattern(b.pattern)
            ? iconOf(PATTERN_ROOT_TYPE)
            : presentationIcon(b),
      letter: letterOf(containerPresentation(b) ?? b.type),
      label: blockLabelOf(b),
      anchor: b.type === "heading" ? plainText(b.fields.text).trim() : "",
      container: isContainerBlock(b),
      pattern: !!(b.pattern && getPattern(b.pattern)),
      templatePart: b.type === TEMPLATE_PART_TYPE,
      hasChildren,
      expanded,
      selected: selected.has(b.id),
      movable: editor.editingMode(b.id) === "default" && editor.canMove(b.id),
      draggable: editor.editingMode(b.id) === "default" && editor.canMove(b.id) ? "true" : "false",
    });
    const walk = (blocks: Block[], depth: number) => {
      for (const b of blocks) {
        // PATTERN SELECTION STATE (thoughts/012): in the MAIN editor a
        // pattern subtree reads as its CONTENT — a flat list of content
        // blocks under the root, no layout/invisible rows. The full
        // structure belongs to Edit pattern's isolation editor.
        if (b.pattern && getPattern(b.pattern)) {
          const content = patternContentBlocks(b);
          const expanded = content.length > 0 && !!state.treeExpanded[b.id];
          rows.push(rowFor(b, depth, content.length > 0, expanded));
          if (expanded) for (const c of content) rows.push(rowFor(c, depth + 1, false, false));
          continue;
        }
        const hasChildren = !!b.children && b.children.length > 0;
        const expanded = hasChildren && !!state.treeExpanded[b.id];
        rows.push(rowFor(b, depth, hasChildren, expanded));
        if (expanded) walk(b.children!, depth + 1);
      }
    };
    if (
      state.documentTemplateVisible &&
      !state.templateMode &&
      state.documentTemplateName &&
      getTemplate(state.documentTemplateName)
    ) {
      for (const node of documentTemplateNodes()) {
        const contentSlot = node.kind === "slot" && node.name === "content";
        const expanded =
          contentSlot &&
          editor.getModel().blocks.length > 0 &&
          state.treeExpanded[node.id] !== false;
        rows.push({
          id: node.id,
          depth: 0,
          pad: "4px",
          icon: node.icon,
          letter: node.label[0]?.toUpperCase() ?? "?",
          label: node.label,
          anchor: "",
          container: false,
          pattern: false,
          templatePart: node.templatePart,
          hasChildren: contentSlot && editor.getModel().blocks.length > 0,
          expanded,
          selected: node.id === state.selectedTemplateNodeId,
          movable: false,
          draggable: "false",
        });
        if (expanded) walk(editor.getModel().blocks, 1);
      }
    } else {
      walk(editor.getModel().blocks, 0);
    }
    state.treeRows = rows;
    const overviewRows: TreeRow[] = [];
    const walkOverview = (blocks: Block[], depth: number) => {
      for (const block of blocks) {
        const hasChildren = !!block.children?.length;
        overviewRows.push({
          ...rowFor(block, depth, hasChildren, hasChildren),
          pad: `${4 + depth * 12}px`,
        });
        if (hasChildren) walkOverview(block.children!, depth + 1);
      }
    };
    if (state.templateIsPattern) walkOverview(editor.getModel().blocks, 0);
    state.patternOverviewRows = overviewRows;
  }

  // Tree View drag/reorder. The source row remains in place and an absolutely
  // positioned, depth-indented line marks the destination without entering
  // layout. The model changes once on drop.
  interface TreeDrop {
    parentId: string | null;
    index: number;
    depth: number;
  }

  let treeDraggedId: string | null = null;
  let treeDrop: TreeDrop | null = null;
  let treeDropIndicator: HTMLElement | null = null;
  let treeDragPreview: HTMLElement | null = null;

  const treeRowsElement = (): HTMLElement | null => document.getElementById("tree-rows");
  const treeRowElement = (id: string): HTMLElement | null =>
    treeRowsElement()?.querySelector<HTMLElement>(`[data-tree-row][data-id="${CSS.escape(id)}"]`) ??
    null;

  const treeBaseDepth = (): number =>
    state.documentTemplateVisible &&
    !state.templateMode &&
    !!state.documentTemplateName &&
    !!getTemplate(state.documentTemplateName)
      ? 1
      : 0;

  const treeDepthFor = (parentId: string | null): number =>
    parentId
      ? (pathToBlock(editor.getModel().blocks, parentId)?.length ?? 0) + treeBaseDepth()
      : treeBaseDepth();

  const treeFinalIndex = (parentId: string | null, rawIndex: number): number => {
    if (!treeDraggedId) return rawIndex;
    const source = locateBlock(editor.getModel().blocks, treeDraggedId);
    const parent = parentId ? editor.getBlock(parentId) : null;
    const destination = parent?.children ?? (parentId ? null : editor.getModel().blocks);
    if (!source || !destination) return rawIndex;
    return Math.max(0, rawIndex - (source.list === destination && source.index < rawIndex ? 1 : 0));
  };

  const treeDropCandidate = (parentId: string | null, rawIndex: number): TreeDrop | null => {
    if (!treeDraggedId || !editor.canMoveTo(treeDraggedId, parentId)) return null;
    return {
      parentId,
      index: treeFinalIndex(parentId, rawIndex),
      depth: treeDepthFor(parentId),
    };
  };

  const treeDropIsOrigin = (drop: TreeDrop): boolean => {
    if (!treeDraggedId) return true;
    const source = locateBlock(editor.getModel().blocks, treeDraggedId);
    return !!source && (source.parent?.id ?? null) === drop.parentId && source.index === drop.index;
  };

  const treeDestinationAt = (event: DragEvent): TreeDrop | null => {
    if (!treeDraggedId) return null;
    const rows = [...(treeRowsElement()?.querySelectorAll<HTMLElement>("[data-tree-row]") ?? [])];
    if (!rows.length) return treeDropCandidate(null, 0);
    const measured = rows.map((row) => ({
      row,
      rect: row.getBoundingClientRect(),
    }));
    let target = measured.find(
      ({ rect }) => event.clientY >= rect.top && event.clientY <= rect.bottom,
    );
    if (!target) {
      target = measured.reduce((nearest, candidate) => {
        const nearestY = nearest.rect.top + nearest.rect.height / 2;
        const candidateY = candidate.rect.top + candidate.rect.height / 2;
        return Math.abs(event.clientY - candidateY) < Math.abs(event.clientY - nearestY)
          ? candidate
          : nearest;
      });
    }
    const targetId = target.row.dataset.id;

    // The registered page template's content node is a visual wrapper around
    // the model root. Dropping on its body therefore means the root list.
    if (targetId?.startsWith("template:")) {
      const node = documentTemplateNodes().find((candidate) => candidate.id === targetId);
      if (node?.kind === "slot" && node.name === "content")
        return treeDropCandidate(null, editor.getModel().blocks.length);
      return null;
    }

    const at = targetId ? locateBlock(editor.getModel().blocks, targetId) : null;
    if (!at) return treeDropCandidate(null, editor.getModel().blocks.length);
    const { rect } = target;
    const ratio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
    const after = ratio >= 0.5;

    // Pull left through the indentation gutter to climb tree levels. This
    // makes unnesting explicit without sacrificing the row's vertical
    // before/inside/after zones.
    const visibleDepth = Number(target.row.dataset.depth ?? 0);
    const intendedDepth = Math.max(0, Math.floor((event.clientX - rect.left - 4) / 20));
    if (intendedDepth < visibleDepth) {
      let cursor: ReturnType<typeof locateBlock> = at;
      for (let level = visibleDepth; cursor?.parent && level > intendedDepth; level--)
        cursor = locateBlock(editor.getModel().blocks, cursor.parent.id);
      if (cursor) {
        const outside = treeDropCandidate(
          cursor.parent?.id ?? null,
          cursor.index + (after ? 1 : 0),
        );
        if (outside) return outside;
      }
    }

    // The middle half of a container row means "inside". This works for
    // collapsed and empty containers too; the destination expands after drop.
    if (ratio >= 0.25 && ratio <= 0.75 && at.block.children) {
      const nested = treeDropCandidate(at.block.id, at.block.children.length);
      if (nested) return nested;
    }

    // Try beside the target, then climb outward. The climb is both the
    // fallback when a nearer slot rejects this type.
    let cursor: ReturnType<typeof locateBlock> = at;
    while (cursor) {
      const beside = treeDropCandidate(cursor.parent?.id ?? null, cursor.index + (after ? 1 : 0));
      if (beside) return beside;
      cursor = cursor.parent ? locateBlock(editor.getModel().blocks, cursor.parent.id) : null;
    }
    return null;
  };

  const showTreeDropIndicator = (drop: TreeDrop): void => {
    const rowsEl = treeRowsElement();
    if (!rowsEl || !treeDraggedId) return;
    if (!treeDropIndicator) {
      treeDropIndicator = document.createElement("div");
      treeDropIndicator.dataset.treeDropIndicator = "";
      treeDropIndicator.className = "pbe-tree-drop-indicator";
      treeDropIndicator.setAttribute("aria-hidden", "true");
      rowsEl.appendChild(treeDropIndicator);
    }
    treeDropIndicator.dataset.parentId = drop.parentId ?? "";
    treeDropIndicator.dataset.index = String(drop.index);
    treeDropIndicator.dataset.depth = String(drop.depth);

    const parent = drop.parentId ? editor.getBlock(drop.parentId) : null;
    const destination = (parent?.children ?? editor.getModel().blocks).filter(
      (block) => block.id !== treeDraggedId,
    );
    const next = destination[drop.index];
    const nextRow = next ? treeRowElement(next.id) : null;
    let boundary: Element | null = nextRow;
    const rowAfterSubtree = (row: HTMLElement): Element | null => {
      let afterSubtree = row.nextElementSibling;
      const depth = Number(row.dataset.depth ?? 0);
      while (
        afterSubtree instanceof HTMLElement &&
        afterSubtree.matches("[data-tree-row]") &&
        Number(afterSubtree.dataset.depth ?? 0) > depth
      )
        afterSubtree = afterSubtree.nextElementSibling;
      return afterSubtree?.matches("[data-tree-row]") ? afterSubtree : null;
    };
    if (nextRow) {
      boundary = nextRow;
    } else if (drop.parentId) {
      const parentRow = treeRowElement(drop.parentId);
      if (!parentRow) return;
      boundary = rowAfterSubtree(parentRow);
    } else {
      // A registered template's Content row visually owns the model root.
      // Anchor an end-of-root marker before the following template node
      // (commonly Footer), rather than after the final row in the whole tree.
      const contentNode = documentTemplateNodes().find(
        (node) => node.kind === "slot" && node.name === "content",
      );
      const contentRow = contentNode ? treeRowElement(contentNode.id) : null;
      if (contentRow) boundary = rowAfterSubtree(contentRow);
    }

    const rowsRect = rowsEl.getBoundingClientRect();
    const canonicalRows = [...rowsEl.querySelectorAll<HTMLElement>("[data-tree-row]")];
    const boundaryY = boundary
      ? boundary.getBoundingClientRect().top
      : (canonicalRows.at(-1)?.getBoundingClientRect().bottom ?? rowsRect.top);
    treeDropIndicator.style.top = `${boundaryY - rowsRect.top}px`;
    // Match the destination row's block icon, not its outer indentation:
    // 4px row inset + 20px per level + the 24px disclosure column.
    treeDropIndicator.style.left = `${28 + drop.depth * 20}px`;
    treeDrop = drop;
  };

  const clearTreeDropIndicator = (): void => {
    treeDropIndicator?.remove();
    treeDropIndicator = null;
    treeDrop = null;
  };

  const endTreeDrag = (): void => {
    if (treeDraggedId) treeRowElement(treeDraggedId)?.removeAttribute("data-tree-drag-source");
    treeDraggedId = null;
    treeDrop = null;
    treeDropIndicator?.remove();
    treeDropIndicator = null;
    treeDragPreview?.remove();
    treeDragPreview = null;
    treeRowsElement()?.removeAttribute("data-tree-dragging");
  };

  // Outline: document stats + the heading outline (level chips, indent
  // guides, empty-heading warnings — a document overview). Same
  // docEpoch discipline as syncTree: runs only inside its effect.
  function syncOutline() {
    void state.docEpoch;
    const AVERAGE_WPM = 189; // a common reading-speed constant
    const rows: OutlineRow[] = [];
    let prevLevel = 0; // previous heading's level in document order (0 = none yet)
    let chars = 0;
    let words = 0;
    const count = (text: string) => {
      chars += text.length;
      words += (text.match(/\S+/g) ?? []).length;
    };
    for (const b of flattenBlocks(editor.getModel().blocks)) {
      if (b.type === "raw-html") {
        count(plainText(b.fields.html));
        continue;
      }
      // count only CONTENT carriers — a tag field ("h2") is not prose
      for (const spec of getBlockType(b.type)?.fields ?? []) {
        if (spec.type === "text") count(plainText(b.fields[spec.name]));
        else if (spec.type === "rich") count(plainText(b.fields[spec.name]));
      }
      if (b.type === "heading") {
        const level = Number(plainText(b.fields.level).replace(/\D/g, "")) || 2;
        const text = plainText(b.fields.text).trim();
        // The conventional structure check: a heading may go any number of levels
        // UP, but only ONE level deeper than the previous heading — H2 → H4
        // skips H3 and reads as a broken document outline.
        const badLevel = prevLevel > 0 && level > prevLevel + 1;
        prevLevel = level;
        rows.push({
          id: b.id,
          level: `H${level}`,
          guide: `${(level - 1) * 20}px`,
          text: text || "(Empty heading)",
          empty: !text,
          badLevel,
          flagged: !text || badLevel,
        });
      }
    }
    state.docChars = String(chars);
    state.docWords = String(words);
    const minutes = Math.round(words / AVERAGE_WPM);
    state.docReadTime = minutes < 1 ? "< 1 minute" : `${minutes} minute${minutes > 1 ? "s" : ""}`;
    state.outlineRows = rows;
    state.outlineEmpty = rows.length === 0;
  }

  // --- CSS engine + theme editing (E3/E4) -----------------------------------

  // The class universe the engine compiles: the canvas PLUS every registered
  // pattern's classes, so the inserter's pattern PREVIEWS render even when
  // their classes aren't on the canvas yet (a pattern is styled before it's
  // inserted). Pattern set is static per session — collected once.
  let patternClasses: string[] | null = null;
  function allClasses(): string[] {
    if (!patternClasses) {
      const set = new Set<string>();
      for (const pattern of patternTypes())
        for (const c of collectClasses(pattern.content)) set.add(c);
      patternClasses = [...set];
    }
    // Isolation backdrop: instance editing borrows the copy's root classes
    // onto the CANVAS ELEMENT (bg, positioning context) — they're not in the
    // serialized fragment, so compile them explicitly or the section loses
    // its background the moment isolation opens.
    return [
      ...new Set([
        ...collectClasses(editor.serialize()),
        ...patternClasses,
        ...backdropClasses,
        ...[...primitiveDrafts.values()].flatMap((html) => collectClasses(html)),
        ...templateTypes().flatMap((template) =>
          collectClasses(hydrateTemplateParts(template.content)),
        ),
        ...templatePartTypes().flatMap((part) => collectClasses(part.content)),
      ]),
    ];
  }

  let engineTimer: number | undefined;
  function refreshEngineCss(): void {
    const engine = cssEngine;
    if (!engine) return;
    window.clearTimeout(engineTimer);
    engineTimer = window.setTimeout(() => {
      void engine
        .compile(allClasses())
        .then((r) => {
          currentEngineCss = r.css;
          if (engineTag) engineTag.textContent = scopeEngineCss(r.css);
          resetPatternPreviews();
          if (state.canvasResponsiveCompare) requestAnimationFrame(syncResponsiveComparison);
        })
        .catch((e: unknown) => console.warn("[pbe] engine compile failed:", e));
    }, 150);
  }

  // The editor shell owns UI tokens with some of the same conventional names
  // as a site theme (notably --color-accent). Re-scope the complete active
  // theme on the CANVAS only so authored blocks never inherit chrome colors.
  // Inline toolbar/menu elements are siblings mounted in .wrap; scoping any
  // higher would recolor the editor UI with the site's content palette.
  const canvasThemeNames = new Set<string>();
  function syncCanvasThemeTokens(): void {
    const next = new Set(activeTheme().tokens.map((token) => token.name));
    for (const name of canvasThemeNames) {
      if (!next.has(name)) canvasEl.style.removeProperty(`--${name}`);
    }
    for (const token of activeTheme().tokens) {
      canvasEl.style.setProperty(`--${token.name}`, token.value);
    }
    const templateSurface = canvasDocument?.querySelector<HTMLElement>(
      "[data-pbe-template-surface]",
    );
    if (templateSurface) applyThemeTokensTo(templateSurface);
    canvasThemeNames.clear();
    for (const name of next) canvasThemeNames.add(name);
    if (state.canvasResponsiveCompare) requestAnimationFrame(syncResponsiveComparison);
  }

  const designPreviewThemeNames = new Set<string>();
  function syncDesignPreviewThemeTokens(): void {
    const root = canvasFrame?.closest<HTMLElement>("#editor-shell");
    const previewSurface = root?.querySelector<HTMLElement>("[data-design-preview-surface]");
    if (!previewSurface) return;
    const next = new Set(activeTheme().tokens.map((token) => token.name));
    for (const name of designPreviewThemeNames) {
      if (!next.has(name)) previewSurface.style.removeProperty(`--${name}`);
    }
    for (const token of activeTheme().tokens) {
      previewSurface.style.setProperty(`--${token.name}`, token.value);
    }
    designPreviewThemeNames.clear();
    for (const name of next) designPreviewThemeNames.add(name);
  }

  function syncDesignPreview(): void {
    const theme = activeTheme();
    const value = (name: string, fallback: string, ...aliases: string[]) =>
      tokenValue(theme, name) ??
      aliases.map((alias) => tokenValue(theme, alias)).find((candidate) => candidate != null) ??
      fallback;
    const base = {
      surface: value("color-surface", "#ffffff"),
      foreground: value("color-foreground", "#18181b"),
      muted: value("color-muted-surface", "#f4f4f5", "color-muted"),
      mutedForeground: value("color-muted-foreground", "#3f3f46"),
      mutedBorder: value("color-muted-border", "#d4d4d8", "color-border"),
      accent: value("color-accent-surface", "#3858e9", "color-accent"),
      accentForeground: value("color-accent-foreground", "#ffffff"),
      accentBorder: value("color-accent-border", "#2947ce", "color-border"),
      border: value("color-border", "#e4e4e7"),
    };
    const contexts = colorContexts(theme);
    if (!contexts.some((context) => context.key === state.designPreviewContext))
      state.designPreviewContext = contexts[0]?.key ?? "default";
    const prefix = state.designPreviewContext === "default" ? "" : `${state.designPreviewContext}-`;
    const contextual = (role: string, fallback: string) =>
      value(`color-${prefix}${role}`, fallback);
    state.designPreviewContextLabel = colorContextLabel(state.designPreviewContext, theme);
    const previewColor = (role: string, fallback: string) =>
      resolveThemeValue(theme, contextual(role, fallback));
    state.designPreviewSurface = previewColor("surface", base.surface);
    state.designPreviewForeground = previewColor("foreground", base.foreground);
    state.designPreviewMuted = previewColor("muted-surface", base.muted);
    state.designPreviewMutedForeground = previewColor("muted-foreground", base.mutedForeground);
    state.designPreviewMutedBorder = previewColor("muted-border", base.mutedBorder);
    state.designPreviewAccent = previewColor("accent-surface", base.accent);
    state.designPreviewAccentForeground = previewColor("accent-foreground", base.accentForeground);
    state.designPreviewAccentBorder = previewColor("accent-border", base.accentBorder);
    state.designPreviewBorder = previewColor("border", base.border);
    state.designPreviewFont = value("font-sans", "Inter, ui-sans-serif, system-ui, sans-serif");
  }

  const colorLabel = (key: string) =>
    key
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const sortColorShades = <T extends { key: string }>(shades: T[]): T[] =>
    [...shades].sort((a, b) => {
      if (!a.key) return -1;
      if (!b.key) return 1;
      const an = Number(a.key);
      const bn = Number(b.key);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      if (Number.isFinite(an)) return -1;
      if (Number.isFinite(bn)) return 1;
      return a.key.localeCompare(b.key);
    });

  function designColorFamilies(theme: Theme): DesignColorFamilyRow[] {
    const parsed = paletteTokens(theme).map((token) => {
      const namespace = token.name.startsWith("color-palette-")
        ? ("color-palette" as const)
        : ("color" as const);
      const key = token.name.slice(`${namespace}-`.length);
      return {
        token,
        namespace,
        key,
      };
    });
    const keysByNamespace = new Map<"color" | "color-palette", Set<string>>();
    for (const color of parsed) {
      const keys = keysByNamespace.get(color.namespace) ?? new Set<string>();
      keys.add(color.key);
      keysByNamespace.set(color.namespace, keys);
    }
    const colors = parsed.map((color) => {
      const numeric = color.key.match(/^(.*)-(\d+)$/);
      if (numeric) return { ...color, base: numeric[1], shade: numeric[2] };
      const keys = keysByNamespace.get(color.namespace) ?? new Set<string>();
      const parent = [...keys]
        .filter((candidate) => candidate !== color.key && color.key.startsWith(`${candidate}-`))
        .sort((a, b) => b.length - a.length)[0];
      return parent
        ? { ...color, base: parent, shade: color.key.slice(parent.length + 1) }
        : { ...color, base: color.key, shade: "" };
    });
    const familyBases = new Set(colors.map((color) => `${color.namespace}:${color.base}`));
    const groups = new Map<string, typeof colors>();
    for (const color of colors) {
      const familyId = `${color.namespace}:${color.base}`;
      const id =
        color.shade || familyBases.has(`${color.namespace}:${color.key}`)
          ? familyId
          : `${color.namespace}:${color.key}`;
      const group = groups.get(id) ?? [];
      group.push(color);
      groups.set(id, group);
    }
    return [...groups].map(([id, group]) => {
      const first = group[0];
      const key = first.base;
      const shades = sortColorShades(
        group.map(({ token, shade }) => ({
          index: 0,
          name: token.name,
          key: shade,
          label: shade || "Base",
          value: token.value,
        })),
      ).map((shade, index) => ({ ...shade, index }));
      const main =
        shades.find((shade) => !shade.key) ??
        shades.find((shade) => shade.key === "500") ??
        shades[Math.floor(shades.length / 2)];
      return {
        id,
        key,
        label: colorLabel(key),
        namespace: first.namespace,
        sourceLabel: first.namespace === "color" ? "Tailwind" : "Theme",
        isRamp: shades.length > 1,
        shades,
        mainLabel: main?.label ?? "Base",
        mainValue: main?.value ?? "#000000",
      };
    });
  }

  interface OklchColor {
    l: number;
    c: number;
    h: number;
  }

  const clampColorChannel = (value: number, min = 0, max = 1) =>
    Math.min(max, Math.max(min, value));

  function srgbToOklch(red: number, green: number, blue: number): OklchColor {
    const linear = (channel: number) => {
      const value = clampColorChannel(channel);
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const r = linear(red);
    const g = linear(green);
    const b = linear(blue);
    const lRoot = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const mRoot = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const sRoot = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const l = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
    const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
    const yellowBlue = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
    const hue = (Math.atan2(yellowBlue, a) * 180) / Math.PI;
    return {
      l: clampColorChannel(l),
      c: Math.max(0, Math.hypot(a, yellowBlue)),
      h: (hue + 360) % 360,
    };
  }

  function hslToRgb(hue: number, saturation: number, lightness: number) {
    const h = ((hue % 360) + 360) % 360;
    const s = clampColorChannel(saturation);
    const l = clampColorChannel(lightness);
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const segment = h / 60;
    const x = chroma * (1 - Math.abs((segment % 2) - 1));
    const [red, green, blue] =
      segment < 1
        ? [chroma, x, 0]
        : segment < 2
          ? [x, chroma, 0]
          : segment < 3
            ? [0, chroma, x]
            : segment < 4
              ? [0, x, chroma]
              : segment < 5
                ? [x, 0, chroma]
                : [chroma, 0, x];
    const match = l - chroma / 2;
    return [red + match, green + match, blue + match] as const;
  }

  function parseColorToOklch(value: string, allowBrowserResolution = true): OklchColor | null {
    const color = value.trim().toLowerCase();
    const oklch = color.match(
      /^oklch\(\s*([+-]?(?:\d*\.)?\d+)(%)?\s+([+-]?(?:\d*\.)?\d+)(%)?\s+([+-]?(?:\d*\.)?\d+)/,
    );
    if (oklch) {
      return {
        l: clampColorChannel(Number(oklch[1]) / (oklch[2] ? 100 : 1)),
        c: Math.max(0, Number(oklch[3]) / (oklch[4] ? 100 : 1)),
        h: ((Number(oklch[5]) % 360) + 360) % 360,
      };
    }
    const hex = color.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
    if (hex) {
      const raw =
        hex[1].length <= 4
          ? hex[1]
              .slice(0, 3)
              .split("")
              .map((part) => part + part)
              .join("")
          : hex[1].slice(0, 6);
      return srgbToOklch(
        Number.parseInt(raw.slice(0, 2), 16) / 255,
        Number.parseInt(raw.slice(2, 4), 16) / 255,
        Number.parseInt(raw.slice(4, 6), 16) / 255,
      );
    }
    const rgb = color.match(/^rgba?\((.+)\)$/);
    if (rgb) {
      const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
      if (parts.length >= 3) {
        const channel = (part: string) =>
          clampColorChannel(Number.parseFloat(part) / (part.endsWith("%") ? 100 : 255));
        return srgbToOklch(channel(parts[0]), channel(parts[1]), channel(parts[2]));
      }
    }
    const hsl = color.match(/^hsla?\((.+)\)$/);
    if (hsl) {
      const parts = hsl[1].split(/[\s,/]+/).filter(Boolean);
      if (parts.length >= 3) {
        const [red, green, blue] = hslToRgb(
          Number.parseFloat(parts[0]),
          Number.parseFloat(parts[1]) / 100,
          Number.parseFloat(parts[2]) / 100,
        );
        return srgbToOklch(red, green, blue);
      }
    }
    if (allowBrowserResolution && typeof document !== "undefined") {
      const probe = document.createElement("span");
      probe.style.color = color;
      if (!probe.style.color) return null;
      probe.style.position = "fixed";
      probe.style.visibility = "hidden";
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      if (resolved && resolved.toLowerCase() !== color) return parseColorToOklch(resolved, false);
    }
    return null;
  }

  function generatedColorScale(value: string): { key: string; value: string }[] | null {
    const base = parseColorToOklch(value);
    if (!base) return null;
    const steps = [
      { key: "50", towardWhite: 0.9, chroma: 0.12 },
      { key: "100", towardWhite: 0.78, chroma: 0.25 },
      { key: "200", towardWhite: 0.62, chroma: 0.48 },
      { key: "300", towardWhite: 0.44, chroma: 0.7 },
      { key: "400", towardWhite: 0.22, chroma: 0.88 },
      { key: "500", towardWhite: 0, chroma: 1 },
      { key: "600", towardBlack: 0.12, chroma: 0.98 },
      { key: "700", towardBlack: 0.28, chroma: 0.9 },
      { key: "800", towardBlack: 0.44, chroma: 0.78 },
      { key: "900", towardBlack: 0.58, chroma: 0.65 },
      { key: "950", towardBlack: 0.76, chroma: 0.45 },
    ];
    return steps.map((step) => {
      if (step.key === "500") return { key: step.key, value };
      const lightness =
        "towardBlack" in step
          ? base.l * (1 - (step.towardBlack ?? 0))
          : base.l + (1 - base.l) * step.towardWhite;
      return {
        key: step.key,
        value: `oklch(${(clampColorChannel(lightness) * 100).toFixed(1)}% ${(base.c * step.chroma).toFixed(3)} ${base.h.toFixed(1)})`,
      };
    });
  }

  function syncDesignPanel(): void {
    const theme = activeTheme();
    state.designWorkspaceSidebarShown = false;
    const row = (
      name: string,
      key: string,
      value: string,
      isColor = false,
      previewValue = value,
    ): DesignRow => ({
      name,
      key,
      value,
      isColor,
      previewValue,
    });
    const section = (ns: string, label: string, rows: DesignRow[]): DesignSection => ({
      ns,
      label,
      rows,
      isPalette: ns === "color-palette",
      isText: ns === "text",
      isWeight: ns === "font-weight",
      isSpacing: ns === "spacing",
      isRadius: ns === "radius",
      isLeading: ns === "leading",
      isTracking: ns === "tracking",
    });
    state.designSections = [
      section(
        "color-palette",
        "Color palette",
        paletteTokens(theme).map((token) =>
          row(
            token.name,
            token.name.startsWith("color-palette-")
              ? token.name.slice("color-palette-".length)
              : token.name.slice("color-".length),
            token.value,
            true,
          ),
        ),
      ),
      section(
        "text",
        "Font sizes",
        fontSizes(theme).map((o) =>
          row(
            `text-${o.key}`,
            o.key,
            o.value,
            false,
            `${Math.max(11, Math.min(32, (cssLengthPx(o.value) ?? 16) * 0.55))}px`,
          ),
        ),
      ),
      section(
        "font-weight",
        "Font weights",
        theme.tokens
          .filter((token) => token.name.startsWith("font-weight-"))
          .map((token) => row(token.name, token.name.slice("font-weight-".length), token.value)),
      ),
      section("spacing", "Spacing", [
        row("spacing", "base", spacingBase(theme) ?? "0.25rem"),
        ...spacings(theme).map((option) => row(`spacing-${option.key}`, option.key, option.value)),
      ]),
      section(
        "radius",
        "Radii",
        radii(theme).map((o) => row(`radius-${o.key}`, o.key, o.value)),
      ),
      section(
        "leading",
        "Line heights",
        leadings(theme).map((o) => row(`leading-${o.key}`, o.key, o.value)),
      ),
      section(
        "tracking",
        "Letter spacings",
        trackings(theme).map((o) => row(`tracking-${o.key}`, o.key, o.value)),
      ),
    ];
    state.designScaleSections = state.designSections.filter((section) => !section.isPalette);
    state.designColorFamilies = designColorFamilies(theme);
    state.designSpacing = spacingBase(theme) ?? "";
    const resolvedBreakpoints = styleBreakpoints(theme);
    const breakpointRows: DesignBreakpointRow[] = resolvedBreakpoints.map((breakpoint) => ({
      key: breakpoint.key,
      label: breakpoint.label,
      token: breakpoint.token ?? `breakpoint-${breakpoint.key}`,
      width: breakpoint.viewport,
      numeric: cssLengthPx(breakpoint.viewport) ?? 0,
      device: breakpointDevice(breakpoint.key, theme),
      mediaQuery: breakpoint.key !== "base",
      locked: breakpoint.key === "base",
      dragLabel: `Move ${breakpoint.label} to another device`,
      removeLabel: `Remove ${breakpoint.label} breakpoint`,
    }));
    const deviceDescriptions: Record<ViewportDevice, string> = {
      mobile: "Base styles and narrow-device previews.",
      tablet: "Intermediate layouts for portrait and landscape tablets.",
      desktop: "Wide layouts and large-screen previews.",
    };
    state.designBreakpointDevices = VIEWPORT_DEVICE_META.map((device) => {
      const rows = breakpointRows.filter((breakpoint) => breakpoint.device === device.key);
      return {
        ...device,
        description: deviceDescriptions[device.key],
        rows,
        adding: state.designBreakpointAdding === device.key,
      };
    });
    const mediaWidths = breakpointRows
      .filter((breakpoint) => breakpoint.mediaQuery)
      .map((breakpoint) => cssLengthPx(breakpoint.width));
    state.designBreakpointOrderValid =
      mediaWidths.every((width) => width != null) &&
      mediaWidths.every((width, index) => index === 0 || width! > mediaWidths[index - 1]!);
    const resolvedContainers = containerWidths(theme);
    state.designContainerWidths = [
      {
        key: "content",
        label: "Content",
        token: "container-content",
        width: resolvedContainers.content,
        numeric: cssLengthPx(resolvedContainers.content) ?? 645,
        rangeValue: (((cssLengthPx(resolvedContainers.content) ?? 645) - 420) / (960 - 420)) * 100,
        min: 420,
        max: 960,
        step: 5,
        description: "Reading-width text and ordinary inner blocks.",
      },
      {
        key: "wide",
        label: "Wide",
        token: "container-wide",
        width: resolvedContainers.wide,
        numeric: cssLengthPx(resolvedContainers.wide) ?? 1340,
        rangeValue: (((cssLengthPx(resolvedContainers.wide) ?? 1340) - 900) / (1800 - 900)) * 100,
        min: 900,
        max: 1800,
        step: 10,
        description: "Navigation, card grids, galleries, and editorial layouts.",
      },
      {
        key: "gutter",
        label: "Side gutter",
        token: "container-gutter",
        width: resolvedContainers.gutter,
        numeric: cssLengthPx(resolvedContainers.gutter) ?? 24,
        rangeValue: (((cssLengthPx(resolvedContainers.gutter) ?? 24) - 8) / (96 - 8)) * 100,
        min: 8,
        max: 96,
        step: 2,
        description: "Minimum breathing room between a container and the viewport edge.",
      },
    ];
    const typeDefault = (
      token: string,
      label: string,
      fallback: string,
      property: string,
      description: string,
    ): DesignTypographyDefaultRow => {
      const value = tokenValue(theme, token) ?? fallback;
      const control: DesignTypographyDefaultRow["control"] =
        property === "font-family"
          ? "font"
          : property === "font-weight"
            ? "weight"
            : property === "line-height"
              ? "lineHeight"
              : property === "font-size"
                ? "size"
                : "spacing";
      const numeric =
        control === "lineHeight" || control === "weight"
          ? Number.parseFloat(value)
          : (cssLengthPx(value) ?? 0);
      const limits = {
        font: { min: 0, max: 0, step: 0, unit: "" },
        size: {
          min: 12,
          max: token === "publr-heading-1-size" ? 96 : 72,
          step: 1,
          unit: "px",
        },
        lineHeight: { min: 0.8, max: 2.2, step: 0.05, unit: "" },
        weight: { min: 300, max: 900, step: 100, unit: "" },
        spacing: {
          min: 0,
          max: token === "publr-rule-spacing" ? 96 : 64,
          step: 1,
          unit: "px",
        },
      }[control];
      return {
        token,
        label,
        value,
        numeric,
        rangeValue:
          limits.max > limits.min ? ((numeric - limits.min) / (limits.max - limits.min)) * 100 : 0,
        ...limits,
        control,
        property,
        description,
      };
    };
    state.designTypographyDefaults = [
      {
        key: "body",
        label: "Body text",
        description: "The inherited reading style for unstyled content.",
        rows: [
          typeDefault(
            "publr-body-font-family",
            "Font family",
            SITE_TYPOGRAPHY_DEFAULTS.bodyFontFamily,
            "font-family",
            "A font token reference or any valid CSS font stack.",
          ),
          typeDefault(
            "publr-body-font-size",
            "Font size",
            SITE_TYPOGRAPHY_DEFAULTS.bodyFontSize,
            "font-size",
            "The root size inherited by paragraphs and other elements.",
          ),
          typeDefault(
            "publr-body-line-height",
            "Line height",
            SITE_TYPOGRAPHY_DEFAULTS.bodyLineHeight,
            "line-height",
            "A unitless rhythm or a valid CSS length.",
          ),
        ],
      },
      {
        key: "headings",
        label: "Headings",
        description: "Shared heading voice plus the default scale for H1–H4.",
        rows: [
          typeDefault(
            "publr-heading-font-family",
            "Font family",
            SITE_TYPOGRAPHY_DEFAULTS.headingFontFamily,
            "font-family",
            "A font token reference or any valid CSS font stack.",
          ),
          typeDefault(
            "publr-heading-font-weight",
            "Font weight",
            SITE_TYPOGRAPHY_DEFAULTS.headingFontWeight,
            "font-weight",
            "A CSS weight such as 600, 700, or bold.",
          ),
          typeDefault(
            "publr-heading-line-height",
            "Line height",
            SITE_TYPOGRAPHY_DEFAULTS.headingLineHeight,
            "line-height",
            "Shared line height for every heading level.",
          ),
          typeDefault(
            "publr-heading-1-size",
            "H1 size",
            SITE_TYPOGRAPHY_DEFAULTS.heading1Size,
            "font-size",
            "Default top-level page heading size.",
          ),
          typeDefault(
            "publr-heading-2-size",
            "H2 size",
            SITE_TYPOGRAPHY_DEFAULTS.heading2Size,
            "font-size",
            "Default section heading size.",
          ),
          typeDefault(
            "publr-heading-3-size",
            "H3 size",
            SITE_TYPOGRAPHY_DEFAULTS.heading3Size,
            "font-size",
            "Default subsection heading size.",
          ),
          typeDefault(
            "publr-heading-4-size",
            "H4 size",
            SITE_TYPOGRAPHY_DEFAULTS.heading4Size,
            "font-size",
            "Default compact heading size.",
          ),
        ],
      },
      {
        key: "spacing",
        label: "Element spacing",
        description: "Vertical rhythm for common unstyled text elements.",
        rows: [
          typeDefault(
            "publr-paragraph-spacing",
            "After paragraphs",
            SITE_TYPOGRAPHY_DEFAULTS.paragraphSpacing,
            "margin-bottom",
            "Space following a paragraph.",
          ),
          typeDefault(
            "publr-heading-spacing-before",
            "Before headings",
            SITE_TYPOGRAPHY_DEFAULTS.headingSpacingBefore,
            "margin-top",
            "Space separating a heading from preceding content.",
          ),
          typeDefault(
            "publr-heading-spacing-after",
            "After headings",
            SITE_TYPOGRAPHY_DEFAULTS.headingSpacingAfter,
            "margin-bottom",
            "Space between a heading and its following content.",
          ),
          typeDefault(
            "publr-list-spacing",
            "After lists",
            SITE_TYPOGRAPHY_DEFAULTS.listSpacing,
            "margin-bottom",
            "Space following an ordered or unordered list.",
          ),
          typeDefault(
            "publr-list-item-spacing",
            "Between list items",
            SITE_TYPOGRAPHY_DEFAULTS.listItemSpacing,
            "margin-top",
            "Additional separation between neighboring list items.",
          ),
          typeDefault(
            "publr-definition-list-spacing",
            "After definition lists",
            SITE_TYPOGRAPHY_DEFAULTS.definitionListSpacing,
            "margin-bottom",
            "Space following a definition list.",
          ),
          typeDefault(
            "publr-definition-term-spacing",
            "Between definitions",
            SITE_TYPOGRAPHY_DEFAULTS.definitionTermSpacing,
            "margin-top",
            "Space before each definition after the first.",
          ),
          typeDefault(
            "publr-definition-description-spacing",
            "Term to description",
            SITE_TYPOGRAPHY_DEFAULTS.definitionDescriptionSpacing,
            "margin-top",
            "Space between a term and its description.",
          ),
          typeDefault(
            "publr-definition-term-weight",
            "Definition term weight",
            SITE_TYPOGRAPHY_DEFAULTS.definitionTermWeight,
            "font-weight",
            "The emphasis used for terms in a definition list.",
          ),
          typeDefault(
            "publr-blockquote-spacing",
            "After blockquotes",
            SITE_TYPOGRAPHY_DEFAULTS.blockquoteSpacing,
            "margin-bottom",
            "Space following a block quotation.",
          ),
          typeDefault(
            "publr-rule-spacing",
            "Around dividers",
            SITE_TYPOGRAPHY_DEFAULTS.ruleSpacing,
            "margin-top",
            "Vertical separation around horizontal rules.",
          ),
        ],
      },
    ];
    const typeValue = (name: string, fallback: string) => tokenValue(theme, name) ?? fallback;
    state.designTypeBodyFontFamily = typeValue(
      "publr-body-font-family",
      SITE_TYPOGRAPHY_DEFAULTS.bodyFontFamily,
    );
    state.designTypeBodyFontSize = typeValue(
      "publr-body-font-size",
      SITE_TYPOGRAPHY_DEFAULTS.bodyFontSize,
    );
    state.designTypeBodyLineHeight = typeValue(
      "publr-body-line-height",
      SITE_TYPOGRAPHY_DEFAULTS.bodyLineHeight,
    );
    state.designTypeParagraphSpacing = typeValue(
      "publr-paragraph-spacing",
      SITE_TYPOGRAPHY_DEFAULTS.paragraphSpacing,
    );
    state.designTypeHeadingFontFamily = typeValue(
      "publr-heading-font-family",
      SITE_TYPOGRAPHY_DEFAULTS.headingFontFamily,
    );
    state.designTypeHeadingFontWeight = typeValue(
      "publr-heading-font-weight",
      SITE_TYPOGRAPHY_DEFAULTS.headingFontWeight,
    );
    state.designTypeHeadingLineHeight = typeValue(
      "publr-heading-line-height",
      SITE_TYPOGRAPHY_DEFAULTS.headingLineHeight,
    );
    state.designTypeHeadingSpacingBefore = typeValue(
      "publr-heading-spacing-before",
      SITE_TYPOGRAPHY_DEFAULTS.headingSpacingBefore,
    );
    state.designTypeHeadingSpacingAfter = typeValue(
      "publr-heading-spacing-after",
      SITE_TYPOGRAPHY_DEFAULTS.headingSpacingAfter,
    );
    state.designTypeHeading1Size = typeValue(
      "publr-heading-1-size",
      SITE_TYPOGRAPHY_DEFAULTS.heading1Size,
    );
    state.designTypeHeading2Size = typeValue(
      "publr-heading-2-size",
      SITE_TYPOGRAPHY_DEFAULTS.heading2Size,
    );
    state.designTypeHeading3Size = typeValue(
      "publr-heading-3-size",
      SITE_TYPOGRAPHY_DEFAULTS.heading3Size,
    );
    state.designTypeHeading4Size = typeValue(
      "publr-heading-4-size",
      SITE_TYPOGRAPHY_DEFAULTS.heading4Size,
    );
    state.designTypeListSpacing = typeValue(
      "publr-list-spacing",
      SITE_TYPOGRAPHY_DEFAULTS.listSpacing,
    );
    state.designTypeListItemSpacing = typeValue(
      "publr-list-item-spacing",
      SITE_TYPOGRAPHY_DEFAULTS.listItemSpacing,
    );
    state.designTypeDefinitionListSpacing = typeValue(
      "publr-definition-list-spacing",
      SITE_TYPOGRAPHY_DEFAULTS.definitionListSpacing,
    );
    state.designTypeDefinitionTermSpacing = typeValue(
      "publr-definition-term-spacing",
      SITE_TYPOGRAPHY_DEFAULTS.definitionTermSpacing,
    );
    state.designTypeDefinitionDescriptionSpacing = typeValue(
      "publr-definition-description-spacing",
      SITE_TYPOGRAPHY_DEFAULTS.definitionDescriptionSpacing,
    );
    state.designTypeDefinitionTermWeight = typeValue(
      "publr-definition-term-weight",
      SITE_TYPOGRAPHY_DEFAULTS.definitionTermWeight,
    );
    state.designTypeBlockquoteSpacing = typeValue(
      "publr-blockquote-spacing",
      SITE_TYPOGRAPHY_DEFAULTS.blockquoteSpacing,
    );
    state.designTypeRuleSpacing = typeValue(
      "publr-rule-spacing",
      SITE_TYPOGRAPHY_DEFAULTS.ruleSpacing,
    );
    // Compatibility colors are compiler inputs for imported templates, not
    // authored theme vocabulary. The portable theme surface contains the
    // semantic roles and non-color scales only.
    state.designExport = themeToCssText({
      tokens: theme.tokens.filter(
        (token) =>
          !isTailwindCompatibilityColor(token.name) ||
          theme.managedColorTokens?.includes(token.name),
      ),
    });
    state.cssImportShown = !!cssEngine?.classesFromCss;
    syncDesignPatternLibrary();
    const palette = paletteTokens(theme);
    const semantic = (
      key: string,
      name: string,
      label: string,
      description: string,
      fallback: string,
      ...aliases: string[]
    ): DesignSemanticRow => {
      const value =
        tokenValue(theme, name) ??
        aliases.map((alias) => tokenValue(theme, alias)).find((candidate) => candidate != null) ??
        fallback;
      return {
        key,
        name,
        label,
        description,
        value,
        resolved: resolveThemeValue(theme, value),
        contextLabel: colorContextLabel(state.designPreviewContext, theme),
        open: state.designSemanticOpen === name,
        choices: palette.map((token) => ({
          name: token.name,
          label: token.name
            .slice(
              token.name.startsWith("color-palette-") ? "color-palette-".length : "color-".length,
            )
            .split("-")
            .map((part) => part[0]?.toUpperCase() + part.slice(1))
            .join(" "),
          value: token.value,
          reference: `var(--${token.name})`,
          selected: value === `var(--${token.name})` || value === token.value,
        })),
      };
    };
    const contexts = colorContexts(theme);
    if (!contexts.some((context) => context.key === state.designPreviewContext))
      state.designPreviewContext = contexts[0]?.key ?? "default";
    const contextPrefix =
      state.designPreviewContext === "default" ? "" : `${state.designPreviewContext}-`;
    const contextName = (role: string) => `color-${contextPrefix}${role}`;
    const baseValue = (role: string, fallback: string) =>
      tokenValue(theme, `color-${role}`) ?? fallback;
    state.designColorContexts = contexts.map((context) => ({
      ...context,
      surfaceCss: resolveThemeValue(
        theme,
        tokenValue(
          theme,
          context.key === "default" ? "color-surface" : `color-${context.key}-surface`,
        ) ?? "#ffffff",
      ),
      selected: context.key === state.designPreviewContext,
      removable: context.key !== "default",
      removeLabel:
        context.key === "default"
          ? "The default context cannot be removed"
          : `Remove ${context.label}`,
    }));
    const roles = semanticColorRoles(theme);
    state.designSemanticRoleSummary = `${roles.length} semantic ${roles.length === 1 ? "role" : "roles"}`;
    state.designContextSummary = `${contexts.length} color ${contexts.length === 1 ? "context" : "contexts"}`;
    state.designContextListSummary = contexts.map((context) => context.label).join(", ");
    state.designSemanticRows = roles.map((role) =>
      semantic(
        role.key,
        contextName(role.key),
        role.label,
        role.description,
        baseValue(role.key, role.value),
      ),
    );
    syncDesignPrimitives();
    syncDesignAssets();
    syncDesignTypographyRecipe();
    syncDesignPreview();
    syncDesignPreviewThemeTokens();
  }

  function syncDesignPatternLibrary(): void {
    const patterns = patternTypes();
    const counts = new Map<string, number>();
    for (const pattern of patterns) {
      const category = pattern.category ?? "Uncategorized";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    if (state.designPatternCategory !== "All" && !counts.has(state.designPatternCategory)) {
      state.designPatternCategory = "All";
    }
    state.designPatternCategories = [
      {
        name: "All",
        count: patterns.length,
        selected: state.designPatternCategory === "All",
      },
      ...[...counts].map(([name, count]) => ({
        name,
        count,
        selected: state.designPatternCategory === name,
      })),
    ];
    state.designPatternItems = patterns
      .filter(
        (pattern) =>
          state.designPatternCategory === "All" ||
          (pattern.category ?? "Uncategorized") === state.designPatternCategory,
      )
      .map((pattern) => ({
        name: pattern.name,
        label: pattern.label,
        category: pattern.category ?? "Uncategorized",
      }));
  }

  // The one theme-mutation choke point: install, re-render, refresh every
  // consumer (canvas CSS, controls, design tab, host theme CSS).
  function applyThemeDocument(theme: Theme): void {
    const nextTheme = theme;
    syncThemePatterns(nextTheme);
    syncThemeTemplates(nextTheme);
    editor.setTheme(nextTheme);
    const availableBreakpoints = styleBreakpoints();
    if (
      state.canvasViewportMode !== "full" &&
      !availableBreakpoints.some((breakpoint) => breakpoint.key === state.canvasViewportMode)
    ) {
      state.canvasViewportMode = defaultViewportBreakpoint();
      state.styleBreakpoint = state.canvasViewportMode;
    } else if (
      !availableBreakpoints.some((breakpoint) => breakpoint.key === state.styleBreakpoint)
    ) {
      state.styleBreakpoint =
        viewportDevices().find((device) => device.key === "desktop")?.breakpoints[0] ?? "base";
    }
    syncCanvasViewport();
    syncCanvasThemeTokens();
    responsiveContainerStyle.textContent = responsiveContainerCss(nextTheme);
    if (!state.templateMode) mountDocumentFrame();
    resetPatternPreviews();
    shellOptions?.onThemeCss?.(); // e.g. the demo's inline-backend :root vars
    shellOptions?.onSiteDesignChange?.(structuredClone(nextTheme));
    refreshEngineCss();
    syncDesignPanel();
    syncBlockPanel();
  }

  function applyTheme(tokens: { name: string; value: string }[]): void {
    applyThemeDocument({ ...activeTheme(), tokens });
  }

  function syncDesignColorFamilyMain(): void {
    const shades = state.designColorFamilyShades;
    const main =
      shades.find((shade) => !shade.key) ??
      shades.find((shade) => shade.key === "500") ??
      shades[Math.floor(shades.length / 2)];
    state.designColorFamilyMainLabel = main?.key || "Base";
    state.designColorFamilyMainValue = main?.value || "#000000";
  }

  function closeDesignColorFamily(): void {
    state.designColorFamilyOpen = false;
    state.designColorFamilyError = "";
  }

  function syncPatternOverview(): void {
    state.patternColorSchemesShown = state.templateIsPattern;
    state.patternDefinitionMode = state.templateMode === "definition";
    state.patternSchemeTitle = state.patternDefinitionMode
      ? "Default pattern style"
      : "Pattern style";
    state.patternSchemeNote = state.patternDefinitionMode ? "" : "Applies to this copy";
    if (!state.templateIsPattern) {
      state.patternStyleSelectorShown = false;
      state.patternColorSchemes = [];
      return;
    }
    const disabledContexts = new Set(state.patternDisabledColorContexts);
    const legacyContexts = new Set(state.patternLegacyColorContexts);
    const contexts = themeColorContexts(activeTheme());
    if (
      state.patternDefinitionMode &&
      !contexts.some(
        (context) =>
          context.key === state.patternDefaultColorContext && !disabledContexts.has(context.key),
      )
    ) {
      const fallback =
        contexts.find((context) => !disabledContexts.has(context.key)) ?? contexts[0];
      state.patternDefaultColorContext = fallback?.key ?? "default";
      disabledContexts.delete(state.patternDefaultColorContext);
      state.patternDisabledColorContexts = [...disabledContexts];
    }
    const rows = contexts
      .filter(
        (context) =>
          state.patternDefinitionMode ||
          !disabledContexts.has(context.key) ||
          legacyContexts.has(context.key) ||
          context.key === state.patternDefaultColorContext,
      )
      .map((context) => {
        const isDefault = context.key === state.patternDefaultColorContext;
        const disabled = disabledContexts.has(context.key);
        return {
          ...context,
          pressed: isDefault,
          default: isDefault,
          disabled,
          enabled: !disabled,
          availabilityShown: state.patternDefinitionMode && !isDefault,
          availabilityLabel: disabled ? `Enable ${context.label}` : `Disable ${context.label}`,
          selectLabel: state.patternDefinitionMode
            ? disabled
              ? `Enable ${context.label} before making it the default pattern style`
              : `Use ${context.label} as the default pattern style`
            : `Apply ${context.label} to this copy`,
          selectDisabled: state.patternDefinitionMode && disabled,
          statusLabel: disabled ? "Disabled" : state.patternDefinitionMode ? "Default" : "Selected",
          statusShown: disabled || isDefault,
        };
      });
    state.patternColorSchemes = rows;
    state.patternStyleSelectorShown = state.patternDefinitionMode
      ? contexts.length > 1
      : rows.length > 1;
  }

  function syncBlockPanel() {
    syncPatternOverview();
    const n = editor.selection.blocks.length;
    const id = panelTarget();
    let block = id ? editor.getBlock(id) : null;
    let selectedPathIds = new Set<string>();
    if (block && id) {
      const path = pathToBlock(editor.getModel().blocks, id);
      const patternRoot = path?.find(
        (candidate) => candidate.pattern && getPattern(candidate.pattern),
      );
      if (patternRoot && patternRoot.id !== id) {
        block = patternRoot;
        selectedPathIds = new Set(path!.map((candidate) => candidate.id));
      }
    }
    state.blockSelected = !!block;
    if (block) {
      const def = getBlockType(block.type);
      // A pattern instance presents its OWN identity, not its root
      // container's — the pattern card + Edit original/Reset replace the
      // block card and its settings (thoughts/011: the door for future
      // template-only options).
      const patternDef = block.pattern ? getPattern(block.pattern) : undefined;
      const templatePartName =
        block.type === TEMPLATE_PART_TYPE ? stringSetting(block, "name") : "";
      const templatePartDef = templatePartName ? getTemplatePart(templatePartName) : undefined;
      const editingMode = editor.editingMode(block.id);
      state.blockIsPattern = !!patternDef;
      state.blockIsTemplatePart = !!templatePartDef;
      state.blockTemplatePartName = templatePartDef ? templatePartName : "";
      state.blockTemplatePartLabel = templatePartDef?.label ?? "";
      state.blockIsContainer = !patternDef && isContainerBlock(block);
      state.blockPattern = patternDef ? block.pattern! : "";
      state.blockPatternRoot = patternDef ? block.id : "";
      // The Content outline: the copy's CONTENT blocks, recursively —
      // layout and invisible blocks never appear; rows focus on click while
      // the panel stays right here.
      state.blockPatternContent = patternDef
        ? patternContentBlocks(block).map((c) => ({
            id: c.id,
            icon:
              c.type === "heading"
                ? iconRef(`heading-level-${plainText(c.fields.level).replace(/\D/g, "") || "2"}`)
                : iconOf(c.type),
            letter: letterOf(c.type),
            label: labelOf(c.type),
            anchor:
              c.type === "heading"
                ? plainText(c.fields.text).trim()
                : plainText(c.fields.body ?? c.fields.label ?? "")
                    .trim()
                    .slice(0, 40),
            selected: selectedPathIds.has(c.id),
          }))
        : [];
      if (patternDef) {
        const storedContext =
          typeof block.settings?.colorContext === "string" ? block.settings.colorContext : "";
        const inferredContext = flattenBlocks(block.children ?? [])
          .flatMap((candidate) => [
            editor.getStyle(candidate.id, "backgroundColor"),
            editor.getStyle(candidate.id, "textColor"),
            editor.getStyle(candidate.id, "borderColor"),
          ])
          .map(colorContextKey)
          .find((key): key is string => !!key);
        const activeContext = storedContext || inferredContext || "default";
        const disabledContexts = new Set(patternDef.disabledColorContexts ?? []);
        const legacyContexts = new Set(
          Array.isArray(block.settings?.legacyColorContexts)
            ? block.settings.legacyColorContexts.filter(
                (context): context is string => typeof context === "string",
              )
            : [],
        );
        state.blockPatternActiveContext = activeContext;
        state.blockPatternContexts = themeColorContexts(activeTheme())
          .filter(
            (context) =>
              !disabledContexts.has(context.key) ||
              context.key === activeContext ||
              legacyContexts.has(context.key),
          )
          .map((context) => ({
            ...context,
            pressed: context.key === activeContext,
          }));
        state.blockPatternContextShown = state.blockPatternContexts.length > 1;
      } else {
        state.blockPatternContexts = [];
        state.blockPatternContextShown = false;
        state.blockPatternActiveContext = "default";
      }
      state.blockLabel = blockLabelOf(block);
      // pattern instances all share the pattern-root icon (tree/toolbar/card agree)
      state.blockIcon = patternDef ? iconOf(PATTERN_ROOT_TYPE) : presentationIcon(block);
      state.blockLetter = patternDef
        ? (patternDef.label[0] ?? "?").toUpperCase()
        : letterOf(containerPresentation(block) ?? block.type);
      state.blockDescription = patternDef
        ? (patternDef.description ??
          "A pattern instance. Edits here never change the original design.")
        : containerPresentation(block)
          ? `${presentationLabel(block)} layout. The block remains a Group at every breakpoint.`
          : (def?.description ?? "");
      // Registry SettingSpecs joined with THIS block: pressed/value = its
      // current field value (its type for transform settings, the EFFECTIVE
      // island value — sparse model over declared default — for island
      // settings). Re-derived on every selection move and committed edit — a
      // transform lands here with the same id but a fresh type, and the
      // control re-presses.
      const roleRank = {
        content: 0,
        structure: 1,
        design: 2,
        advanced: 3,
      } as const;
      const roleLabel = {
        content: "Content",
        structure: "Structure",
        design: "Appearance",
        advanced: "Advanced",
      } as const;
      const settingSpecs = (patternDef ? [] : (def?.settings ?? []))
        .map((s, index) => {
          const field = s.field
            ? def?.fields.find((candidate) => candidate.name === s.field)
            : null;
          const role =
            s.role ??
            (s.transform || field?.type === "tag" ? "structure" : s.field ? "content" : "advanced");
          return { s, index, role };
        })
        .filter(({ role }) => editingMode === "default" || role === "content")
        .filter(({ s }) => {
          if (!s.when) return true;
          const dependency = s.when.field
            ? block.fields[s.when.field]
            : s.when.style
              ? effectiveStyle(block.id, s.when.style).value ||
                def?.settings?.find((candidate) => candidate.style === s.when!.style)?.default
              : block.settings && s.when.setting! in block.settings
                ? block.settings[s.when.setting!]
                : def?.settings?.find((candidate) => candidate.setting === s.when!.setting)
                    ?.default;
          return "equals" in s.when
            ? JSON.stringify(dependency) === JSON.stringify(s.when.equals)
            : JSON.stringify(dependency) !== JSON.stringify(s.when.notEquals);
        })
        .sort((a, b) => roleRank[a.role] - roleRank[b.role] || a.index - b.index);
      const settingRows = settingSpecs.map(({ s, index, role }) => {
        const mode = s.transform
          ? ("transform" as const)
          : s.style
            ? ("style" as const)
            : s.field
              ? ("field" as const)
              : ("setting" as const);
        const effective =
          mode === "style"
            ? effectiveStyle(block.id, s.style!).value || s.default || ""
            : mode === "setting" && block.settings && s.setting! in block.settings
              ? block.settings[s.setting!]
              : s.default;
        const picked = (v: string) =>
          mode === "transform"
            ? block.type === v
            : mode === "style"
              ? effective === v
              : mode === "field"
                ? block.fields[s.field!] === v
                : effective === v;
        // media rows edit the image-carrier object through its parts
        const media =
          s.control === "media" && s.field
            ? ((block.fields[s.field] ?? {}) as Partial<ImageValue>)
            : null;
        // island values are JSON primitives per the control-kind contract;
        // anything else renders as "" rather than "[object Object]"
        const display =
          typeof effective === "string" ||
          typeof effective === "number" ||
          typeof effective === "boolean"
            ? String(effective)
            : "";
        const defaultStyleValue =
          typeof s.default === "string" ||
          typeof s.default === "number" ||
          typeof s.default === "boolean"
            ? String(s.default)
            : "";
        const responsiveValues =
          mode === "style"
            ? responsiveValueRanges(block.id, s.style!, defaultStyleValue)
            : { ranges: [], points: [], summary: "", changes: "" };
        return {
          key: `${block.id}:${index}`,
          id: block.id,
          label: s.label,
          mode,
          field: s.field ?? "",
          setting: s.setting ?? "",
          style: s.style ?? "",
          options: (s.options ?? []).map((o) => ({
            value: o.value,
            label: o.label,
            icon: iconRef(o.icon),
            pressed: picked(o.value),
          })),
          value:
            mode === "setting" || mode === "style"
              ? display
              : mode === "field" && (s.control === "text" || s.control === "select")
                ? plainText(block.fields[s.field!])
                : "",
          pressed:
            mode === "style" && s.control === "toggle" ? effective === "true" : effective === true,
          placeholder: s.placeholder ?? "",
          min: s.min ?? null,
          max: s.max ?? null,
          step: s.step ?? null,
          error: state.settingErrors[`${block.id}:${index}`] ?? "",
          invalid: !!state.settingErrors[`${block.id}:${index}`],
          isChoice: s.control === "toggle-group",
          isToggle: s.control === "toggle",
          isSelect: s.control === "select",
          isText: s.control === "text",
          isNumber: s.control === "number",
          isMedia: s.control === "media",
          mediaSrc: media?.src ?? "",
          mediaAlt: media?.alt ?? "",
          hasMedia: !!media?.src,
          // While an upload/browse is in flight the action affordances swap
          // for the mediaBusy spinner row — hence the !busy gates below.
          mediaBusy: !!state.mediaBusy[`${block.id}:${index}`],
          mediaBusyLabel: state.mediaBusy[`${block.id}:${index}`] ?? "",
          mediaIdle: !state.mediaBusy[`${block.id}:${index}`],
          showAdd:
            !media?.src &&
            mediaAdapter.uploadAvailable() &&
            !state.mediaBusy[`${block.id}:${index}`],
          addLabel: `Add ${s.label.toLowerCase()}`,
          canUpload: mediaAdapter.uploadAvailable() && !state.mediaBusy[`${block.id}:${index}`],
          showBrowse: !!mediaAdapter.browse && !state.mediaBusy[`${block.id}:${index}`],
          showBrowseEmpty:
            !media?.src && !!mediaAdapter.browse && !state.mediaBusy[`${block.id}:${index}`],
          section: roleLabel[role],
          sectionRole: role,
          sectionStyle:
            settingSpecs.find((candidate) => candidate.role === role)?.s.style ?? s.style ?? "",
          sectionKey: `${block.id}:${role}`,
          sectionExpanded:
            `${block.id}:${role}` in state.settingSectionOpen
              ? state.settingSectionOpen[`${block.id}:${role}`]
              : role !== "advanced",
          showSection: false,
          help: s.help ?? "",
          responsive: responsiveValues.ranges.length > 1,
          responsiveSummary: responsiveValues.summary,
          responsiveChanges: responsiveValues.changes,
          responsiveRanges: responsiveValues.ranges,
          responsivePoints: responsiveValues.points,
        };
      });
      // A container's layout identity is the one high-frequency setting that
      // belongs with the block identity. Promote it above the inspector tabs
      // while keeping every other registry setting in the shared sections.
      state.blockHeaderSettings = settingRows.filter(
        (row) => row.isChoice && row.style === "layoutMode",
      );
      const inspectorSettings = settingRows.filter(
        (row) => !(row.isChoice && row.style === "layoutMode"),
      );
      state.blockSettings = inspectorSettings.map((row, rowIndex) => ({
        ...row,
        showSection:
          rowIndex === 0 || inspectorSettings[rowIndex - 1].sectionRole !== row.sectionRole,
      }));
      // Universal STYLE controls (Phase C): shown per the block's `supports`,
      // disabled when policy locks style (content-only). Value from editor.getStyle.
      const supports =
        patternDef || editingMode !== "default" ? undefined : editor.styleSupports(id!);
      const variants =
        patternDef || editingMode !== "default" ? undefined : editor.blockVariants(id!);
      state.blockHasStyles = !!supports || !!variants?.length;
      state.styleResponsiveAvailable = editor.styleBackend().name === "classes";
      if (!state.styleResponsiveAvailable) {
        state.styleBreakpoint = "base";
        state.canvasResponsiveCompare = false;
        clearResponsiveComparison();
      }
      const resolvedBreakpoints = styleBreakpoints();
      const activeBreakpoint =
        resolvedBreakpoints.find((option) => option.key === state.styleBreakpoint) ??
        resolvedBreakpoints[0];
      state.styleBreakpointLabel = activeBreakpoint.label;
      if (state.canvasViewportMode === "full") {
        state.canvasViewportWidth = "100%";
        state.canvasViewportPixelWidth = 0;
        state.canvasViewportFull = true;
        state.canvasViewportLabel = "Full canvas";
        state.canvasViewportResizeLabel = "Resize canvas";
      } else if (state.canvasViewportCustomWidth != null) {
        state.canvasViewportWidth = `${state.canvasViewportCustomWidth}px`;
        state.canvasViewportPixelWidth = state.canvasViewportCustomWidth;
        state.canvasViewportFull = false;
        state.canvasViewportLabel = `${state.canvasViewportCustomWidth}px viewport · ${activeBreakpoint.label}`;
        state.canvasViewportResizeLabel = `Resize canvas, currently ${state.canvasViewportCustomWidth}px`;
      } else {
        state.canvasViewportWidth = activeBreakpoint.viewport;
        state.canvasViewportPixelWidth = cssLengthPx(activeBreakpoint.viewport) ?? 0;
        state.canvasViewportFull = false;
        state.canvasViewportLabel = activeBreakpoint.label;
        state.canvasViewportResizeLabel = `Resize ${activeBreakpoint.viewport} canvas`;
      }
      syncCanvasViewportFit();
      const breakpointOptions = resolvedBreakpoints.map((option) => ({
        ...option,
        hasValue: Object.keys(STYLE_PROPS).some(
          (prop) => blockSupportsStyle(supports, prop) && !!editor.getStyle(id!, prop, option.key),
        ),
      }));
      syncViewportOptions(
        Object.fromEntries(breakpointOptions.map((option) => [option.key, option.hasValue])),
      );
      state.styleHasValues =
        breakpointOptions.some((option) => option.hasValue) || !!editor.getStyle(id!, "variation");
      if (!state.blockHasStyles && state.blockInspectorTab === "styles")
        state.blockInspectorTab = "settings";
      const curVariation = editor.getStyle(id!, "variation");
      // "default" leads the grid — pressed when no variation
      // is set; picking it clears. The name is reserved by the chrome.
      state.variationOptions = variants?.length
        ? [
            { name: "default", label: "Default", pressed: !curVariation },
            ...variants.map((v) => ({
              name: v.name,
              label: v.label,
              pressed: v.name === curVariation,
            })),
          ]
        : [];
      // Everything below derives from the SITE THEME (E1) — token scales in,
      // control options out. A control renders segmented up to SEG_MAX
      // options, a <select> above (the Tailwind default: 13 font sizes); a
      // palette renders a flat swatch row up to GRID_MIN, a family grid above.
      const theme = activeTheme();
      const themeSpacing = spacings(theme);
      const spacingChoices = themeSpacing.map(({ key, value }) => ({
        key,
        value,
        label: /^(?:2xs|xs|s|m|l|xl|2xl)$/i.test(key)
          ? key.toUpperCase()
          : key
              .split("-")
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" "),
      }));
      state.boxSpacingOptions = spacingChoices;
      const SEG_MAX = 8;
      const GRID_MIN = 12;
      const scaleRow = (
        prop: string,
        label: string,
        opts: { key: string; label: string; value?: string; icon?: string }[],
        none?: boolean,
        allowCustom = true,
      ): ScaleRow => {
        const resolved = effectiveStyle(id!, prop);
        const cur = resolved.value;
        const emptyLabel =
          prop.startsWith("padding") || prop.startsWith("margin") ? "None" : "Default";
        const responsiveValues = responsiveValueRanges(id!, prop, "");
        const rangeIndex = opts.findIndex((option) => option.key === cur) + 1;
        const options = opts.map((o, index) => ({
          ...o,
          pressed: o.key === cur,
          active: rangeIndex > 0 && index < rangeIndex,
        }));
        const rangeProps = new Set([
          "padding",
          "paddingInline",
          "paddingBlock",
          "paddingTop",
          "paddingRight",
          "paddingBottom",
          "paddingLeft",
          "margin",
          "marginTop",
          "marginRight",
          "marginBottom",
          "marginLeft",
          "width",
          "height",
          "minHeight",
          "minWidth",
          "flexBasis",
          "gap",
          "rowGap",
          "columnGap",
          "gridColumns",
          "lineHeight",
          "letterSpacing",
          "borderWidth",
          "borderRadius",
        ]);
        const isRange = rangeProps.has(prop) && options.length > 1;
        // Keyword groups get a leading reset segment: an explicit clear beats
        // the hidden re-click-to-clear affordance.
        if (none && !isRange)
          options.unshift({
            key: "none",
            label: "Default",
            icon: iconRef("reset"),
            pressed: !cur,
            active: false,
          });
        const customSource = opts.find((option) => option.key === cur)?.value ?? cur;
        const customMatch = /^(-?(?:\d+|\d*\.\d+))(px|%|em|rem|vw|vh)$/i.exec(customSource.trim());
        const customUnit = spacingCustomUnits.includes(
          customMatch?.[2]?.toLowerCase() as BoxSpacingUnit,
        )
          ? (customMatch![2].toLowerCase() as BoxSpacingUnit)
          : "px";
        const customNumber = customMatch?.[1] ?? (cur ? "" : "0");
        const customRange = spacingCustomScale(customUnit);
        const customNumeric = Number(customNumber);
        const customRangeValue = Math.min(
          customRange.max,
          Math.max(
            customRange.min,
            Number.isFinite(customNumeric) ? customNumeric : customRange.min,
          ),
        );
        return {
          prop,
          kind: "",
          side: "",
          label,
          options,
          isSelect: !isRange && options.length > SEG_MAX,
          isRange,
          isSegmented: !isRange && options.length <= SEG_MAX,
          rangeIndex,
          rangeMax: options.length,
          thumbPosition: `calc(8px + (100% - 16px) * ${rangeIndex / Math.max(1, options.length)})`,
          scaleIcon: "",
          scaleIcons: [],
          hasScaleIcon: false,
          value: cur,
          explicitValue: resolved.explicitValue,
          valueLabel:
            options.find((option) => option.key === cur)?.label ?? (cur ? "Custom" : emptyLabel),
          emptyLabel,
          inherited: resolved.inherited,
          inheritedLabel: resolved.inherited ? `From ${inheritedLabel(resolved.source)}` : "",
          allowCustom,
          showCustomDisclosure: allowCustom && !isRange,
          customOpen:
            state.tokenScaleCustom[prop] ??
            (isRange && !!cur && !options.some((option) => option.key === cur)),
          customParsed: !!customMatch || !cur,
          customNumber,
          customUnit,
          customMin: customRange.min,
          customMax: customRange.max,
          customStep: customRange.step,
          customRangeValue,
          customTrackFill: `${
            ((customRangeValue - customRange.min) /
              Math.max(customRange.step, customRange.max - customRange.min)) *
            100
          }%`,
          customThumbPosition: `calc(8px + (100% - 16px) * ${
            (customRangeValue - customRange.min) /
            Math.max(customRange.step, customRange.max - customRange.min)
          })`,
          responsive: responsiveValues.ranges.length > 1,
          responsiveSummary: responsiveValues.summary,
          responsiveChanges: responsiveValues.changes,
          responsiveRanges: responsiveValues.ranges,
          responsivePoints: responsiveValues.points,
        };
      };
      const selectedPath = pathToBlock(editor.getModel().blocks, id!) ?? [];
      const availableContextKeys = new Set(themeColorContexts(theme).map((context) => context.key));
      const activeColorContext =
        [...selectedPath]
          .reverse()
          .flatMap((candidate) => [
            effectiveStyle(candidate.id, "textColor").value,
            effectiveStyle(candidate.id, "backgroundColor").value,
            effectiveStyle(candidate.id, "borderColor").value,
          ])
          .map(colorContextKey)
          .find((key): key is string => !!key && availableContextKeys.has(key)) ?? "default";
      const colorRow = (prop: string, label: string): ColorRow => {
        const resolved = effectiveStyle(id!, prop);
        const value = resolved.value;
        const semantic = semanticColors(theme);
        const allowedRoles =
          prop === "backgroundColor"
            ? new Set(["surface", "accent", "muted"])
            : prop === "borderColor"
              ? new Set(["border", "foreground", "accent"])
              : new Set(["foreground", "accent", "accent-foreground", "muted-foreground"]);
        const palette = semantic.filter(
          (color) =>
            colorContextKey(color.key) === activeColorContext &&
            allowedRoles.has(colorRoleKey(color.key) ?? ""),
        );
        const swatches = palette.map((c) => ({
          key: c.key,
          css: c.value,
          label: c.label,
          pressed: c.key === value,
        }));
        const grid = swatches.length > GRID_MIN;
        const families: SwatchFamily[] = [];
        if (grid) {
          palette.forEach((c, i) => {
            const row = families.find((f) => f.family === c.family);
            if (row) row.swatches.push(swatches[i]);
            else families.push({ family: c.family, swatches: [swatches[i]] });
          });
        }
        return {
          prop,
          label,
          contextLabel: `${colorContextLabel(activeColorContext)} style`,
          value,
          explicitValue: resolved.explicitValue,
          valueLabel: semantic.find((color) => color.key === value)?.label ?? (value || "Default"),
          currentCss: semantic.find((color) => color.key === value)?.value ?? "transparent",
          inherited: resolved.inherited,
          inheritedLabel: resolved.inherited ? `From ${inheritedLabel(resolved.source)}` : "",
          empty: !value,
          pickerOpen: state.colorPickerOpen === prop,
          popoverTop: state.colorPopoverTop,
          popoverLeft: state.colorPopoverLeft,
          grid,
          swatches: grid ? [] : swatches,
          families,
        };
      };
      const capabilities = [
        ["fontSize", "Font size", supports?.typography?.fontSize],
        ["lineHeight", "Line height", supports?.typography?.lineHeight],
        ["letterSpacing", "Letter spacing", supports?.typography?.letterSpacing],
        ["decoration", "Decoration", supports?.typography?.decoration],
        ["letterCase", "Letter case", supports?.typography?.letterCase],
        ["textAlign", "Text alignment", supports?.typography?.textAlign],
        ["fontWeight", "Font weight", supports?.typography?.fontWeight],
        ["fontStyle", "Font style", supports?.typography?.fontStyle],
        ["textColor", "Text color", supports?.color?.text],
        ["backgroundColor", "Background color", supports?.color?.background],
        ["padding", "Padding", supports?.spacing?.padding],
        ["paddingInline", "Horizontal padding", supports?.spacing?.paddingInline],
        ["paddingBlock", "Vertical padding", supports?.spacing?.paddingBlock],
        ["paddingTop", "Padding top", supports?.spacing?.paddingTop],
        ["paddingRight", "Padding right", supports?.spacing?.paddingRight],
        ["paddingBottom", "Padding bottom", supports?.spacing?.paddingBottom],
        ["paddingLeft", "Padding left", supports?.spacing?.paddingLeft],
        ["margin", "Margin", supports?.spacing?.margin],
        ["marginTop", "Margin top", supports?.spacing?.marginTop],
        ["marginRight", "Margin right", supports?.spacing?.marginRight],
        ["marginBottom", "Margin bottom", supports?.spacing?.marginBottom],
        ["marginLeft", "Margin left", supports?.spacing?.marginLeft],
        ["width", "Width", supports?.dimensions?.width],
        ["height", "Height", supports?.dimensions?.height],
        ["minHeight", "Minimum height", supports?.dimensions?.minHeight],
        ["minWidth", "Minimum width", supports?.dimensions?.minWidth],
        ["flexBasis", "Flex basis", supports?.dimensions?.flexBasis],
        ["aspectRatio", "Aspect ratio", supports?.dimensions?.aspectRatio],
        ["gap", "Gap", supports?.layout?.gap],
        ["rowGap", "Row gap", supports?.layout?.rowGap],
        ["columnGap", "Column gap", supports?.layout?.columnGap],
        ["justifyContent", "Justification", supports?.layout?.justifyContent],
        ["alignItems", "Items alignment", supports?.layout?.alignItems],
        ["flexWrap", "Wrapping", supports?.layout?.flexWrap],
        ["gridColumns", "Grid columns", supports?.layout?.gridColumns],
        ["borderWidth", "Border width", supports?.border?.width],
        ["borderColor", "Border color", supports?.border?.color],
        ["borderRadius", "Border radius", supports?.border?.radius],
        ["borderStyle", "Border style", supports?.border?.style],
      ] as const;
      const paddingSides = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
      const marginSides = ["marginTop", "marginRight", "marginBottom", "marginLeft"];
      state.paddingLinkAvailable =
        blockSupportsStyle(supports, "padding") &&
        paddingSides.every((prop) => blockSupportsStyle(supports, prop));
      state.marginLinkAvailable =
        blockSupportsStyle(supports, "margin") &&
        marginSides.every((prop) => blockSupportsStyle(supports, prop));
      const linked = (kind: "padding" | "margin", sides: string[], available: boolean) => {
        if (!available) return true;
        const key = `${id}:${kind}`;
        if (!(key in state.styleSidesLinked))
          state.styleSidesLinked[key] = !sides.some((prop) => !!effectiveStyle(id!, prop).value);
        return state.styleSidesLinked[key];
      };
      state.paddingSidesLinked = linked("padding", paddingSides, state.paddingLinkAvailable);
      state.marginSidesLinked = linked("margin", marginSides, state.marginLinkAvailable);
      state.paddingSidesLabel = "Edit all padding sides";
      state.marginSidesLabel = "Edit all margin sides";
      state.borderSidesLabel = "Edit border properties";
      state.boxPaddingShown = state.paddingLinkAvailable;
      state.boxMarginShown = state.marginLinkAvailable;
      state.boxBorderShown =
        blockSupportsStyle(supports, "borderWidth") ||
        blockSupportsStyle(supports, "borderColor") ||
        blockSupportsStyle(supports, "borderRadius");
      state.boxBorderRadiusShown = blockSupportsStyle(supports, "borderRadius");
      state.spacingBoxShown = state.boxPaddingShown || state.boxMarginShown || state.boxBorderShown;
      const boxResponsiveValues = responsiveValueRanges(id!, boxModelResponsiveProps, "");
      state.boxResponsive = boxResponsiveValues.ranges.length > 1;
      state.boxResponsiveSummary = boxResponsiveValues.summary;
      state.boxResponsiveChanges = boxResponsiveValues.changes;
      state.boxResponsiveRanges = boxResponsiveValues.ranges;
      state.boxResponsivePoints = boxResponsiveValues.points;
      type BoxValueKey =
        | "boxPaddingTop"
        | "boxPaddingRight"
        | "boxPaddingBottom"
        | "boxPaddingLeft"
        | "boxMarginTop"
        | "boxMarginRight"
        | "boxMarginBottom"
        | "boxMarginLeft"
        | "boxBorderTop"
        | "boxBorderRight"
        | "boxBorderBottom"
        | "boxBorderLeft";
      const syncBoxValues = (kind: "padding" | "margin", isLinked: boolean) => {
        for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
          const value = isLinked
            ? spacingValueForSide(id!, kind, side)
            : effectiveStyle(id!, `${kind}${side}`).value || spacingValueForSide(id!, kind, side);
          const stateKey = `box${kind === "padding" ? "Padding" : "Margin"}${side}` as BoxValueKey;
          state[stateKey] = value;
        }
      };
      syncBoxValues("padding", state.paddingSidesLinked);
      syncBoxValues("margin", state.marginSidesLinked);
      state.boxBorderTop = borderValueForSide(id!, "borderWidth", "Top");
      state.boxBorderRight = borderValueForSide(id!, "borderWidth", "Right");
      state.boxBorderBottom = borderValueForSide(id!, "borderWidth", "Bottom");
      state.boxBorderLeft = borderValueForSide(id!, "borderWidth", "Left");
      state.boxBorderRadiusTopLeft = borderRadiusCornerValue(id!, "borderTopLeftRadius");
      state.boxBorderRadiusTopRight = borderRadiusCornerValue(id!, "borderTopRightRadius");
      state.boxBorderRadiusBottomRight = borderRadiusCornerValue(id!, "borderBottomRightRadius");
      state.boxBorderRadiusBottomLeft = borderRadiusCornerValue(id!, "borderBottomLeftRadius");
      const activeKind: BoxSpacingKind =
        state.boxActiveKind === "margin"
          ? "margin"
          : state.boxActiveKind === "border"
            ? "border"
            : "padding";
      const activeSide = ["Top", "Right", "Bottom", "Left"].includes(state.boxActiveSide)
        ? (state.boxActiveSide as BoxSpacingRow["side"])
        : "Top";
      if (state.boxEditorOpen && state.boxEditorTargetId !== id) {
        state.boxEditorOpen = false;
        state.boxEditorTargetId = "";
      }
      const editorTargets =
        state.boxEditorOpen && state.boxEditorTargetId === id
          ? orderedSpacingSides(state.boxEditorSelectedSides)
          : [];
      const editorCorners =
        state.boxEditorOpen && state.boxEditorTargetId === id && state.boxEditorRadiusOnly
          ? orderedBorderRadiusCorners(state.boxEditorSelectedCorners)
          : [];
      state.boxTargetPaddingTop = activeKind === "padding" && editorTargets.includes("Top");
      state.boxTargetPaddingRight = activeKind === "padding" && editorTargets.includes("Right");
      state.boxTargetPaddingBottom = activeKind === "padding" && editorTargets.includes("Bottom");
      state.boxTargetPaddingLeft = activeKind === "padding" && editorTargets.includes("Left");
      state.boxTargetPaddingAll =
        activeKind === "padding" && editorTargets.length === spacingSides.length;
      state.boxTargetMarginTop = activeKind === "margin" && editorTargets.includes("Top");
      state.boxTargetMarginRight = activeKind === "margin" && editorTargets.includes("Right");
      state.boxTargetMarginBottom = activeKind === "margin" && editorTargets.includes("Bottom");
      state.boxTargetMarginLeft = activeKind === "margin" && editorTargets.includes("Left");
      state.boxTargetMarginAll =
        activeKind === "margin" && editorTargets.length === spacingSides.length;
      state.boxTargetBorderRight =
        activeKind === "border" && !state.boxEditorRadiusOnly && editorTargets.includes("Right");
      state.boxTargetBorderBottom =
        activeKind === "border" && !state.boxEditorRadiusOnly && editorTargets.includes("Bottom");
      state.boxTargetBorderLeft =
        activeKind === "border" && !state.boxEditorRadiusOnly && editorTargets.includes("Left");
      state.boxTargetBorderTop =
        activeKind === "border" && !state.boxEditorRadiusOnly && editorTargets.includes("Top");
      state.boxTargetBorderAll =
        activeKind === "border" &&
        !state.boxEditorRadiusOnly &&
        editorTargets.length === spacingSides.length;
      state.boxTargetRadiusTopLeft =
        activeKind === "border" &&
        state.boxEditorRadiusOnly &&
        editorCorners.includes("borderTopLeftRadius");
      state.boxTargetRadiusTopRight =
        activeKind === "border" &&
        state.boxEditorRadiusOnly &&
        editorCorners.includes("borderTopRightRadius");
      state.boxTargetRadiusBottomRight =
        activeKind === "border" &&
        state.boxEditorRadiusOnly &&
        editorCorners.includes("borderBottomRightRadius");
      state.boxTargetRadiusBottomLeft =
        activeKind === "border" &&
        state.boxEditorRadiusOnly &&
        editorCorners.includes("borderBottomLeftRadius");
      state.boxActiveKey = `${activeKind}-${activeSide}`;
      state.boxActiveLabel = `${spacingKindLabel(activeKind)} ${spacingSelectionLabel(
        state.boxEditorSelectedSides,
      )}`;
      state.boxActiveValue = spacingValueForSide(id!, activeKind, activeSide);
      state.boxEditorTitle =
        activeKind === "border" && state.boxEditorRadiusOnly
          ? "Border Radius"
          : spacingKindLabel(activeKind);
      state.boxEditorSourceLabel =
        activeKind === "border" && state.boxEditorRadiusOnly
          ? borderRadiusSelectionLabel(state.boxEditorSelectedCorners)
          : spacingSelectionLabel(state.boxEditorSelectedSides);
      state.boxEditorSyncShown = !state.boxEditorRadiusOnly;
      state.boxEditorRadiusSyncShown =
        activeKind === "border" &&
        state.boxEditorRadiusOnly &&
        blockSupportsStyle(supports, "borderRadius");
      const pairSides: BoxSpacingSide[] =
        activeSide === "Top" || activeSide === "Bottom" ? ["Top", "Bottom"] : ["Left", "Right"];
      state.boxEditorPairLabel =
        pairSides[0] === "Top" ? "Sync top and bottom" : "Sync left and right";
      state.boxEditorPairIcon = iconRef(
        pairSides[0] === "Top" ? "spacing-sync-top-bottom" : "spacing-sync-left-right",
      );
      state.boxEditorPairPressed = sameSpacingSides(state.boxEditorSelectedSides, pairSides);
      state.boxEditorAllPressed = sameSpacingSides(state.boxEditorSelectedSides, spacingSides);
      state.boxEditorRadiusAllPressed =
        state.boxEditorSelectedCorners.length === borderRadiusCorners.length;
      state.boxEditorSelectionIcons = spacingSelectionIcons(state.boxEditorSelectedSides);
      state.boxEditorSelectionIcon = state.boxEditorSelectionIcons[0] ?? "";
      const makeBoxEditorRow = (
        prop: string,
        label: string,
        value: string,
        choices: { key: string; value: string; label: string }[],
        scaleIcons = state.boxEditorSelectionIcons,
      ): BoxSpacingRow => {
        const scaleIcon = scaleIcons[0] ?? "";
        const custom = spacingCustomValue(value, choices);
        const customScale = spacingCustomScale(custom.unit);
        const customNumber = Number(custom.number);
        const customRangeValue = Math.min(
          customScale.max,
          Math.max(customScale.min, Number.isFinite(customNumber) ? customNumber : customScale.min),
        );
        const customRatio =
          (customRangeValue - customScale.min) /
          Math.max(customScale.step, customScale.max - customScale.min);
        const rangeIndex = choices.findIndex((option) => option.key === value) + 1;
        const snapRatio = rangeIndex / Math.max(1, choices.length);
        const customOpen =
          activeKind === "border"
            ? !!state.tokenScaleCustom[prop] || (!!value && rangeIndex === 0)
            : state.boxEditorCustomOpen;
        return {
          prop,
          kind: activeKind,
          side: activeSide,
          label,
          value,
          valueLabel:
            choices.find((option) => option.key === value)?.label ?? (value ? "Custom" : "None"),
          rangeIndex,
          rangeMax: choices.length,
          snapped: !value || rangeIndex > 0,
          thumbPosition: `calc(8px + (100% - 16px) * ${snapRatio})`,
          scaleIcon,
          hasScaleIcon: !!scaleIcon,
          inherited: false,
          responsive: false,
          customOpen,
          customParsed: true,
          customNumber: custom.number,
          customUnit: custom.unit,
          customMin: customScale.min,
          customMax: customScale.max,
          customStep: customScale.step,
          customRangeValue,
          customTrackFill: `${customRatio * 100}%`,
          customThumbPosition: `calc(8px + (100% - 16px) * ${customRatio})`,
          scaleIcons,
          options: choices.map((option, index) => ({
            key: option.key,
            label: option.label,
            active: rangeIndex > 0 && index < rangeIndex,
          })),
        };
      };
      const widthChoices = boxScaleChoices(activeKind, spacingChoices);
      const radiusChoices = radii(theme).map(({ key, value }) => ({
        key,
        value,
        label: key,
      }));
      state.boxEditorRadiusShown =
        activeKind === "border" &&
        state.boxEditorRadiusOnly &&
        blockSupportsStyle(supports, "borderRadius");
      const selectedRadiusCorners = borderRadiusCorners.filter(({ prop }) =>
        state.boxEditorSelectedCorners.includes(prop),
      );
      const selectedRadiusValues = selectedRadiusCorners.map(({ prop }) =>
        borderRadiusCornerValue(id!, prop),
      );
      const selectedRadiusValue = selectedRadiusValues.every(
        (value) => value === selectedRadiusValues[0],
      )
        ? (selectedRadiusValues[0] ?? "")
        : "";
      state.boxEditorRadiusRows =
        state.boxEditorRadiusShown && selectedRadiusCorners[0]
          ? [
              {
                ...makeBoxEditorRow(
                  selectedRadiusCorners[0].prop,
                  borderRadiusSelectionLabel(state.boxEditorSelectedCorners),
                  selectedRadiusValue,
                  radiusChoices,
                  [iconRef(selectedRadiusCorners[0].icon)],
                ),
                scaleIcons: selectedRadiusCorners.map(({ icon }) => iconRef(icon)),
              },
            ]
          : [];
      state.boxEditorRows =
        activeKind === "border"
          ? state.boxEditorRadiusOnly || !blockSupportsStyle(supports, "borderWidth")
            ? []
            : [
                makeBoxEditorRow(
                  "borderWidth",
                  "Width",
                  borderValueForSide(id!, "borderWidth", activeSide),
                  widthChoices,
                ),
              ]
          : [makeBoxEditorRow("", state.boxActiveLabel, state.boxActiveValue, widthChoices)];
      state.boxEditorMultipleRows = false;
      state.optionalStyleControls = capabilities
        .filter(
          ([prop, , support]) =>
            support &&
            typeof support === "object" &&
            support.default === false &&
            !(state.paddingLinkAvailable && paddingSides.includes(prop)) &&
            !(state.marginLinkAvailable && marginSides.includes(prop)),
        )
        .map(([prop, label]) => ({
          prop,
          label,
          enabled: !!state.styleOptional[prop] || !!effectiveStyle(id!, prop).value,
        }));
      const shown = (prop: string): boolean => {
        const support = capabilities.find(([candidate]) => candidate === prop)?.[2];
        if (!support || !blockSupportsStyle(supports, prop)) return false;
        const layout = containerPresentation(block);
        if (layout) {
          if (
            layout === "group" &&
            [
              "gap",
              "rowGap",
              "columnGap",
              "justifyContent",
              "alignItems",
              "flexWrap",
              "gridColumns",
            ].includes(prop)
          )
            return false;
          if (layout !== "grid" && prop === "gridColumns") return false;
          if (layout !== "row" && prop === "flexWrap") return false;
        }
        return (
          typeof support === "boolean" ||
          support.default !== false ||
          !!state.styleOptional[prop] ||
          !!effectiveStyle(id!, prop).value
        );
      };
      const supportsFontSize = shown("fontSize");
      state.styleDisabled = !editor.canStyle(id!);
      const fsRow = supportsFontSize
        ? scaleRow(
            "fontSize",
            "Font size",
            fontSizes(theme).map((o) => ({ key: o.key, label: o.key })),
          )
        : null;
      state.fontSizeOptions = fsRow?.options ?? [];
      state.fontSizeIsSelect = fsRow?.isSelect ?? false;
      state.fontSizeValue = fsRow?.value ?? "";
      state.fontSizeValueLabel = fsRow?.valueLabel ?? "Default";
      state.fontSizeInherited = fsRow?.inherited ?? false;
      state.fontSizeInheritedLabel = fsRow?.inheritedLabel ?? "";
      state.colorRows = [
        { prop: "textColor", label: "Text", shown: shown("textColor") },
        {
          prop: "backgroundColor",
          label: "Background",
          shown: shown("backgroundColor"),
        },
      ]
        .filter((r) => r.shown)
        .map((r) => colorRow(r.prop, r.label));
      state.dimensionRows = [
        {
          prop: "padding",
          label: "Padding",
          shown: !state.paddingLinkAvailable && shown("padding"),
        },
        {
          prop: "paddingInline",
          label: "Horizontal padding",
          shown: !state.boxPaddingShown && shown("paddingInline"),
        },
        {
          prop: "paddingBlock",
          label: "Vertical padding",
          shown: !state.boxPaddingShown && shown("paddingBlock"),
        },
        ...paddingSides.map((prop) => ({
          prop,
          label: prop
            .replace(/([A-Z])/g, " $1")
            .toLowerCase()
            .replace(/^./, (c) => c.toUpperCase()),
          shown: !state.paddingLinkAvailable && shown(prop),
        })),
        {
          prop: "margin",
          label: "Margin",
          shown: !state.marginLinkAvailable && shown("margin"),
        },
        ...marginSides.map((prop) => ({
          prop,
          label: prop
            .replace(/([A-Z])/g, " $1")
            .toLowerCase()
            .replace(/^./, (c) => c.toUpperCase()),
          shown: !state.marginLinkAvailable && shown(prop),
        })),
        { prop: "width", label: "Width", shown: shown("width") },
        { prop: "height", label: "Height", shown: shown("height") },
        {
          prop: "minHeight",
          label: "Minimum height",
          shown: shown("minHeight"),
        },
        { prop: "minWidth", label: "Minimum width", shown: shown("minWidth") },
        { prop: "flexBasis", label: "Flex basis", shown: shown("flexBasis") },
      ]
        .filter((r) => r.shown)
        .map((r) =>
          scaleRow(
            r.prop,
            r.label,
            (r.prop.startsWith("padding") || r.prop.startsWith("margin")
              ? spacingChoices
              : SPACING_STEPS.map((key) => ({ key, label: key, value: key }))
            ).map(({ key, label, value }) => ({ key, label, value })),
          ),
        );
      const aspectValues =
        typeof supports?.dimensions?.aspectRatio === "object" &&
        supports.dimensions.aspectRatio.values
          ? supports.dimensions.aspectRatio.values
          : ["auto", "square", "video"];
      if (shown("aspectRatio"))
        state.dimensionRows.push(
          scaleRow(
            "aspectRatio",
            "Aspect ratio",
            aspectValues.map((key) => ({ key, label: key })),
          ),
        );
      state.dimensionPanelShown = state.spacingBoxShown || !!state.dimensionRows.length;
      state.textSpacingResetShown =
        getBlockType(block!.type)?.category === "Text" && state.spacingBoxShown;
      state.layoutRows = [
        shown("gap")
          ? scaleRow(
              "gap",
              "Gap",
              spacingChoices.map(({ key, label, value }) => ({ key, label, value })),
            )
          : null,
        shown("rowGap")
          ? scaleRow(
              "rowGap",
              "Row gap",
              spacingChoices.map(({ key, label, value }) => ({ key, label, value })),
            )
          : null,
        shown("columnGap")
          ? scaleRow(
              "columnGap",
              "Column gap",
              spacingChoices.map(({ key, label, value }) => ({ key, label, value })),
            )
          : null,
        shown("justifyContent")
          ? scaleRow(
              "justifyContent",
              "Justification",
              JUSTIFY_CONTENT.map(({ key, label }) => ({
                key,
                label,
                icon: iconRef(`justify-${key}`),
              })),
              true,
              false,
            )
          : null,
        shown("alignItems")
          ? scaleRow(
              "alignItems",
              "Items alignment",
              ALIGN_ITEMS.map(({ key, label }) => ({
                key,
                label,
                icon: iconRef(`align-${key}`),
              })),
              true,
              false,
            )
          : null,
        shown("flexWrap")
          ? scaleRow(
              "flexWrap",
              "Wrapping",
              FLEX_WRAPS.map(({ key, label }) => ({
                key,
                label,
                icon: iconRef(
                  key === "nowrap" ? "wrap-none" : key === "reverse" ? "wrap-reverse" : "wrap",
                ),
              })),
              true,
              false,
            )
          : null,
        shown("gridColumns")
          ? scaleRow(
              "gridColumns",
              "Grid columns",
              (typeof supports?.layout?.gridColumns === "object" &&
              supports.layout.gridColumns.values
                ? supports.layout.gridColumns.values
                : ["1", "2", "3", "4", "5", "6"]
              ).map((key) => ({ key, label: key })),
            )
          : null,
      ].filter((row): row is ScaleRow => !!row);
      // Border (C4)
      // Width is edited in the unified box model above. The Border panel keeps
      // the properties that are not part of box geometry.
      state.borderWidthRows = [];
      state.borderRadiusRows = [];
      const bcRow = shown("borderColor") ? colorRow("borderColor", "Color") : null;
      const activeBorderColor =
        activeKind === "border"
          ? borderValueForSide(id!, "borderColor", activeSide)
          : (bcRow?.value ?? "");
      const semanticBorderColors = semanticColors(theme);
      const recommendedBorderColors = semanticBorderColors
        .filter((color) => colorRoleKey(color.key) === "border")
        .sort((left, right) => {
          const leftActive = colorContextKey(left.key) === activeColorContext ? 0 : 1;
          const rightActive = colorContextKey(right.key) === activeColorContext ? 0 : 1;
          return leftActive - rightActive;
        });
      const tokenBorderColors = paletteTokens(theme).map((token) => {
        const key = token.name.slice("color-".length);
        return {
          key,
          value: token.value,
          family: key.replace(/-\d+$/, ""),
          label: key
            .split("-")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
        };
      });
      const borderPalette =
        state.borderColorTier === "semantic"
          ? semanticBorderColors
          : state.borderColorTier === "tokens"
            ? tokenBorderColors
            : state.borderColorTier === "custom"
              ? []
              : recommendedBorderColors;
      const borderSwatches = borderPalette.map((color) => ({
        key: color.key,
        css: color.value,
        label: color.label,
        pressed: color.key === activeBorderColor,
      }));
      const borderColorGrid = borderSwatches.length > GRID_MIN;
      const borderColorFamilies = borderColorGrid
        ? borderPalette.reduce<SwatchFamily[]>((families, color, index) => {
            const familyName = color.family || "Colors";
            const family = families.find((candidate) => candidate.family === familyName);
            if (family) family.swatches.push(borderSwatches[index]);
            else families.push({ family: familyName, swatches: [borderSwatches[index]] });
            return families;
          }, [])
        : [];
      const selectedColor =
        [...semanticBorderColors, ...tokenBorderColors].find(
          (color) => color.key === activeBorderColor,
        )?.value ?? activeBorderColor;
      const shortHex = /^#([\da-f])([\da-f])([\da-f])$/i.exec(selectedColor);
      const fullHex = /^#[\da-f]{6}$/i.test(selectedColor)
        ? selectedColor
        : shortHex
          ? `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`
          : "#000000";
      state.borderColorShown = !!bcRow;
      state.boxEditorBorderColorShown =
        activeKind === "border" &&
        !state.boxEditorRadiusOnly &&
        !!bcRow &&
        editorTargets.length > 0 &&
        editorTargets.every((side) => hasBorderWidth(borderValueForSide(id!, "borderWidth", side)));
      state.borderColorTierRecommended = state.borderColorTier === "recommended";
      state.borderColorTierSemantic = state.borderColorTier === "semantic";
      state.borderColorTierTokens = state.borderColorTier === "tokens";
      state.borderColorTierCustom = state.borderColorTier === "custom";
      state.borderColorChoicesShown = state.borderColorTier !== "custom";
      state.borderColorGrid = borderColorGrid;
      state.borderColorValue = activeBorderColor;
      state.borderColorCustomValue = fullHex;
      state.borderColorCustomText = selectedColor || "";
      state.borderColorSwatches = borderColorGrid ? [] : borderSwatches;
      state.borderColorFamilies = borderColorFamilies;
      const borderStyle = effectiveStyle(id!, "borderStyle").value;
      state.borderStyleOptions = shown("borderStyle")
        ? BORDER_STYLES.map(({ key, label }) => ({
            key,
            label,
            pressed: key === borderStyle,
          }))
        : [];
      state.borderShown = !!state.borderStyleOptions.length;
      // Typography extras (C5): line-height + letter-spacing scales come from
      // the theme; decoration + case are keyword utilities (the spec, not the
      // theme) and keep their static vocabulary.
      state.typographyRows = (
        [
          [
            "lineHeight",
            "Line height",
            leadings(theme).map((o) => ({ key: o.key, label: o.key })),
            shown("lineHeight"),
            false,
          ],
          [
            "textAlign",
            "Text alignment",
            TEXT_ALIGNMENTS.map(({ key, label }) => ({ key, label })),
            shown("textAlign"),
            true,
          ],
          [
            "fontWeight",
            "Font weight",
            FONT_WEIGHTS.map(({ key, label }) => ({ key, label })),
            shown("fontWeight"),
            true,
          ],
          [
            "fontStyle",
            "Font style",
            FONT_STYLES.map(({ key, label }) => ({ key, label })),
            shown("fontStyle"),
            true,
          ],
          [
            "letterSpacing",
            "Letter spacing",
            trackings(theme).map((o) => ({ key: o.key, label: o.key })),
            shown("letterSpacing"),
            false,
          ],
          [
            "decoration",
            "Decoration",
            DECORATIONS.map((k) => ({ key: k.key, label: k.label })),
            shown("decoration"),
            true,
          ],
          [
            "letterCase",
            "Letter case",
            LETTER_CASES.map((k) => ({ key: k.key, label: k.label })),
            shown("letterCase"),
            true,
          ],
        ] as [string, string, { key: string; label: string }[], boolean, boolean][]
      )
        .filter(([, , , shown]) => shown)
        .map(([prop, label, opts, , none]) => scaleRow(prop, label, opts, none));
      state.styleFontSizeShown = supportsFontSize || !!state.typographyRows.length;
      // Unresolved utility chips (E4): utility-shaped classes with no token.
      const ownClasses = (editor.getBlock(id!)?.classes ?? "").split(/\s+/).filter(Boolean);
      state.unresolvedChips = unresolvedUtilities(ownClasses).map((u) => ({
        cls: u.cls,
        suffix: u.suffix,
        ns: u.namespaces[0],
        label: u.namespaces.map((n) => `--${n}-${u.suffix}`).join("  or  "),
      }));
    } else {
      state.blockDescription = "";
      state.blockSettings = [];
      state.blockHeaderSettings = [];
      state.blockHasStyles = false;
      state.styleHasValues = false;
      state.blockInspectorTab = "settings";
      state.styleFontSizeShown = false;
      state.fontSizeOptions = [];
      state.fontSizeIsSelect = false;
      state.fontSizeValue = "";
      state.variationOptions = [];
      state.colorRows = [];
      state.dimensionRows = [];
      state.dimensionPanelShown = false;
      state.spacingBoxShown = false;
      state.textSpacingResetShown = false;
      state.boxPaddingShown = false;
      state.boxMarginShown = false;
      state.boxBorderShown = false;
      state.boxBorderRadiusTopLeft = "";
      state.boxBorderRadiusTopRight = "";
      state.boxBorderRadiusBottomRight = "";
      state.boxBorderRadiusBottomLeft = "";
      state.boxEditorOpen = false;
      state.boxEditorTargetId = "";
      state.boxEditorRows = [];
      state.boxEditorRadiusRows = [];
      state.boxEditorRadiusShown = false;
      state.boxEditorRadiusOnly = false;
      state.boxEditorRadiusSyncShown = false;
      state.boxEditorRadiusAllPressed = false;
      state.boxEditorBorderColorShown = false;
      state.boxTargetPaddingTop = false;
      state.boxTargetPaddingRight = false;
      state.boxTargetPaddingBottom = false;
      state.boxTargetPaddingLeft = false;
      state.boxTargetPaddingAll = false;
      state.boxTargetMarginTop = false;
      state.boxTargetMarginRight = false;
      state.boxTargetMarginBottom = false;
      state.boxTargetMarginLeft = false;
      state.boxTargetMarginAll = false;
      state.boxTargetBorderTop = false;
      state.boxTargetBorderRight = false;
      state.boxTargetBorderBottom = false;
      state.boxTargetBorderLeft = false;
      state.boxTargetBorderAll = false;
      state.boxTargetRadiusTopLeft = false;
      state.boxTargetRadiusTopRight = false;
      state.boxTargetRadiusBottomRight = false;
      state.boxTargetRadiusBottomLeft = false;
      state.boxBorderRadiusShown = false;
      state.paddingLinkAvailable = false;
      state.paddingSidesLinked = true;
      state.paddingSidesLabel = "Separate sides";
      state.marginLinkAvailable = false;
      state.marginSidesLinked = true;
      state.marginSidesLabel = "Separate sides";
      state.borderSidesLabel = "Edit border properties";
      state.layoutRows = [];
      state.borderShown = false;
      state.borderWidthRows = [];
      state.borderRadiusRows = [];
      state.borderStyleOptions = [];
      state.borderColorShown = false;
      state.borderColorGrid = false;
      state.borderColorValue = "";
      state.borderColorSwatches = [];
      state.borderColorFamilies = [];
      state.typographyRows = [];
      state.optionalStyleControls = [];
      state.styleOptionalOpen = false;
      state.unresolvedChips = [];
      state.blockIsPattern = false;
      state.blockIsTemplatePart = false;
      state.blockTemplatePartName = "";
      state.blockTemplatePartLabel = "";
      state.blockIsContainer = false;
      state.blockPattern = "";
      state.blockPatternRoot = "";
      state.blockPatternContent = [];
      state.blockPatternContexts = [];
      state.blockPatternContextShown = false;
      state.blockPatternActiveContext = "default";
      if (!state.templateIsPattern) {
        state.patternColorSchemesShown = false;
        state.patternColorSchemes = [];
      }
    }
    const lockedTemplatePart = documentTemplateNodes().find(
      (candidate) => candidate.id === state.selectedTemplateNodeId && candidate.kind === "part",
    );
    if (!block && lockedTemplatePart) {
      state.blockSelected = true;
      state.blockLabel = lockedTemplatePart.label;
      state.blockIcon = lockedTemplatePart.icon;
      state.blockLetter = lockedTemplatePart.label[0]?.toUpperCase() ?? "T";
      state.blockDescription =
        "A shared template part. Edit the original to update every document that uses it.";
      state.blockSettings = [];
      state.blockHeaderSettings = [];
      state.blockHasStyles = false;
      state.blockInspectorTab = "settings";
      state.blockIsPattern = false;
      state.blockIsTemplatePart = true;
      state.blockTemplatePartName = lockedTemplatePart.name;
      state.blockTemplatePartLabel = lockedTemplatePart.label;
      state.blockIsContainer = false;
      if (!state.templateIsPattern) {
        state.patternColorSchemesShown = false;
        state.patternColorSchemes = [];
      }
    }
    if (state.boxEditorOpen) scheduleBoxEditorPosition();
    state.emptyNote = n > 1 ? `${n} blocks selected.` : "No block selected.";
  }

  function syncBreadcrumb() {
    const n = editor.selection.blocks.length;
    const id = panelTarget();
    const templateNode = documentTemplateNodes().find(
      (candidate) => candidate.id === state.selectedTemplateNodeId,
    );
    // full ancestor path breadcrumb: Document › Group › Heading
    const path = id ? pathToBlock(editor.getModel().blocks, id) : null;
    state.breadcrumb = templateNode
      ? `Document › ${templateNode.label}`
      : n > 1
        ? `Document › ${n} blocks selected`
        : path
          ? ["Document", ...path.map((b) => blockLabelOf(b))].join(" › ")
          : "Document";
  }

  // Familiar block-editor semantics: picking REPLACES an empty default block; otherwise a
  // top-level anchor inserts right after it; anything else appends at the end.
  // A "pattern:<name>" pick stamps the pattern through the same anchor rules.
  function insertFromLibrary(type: string) {
    const pattern = type.startsWith("pattern:") ? type.slice("pattern:".length) : null;
    const placement = inserterPlacement;
    inserterPlacement = null;
    if (placement) {
      if (pattern) editor.insertPatternAdjacent(placement.anchorId, placement.edge, pattern);
      else editor.insertBlockAdjacent(placement.anchorId, placement.edge, type);
      return;
    }
    const anchorId = singleTarget() ?? inserterAnchorId;
    const anchor = anchorId ? editor.getBlock(anchorId) : null;
    if (anchorId && anchor?.type === "paragraph" && !plainText(anchor.fields.body).trim()) {
      if (pattern) editor.replaceWithPattern(anchorId, pattern);
      else editor.replaceBlock(anchorId, type);
    } else if (anchorId && anchor) {
      const model = editor.getModel();
      const at = locateBlock(model.blocks, anchorId);
      // insert is a top-level primitive — a nested anchor appends at the end
      const index = at && at.list === model.blocks ? at.index + 1 : undefined;
      if (pattern) editor.insertPattern(pattern, index);
      else editor.insertBlock(type, index);
    } else if (pattern) {
      editor.insertPattern(pattern);
    } else {
      editor.insertBlock(type);
    }
  }

  function setInserterOpen(open: boolean) {
    if (state.inserterOpen === open) return;
    if (open) {
      setTreeOpen(false); // the left rail hosts one panel at a time
      if (state.inserterTab === "patterns") setSidebarOpen(false);
      // capture the anchor BEFORE the search steals focus and clears `active`
      inserterAnchorId = singleTarget();
      inserterPlacement = null;
      state.query = "";
      state.libraryEpoch++; // console-registered blocks appear on the next open
    }
    state.inserterOpen = open;
    if (open) {
      // bindings flush on a microtask; focus once the panel is visible
      requestAnimationFrame(() =>
        document
          .getElementById(state.inserterTab === "patterns" ? "pattern-search" : "library-search")
          ?.focus(),
      );
    }
  }

  function setTreeOpen(open: boolean) {
    if (state.treeOpen === open) return;
    if (open) setInserterOpen(false); // ← mutual: the early-return above breaks the recursion
    if (open && state.treeTab === "patterns") setSidebarOpen(false);
    state.treeOpen = open;
  }

  function patternBrowserActive(): boolean {
    return (
      state.explorerOpen ||
      (state.treeOpen && state.treeTab === "patterns") ||
      (state.inserterOpen && state.inserterTab === "patterns")
    );
  }

  function setSidebarOpen(open: boolean) {
    if (open && patternBrowserActive()) return;
    state.sidebarOpen = open;
    if (!open) return;
    state.sidebarTab = editor.selection.blocks.length ? "block" : "document";
    state.blockInspectorTab = "settings";
  }

  // The explorer dialog's OPEN path — shared by the rail's "Explore all
  // patterns" button and the in-canvas pickers' "Pattern" entry (which
  // passes the block the picker targeted as the insertion anchor).
  function openExplorer(anchorId?: string | null, placement?: InlineInsertionPlacement) {
    if (anchorId) inserterAnchorId = anchorId;
    inserterPlacement = placement ?? null;
    setSidebarOpen(false);
    state.explorerQuery = "";
    state.explorerGroup = state.patternGroup || "All";
    state.explorerOpen = true;
    // Escape must close the dialog wherever focus sits (the search focus
    // below lands a frame later — a modal can't depend on it): document
    // scope, capture phase, detached again on close.
    document.addEventListener("keydown", explorerEscape, true);
    requestAnimationFrame(() => document.getElementById("explorer-search")?.focus());
  }

  // The explorer dialog's close path — shared by the ✕ button, the backdrop
  // click, and the document-level Escape (attached while open).
  function closeExplorer() {
    document.removeEventListener("keydown", explorerEscape, true);
    if (!state.explorerOpen) return;
    state.explorerOpen = false;
    document.getElementById("pattern-explore")?.focus();
  }
  function explorerEscape(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.stopPropagation(); // the dialog swallows its own dismissal — nothing else reacts
    closeExplorer();
  }

  // --- isolation editing modes ---------------------------------------------------
  //
  // Not a sub-editor: THE editor enters an isolation mode — the page document
  // is parked, the isolated content loads into the same canvas, and every
  // piece of chrome (rail inserter, sidebar, list view, toolbar) just keeps
  // working because nothing else changed. The TOPBAR carries the mode — it
  // morphs (purple isolation skin, scope label + error at left, Cancel/commit
  // replacing the host actions at right) rather than growing a banner row:
  // modes never stack chrome. History is isolated for free — loadHtml resets
  // it on the way in AND out.
  //
  // THREE modes over the same machinery (thoughts/012):
  // - "definition": editing a pattern in the LIBRARY. Save = publish —
  //   versioned via publishPattern, previews refresh, placed copies never
  //   move. Entered from the flyout/explorer cards' Edit affordance.
  // - "instance": a placed copy's "Edit pattern". Save applies the edited
  //   blocks back to THAT COPY only (editor.setBlockChildren) — there is no
  //   "source" from the instance's point of view.
  // - "primitive": a block's theme default. The editor and block inspector
  //   dock into the theme workspace while the parked page stays untouched.

  let templateName: string | null = null; // definition mode: the pattern name
  let instanceId: string | null = null; // instance mode: the copy's block id
  let pageTemplateName: string | null = null;
  let templatePartName: string | null = null;
  let parkedDoc: string | null = null; // the page document while a mode is on
  let currentIsolationScope: IsolationScope | null = null;

  interface IsolationFrame {
    mode: IsolationMode;
    content: string;
    targetId: string;
    scope: IsolationScope;
    opener: HTMLElement | null;
    backdropClasses: string[];
    templateName: string | null;
    instanceId: string | null;
    pageTemplateName: string | null;
    templatePartName: string | null;
    ui: {
      label: string;
      isInstance: boolean;
      isPattern: boolean;
      canvasShown: boolean;
      lead: string;
      help: string;
      saveLabel: string;
      error: string;
      patternDefaultColorContext: string;
      patternDisabledColorContexts: string[];
      patternLegacyColorContexts: string[];
    };
  }

  interface IsolationViewportSnapshot {
    canvasX: number;
    canvasY: number;
    targetVisualTop: number | null;
    ancestors: Array<{ element: Element; left: number; top: number }>;
    hostX: number;
    hostY: number;
  }

  const isolationStack: IsolationFrame[] = [];
  let parkedViewport: IsolationViewportSnapshot | null = null;

  const captureIsolationViewport = (targetId?: string | null): IsolationViewportSnapshot => {
    const canvasWindow = canvasDocument.defaultView;
    const target = targetId
      ? canvasEl.querySelector<HTMLElement>(`[data-pb-id="${CSS.escape(targetId)}"]`)
      : null;
    const ancestors: IsolationViewportSnapshot["ancestors"] = [];
    for (let element = canvasFrame.parentElement; element; element = element.parentElement)
      ancestors.push({ element, left: element.scrollLeft, top: element.scrollTop });
    return {
      canvasX: canvasWindow?.scrollX ?? 0,
      canvasY: canvasWindow?.scrollY ?? 0,
      targetVisualTop: target?.getBoundingClientRect().top ?? null,
      ancestors,
      hostX: window.scrollX,
      hostY: window.scrollY,
    };
  };

  const restoreIsolationViewport = (
    snapshot: IsolationViewportSnapshot | null,
    targetId: string | null,
  ): void => {
    if (!snapshot) return;
    const restore = () => {
      if (state.templateMode) return;
      for (const { element, left, top } of snapshot.ancestors) {
        element.scrollLeft = left;
        element.scrollTop = top;
      }
      window.scrollTo(snapshot.hostX, snapshot.hostY);
      const canvasWindow = canvasDocument.defaultView;
      if (!canvasWindow) return;
      let canvasY = snapshot.canvasY;
      if (targetId && snapshot.targetVisualTop != null) {
        const target = canvasEl.querySelector<HTMLElement>(
          `[data-pb-id="${CSS.escape(targetId)}"]`,
        );
        if (target)
          canvasY = Math.max(
            0,
            canvasWindow.scrollY + target.getBoundingClientRect().top - snapshot.targetVisualTop,
          );
      }
      canvasWindow.scrollTo(snapshot.canvasX, canvasY);
    };
    // loadHtml and selection are synchronous, so restore immediately to avoid
    // a top-pinned paint. Repeat after the frame so Apply-to-copy's subsequent
    // setBlockChildren render and focus restoration cannot dislodge the page.
    restore();
    requestAnimationFrame(restore);
  };

  // Classes lent to the canvas as a BACKDROP during instance isolation (see
  // enterIsolation) — the instance editor isolates the copy's CHILDREN, so the
  // root's own classes (bg, relative/isolate for absolute decorations) aren't
  // in the content; borrowing them onto the canvas renders the children in the
  // same visual context they have on the page. Definition mode passes none —
  // its content includes the root.
  let backdropClasses: string[] = [];
  // The control that opened the mode: Cancel/commit live in the morphing
  // topbar, so whatever was focused on entry is the right place to send
  // focus back to on exit (if it survived the mode).
  let isolationOpener: HTMLElement | null = null;

  function syncIsolationBreadcrumbs(): void {
    const scopes = [
      ...isolationStack.map((frame) => frame.scope),
      ...(currentIsolationScope ? [currentIsolationScope] : []),
    ];
    state.isolationBreadcrumbsShown = scopes.length > 1;
    state.isolationBreadcrumbs = scopes.map((scope, index) => ({
      ...scope,
      index,
      current: index === scopes.length - 1,
    }));
  }

  function pushIsolationParent(targetId: string): boolean {
    if (!state.templateMode || state.templateMode === "primitive" || !currentIsolationScope)
      return false;
    isolationStack.push({
      mode: state.templateMode,
      content: editor.serialize(),
      targetId,
      scope: currentIsolationScope,
      opener: isolationOpener,
      backdropClasses: [...backdropClasses],
      templateName,
      instanceId,
      pageTemplateName,
      templatePartName,
      ui: {
        label: state.templateLabel,
        isInstance: state.templateIsInstance,
        isPattern: state.templateIsPattern,
        canvasShown: state.templateCanvasShown,
        lead: state.templateLead,
        help: state.templateHelp,
        saveLabel: state.templateSaveLabel,
        error: state.templateError,
        patternDefaultColorContext: state.patternDefaultColorContext,
        patternDisabledColorContexts: [...state.patternDisabledColorContexts],
        patternLegacyColorContexts: [...state.patternLegacyColorContexts],
      },
    });
    if (backdropClasses.length) canvasEl.classList.remove(...backdropClasses);
    backdropClasses = [];
    return true;
  }

  function enterIsolation(
    label: string,
    content: string,
    scope: IsolationScope,
    backdrop = "",
    nested = false,
    restoreTargetId: string | null = null,
  ) {
    isolationOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!nested) {
      parkedDoc = editor.serialize(); // full editor-pipeline wire — everything survives
      parkedViewport = captureIsolationViewport(restoreTargetId);
    }
    currentIsolationScope = scope;
    state.templateIsPattern =
      state.templateMode === "definition" || state.templateMode === "instance";
    if (state.templateIsPattern) inspectedId = null;
    state.templateCanvasShown = state.templateIsPattern || state.templateMode === "template-part";
    mountBareCanvas();
    state.templateLabel = label;
    state.templateError = "";
    setTreeOpen(false); // panels re-open fine in-mode; start on the content
    setInserterOpen(false);
    backdropClasses = backdrop.split(/\s+/).filter(Boolean);
    if (backdropClasses.length) canvasEl.classList.add(...backdropClasses);
    // The current scope's own wrapper is absent (definitions load their
    // content; instances load their children), so opacity can stay enabled:
    // any pattern wrapper still present is a nested instance and remains
    // content-only until its own Edit pattern door is opened.
    editor.setPatternsOpaque(true);
    editor.loadHtml(content);
    syncIsolationBreadcrumbs();
    requestAnimationFrame(syncIsolationCanvasHeight);
    // Pattern isolation opens at the pattern level with no implied block.
    // Other isolation modes retain their established root-block landing.
    const root = editor.getModel().blocks[0];
    if (root && !state.templateIsPattern) editor.selectBlock(root.id);
    else editor.clearSelection();
  }

  function openTemplateEditor(name: string) {
    const def = getPattern(name);
    if (!def || state.templateMode) return;
    templateName = name;
    state.templateMode = "definition";
    state.templateIsInstance = false;
    state.templateIsPrimitive = false;
    state.templateChromeShown = true;
    state.templateLead = "Editing pattern:";
    state.templateHelp = "Publishing updates the library design; placed copies never change";
    state.templateSaveLabel = "Publish pattern";
    state.patternDefaultColorContext = def.defaultColorContext ?? "default";
    state.patternDisabledColorContexts = [...(def.disabledColorContexts ?? [])];
    state.patternLegacyColorContexts = [];
    enterIsolation(def.label, hydrateTemplateParts(def.content), {
      label: def.label,
      kind: "pattern",
    });
    if (!def.defaultColorContext) {
      const inferredContext = flattenBlocks(editor.getModel().blocks)
        .flatMap((block) => [
          editor.getStyle(block.id, "backgroundColor"),
          editor.getStyle(block.id, "textColor"),
          editor.getStyle(block.id, "borderColor"),
        ])
        .map(colorContextKey)
        .find((key): key is string => !!key);
      state.patternDefaultColorContext = inferredContext ?? "default";
      syncBlockPanel();
    }
    setSidebarOpen(true);
    state.sidebarTab = "document";
    requestAnimationFrame(() => {
      if (state.templateMode === "definition") state.sidebarTab = "document";
    });
  }

  function openInstanceEditor(id: string) {
    const block = editor.getBlock(id);
    const def = block?.pattern ? getPattern(block.pattern) : undefined;
    if (!block?.children || state.templateMode === "primitive") return;
    const nested = !!state.templateMode;
    if (nested && !pushIsolationParent(id)) return;
    templateName = null;
    instanceId = id;
    pageTemplateName = null;
    templatePartName = null;
    state.templateMode = "instance";
    state.templateIsInstance = true;
    state.templateIsPrimitive = false;
    state.templateChromeShown = true;
    state.templateLead = "Editing pattern:";
    state.templateHelp = "Changes apply only to this copy";
    state.templateSaveLabel = "Apply to this copy";
    const storedContext =
      typeof block.settings?.colorContext === "string" ? block.settings.colorContext : "";
    const inferredContext = flattenBlocks(block.children)
      .flatMap((candidate) => [
        editor.getStyle(candidate.id, "backgroundColor"),
        editor.getStyle(candidate.id, "textColor"),
        editor.getStyle(candidate.id, "borderColor"),
      ])
      .map(colorContextKey)
      .find((key): key is string => !!key);
    state.patternDefaultColorContext =
      storedContext || inferredContext || def?.defaultColorContext || "default";
    state.patternDisabledColorContexts = [...(def?.disabledColorContexts ?? [])];
    state.patternLegacyColorContexts = Array.isArray(block.settings?.legacyColorContexts)
      ? block.settings.legacyColorContexts.filter(
          (context): context is string => typeof context === "string",
        )
      : [];
    // Borrow the instance root's classes as the canvas backdrop so the
    // children render on the section's own background (the copy's root frame
    // stays in the page — Save writes back via setBlockChildren).
    enterIsolation(
      def?.label ?? "Pattern",
      hydrateTemplateParts(downcast({ blocks: block.children })),
      { label: def?.label ?? "Pattern", kind: "pattern" },
      block.classes,
      nested,
      id,
    );
    setSidebarOpen(true);
    state.sidebarTab = "document";
    requestAnimationFrame(() => {
      if (state.templateMode === "instance") state.sidebarTab = "document";
    });
  }

  function openPageTemplateEditor(name: string) {
    const definition = getTemplate(name);
    if (!definition || state.templateMode) return;
    pageTemplateName = name;
    state.templateMode = "page-template";
    state.templateIsInstance = false;
    state.templateIsPrimitive = false;
    state.templateChromeShown = true;
    state.templateLead = "Editing template:";
    state.templateHelp = "Changes apply to every document using this template";
    state.templateSaveLabel = "Save template";
    enterIsolation(definition.label, hydrateTemplateParts(definition.content), {
      label: definition.label,
      kind: "template",
    });
  }

  function openTemplatePartEditor(id: string) {
    const block = editor.getBlock(id);
    const name = block?.type === TEMPLATE_PART_TYPE ? stringSetting(block, "name") : "";
    const definition = name ? getTemplatePart(name) : undefined;
    if (!block || !definition || !state.templateMode || state.templateMode === "primitive") return;
    if (!pushIsolationParent(id)) return;
    templateName = null;
    instanceId = null;
    pageTemplateName = null;
    templatePartName = name;
    state.templateMode = "template-part";
    state.templateIsInstance = false;
    state.templateIsPrimitive = false;
    state.templateIsPattern = false;
    state.templateChromeShown = true;
    state.templateCanvasShown = true;
    state.templateLead = "Editing template part:";
    state.templateHelp = "Changes apply everywhere this template part is used";
    state.templateSaveLabel = "Save template part";
    enterIsolation(
      definition.label,
      hydrateTemplateParts(definition.content, [name]),
      { label: definition.label, kind: "template-part" },
      "",
      true,
    );
  }

  function openDocumentTemplatePartEditor(name: string) {
    const definition = getTemplatePart(name);
    if (!definition || state.templateMode) return;
    templatePartName = name;
    state.templateMode = "template-part";
    state.templateIsInstance = false;
    state.templateIsPrimitive = false;
    state.templateChromeShown = true;
    state.templateLead = "Editing template part:";
    state.templateHelp = "Changes apply everywhere this template part is used";
    state.templateSaveLabel = "Save template part";
    enterIsolation(definition.label, hydrateTemplateParts(definition.content, [name]), {
      label: definition.label,
      kind: "template-part",
    });
  }

  function returnToParentIsolation(
    content?: string,
    colorContext?: string,
    legacyColorContexts?: readonly string[],
  ): boolean {
    const frame = isolationStack.pop();
    if (!frame) return false;
    if (backdropClasses.length) canvasEl.classList.remove(...backdropClasses);
    backdropClasses = [...frame.backdropClasses];
    if (backdropClasses.length) canvasEl.classList.add(...backdropClasses);
    templateName = frame.templateName;
    instanceId = frame.instanceId;
    pageTemplateName = frame.pageTemplateName;
    templatePartName = frame.templatePartName;
    currentIsolationScope = frame.scope;
    isolationOpener = frame.opener;
    state.templateMode = frame.mode;
    state.templateIsInstance = frame.ui.isInstance;
    state.templateIsPattern = frame.ui.isPattern;
    state.templateCanvasShown = frame.ui.canvasShown;
    state.templateChromeShown = true;
    state.templateLabel = frame.ui.label;
    state.templateLead = frame.ui.lead;
    state.templateHelp = frame.ui.help;
    state.templateSaveLabel = frame.ui.saveLabel;
    state.templateError = frame.ui.error;
    state.patternDefaultColorContext = frame.ui.patternDefaultColorContext;
    state.patternDisabledColorContexts = [...frame.ui.patternDisabledColorContexts];
    state.patternLegacyColorContexts = [...frame.ui.patternLegacyColorContexts];
    editor.setPatternsOpaque(true);
    editor.loadHtml(frame.content);
    if (content != null)
      editor.setBlockChildren(frame.targetId, content, colorContext, legacyColorContexts);
    else editor.selectBlock(frame.targetId);
    syncIsolationBreadcrumbs();
    syncCanvasViewportFit();
    requestAnimationFrame(syncIsolationCanvasHeight);
    return true;
  }

  function navigateIsolationBreadcrumb(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= isolationStack.length) return;
    while (isolationStack.length > index) returnToParentIsolation();
  }

  function mountPrimitiveSurface(): void {
    const shell = canvasFrame.closest<HTMLElement>("#editor-shell");
    const main = shell?.querySelector<HTMLElement>("#main");
    const editorSlot = shell?.querySelector<HTMLElement>("[data-design-default-editor-slot]");
    const sidebar = shell?.querySelector<HTMLElement>("#sidebar");
    if (!main || !editorSlot || !sidebar) return;
    // Reparenting an iframe reloads its browsing context. Keep #main in its
    // original DOM home and project it over the workspace's editor slot.
    editorSlot.classList.remove("hidden");
    const place = () => {
      if (!state.designPrimitiveEditing) return;
      const rect = editorSlot.getBoundingClientRect();
      main.classList.remove("hidden");
      main.style.position = "fixed";
      main.style.left = `${rect.left}px`;
      main.style.top = `${rect.top}px`;
      main.style.width = `${rect.width}px`;
      main.style.height = `${rect.height}px`;
      main.style.zIndex = "30";
      main.style.background = "var(--color-background)";
    };
    place();
    requestAnimationFrame(place);
    sidebar.querySelector<HTMLElement>("#sidebar-tabs")?.classList.add("hidden");
  }

  function unmountPrimitiveSurface(): void {
    const shell = canvasFrame.closest<HTMLElement>("#editor-shell");
    const main = shell?.querySelector<HTMLElement>("#main");
    const sidebar = shell?.querySelector<HTMLElement>("#sidebar");
    if (!main || !sidebar) return;
    for (const property of ["position", "left", "top", "width", "height", "z-index", "background"])
      main.style.removeProperty(property);
    if (state.designWorkspaceOpen) main.classList.add("hidden");
    sidebar.querySelector<HTMLElement>("#sidebar-tabs")?.classList.remove("hidden");
  }

  function openPrimitiveDefaultEditor(type: string) {
    const def = getBlockType(type);
    if (!def || state.templateMode || def.internal || NON_THEME_PRIMITIVES.has(type)) return;
    primitiveType = type;
    state.designPrimitiveType = type;
    syncDesignPrimitives();
    state.templateMode = "primitive";
    state.templateIsInstance = false;
    state.templateIsPrimitive = true;
    state.templateChromeShown = false;
    state.templateLead = "Editing default:";
    state.templateHelp = "Set the starting content, appearance, and behavior for this block";
    state.templateSaveLabel = "Save default";
    state.designPrimitiveEditing = true;
    state.designPrimitiveToast = "";
    if (primitiveToastTimer) {
      clearTimeout(primitiveToastTimer);
      primitiveToastTimer = null;
    }
    state.treeTab = "list";
    mountPrimitiveSurface();
    const editorContent = canvasFrame.closest<HTMLElement>("#editor-content");
    if (editorContent) {
      editorContent.style.backgroundColor = state.designPreviewSurface;
      editorContent.style.color = state.designPreviewForeground;
      editorContent.style.fontFamily = state.designPreviewFont;
    }
    canvasEl.style.padding = "64px max(48px, calc((100% - 760px) / 2)) 120px";
    const draft = primitiveDrafts.get(type);
    enterIsolation(def.label, draft ?? "", {
      label: def.label,
      kind: "template",
    });
    let root: Block | undefined = editor.getModel().blocks[0];
    if (!draft) {
      root = editor.insertBlock(type) ?? undefined;
      if (root) {
        seedPrimitiveContent(editor, root);
      }
    }
    if (root) editor.selectBlock(root.id, { toggle: true });
    state.sidebarTab = "block";
    syncBlockPanel();
  }

  // Switching primitives must keep the live iframe mounted. Reparenting an
  // iframe destroys its browsing context in browsers, which used to leave a
  // correctly updated model rendered into a now-detached document.
  function switchPrimitiveDefaultEditor(type: string) {
    const def = getBlockType(type);
    if (!def || state.templateMode !== "primitive" || def.internal) return;
    if (primitiveType) primitiveDrafts.set(primitiveType, editor.serialize());
    primitiveType = type;
    state.designPrimitiveType = type;
    state.designPrimitiveStatus = "Live draft";
    state.designPrimitiveToast = "";
    state.templateLead = "Editing default:";
    state.templateHelp = "Set the starting content, appearance, and behavior for this block";
    state.templateSaveLabel = "Save default";
    syncDesignPrimitives();
    const draft = primitiveDrafts.get(type);
    editor.loadHtml(draft ?? "");
    let root: Block | undefined = editor.getModel().blocks[0];
    if (!draft) {
      root = editor.insertBlock(type) ?? undefined;
      if (root) seedPrimitiveContent(editor, root);
    }
    if (root) editor.selectBlock(root.id, { toggle: true });
    state.sidebarTab = "block";
    syncBlockPanel();
  }

  function closeTemplateEditor() {
    if (!state.templateMode) return;
    if (returnToParentIsolation()) return;
    const wasPrimitive = state.templateMode === "primitive";
    const restoreId = instanceId; // instance mode: re-select the copy we edited
    const restoreViewport = parkedViewport;
    parkedViewport = null;
    const reopenDesign = returnToDesignWorkspace;
    returnToDesignWorkspace = null;
    state.templateMode = false;
    state.templateIsPrimitive = false;
    state.templateIsPattern = false;
    state.templateCanvasShown = false;
    state.templateChromeShown = false;
    state.templateError = "";
    state.patternColorSchemesShown = false;
    state.patternStyleSelectorShown = false;
    state.patternColorSchemes = [];
    state.patternDefaultColorContext = "default";
    state.patternDisabledColorContexts = [];
    state.patternLegacyColorContexts = [];
    state.patternDefinitionMode = false;
    state.patternSchemeTitle = "Default pattern style";
    state.patternSchemeNote = "";
    state.patternOverviewRows = [];
    syncCanvasViewportFit();
    templateName = null;
    instanceId = null;
    pageTemplateName = null;
    templatePartName = null;
    currentIsolationScope = null;
    isolationStack.length = 0;
    syncIsolationBreadcrumbs();
    primitiveType = null;
    if (backdropClasses.length) canvasEl.classList.remove(...backdropClasses);
    backdropClasses = [];
    editor.setPatternsOpaque(true); // the page document is back — instances close up
    mountDocumentFrame();
    editor.loadHtml(parkedDoc ?? "");
    refreshEngineCss();
    parkedDoc = null;
    if (wasPrimitive) {
      state.designPrimitiveToast = "";
      if (primitiveToastTimer) {
        clearTimeout(primitiveToastTimer);
        primitiveToastTimer = null;
      }
      setTreeOpen(false);
      const editorContent = canvasFrame.closest<HTMLElement>("#editor-content");
      if (editorContent) {
        editorContent.style.removeProperty("background-color");
        editorContent.style.removeProperty("color");
        editorContent.style.removeProperty("font-family");
      }
      canvasEl.style.removeProperty("padding");
      unmountPrimitiveSurface();
      state.designPrimitiveEditing = false;
    }
    // ids ride the wire (serialize → loadHtml round-trips them), so the
    // parked document still knows the instance — selection lands back on it
    if (restoreId) editor.selectBlock(restoreId, { center: true });
    // Cancel/commit hide with the mode — return focus to the control that
    // opened it rather than dropping it on <body>.
    if (isolationOpener?.isConnected) isolationOpener.focus();
    isolationOpener = null;
    if (reopenDesign) {
      state.designWorkspaceOpen = true;
      state.designWorkspacePage = reopenDesign;
      syncDesignPanel();
      if (reopenDesign === "patterns") requestAnimationFrame(fillPatternPreviews);
    }
    restoreIsolationViewport(restoreViewport, restoreId);
  }

  async function saveTemplate() {
    if (state.templateMode === "primitive") {
      const type = primitiveType;
      if (type) {
        primitiveDrafts.set(type, editor.serialize());
        applyThemeDocument({
          ...activeTheme(),
          blockDefaults: Object.fromEntries(primitiveDrafts),
        });
      }
      state.designPrimitiveStatus = "Saved";
      state.designPrimitiveToast = `${state.designPrimitiveLabel} default saved`;
      if (primitiveToastTimer) clearTimeout(primitiveToastTimer);
      primitiveToastTimer = setTimeout(() => {
        state.designPrimitiveToast = "";
        state.designPrimitiveStatus = "Live draft";
        primitiveToastTimer = null;
      }, 2200);
      return;
    }
    if (state.templateMode === "instance") {
      // apply to THIS COPY: restore the page, then write the edited blocks
      // back into the instance — one undo entry on the restored document
      const id = instanceId;
      const content = editor.serialize();
      const colorContext = state.patternDefaultColorContext;
      const legacyColorContexts = [...state.patternLegacyColorContexts];
      if (returnToParentIsolation(content, colorContext, legacyColorContexts)) return;
      closeTemplateEditor();
      if (id) editor.setBlockChildren(id, content, colorContext, legacyColorContexts);
      return;
    }
    if (state.templateMode === "template-part") {
      const name = templatePartName;
      if (!name) return;
      const previous = getTemplatePart(name);
      const content = editor.serialize();
      try {
        publishTemplatePart(name, content);
        await shellOptions?.document?.template?.onSavePart?.(name, content, editor);
      } catch (err) {
        if (previous) publishTemplatePart(name, previous.content);
        state.templateError = err instanceof Error ? err.message : String(err);
        return;
      }
      if (!returnToParentIsolation(content)) closeTemplateEditor();
      return;
    }
    if (state.templateMode === "page-template") {
      const name = pageTemplateName;
      if (!name) return;
      const previous = getTemplate(name);
      const content = editor.serialize();
      try {
        publishTemplate(name, content);
        await shellOptions?.document?.template?.onSave?.(name, content, editor);
      } catch (err) {
        if (previous) publishTemplate(name, previous.content);
        state.templateError = err instanceof Error ? err.message : String(err);
        return;
      }
      closeTemplateEditor();
      return;
    }
    if (!templateName || !getPattern(templateName)) return;
    const name = templateName;
    // publishPattern is the whole story: bump from the structural diff
    // (no-op saves keep the version), hard validation with the old
    // definition restored on failure, superseded content archived per
    // version (the future Symbol "Update from Source" base).
    try {
      const { kind } = publishPattern(name, editor.serialize(), {
        defaultColorContext: state.patternDefaultColorContext,
        disabledColorContexts: state.patternDisabledColorContexts,
      });
      if (kind === "none") {
        closeTemplateEditor();
        return;
      }
    } catch (err) {
      // the mode stays on with the error in the topbar scope group
      state.templateError = err instanceof Error ? err.message : String(err);
      return;
    }
    const published = getPattern(name);
    if (published) {
      const pattern = {
        name,
        label: published.label,
        content: published.content,
        version: published.version,
        ...(published.category ? { category: published.category } : {}),
        ...(published.description ? { description: published.description } : {}),
        ...(published.icon ? { icon: published.icon } : {}),
        ...(published.defaultColorContext
          ? { defaultColorContext: published.defaultColorContext }
          : {}),
        ...(published.disabledColorContexts?.length
          ? { disabledColorContexts: [...published.disabledColorContexts] }
          : {}),
      };
      const patterns = [...(activeTheme().patterns ?? [])];
      const at = patterns.findIndex((candidate) => candidate.name === name);
      if (at >= 0) patterns[at] = pattern;
      else patterns.push(pattern);
      applyThemeDocument({ ...activeTheme(), patterns });
    }
    // stale previews: drop the cache entry and refill this pattern's cards
    previewCache.delete(name);
    resetPatternPreviews(name);
    state.libraryEpoch++;
    closeTemplateEditor();
  }

  function cancelTemplate() {
    if (state.templateMode !== "primitive") {
      closeTemplateEditor();
      return;
    }
    const type = primitiveType;
    const def = type ? getBlockType(type) : undefined;
    if (!type || !def) return;
    const draft = primitiveDrafts.get(type);
    editor.loadHtml(draft ?? "");
    let root: Block | undefined = editor.getModel().blocks[0];
    if (!draft) {
      root = editor.insertBlock(type) ?? undefined;
      if (root) seedPrimitiveContent(editor, root);
    }
    if (root) editor.selectBlock(root.id, { toggle: true });
    state.sidebarTab = "block";
    syncBlockPanel();
    state.designPrimitiveStatus = "Live draft";
    state.designPrimitiveToast = "Changes reverted";
    if (primitiveToastTimer) clearTimeout(primitiveToastTimer);
    primitiveToastTimer = setTimeout(() => {
      state.designPrimitiveToast = "";
      primitiveToastTimer = null;
    }, 1800);
  }

  function openDocumentRename() {
    state.documentRenameDraft = state.documentTitle;
    state.documentRenameError = "";
    state.documentRenameOpen = true;
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>("#document-rename-input");
      input?.focus();
      input?.select();
    });
  }

  function closeDocumentRename() {
    if (state.documentRenameBusy) return;
    state.documentRenameOpen = false;
    state.documentRenameError = "";
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>('[aria-label="Document actions"]')?.focus(),
    );
  }

  return {
    state,
    actions: {
      /** Chrome convention: swallow mousedown so buttons never blur the carrier. */
      swallow() {},

      // --- top bar ---------------------------------------------------------
      // Preview = a SELF-CONTAINED published page: the data-pipeline HTML (the
      // published shape) + all the CSS to render it. That CSS is the engine's
      // compile of the content's own class universe (with preflight prepended,
      // so the standalone page has the same reset production ships) plus the
      // theme :root (so var(--token) references resolve — utilities and the
      // inline backend alike). No engine → the theme :root + inline styles
      // still render the inline backend; the classes backend needs the engine.
      preview() {
        // Host seam first: a provided preview() owns the whole flow (the CMS
        // renders through its real pipeline instead of this quick export).
        if (typeof shellOptions?.preview === "function") {
          shellOptions.preview(editor);
          return;
        }
        const html = renderDocumentHtml(editor.serialize({ pipeline: "data" }));
        // Open synchronously (a click-driven window.open survives; an async one
        // is popup-blocked), then stream the compiled doc in.
        const win = window.open("", "_blank");
        void (async () => {
          const cssParts = [baseCss, themeBaseCss(), siteCss, responsiveContainerCss()];
          try {
            if (cssEngine)
              // The ACTIVE engine (wasm in the browser, or the dev bridge under
              // `vp dev`) — NOT a hardcoded /__jit, which 404s on a static
              // deploy and left the preview unstyled. Preflight is prepended
              // here (the engine emits only utilities + used tokens) so the
              // standalone page ships the same reset production does.
              cssParts.push((await cssEngine.compile(collectClasses(html))).css);
          } catch (e) {
            console.warn("[preview] engine compile failed:", e);
          }
          // The full theme :root — the compile tree-shakes to used tokens, this
          // guarantees every var() (incl. inline-backend declarations) resolves.
          cssParts.push(inlineBackend.css?.() ?? "");
          const css = composeContentCss(cssParts);
          const templateWidth = shellOptions?.templateWidth ?? "full";
          const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview</title><style>${css}</style></head><body><main id="canvas" data-pbe-template-width="${templateWidth}">${html}</main></body></html>`;
          if (win) win.document.write(doc);
          else window.open(URL.createObjectURL(new Blob([doc], { type: "text/html" })), "_blank");
        })();
      },
      toggleOutput: () => (state.outputShown = !state.outputShown),
      copyEditing: () => void navigator.clipboard.writeText(editor.serialize()),
      copyData: () => void navigator.clipboard.writeText(editor.serialize({ pipeline: "data" })),

      // --- sidebar -----------------------------------------------------------
      runDocumentAction(d: Dataset, ctx: { event: MouseEvent }) {
        const actions = shellOptions?.document?.actions;
        if (d.action === "rename" && actions?.rename) {
          openDocumentRename();
          return;
        }
        const action =
          d.action === "view"
            ? actions?.view
            : d.action === "set-homepage"
              ? actions?.setAsHomepage
              : d.action === "trash"
                ? actions?.trash
                : undefined;
        if (!action) return;
        void Promise.resolve(action(editor, ctx.event)).catch((err) => {
          console.error(`[publr-editor] document action "${d.action}" failed:`, err);
          state.documentFeaturedError = "The document action couldn't be completed.";
        });
      },
      closeDocumentRename,
      async confirmDocumentRename(_d: Dataset, ctx: { event: SubmitEvent }) {
        ctx.event.preventDefault();
        const title = state.documentRenameDraft.trim();
        const rename = shellOptions?.document?.actions?.rename;
        if (!title) {
          state.documentRenameError = "Enter a title.";
          return;
        }
        if (!rename) return;
        state.documentRenameBusy = true;
        state.documentRenameError = "";
        try {
          await rename(title, editor);
          state.documentTitle = title;
          if (!state.templateMode) mountDocumentFrame();
          state.documentRenameOpen = false;
          requestAnimationFrame(() =>
            document.querySelector<HTMLButtonElement>('[aria-label="Document actions"]')?.focus(),
          );
        } catch (err) {
          console.error("[publr-editor] document rename failed:", err);
          state.documentRenameError = "Couldn't rename the document.";
        } finally {
          state.documentRenameBusy = false;
        }
      },
      hideDocumentFeaturedUrl() {
        state.documentFeaturedUrlOpen = false;
      },
      toggleDocumentFeaturedUrl(_d: Dataset, ctx: { event: Event }) {
        // Keep the surrounding dropdown open while revealing its small URL
        // form; the dropdown's delegated itemClick otherwise dismisses it.
        ctx.event.stopPropagation();
        state.documentFeaturedUrlOpen = !state.documentFeaturedUrlOpen;
        if (state.documentFeaturedUrlOpen)
          requestAnimationFrame(() =>
            document.querySelector<HTMLInputElement>("#document-featured-url")?.focus(),
          );
      },
      chooseDocumentFeaturedUpload() {
        document.querySelector<HTMLInputElement>("#document-featured-upload")?.click();
      },
      async uploadDocumentFeatured(_d: Dataset, ctx: { event: Event }) {
        const input = ctx.event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file || !mediaAdapter.upload) return;
        const current = documentImageValue();
        state.documentFeaturedError = "";
        state.documentFeaturedBusy = true;
        state.documentFeaturedBusyLabel = "Uploading…";
        try {
          const value = await mediaAdapter.upload(file);
          await commitDocumentImage(
            await toDocumentMediaValue(value, { file, prevAlt: current.alt }),
          );
        } catch (err) {
          console.error("[publr-editor] featured image upload failed:", err);
          state.documentFeaturedError = "Upload failed.";
        } finally {
          state.documentFeaturedBusy = false;
          state.documentFeaturedBusyLabel = "";
        }
      },
      async browseDocumentFeatured() {
        if (!mediaAdapter.browse) return;
        const current = documentImageValue();
        state.documentFeaturedError = "";
        state.documentFeaturedBusy = true;
        state.documentFeaturedBusyLabel = "Media library open…";
        try {
          const picked = await mediaAdapter.browse(current.src ? { ...current } : undefined);
          if (picked)
            await commitDocumentImage(await toDocumentMediaValue(picked, { prevAlt: current.alt }));
        } catch (err) {
          console.error("[publr-editor] featured image browse failed:", err);
          state.documentFeaturedError = "Couldn't get media from the library.";
        } finally {
          state.documentFeaturedBusy = false;
          state.documentFeaturedBusyLabel = "";
        }
      },
      applyDocumentFeaturedUrl(_d: Dataset, ctx: { event: SubmitEvent }) {
        ctx.event.preventDefault();
        const form = ctx.event.currentTarget as HTMLFormElement;
        const input = form.elements.namedItem("featured-image-url") as HTMLInputElement | null;
        if (!input) return;
        const current = documentImageValue();
        void commitDocumentImage({
          src: input.value.trim(),
          alt: current.alt,
          width: "",
          height: "",
        });
        closeDocumentFeaturedMenu();
      },
      resetDocumentFeatured() {
        const current = documentImageValue();
        void commitDocumentImage({
          src: "",
          alt: current.alt,
          width: "",
          height: "",
        });
      },
      toggleSidebar: () => setSidebarOpen(!state.sidebarOpen),
      openDesignWorkspace() {
        if (shellOptions?.openSiteDesign) {
          shellOptions.openSiteDesign(editor);
          return;
        }
        state.designModeActive = true;
        state.designWorkspaceOpen = true;
        state.designWorkspacePage = "foundations";
        state.designWorkspaceHome = true;
        state.designWorkspaceSidebarShown = false;
        setInserterOpen(false);
        setTreeOpen(false);
        syncDesignPanel();
        requestAnimationFrame(fillPatternPreviews);
      },
      async publishSiteDesign() {
        if (state.siteDesignSaving) return;
        state.siteDesignSaving = true;
        state.siteDesignPublishLabel = "Publishing…";
        try {
          await shellOptions?.saveSiteDesign?.(structuredClone(activeTheme()), editor);
          siteDesignSavedJson = JSON.stringify(activeTheme());
          state.siteDesignStatus = shellOptions?.saveSiteDesign ? "Saved to site" : "Saved locally";
          state.siteDesignPublishLabel = "Published";
          window.setTimeout(() => {
            state.siteDesignPublishLabel = "Publish theme";
          }, 1800);
        } catch (error) {
          state.siteDesignStatus = error instanceof Error ? error.message : "Publish failed";
          state.siteDesignPublishLabel = "Try again";
        } finally {
          state.siteDesignSaving = false;
        }
      },
      async resetSiteDesign() {
        if (state.siteDesignSaving || !shellOptions?.resetSiteDesign) return;
        state.siteDesignSaving = true;
        state.siteDesignStatus = "Resetting…";
        try {
          await shellOptions.resetSiteDesign(editor);
          siteDesignSavedJson = JSON.stringify(activeTheme());
          state.siteDesignStatus = "Theme files restored";
        } catch (error) {
          state.siteDesignStatus = error instanceof Error ? error.message : "Reset failed";
        } finally {
          state.siteDesignSaving = false;
        }
      },
      setSidebarTab(d: Dataset) {
        if (d.tab === "design") {
          state.designModeActive = true;
          state.designWorkspaceOpen = true;
          state.designWorkspacePage = "foundations";
          state.designWorkspaceHome = true;
          syncDesignPanel();
          return;
        }
        if (d.tab) state.sidebarTab = d.tab;
      },
      closeDesignWorkspace() {
        if (shellOptions?.closeSiteDesign) {
          shellOptions.closeSiteDesign(editor);
          return;
        }
        if (state.templateMode === "primitive") closeTemplateEditor();
        state.designModeActive = false;
        state.designWorkspaceOpen = false;
        state.sidebarTab = editor.selection.blocks.length ? "block" : "document";
      },
      setDesignWorkspacePage(d: Dataset) {
        if (!d.page) return;
        if (state.templateMode === "primitive" && d.page !== "components") {
          if (primitiveType) primitiveDrafts.set(primitiveType, editor.serialize());
          closeTemplateEditor();
        }
        state.designWorkspacePage = d.page;
        state.designTokenTransferShown = false;
        state.designTokenLibraryShown = d.page === "advanced";
        state.designWorkspaceHome = false;
        state.designWorkspaceSidebarShown = false;
        if (d.page === "components" && !state.templateMode) {
          returnToDesignWorkspace = "components";
          openPrimitiveDefaultEditor(state.designPrimitiveType);
        }
        if (d.page === "patterns") requestAnimationFrame(fillPatternPreviews);
      },
      openDesignWorkspaceHome() {
        if (state.templateMode === "primitive") {
          if (primitiveType) primitiveDrafts.set(primitiveType, editor.serialize());
          closeTemplateEditor();
        }
        state.designWorkspaceHome = true;
        state.designTokenTransferShown = false;
        state.designTokenLibraryShown = false;
        state.designWorkspaceSidebarShown = false;
      },
      openDesignTransfer() {
        state.designWorkspacePage = "advanced";
        state.designWorkspaceHome = false;
        state.designWorkspaceSidebarShown = false;
        state.designTokenTransferShown = true;
        state.designTokenLibraryShown = false;
        state.designImportError = "";
        state.designImportStatus = "";
      },
      designSelectPatternCategory(d: Dataset) {
        if (!d.designPatternCategory) return;
        state.designPatternCategory = d.designPatternCategory;
        syncDesignPatternLibrary();
        requestAnimationFrame(fillPatternPreviews);
      },
      designEditPrimitive(d: Dataset) {
        if (!d.blockType || !getBlockType(d.blockType)) return;
        if (state.templateMode === "primitive") {
          switchPrimitiveDefaultEditor(d.blockType);
          return;
        } else if (state.templateMode) return;
        state.designPrimitiveType = d.blockType;
        syncDesignPrimitives();
        returnToDesignWorkspace = "components";
        openPrimitiveDefaultEditor(d.blockType);
      },
      designEditPattern(d: Dataset) {
        if (!d.pattern || !getPattern(d.pattern)) return;
        state.designWorkspaceOpen = false;
        returnToDesignWorkspace = "patterns";
        openTemplateEditor(d.pattern);
      },
      designToggleAssetManager() {
        state.designAssetManagerOpen = !state.designAssetManagerOpen;
      },
      designToggleGlyph(d: Dataset) {
        if (!d.icon) return;
        state.designAssetCatalog = state.designAssetCatalog.map((item) =>
          item.id === d.icon ? { ...item, active: !item.active } : item,
        );
        syncDesignAssets();
      },
      designAddGlyph(d: Dataset, ctx: { event: Event }) {
        const wrap = (ctx.event.target as Element).closest("[data-design-icon-add]");
        const [glyphInput, labelInput] = wrap
          ? [...wrap.querySelectorAll<HTMLInputElement>("input")]
          : [];
        const glyph = glyphInput?.value.trim();
        const label = labelInput?.value.trim();
        if (!glyph || !label) return;
        const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
        state.designAssetCatalog = [
          ...state.designAssetCatalog,
          { id, glyph, label, active: true },
        ];
        if (glyphInput) glyphInput.value = "";
        if (labelInput) labelInput.value = "";
        syncDesignAssets();
      },
      designToggleFontForm() {
        state.designFontFormOpen = !state.designFontFormOpen;
      },
      designAddFont(d: Dataset, ctx: { event: Event }) {
        const wrap = (ctx.event.target as Element).closest("[data-design-font-add]");
        const [labelInput, stackInput] = wrap
          ? [...wrap.querySelectorAll<HTMLInputElement>("input")]
          : [];
        const label = labelInput?.value.trim();
        const value = stackInput?.value.trim();
        if (!label || !value) return;
        const slug = label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        if (!slug) return;
        const name = `font-${slug}`;
        applyTheme([
          ...activeTheme().tokens.filter((token) => token.name !== name),
          { name, value },
        ]);
        state.designFontFormOpen = false;
        if (labelInput) labelInput.value = "";
        if (stackInput) stackInput.value = "";
      },
      designSelectContext(d: Dataset) {
        if (!d.context) return;
        if (!colorContexts(activeTheme()).some((context) => context.key === d.context)) return;
        state.designPreviewContext = d.context;
        state.designSemanticOpen = "";
        syncDesignPanel();
      },
      designToggleContextForm() {
        state.designContextFormOpen = !state.designContextFormOpen;
        state.designColorDefinitionError = "";
      },
      designToggleRoleForm() {
        state.designRoleFormOpen = !state.designRoleFormOpen;
        state.designColorDefinitionError = "";
      },
      designAddContext(d: Dataset, ctx: { event: Event }) {
        const wrap = (ctx.event.target as Element).closest("[data-context-add]");
        const [labelInput, keyInput] = wrap
          ? [...wrap.querySelectorAll<HTMLInputElement>("input")]
          : [];
        const label = labelInput?.value.trim() ?? "";
        const key = (keyInput?.value.trim() || label)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const theme = activeTheme();
        const contexts = colorContexts(theme);
        if (!label || !key) {
          state.designColorDefinitionError = "Give the context a name.";
          return;
        }
        if (key === "default" || contexts.some((context) => context.key === key)) {
          state.designColorDefinitionError = `A “${key}” context already exists.`;
          return;
        }
        const sourcePrefix =
          state.designPreviewContext === "default" ? "" : `${state.designPreviewContext}-`;
        const additions = semanticColorRoles(theme).map((role) => ({
          name: `color-${key}-${role.key}`,
          value:
            tokenValue(theme, `color-${sourcePrefix}${role.key}`) ??
            tokenValue(theme, `color-${role.key}`) ??
            role.value,
        }));
        applyThemeDocument({
          ...theme,
          tokens: [...theme.tokens, ...additions],
          colorContexts: [...contexts, { key, label }],
        });
        state.designPreviewContext = key;
        state.designContextFormOpen = false;
        state.designColorDefinitionError = "";
        if (labelInput) labelInput.value = "";
        if (keyInput) keyInput.value = "";
        syncDesignPanel();
      },
      designRenameContext(d: Dataset, ctx: { event: Event }) {
        if (!d.context) return;
        const label = (ctx.event.target as HTMLInputElement).value.trim();
        if (!label) {
          syncDesignPanel();
          return;
        }
        const theme = activeTheme();
        applyThemeDocument({
          ...theme,
          colorContexts: colorContexts(theme).map((context) =>
            context.key === d.context ? { ...context, label } : context,
          ),
        });
      },
      designRemoveContext(d: Dataset) {
        if (!d.context || d.context === "default") return;
        const theme = activeTheme();
        const contexts = colorContexts(theme);
        if (!contexts.some((context) => context.key === d.context)) return;
        const ownedNames = new Set(
          semanticColorRoles(theme).map((role) => `color-${d.context}-${role.key}`),
        );
        state.designPreviewContext = "default";
        state.designSemanticOpen = "";
        applyThemeDocument({
          ...theme,
          tokens: theme.tokens.filter((token) => !ownedNames.has(token.name)),
          colorContexts: contexts.filter((context) => context.key !== d.context),
        });
      },
      designAddRole(d: Dataset, ctx: { event: Event }) {
        const wrap = (ctx.event.target as Element).closest("[data-role-add]");
        const [labelInput, keyInput] = wrap
          ? [...wrap.querySelectorAll<HTMLInputElement>("input")]
          : [];
        const label = labelInput?.value.trim() ?? "";
        const key = (keyInput?.value.trim() || label)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const theme = activeTheme();
        const roles = semanticColorRoles(theme);
        if (!label || !key) {
          state.designColorDefinitionError = "Give the semantic role a name.";
          return;
        }
        if (roles.some((role) => role.key === key)) {
          state.designColorDefinitionError = `A “${key}” role already exists.`;
          return;
        }
        const firstPalette = paletteTokens(theme)[0]?.name ?? "";
        const value = firstPalette ? `var(--${firstPalette})` : "#000000";
        const role: SemanticColorRoleDefinition = {
          key,
          label,
          description: "Custom semantic color",
          value,
        };
        const additions = colorContexts(theme).map((context) => ({
          name: `color-${context.key === "default" ? "" : `${context.key}-`}${key}`,
          value,
        }));
        applyThemeDocument({
          ...theme,
          tokens: [...theme.tokens, ...additions],
          semanticColorRoles: [...roles, role],
        });
        state.designRoleFormOpen = false;
        state.designColorDefinitionError = "";
        if (labelInput) labelInput.value = "";
        if (keyInput) keyInput.value = "";
      },
      designUpdateRole(d: Dataset, ctx: { event: Event }) {
        if (!d.role || (d.field !== "label" && d.field !== "description")) return;
        const value = (ctx.event.target as HTMLInputElement).value.trim();
        if (!value) {
          syncDesignPanel();
          return;
        }
        const theme = activeTheme();
        applyThemeDocument({
          ...theme,
          semanticColorRoles: semanticColorRoles(theme).map((role) =>
            role.key === d.role ? { ...role, [d.field!]: value } : role,
          ),
        });
      },
      designRemoveRole(d: Dataset) {
        if (!d.role) return;
        const theme = activeTheme();
        const roles = semanticColorRoles(theme);
        if (roles.length <= 1 || !roles.some((role) => role.key === d.role)) {
          state.designColorDefinitionError = "Keep at least one semantic role.";
          return;
        }
        const ownedNames = new Set(
          colorContexts(theme).map(
            (context) => `color-${context.key === "default" ? "" : `${context.key}-`}${d.role}`,
          ),
        );
        state.designSemanticOpen = "";
        applyThemeDocument({
          ...theme,
          tokens: theme.tokens.filter((token) => !ownedNames.has(token.name)),
          semanticColorRoles: roles.filter((role) => role.key !== d.role),
        });
      },
      designToggleSemantic(d: Dataset) {
        if (!d.name) return;
        state.designSemanticOpen = state.designSemanticOpen === d.name ? "" : d.name;
        syncDesignPanel();
      },
      designUpdateSemantic(d: Dataset, ctx: { event: Event }) {
        const value = (ctx.event.target as HTMLInputElement).value.trim();
        if (!d.name || !value) return;
        applyTheme([
          ...activeTheme().tokens.filter((token) => token.name !== d.name),
          { name: d.name, value },
        ]);
        state.designAiStatus = "";
      },
      designSetSemanticToken(d: Dataset) {
        if (!d.name || !d.value) return;
        applyTheme([
          ...activeTheme().tokens.filter((token) => token.name !== d.name),
          { name: d.name, value: d.value },
        ]);
        state.designAiStatus = "";
      },
      designApplyAiConcept() {
        const concept: ThemeToken[] = [
          { name: "color-surface", value: "#f7f4ee" },
          { name: "color-foreground", value: "#18231f" },
          { name: "color-border", value: "#d6d0c5" },
          { name: "color-accent-surface", value: "#d45b3f" },
          { name: "color-accent-foreground", value: "#fffaf3" },
          { name: "color-accent-border", value: "#b84831" },
          { name: "color-muted-surface", value: "#e9e4da" },
          { name: "color-muted-foreground", value: "#38433e" },
          { name: "color-muted-border", value: "#d6d0c5" },
        ];
        const names = new Set(concept.map((token) => token.name));
        applyTheme([...activeTheme().tokens.filter((token) => !names.has(token.name)), ...concept]);
        state.designPreviewContext = "default";
        state.designAiStatus = "Applied “Warm editorial” direction";
        syncDesignPreview();
      },
      setBlockInspectorTab(d: Dataset) {
        if (d.itab === "settings") state.blockInspectorTab = "settings";
        if (d.itab === "styles" && state.blockHasStyles) state.blockInspectorTab = "styles";
      },
      toggleCanvasViewportFit() {
        if (state.canvasResponsiveCompare) return;
        state.canvasViewportFit = !state.canvasViewportFit;
        if (state.canvasViewportFit && state.canvasViewportMode === "full") {
          const breakpoint = defaultViewportBreakpoint();
          state.canvasViewportMode = breakpoint;
          state.styleBreakpoint = breakpoint;
          syncCanvasViewport();
          syncBlockPanel();
          return;
        }
        syncCanvasViewportFit();
      },
      toggleResponsiveComparison() {
        if (!state.styleResponsiveAvailable) return;
        state.canvasResponsiveCompare = !state.canvasResponsiveCompare;
        state.canvasViewportFit = false;
        if (state.canvasResponsiveCompare && state.canvasViewportMode === "full") {
          state.canvasViewportMode = activeStyleBreakpoint();
          state.styleBreakpoint = state.canvasViewportMode;
        }
        syncCanvasViewport();
        syncBlockPanel();
        if (state.canvasResponsiveCompare) requestAnimationFrame(syncResponsiveComparison);
        else clearResponsiveComparison();
      },
      setViewportDevice(d: Dataset) {
        if (!state.styleResponsiveAvailable) return;
        const device = viewportDevices().find((option) => option.key === d.device);
        if (!device || device.disabled) return;
        const menuDevice = state.styleViewportDevices.find((option) => option.key === device.key);
        state.styleViewportMenuLabel = `${device.label} breakpoints`;
        state.styleViewportMenuEndpoints = menuDevice ? [...menuDevice.endpoints] : [];
        if (
          state.canvasViewportMode !== "full" &&
          viewportDeviceForMode(state.canvasViewportMode) === device.key
        ) {
          if (device.breakpoints.length > 1) return;
          if (state.canvasResponsiveCompare) return;
          state.canvasViewportFit = false;
          state.canvasViewportMode = "full";
          state.styleBreakpoint = "base";
          syncCanvasViewport();
          syncBlockPanel();
          return;
        }
        const selected = viewportDeviceSelections[device.key];
        const breakpoint = device.breakpoints.includes(selected ?? "")
          ? selected!
          : device.defaultMode;
        state.canvasViewportMode = breakpoint;
        state.styleBreakpoint = breakpoint;
        syncCanvasViewport();
        syncBlockPanel();
        if (state.canvasResponsiveCompare) requestAnimationFrame(syncResponsiveComparison);
      },
      setStyleBreakpoint(d: Dataset) {
        if (!state.styleResponsiveAvailable) return;
        const breakpoint = styleBreakpoints().find((option) => option.key === d.breakpoint);
        if (!breakpoint) return;
        if (state.canvasViewportMode === breakpoint.key) {
          if (state.canvasResponsiveCompare) return;
          state.canvasViewportFit = false;
          state.canvasViewportMode = "full";
          state.styleBreakpoint = "base";
          syncCanvasViewport();
          syncBlockPanel();
          return;
        }
        state.canvasViewportMode = breakpoint.key;
        state.canvasViewportFull = false;
        state.styleBreakpoint = breakpoint.key;
        viewportDeviceSelections[breakpointDevice(breakpoint.key)] = breakpoint.key;
        syncCanvasViewport();
        syncBlockPanel();
        if (state.canvasResponsiveCompare) requestAnimationFrame(syncResponsiveComparison);
      },
      jumpToStyleBreakpoint(d: Dataset, ctx?: { event: Event }) {
        if (Date.now() < responsiveBoundaryClickSuppressedUntil) {
          ctx?.event.preventDefault();
          return;
        }
        if (!state.styleResponsiveAvailable) return;
        const breakpoint = styleBreakpoints().find((option) => option.key === d.breakpoint);
        if (!breakpoint || state.styleBreakpoint === breakpoint.key) return;
        state.canvasViewportMode = breakpoint.key;
        state.canvasViewportFull = false;
        state.styleBreakpoint = breakpoint.key;
        viewportDeviceSelections[breakpointDevice(breakpoint.key)] = breakpoint.key;
        syncCanvasViewport();
        syncBlockPanel();
        if (state.canvasResponsiveCompare) requestAnimationFrame(syncResponsiveComparison);
      },
      resetResponsiveValueRange(d: Dataset, ctx?: { event: Event }) {
        if (Date.now() < responsiveBoundaryClickSuppressedUntil) {
          ctx?.event.preventDefault();
          return;
        }
        const id = panelTarget();
        const breakpoint = styleBreakpoints().find((option) => option.key === d.breakpoint)?.key;
        const props = responsiveMutationProps(d.props);
        if (!id || !breakpoint || !props.length) return;
        resetResponsiveBoundary(id, props, breakpoint);
      },
      moveResponsiveBoundary(d: Dataset, ctx: { event: Event }) {
        const event = ctx.event as KeyboardEvent;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        const id = panelTarget();
        const breakpoints = styleBreakpoints();
        const sourceIndex = Number(d.index);
        const minIndex = Number(d.minIndex);
        const maxIndex = Number(d.maxIndex);
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const targetIndex = Math.max(minIndex, Math.min(maxIndex, sourceIndex + direction));
        const source = breakpoints[sourceIndex]?.key;
        const target = breakpoints[targetIndex]?.key;
        const props = responsiveMutationProps(d.props);
        if (!id || !source || !target || target === source || !props.length) return;
        event.preventDefault();
        moveResponsiveBoundary(id, props, source, target);
      },
      startResponsiveBoundaryDrag(d: Dataset, ctx: { event: Event }) {
        const event = ctx.event as PointerEvent;
        const button = event.currentTarget;
        const id = panelTarget();
        const breakpoints = styleBreakpoints();
        const sourceIndex = Number(d.index);
        const minIndex = Number(d.minIndex);
        const maxIndex = Number(d.maxIndex);
        const source = breakpoints[sourceIndex]?.key;
        const props = responsiveMutationProps(d.props);
        if (
          !id ||
          !source ||
          !props.length ||
          !Number.isFinite(sourceIndex) ||
          !Number.isFinite(minIndex) ||
          !Number.isFinite(maxIndex) ||
          minIndex >= maxIndex ||
          !(button instanceof HTMLElement)
        )
          return;
        cancelResponsiveBoundaryDrag?.();
        const doc = button.ownerDocument;
        const field = button.closest<HTMLElement>(".pbe-responsive-field");
        const points =
          button.closest<HTMLElement>(".pbe-responsive-field__points") ??
          field?.querySelector<HTMLElement>(".pbe-responsive-field__points");
        const track = field?.querySelector<HTMLElement>(".pbe-responsive-field__track");
        const pointButtons = [
          ...(points?.querySelectorAll<HTMLButtonElement>(".pbe-responsive-field__point") ?? []),
        ];
        const rangeButtons = [...(track?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const rangeBoundary = rangeButtons.find(
          (candidate) => candidate.dataset.breakpoint === source,
        );
        const rangeIndex = rangeBoundary ? rangeButtons.indexOf(rangeBoundary) : -1;
        const previousRange = rangeIndex > 0 ? rangeButtons[rangeIndex - 1] : undefined;
        if (!field || !points || !rangeBoundary || !previousRange) return;
        const pointsRect = points?.getBoundingClientRect();
        const startX = event.clientX;
        const stepWidth =
          pointsRect && pointsRect.width > 0 ? pointsRect.width / breakpoints.length : 32;
        const originalPreviousGrow =
          Number(previousRange.style.flexGrow) ||
          Number(doc.defaultView?.getComputedStyle(previousRange).flexGrow) ||
          1;
        const originalBoundaryGrow =
          Number(rangeBoundary.style.flexGrow) ||
          Number(doc.defaultView?.getComputedStyle(rangeBoundary).flexGrow) ||
          1;
        const originalPoints = pointButtons.map((point) => ({
          point,
          changed: point.hasAttribute("data-changed"),
          color: point.style.getPropertyValue("--pbe-responsive-color"),
        }));
        const sourcePoint = pointButtons.find(
          (point) => Number(point.dataset.index) === sourceIndex,
        );
        const sourceColor = sourcePoint?.style.getPropertyValue("--pbe-responsive-color") ?? "";
        let targetIndex = sourceIndex;
        let moved = false;
        const positionForClientX = (clientX: number): number =>
          Math.max(minIndex, Math.min(maxIndex, sourceIndex + (clientX - startX) / stepWidth));
        const applyPreview = (position: number): void => {
          const nearestIndex = Math.max(minIndex, Math.min(maxIndex, Math.round(position)));
          const snapDistance = Math.min(6 / stepWidth, 0.1);
          const snapped = Math.abs(position - nearestIndex) <= snapDistance;
          const previewPosition = snapped ? nearestIndex : position;
          targetIndex = nearestIndex;
          const delta = previewPosition - sourceIndex;
          previousRange.style.flexGrow = String(originalPreviousGrow + delta);
          rangeBoundary.style.flexGrow = String(originalBoundaryGrow - delta);
          for (const original of originalPoints) {
            if (original.changed) original.point.dataset.changed = "true";
            else original.point.removeAttribute("data-changed");
            original.point.removeAttribute("data-drop-target");
            original.point.style.setProperty("--pbe-responsive-color", original.color);
          }
          if (snapped && targetIndex !== sourceIndex) sourcePoint?.removeAttribute("data-changed");
          const targetPoint = snapped
            ? pointButtons.find((point) => Number(point.dataset.index) === targetIndex)
            : undefined;
          if (targetPoint && targetIndex !== sourceIndex) {
            targetPoint.dataset.changed = "true";
            targetPoint.dataset.dropTarget = "true";
            if (sourceColor) targetPoint.style.setProperty("--pbe-responsive-color", sourceColor);
          }
          field.dataset.responsiveDragging = "true";
          rangeBoundary.dataset.dragging = "true";
          const previewLabel =
            snapped && targetIndex !== sourceIndex
              ? (targetPoint?.textContent?.trim() ?? breakpoints[targetIndex]?.viewport ?? "")
              : "";
          if (previewLabel) rangeBoundary.dataset.previewLabel = previewLabel;
          else rangeBoundary.removeAttribute("data-preview-label");
        };
        const restorePreview = (): void => {
          previousRange.style.flexGrow = String(originalPreviousGrow);
          rangeBoundary.style.flexGrow = String(originalBoundaryGrow);
          for (const original of originalPoints) {
            if (original.changed) original.point.dataset.changed = "true";
            else original.point.removeAttribute("data-changed");
            original.point.removeAttribute("data-drop-target");
            original.point.style.setProperty("--pbe-responsive-color", original.color);
          }
          field.removeAttribute("data-responsive-dragging");
          rangeBoundary.removeAttribute("data-dragging");
          rangeBoundary.removeAttribute("data-preview-label");
        };
        const clear = (): void => {
          doc.removeEventListener("pointermove", onMove);
          doc.removeEventListener("pointerup", onUp);
          doc.removeEventListener("pointercancel", onCancel);
          button.removeAttribute("data-dragging");
          restorePreview();
          cancelResponsiveBoundaryDrag = null;
        };
        const onMove = (moveEvent: PointerEvent): void => {
          moved ||= Math.abs(moveEvent.clientX - startX) > 3;
          applyPreview(positionForClientX(moveEvent.clientX));
        };
        const onUp = (upEvent: PointerEvent): void => {
          const position = positionForClientX(upEvent.clientX);
          targetIndex = Math.max(minIndex, Math.min(maxIndex, Math.round(position)));
          applyPreview(targetIndex);
          const target = breakpoints[targetIndex]?.key;
          if (moved) responsiveBoundaryClickSuppressedUntil = Date.now() + 400;
          clear();
          if (moved && target && target !== source)
            moveResponsiveBoundary(id, props, source, target);
        };
        const onCancel = (): void => clear();
        cancelResponsiveBoundaryDrag = clear;
        applyPreview(sourceIndex);
        doc.addEventListener("pointermove", onMove);
        doc.addEventListener("pointerup", onUp);
        doc.addEventListener("pointercancel", onCancel);
      },
      resetBlockStyles() {
        const id = panelTarget();
        if (id) editor.resetStyles(id);
      },
      toggleStyleOptions() {
        state.styleOptionalOpen = !state.styleOptionalOpen;
      },
      toggleOptionalStyle(d: Dataset) {
        if (!d.prop) return;
        state.styleOptional[d.prop] = !state.styleOptional[d.prop];
        syncBlockPanel();
      },
      resetStylePanel(d: Dataset) {
        const id = panelTarget();
        if (id && d.panel) editor.resetStylePanel(id, d.panel, activeStyleBreakpoint());
      },
      zeroTextSpacing() {
        const id = panelTarget();
        const block = id ? editor.getBlock(id) : null;
        const supports = block ? getBlockType(block.type)?.supports : undefined;
        if (!id || !block || getBlockType(block.type)?.category !== "Text") return;
        const props = [
          "margin",
          "marginTop",
          "marginRight",
          "marginBottom",
          "marginLeft",
          "padding",
          "paddingTop",
          "paddingRight",
          "paddingBottom",
          "paddingLeft",
        ].filter((prop) => blockSupportsStyle(supports, prop));
        writeStyles(id, Object.fromEntries(props.map((prop) => [prop, "0"])));
      },
      // One action for every option BUTTON (toggle-group); the dataset says
      // which primitive to call. Selection survives because chrome swallows
      // mousedown (the convention above).
      applySetting(d: Dataset) {
        if (!d.id || !d.value) return;
        if (d.mode === "transform") editor.transformBlock(d.id, d.value);
        else if (d.mode === "style" && d.style)
          editor.setStyle(d.id, d.style, d.value, activeStyleBreakpoint());
        else if (d.mode === "setting" && d.setting) editor.setSetting(d.id, d.setting, d.value);
        else if (d.field) editor.setField(d.id, d.field, d.value);
      },
      // The boolean flip: the switch's dataset carries the CURRENT value, the
      // click writes its negation.
      toggleSetting(d: Dataset) {
        if (!d.id) return;
        if (d.style)
          editor.setStyle(
            d.id,
            d.style,
            d.pressed === "true" ? "false" : "true",
            activeStyleBreakpoint(),
          );
        else if (d.setting) editor.setSetting(d.id, d.setting, d.pressed !== "true");
      },
      resetSettingSection(d: Dataset) {
        if (d.id && d.role)
          editor.resetSettings(d.id, d.role as ControlRole, activeStyleBreakpoint());
      },
      toggleSettingSection(d: Dataset) {
        if (!d.section) return;
        state.settingSectionOpen[d.section] = state.settingSectionOpen[d.section] === false;
        syncBlockPanel();
      },
      // Font Size (Phase C style control): re-clicking the active size clears it
      // (familiar block-editor semantics). setStyle enforces supports + policy.
      applyFontSize(d: Dataset) {
        const id = panelTarget();
        if (!id || !d.key) return;
        writeStyle(id, "fontSize", readStyle(id, "fontSize") === d.key ? "" : d.key);
      },
      // Style variation (C6): pick a named class-set; "default" (or re-click)
      // clears back to the block's base look.
      applyVariation(d: Dataset) {
        clearVariationPreview();
        const id = panelTarget();
        if (!id || !d.name) return;
        const cur = editor.getStyle(id, "variation");
        editor.setStyle(id, "variation", d.name === "default" || d.name === cur ? "" : d.name);
      },
      previewVariation(d: Dataset, ctx: { event: Event }) {
        clearVariationPreview();
        const id = panelTarget();
        if (!id || !d.name) return;
        const element = canvasEl.querySelector<HTMLElement>(`[data-pb-id="${CSS.escape(id)}"]`);
        const variants = editor.blockVariants(id);
        const trigger = ctx.event.currentTarget;
        if (!element || !variants || !(trigger instanceof HTMLElement)) return;
        const current = editor.getStyle(id, "variation");
        const remove = new Set(variantClasses(variants, current));
        const clone = element.cloneNode(true) as HTMLElement;
        const classes = [...clone.classList].filter(
          (cls) => !remove.has(cls) && cls !== "pbe-selected",
        );
        if (d.name !== "default") classes.push(...variantClasses(variants, d.name));
        clone.className = [...new Set(classes)].join(" ");
        for (const node of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
          node.removeAttribute("data-pb-id");
          node.removeAttribute("contenteditable");
          node.removeAttribute("tabindex");
        }
        const popup = document.createElement("div");
        popup.className = "pbe-variant-preview-popover";
        const title = document.createElement("strong");
        title.className = "pbe-variant-preview-popover__title";
        title.textContent = trigger.getAttribute("aria-label") ?? "Style preview";
        const stage = document.createElement("div");
        stage.className = "pbe-variant-preview-popover__stage";
        stage.appendChild(clone);
        popup.append(title, stage);
        canvasEl.appendChild(popup);
        const rect = trigger.getBoundingClientRect();
        const width = 300;
        const left =
          rect.left >= width + 20
            ? rect.left - width - 12
            : Math.min(window.innerWidth - width - 12, rect.right + 12);
        popup.style.left = `${Math.max(12, left)}px`;
        popup.style.top = `${Math.max(
          12,
          Math.min(rect.top, window.innerHeight - popup.offsetHeight - 12),
        )}px`;
        variationPreview = popup;
      },
      clearVariationPreview() {
        clearVariationPreview();
      },
      // Color (C2): a swatch sets the TOKEN KEY ("red-500"), re-clicking the
      // active swatch (or Clear, which carries no value) clears it.
      applyColor(d: Dataset) {
        const id = panelTarget();
        if (!id || !d.prop) return;
        state.colorPickerOpen = "";
        const value = d.value && d.value !== readStyle(id, d.prop) ? d.value : "";
        writeStyle(id, d.prop, value);
        // A border color is invisible at preflight's 0 width — picking one
        // without a width applies the 1px step.
        if (d.prop === "borderColor" && value && !readStyle(id, "borderWidth"))
          writeStyle(id, "borderWidth", "1");
      },
      toggleColorPicker(d: Dataset, ctx: { event: Event }) {
        if (!d.prop) return;
        const opening = state.colorPickerOpen !== d.prop;
        state.colorPickerOpen = opening ? d.prop : "";
        if (opening && ctx.event.currentTarget instanceof HTMLElement) {
          const rect = ctx.event.currentTarget.getBoundingClientRect();
          const width = 286;
          const left =
            rect.left >= width + 20
              ? rect.left - width - 12
              : Math.min(window.innerWidth - width - 12, rect.right + 12);
          state.colorPopoverLeft = `${Math.max(12, left)}px`;
          state.colorPopoverTop = `${Math.max(12, Math.min(rect.top, window.innerHeight - 300))}px`;
        }
        syncBlockPanel();
      },
      // Big scales render a <select> — value from the control, "" clears.
      applyStyleSelect(d: Dataset, ctx: { event: Event }) {
        const id = panelTarget();
        if (!id || !d.prop) return;
        writeStyle(id, d.prop, (ctx.event.target as HTMLSelectElement).value);
      },

      // --- Design tab (E4): the visual theme editor -------------------------
      // Every edit funnels through applyTheme (install + re-render + refresh).
      designOpenColorFamily(d: Dataset) {
        const family = state.designColorFamilies.find((row) => row.id === d.colorFamily);
        if (!family) return;
        state.designColorFamilyId = family.id;
        state.designColorFamilyNamespace = family.namespace;
        state.designColorFamilyName = family.key;
        state.designColorFamilyOriginalNames = family.shades.map((shade) => shade.name);
        state.designColorFamilyShades = family.shades.map((shade, index) => ({
          index,
          originalName: shade.name,
          key: shade.key === "Base" ? "" : shade.key,
          value: shade.value,
        }));
        state.designColorFamilyError = "";
        syncDesignColorFamilyMain();
        state.designColorFamilyOpen = true;
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>("[data-design-color-family-name]")?.focus(),
        );
      },
      designNewColorFamily() {
        state.designColorFamilyId = "";
        state.designColorFamilyNamespace = "color-palette";
        state.designColorFamilyName = "";
        state.designColorFamilyOriginalNames = [];
        state.designColorFamilyShades = [{ index: 0, originalName: "", key: "", value: "#3858e9" }];
        state.designColorFamilyError = "";
        syncDesignColorFamilyMain();
        state.designColorFamilyOpen = true;
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>("[data-design-color-family-name]")?.focus(),
        );
      },
      designCloseColorFamily: closeDesignColorFamily,
      designUpdateColorShade(d: Dataset, ctx: { event: Event }) {
        const index = Number(d.shadeIndex);
        const field = d.shadeField;
        const value = (ctx.event.target as HTMLInputElement).value.trim();
        if (!Number.isInteger(index) || (field !== "key" && field !== "value")) return;
        state.designColorFamilyShades = state.designColorFamilyShades.map((shade) =>
          shade.index === index ? { ...shade, [field]: value } : shade,
        );
        state.designColorFamilyError = "";
        syncDesignColorFamilyMain();
      },
      designAddColorShade() {
        const numeric = state.designColorFamilyShades
          .map((shade) => Number(shade.key))
          .filter(Number.isFinite);
        const suggested = numeric.length ? String(Math.max(...numeric) + 100) : "100";
        const index =
          Math.max(-1, ...state.designColorFamilyShades.map((shade) => shade.index)) + 1;
        state.designColorFamilyShades = [
          ...state.designColorFamilyShades,
          {
            index,
            originalName: "",
            key: suggested,
            value: state.designColorFamilyMainValue,
          },
        ];
      },
      designGenerateColorScale() {
        const source =
          state.designColorFamilyShades.find((shade) => !shade.key) ??
          state.designColorFamilyShades.find((shade) => shade.key === "500") ??
          state.designColorFamilyShades[Math.floor(state.designColorFamilyShades.length / 2)];
        if (!source) {
          state.designColorFamilyError = "Add a base color before generating a scale.";
          return;
        }
        const generated = generatedColorScale(source.value);
        if (!generated) {
          state.designColorFamilyError =
            "The base color could not be read. Use a hex, RGB, HSL, or OKLCH color value.";
          return;
        }
        const existingByKey = new Map(
          state.designColorFamilyShades.map((shade) => [shade.key, shade]),
        );
        const named = state.designColorFamilyShades.filter(
          (shade) => !shade.key || !/^\d+$/.test(shade.key),
        );
        state.designColorFamilyShades = sortColorShades([
          ...named,
          ...generated.map((shade) => ({
            index: 0,
            originalName: existingByKey.get(shade.key)?.originalName ?? "",
            ...shade,
          })),
        ]).map((shade, index) => ({ ...shade, index }));
        state.designColorFamilyError = "";
        syncDesignColorFamilyMain();
      },
      designRemoveColorShade(d: Dataset) {
        if (state.designColorFamilyShades.length === 1) {
          state.designColorFamilyError = "A color family needs at least one value.";
          return;
        }
        const index = Number(d.shadeIndex);
        state.designColorFamilyShades = state.designColorFamilyShades.filter(
          (shade) => shade.index !== index,
        );
        syncDesignColorFamilyMain();
      },
      designSaveColorFamily() {
        const name = state.designColorFamilyName.trim();
        if (!/^[a-z][a-z0-9-]*$/.test(name)) {
          state.designColorFamilyError =
            "Use a lowercase color name beginning with a letter, such as ocean or ocean-blue.";
          return;
        }
        if (!state.designColorFamilyShades.length) {
          state.designColorFamilyError = "Add at least one color value.";
          return;
        }
        const keys = new Set<string>();
        for (const shade of state.designColorFamilyShades) {
          if (shade.key && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shade.key)) {
            state.designColorFamilyError = `“${shade.key}” is not a valid shade name.`;
            return;
          }
          if (keys.has(shade.key)) {
            state.designColorFamilyError = shade.key
              ? `Shade ${shade.key} is defined more than once.`
              : "The base color is defined more than once.";
            return;
          }
          if (!shade.value) {
            state.designColorFamilyError = "Every shade needs a color value.";
            return;
          }
          keys.add(shade.key);
        }
        const current = activeTheme();
        const originals = new Set(state.designColorFamilyOriginalNames);
        const additions = state.designColorFamilyShades.map((shade) => ({
          name: `${state.designColorFamilyNamespace}-${name}${shade.key ? `-${shade.key}` : ""}`,
          value: shade.value,
        }));
        const outsideNames = new Set(
          current.tokens.filter((token) => !originals.has(token.name)).map((token) => token.name),
        );
        const conflict = additions.find((token) => outsideNames.has(token.name));
        if (conflict) {
          state.designColorFamilyError = `A token named --${conflict.name} already exists.`;
          return;
        }
        const managed = new Set(current.managedColorTokens ?? []);
        for (const original of originals) managed.delete(original);
        if (state.designColorFamilyNamespace === "color") {
          for (const token of additions) managed.add(token.name);
        }
        applyThemeDocument({
          ...current,
          tokens: [...current.tokens.filter((token) => !originals.has(token.name)), ...additions],
          managedColorTokens: [...managed],
        });
        closeDesignColorFamily();
      },
      designDeleteColorFamily() {
        const current = activeTheme();
        const originals = new Set(state.designColorFamilyOriginalNames);
        const managed = (current.managedColorTokens ?? []).filter((name) => !originals.has(name));
        applyThemeDocument({
          ...current,
          tokens: current.tokens.filter((token) => !originals.has(token.name)),
          managedColorTokens: managed,
        });
        closeDesignColorFamily();
      },
      designUpdateToken(d: Dataset, ctx: { event: Event }) {
        const value = (ctx.event.target as HTMLInputElement).value.trim();
        if (!d.name || !value) return;
        applyTheme(
          activeTheme().tokens.map((t) => (t.name === d.name ? { name: t.name, value } : t)),
        );
      },
      designRemoveToken(d: Dataset) {
        if (!d.name) return;
        // A token's `--` modifiers (text-lg--line-height) leave with it.
        applyTheme(
          activeTheme().tokens.filter(
            (t) => t.name !== d.name && !t.name.startsWith(`${d.name}--`),
          ),
        );
      },
      designAddToken(d: Dataset, ctx: { event: Event }) {
        const wrap = (ctx.event.target as Element).closest("[data-add]");
        const [keyInput, valueInput] = wrap
          ? [...wrap.querySelectorAll<HTMLInputElement>("input")]
          : [];
        const key = keyInput?.value.trim();
        const value = valueInput?.value.trim();
        if (!d.ns || !key || !value) return;
        const name = `${d.ns}-${key}`;
        applyTheme([...activeTheme().tokens.filter((t) => t.name !== name), { name, value }]);
        if (keyInput) keyInput.value = "";
        if (valueInput) valueInput.value = "";
      },
      designSetSpacing(d: Dataset, ctx: { event: Event }) {
        const value = (ctx.event.target as HTMLInputElement).value.trim();
        if (!value) return;
        const rest = activeTheme().tokens.filter((t) => t.name !== "spacing");
        applyTheme([{ name: "spacing", value }, ...rest]);
      },
      designUpdateBreakpoint(d: Dataset, ctx: { event: Event }) {
        if (!d.breakpoint || !d.name) return;
        const raw = (ctx.event.target as HTMLInputElement).value.trim();
        const value = /^\d+(?:\.\d+)?$/.test(raw) ? `${raw}px` : raw;
        if (cssLengthPx(value) == null) {
          state.designBreakpointError = "Use a positive CSS length in px, rem, or em.";
          return;
        }
        state.designBreakpointError = "";
        applyTheme([
          ...breakpointMutationTokens().filter((token) => token.name !== d.name),
          { name: d.name, value },
        ]);
      },
      designUpdateBreakpointControl(d: Dataset, ctx: { event: Event }) {
        if (!d.breakpoint || !d.name) return;
        const amount = Number((ctx.event.target as HTMLInputElement).value);
        if (!Number.isFinite(amount) || amount <= 0) return;
        state.designBreakpointError = "";
        applyTheme([
          ...breakpointMutationTokens().filter((token) => token.name !== d.name),
          { name: d.name, value: `${Math.round(amount)}px` },
        ]);
      },
      designDragBreakpoint(d: Dataset, ctx: { event: DragEvent }) {
        if (!d.breakpoint || d.breakpoint === "base") return;
        state.designDraggedBreakpoint = d.breakpoint;
        ctx.event.dataTransfer?.setData("text/plain", d.breakpoint);
        if (ctx.event.dataTransfer) ctx.event.dataTransfer.effectAllowed = "move";
        (ctx.event.currentTarget as Element)
          .closest("[data-breakpoint-row]")
          ?.setAttribute("data-dragging", "true");
      },
      designBreakpointDragOver(_d: Dataset, ctx: { event: DragEvent }) {
        if (!state.designDraggedBreakpoint) return;
        if (ctx.event.dataTransfer) ctx.event.dataTransfer.dropEffect = "move";
        (ctx.event.currentTarget as HTMLElement).setAttribute("data-drag-over", "true");
      },
      designBreakpointDragLeave(_d: Dataset, ctx: { event: DragEvent }) {
        const target = ctx.event.currentTarget as HTMLElement;
        if (ctx.event.relatedTarget instanceof Node && target.contains(ctx.event.relatedTarget))
          return;
        target.removeAttribute("data-drag-over");
      },
      designDropBreakpoint(d: Dataset, ctx: { event: DragEvent }) {
        const key = ctx.event.dataTransfer?.getData("text/plain") || state.designDraggedBreakpoint;
        const device = d.device;
        (ctx.event.currentTarget as HTMLElement).removeAttribute("data-drag-over");
        if (
          !key ||
          key === "base" ||
          (device !== "mobile" && device !== "tablet" && device !== "desktop")
        )
          return;
        state.designDraggedBreakpoint = "";
        const name = breakpointDeviceToken(key);
        applyTheme([
          ...breakpointMutationTokens().filter((token) => token.name !== name),
          { name, value: device },
        ]);
      },
      designEndBreakpointDrag(_d: Dataset, ctx: { event: DragEvent }) {
        state.designDraggedBreakpoint = "";
        (ctx.event.currentTarget as Element)
          .closest("[data-breakpoint-row]")
          ?.removeAttribute("data-dragging");
        document
          .querySelectorAll("[data-breakpoint-device-drop][data-drag-over]")
          .forEach((target) => target.removeAttribute("data-drag-over"));
      },
      designStartBreakpoint(d: Dataset) {
        if (d.device !== "mobile" && d.device !== "tablet" && d.device !== "desktop") return;
        state.designBreakpointAdding = d.device;
        state.designBreakpointError = "";
        syncDesignPanel();
      },
      designCancelBreakpoint() {
        state.designBreakpointAdding = "";
        state.designBreakpointError = "";
        syncDesignPanel();
      },
      designAddBreakpoint(d: Dataset, ctx: { event: Event }) {
        const wrap = (ctx.event.target as Element).closest("[data-add-breakpoint]");
        const [nameInput, widthInput] = wrap
          ? [...wrap.querySelectorAll<HTMLInputElement>("input")]
          : [];
        const key = (nameInput?.value ?? "")
          .trim()
          .toLowerCase()
          .replace(/^breakpoint-/, "")
          .replace(/[\s_]+/g, "-");
        const rawWidth = widthInput?.value.trim() ?? "";
        const width = /^\d+(?:\.\d+)?$/.test(rawWidth) ? `${rawWidth}px` : rawWidth;
        const device = d.device;
        if (device !== "mobile" && device !== "tablet" && device !== "desktop") return;
        if (!key || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || key === "base") {
          state.designBreakpointError =
            "Use a unique breakpoint name containing letters, numbers, or hyphens.";
          return;
        }
        if (styleBreakpoints().some((breakpoint) => breakpoint.key === key)) {
          state.designBreakpointError = `The “${key}” breakpoint already exists.`;
          return;
        }
        if (cssLengthPx(width) == null || cssLengthPx(width)! <= 0) {
          state.designBreakpointError = "Use a positive CSS length in px, rem, or em.";
          return;
        }
        state.designBreakpointError = "";
        applyTheme([
          ...breakpointMutationTokens(),
          { name: `breakpoint-${key}`, value: width },
          { name: breakpointDeviceToken(key), value: device },
        ]);
        state.designBreakpointAdding = "";
        if (nameInput) nameInput.value = "";
        if (widthInput) widthInput.value = "";
      },
      designRemoveBreakpoint(d: Dataset) {
        const key = d.breakpoint;
        if (!key || key === "base") return;
        const widthToken = `breakpoint-${key}`;
        const deviceToken = breakpointDeviceToken(key);
        state.designBreakpointError = "";
        applyTheme(
          breakpointMutationTokens().filter(
            (token) => token.name !== widthToken && token.name !== deviceToken,
          ),
        );
      },
      designResetBreakpoints() {
        const defaults = STYLE_BREAKPOINTS.map((breakpoint) => ({
          name: breakpoint.token ?? `breakpoint-${breakpoint.key}`,
          value: breakpoint.viewport,
        }));
        state.designBreakpointError = "";
        applyTheme([
          ...activeTheme().tokens.filter(
            (token) =>
              token.name !== "publr-preview-base" &&
              token.name !== BREAKPOINT_CONFIGURATION_TOKEN &&
              !token.name.startsWith("breakpoint-") &&
              !/^publr-breakpoint-.+-device$/.test(token.name),
          ),
          ...defaults,
          { name: BREAKPOINT_CONFIGURATION_TOKEN, value: "1" },
        ]);
      },
      designUpdateContainerWidth(d: Dataset, ctx: { event: Event }) {
        if (!d.name) return;
        const raw = (ctx.event.target as HTMLInputElement).value.trim();
        const value = /^\d+(?:\.\d+)?$/.test(raw) ? `${raw}px` : raw;
        if (cssLengthPx(value) == null || cssLengthPx(value)! <= 0) {
          state.designContainerError = "Use a positive CSS length in px, rem, or em.";
          return;
        }
        state.designContainerError = "";
        applyTheme([
          ...activeTheme().tokens.filter((token) => token.name !== d.name),
          { name: d.name, value },
        ]);
      },
      designUpdateContainerControl(d: Dataset, ctx: { event: Event }) {
        if (!d.name) return;
        const position = Number((ctx.event.target as HTMLInputElement).value);
        const min = Number(d.min);
        const max = Number(d.max);
        const step = Number(d.step);
        const unrounded = min + ((max - min) * position) / 100;
        const amount = Math.round(unrounded / step) * step;
        if (!Number.isFinite(amount) || amount <= 0) return;
        state.designContainerError = "";
        applyTheme([
          ...activeTheme().tokens.filter((token) => token.name !== d.name),
          { name: d.name, value: `${Math.round(amount)}px` },
        ]);
      },
      designResetContainerWidths() {
        state.designContainerError = "";
        const names = new Set(["container-content", "container-wide", "container-gutter"]);
        applyTheme([
          ...activeTheme().tokens.filter((token) => !names.has(token.name)),
          {
            name: "container-content",
            value: CONTAINER_WIDTH_DEFAULTS.content,
          },
          { name: "container-wide", value: CONTAINER_WIDTH_DEFAULTS.wide },
          { name: "container-gutter", value: CONTAINER_WIDTH_DEFAULTS.gutter },
        ]);
      },
      designUpdateTypographyDefault(d: Dataset, ctx: { event: Event }) {
        if (!d.name || !d.property) return;
        const value = (ctx.event.target as HTMLInputElement).value.trim();
        if (!value || !CSS.supports(d.property, value)) {
          state.designTypographyError = `Use a valid CSS ${d.property.replace("-", " ")} value.`;
          syncDesignPanel();
          return;
        }
        state.designTypographyError = "";
        applyTheme([
          ...activeTheme().tokens.filter((token) => token.name !== d.name),
          { name: d.name, value },
        ]);
      },
      designUpdateTypographyControl(d: Dataset, ctx: { event: Event }) {
        if (!d.name || !d.property || !d.control) return;
        const target = ctx.event.target as HTMLInputElement | HTMLSelectElement;
        const raw = target.value;
        const min = Number(d.min);
        const max = Number(d.max);
        const step = Number(d.step);
        const unrounded = min + ((max - min) * Number(raw)) / 100;
        const amount = Math.round(unrounded / step) * step;
        const value =
          d.control === "font"
            ? raw
            : d.control === "size" || d.control === "spacing"
              ? `${amount}px`
              : d.control === "weight"
                ? String(Number(raw))
                : String(Number(amount.toFixed(2)));
        if (!value || value.includes("NaN") || !CSS.supports(d.property, value)) return;
        state.designTypographyError = "";
        applyTheme([
          ...activeTheme().tokens.filter((token) => token.name !== d.name),
          { name: d.name, value },
        ]);
      },
      designSelectTypographyElement(d: Dataset) {
        if (
          d.element !== "text" &&
          d.element !== "links" &&
          d.element !== "headings" &&
          d.element !== "captions" &&
          d.element !== "buttons"
        )
          return;
        state.designTypographyElement = d.element;
        syncDesignTypographyRecipe();
      },
      designSelectTypographyHeadingLevel(d: Dataset) {
        if (d.level !== "h1" && d.level !== "h2" && d.level !== "h3" && d.level !== "h4") return;
        state.designTypographyHeadingLevel = d.level;
        syncDesignTypographyRecipe();
      },
      designSetTypographyChoice(d: Dataset) {
        if (!d.name || !d.value) return;
        applyTheme([
          ...activeTheme().tokens.filter((token) => token.name !== d.name),
          { name: d.name, value: d.value },
        ]);
      },
      designUpdateTypographyNumber(d: Dataset, ctx: { event: Event }) {
        if (!d.name || !d.property) return;
        const wrap = (ctx.event.target as Element).closest("[data-typography-number]");
        const number = wrap?.querySelector<HTMLInputElement>('input[type="number"]');
        const unit = wrap?.querySelector<HTMLSelectElement>("select");
        const raw = number?.value.trim() ?? "";
        const value = unit ? `${raw}${unit.value}` : raw;
        if (!raw || !CSS.supports(d.property, value)) {
          state.designTypographyError = `Use a valid ${d.property.replace("-", " ")} value.`;
          return;
        }
        state.designTypographyError = "";
        applyTheme([
          ...activeTheme().tokens.filter((token) => token.name !== d.name),
          { name: d.name, value },
        ]);
      },
      designStepTypographyNumber(d: Dataset, ctx: { event: Event }) {
        const wrap = (ctx.event.target as Element).closest("[data-typography-number]");
        const input = wrap?.querySelector<HTMLInputElement>('input[type="number"]');
        if (!input || !d.delta) return;
        input.value = String(Number((Number(input.value) + Number(d.delta)).toFixed(2)));
        const event = new Event("change", { bubbles: true });
        input.dispatchEvent(event);
      },
      designResetTypographyDefaults() {
        state.designTypographyError = "";
        const defaults: ThemeToken[] = [
          {
            name: "publr-body-font-family",
            value: SITE_TYPOGRAPHY_DEFAULTS.bodyFontFamily,
          },
          {
            name: "publr-body-font-size",
            value: SITE_TYPOGRAPHY_DEFAULTS.bodyFontSize,
          },
          {
            name: "publr-body-font-weight",
            value: SITE_TYPOGRAPHY_DEFAULTS.bodyFontWeight,
          },
          {
            name: "publr-body-color",
            value: SITE_TYPOGRAPHY_DEFAULTS.bodyColor,
          },
          {
            name: "publr-body-line-height",
            value: SITE_TYPOGRAPHY_DEFAULTS.bodyLineHeight,
          },
          {
            name: "publr-body-letter-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.bodyLetterSpacing,
          },
          {
            name: "publr-body-text-transform",
            value: SITE_TYPOGRAPHY_DEFAULTS.bodyTextTransform,
          },
          {
            name: "publr-paragraph-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.paragraphSpacing,
          },
          {
            name: "publr-heading-font-family",
            value: SITE_TYPOGRAPHY_DEFAULTS.headingFontFamily,
          },
          {
            name: "publr-heading-font-weight",
            value: SITE_TYPOGRAPHY_DEFAULTS.headingFontWeight,
          },
          {
            name: "publr-heading-color",
            value: SITE_TYPOGRAPHY_DEFAULTS.headingColor,
          },
          {
            name: "publr-heading-line-height",
            value: SITE_TYPOGRAPHY_DEFAULTS.headingLineHeight,
          },
          {
            name: "publr-heading-letter-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.headingLetterSpacing,
          },
          {
            name: "publr-heading-text-transform",
            value: SITE_TYPOGRAPHY_DEFAULTS.headingTextTransform,
          },
          {
            name: "publr-heading-spacing-before",
            value: SITE_TYPOGRAPHY_DEFAULTS.headingSpacingBefore,
          },
          {
            name: "publr-heading-spacing-after",
            value: SITE_TYPOGRAPHY_DEFAULTS.headingSpacingAfter,
          },
          {
            name: "publr-heading-1-size",
            value: SITE_TYPOGRAPHY_DEFAULTS.heading1Size,
          },
          {
            name: "publr-heading-2-size",
            value: SITE_TYPOGRAPHY_DEFAULTS.heading2Size,
          },
          {
            name: "publr-heading-3-size",
            value: SITE_TYPOGRAPHY_DEFAULTS.heading3Size,
          },
          {
            name: "publr-heading-4-size",
            value: SITE_TYPOGRAPHY_DEFAULTS.heading4Size,
          },
          {
            name: "publr-list-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.listSpacing,
          },
          {
            name: "publr-list-item-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.listItemSpacing,
          },
          {
            name: "publr-definition-list-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.definitionListSpacing,
          },
          {
            name: "publr-definition-term-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.definitionTermSpacing,
          },
          {
            name: "publr-definition-description-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.definitionDescriptionSpacing,
          },
          {
            name: "publr-definition-term-weight",
            value: SITE_TYPOGRAPHY_DEFAULTS.definitionTermWeight,
          },
          {
            name: "publr-blockquote-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.blockquoteSpacing,
          },
          {
            name: "publr-rule-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.ruleSpacing,
          },
          {
            name: "publr-link-color",
            value: SITE_TYPOGRAPHY_DEFAULTS.linkColor,
          },
          {
            name: "publr-link-font-family",
            value: SITE_TYPOGRAPHY_DEFAULTS.linkFontFamily,
          },
          {
            name: "publr-link-font-size",
            value: SITE_TYPOGRAPHY_DEFAULTS.linkFontSize,
          },
          {
            name: "publr-link-font-weight",
            value: SITE_TYPOGRAPHY_DEFAULTS.linkFontWeight,
          },
          {
            name: "publr-link-line-height",
            value: SITE_TYPOGRAPHY_DEFAULTS.linkLineHeight,
          },
          {
            name: "publr-link-letter-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.linkLetterSpacing,
          },
          {
            name: "publr-link-text-transform",
            value: SITE_TYPOGRAPHY_DEFAULTS.linkTextTransform,
          },
          {
            name: "publr-link-text-decoration",
            value: SITE_TYPOGRAPHY_DEFAULTS.linkTextDecoration,
          },
          {
            name: "publr-caption-font-family",
            value: SITE_TYPOGRAPHY_DEFAULTS.captionFontFamily,
          },
          {
            name: "publr-caption-font-size",
            value: SITE_TYPOGRAPHY_DEFAULTS.captionFontSize,
          },
          {
            name: "publr-caption-font-weight",
            value: SITE_TYPOGRAPHY_DEFAULTS.captionFontWeight,
          },
          {
            name: "publr-caption-color",
            value: SITE_TYPOGRAPHY_DEFAULTS.captionColor,
          },
          {
            name: "publr-caption-line-height",
            value: SITE_TYPOGRAPHY_DEFAULTS.captionLineHeight,
          },
          {
            name: "publr-caption-letter-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.captionLetterSpacing,
          },
          {
            name: "publr-caption-text-transform",
            value: SITE_TYPOGRAPHY_DEFAULTS.captionTextTransform,
          },
          {
            name: "publr-button-font-family",
            value: SITE_TYPOGRAPHY_DEFAULTS.buttonFontFamily,
          },
          {
            name: "publr-button-font-size",
            value: SITE_TYPOGRAPHY_DEFAULTS.buttonFontSize,
          },
          {
            name: "publr-button-font-weight",
            value: SITE_TYPOGRAPHY_DEFAULTS.buttonFontWeight,
          },
          {
            name: "publr-button-color",
            value: SITE_TYPOGRAPHY_DEFAULTS.buttonColor,
          },
          {
            name: "publr-button-line-height",
            value: SITE_TYPOGRAPHY_DEFAULTS.buttonLineHeight,
          },
          {
            name: "publr-button-letter-spacing",
            value: SITE_TYPOGRAPHY_DEFAULTS.buttonLetterSpacing,
          },
          {
            name: "publr-button-text-transform",
            value: SITE_TYPOGRAPHY_DEFAULTS.buttonTextTransform,
          },
        ];
        const names = new Set(defaults.map((token) => token.name));
        applyTheme([
          ...activeTheme().tokens.filter((token) => !names.has(token.name)),
          ...defaults,
        ]);
      },
      // Import: paste any CSS carrying v4 @theme blocks → becomes the theme.
      designImport(d: Dataset, ctx: { event: Event }) {
        const ta = (ctx.event.target as Element)
          .closest("[data-import]")
          ?.querySelector("textarea");
        const parsed = ta ? themeFromCssText(ta.value) : null;
        if (!parsed) {
          state.designImportStatus = "";
          state.designImportError =
            "No valid tokens found. Paste CSS containing an @theme { --token: value; } block.";
          return;
        }
        state.designImportError = "";
        const current = activeTheme();
        const importedNames = new Set(parsed.tokens.map((token) => token.name));
        applyThemeDocument({
          ...current,
          tokens: [
            ...current.tokens.filter((token) => !importedNames.has(token.name)),
            ...parsed.tokens,
          ],
          managedColorTokens: [
            ...new Set([
              ...(current.managedColorTokens ?? []),
              ...(parsed.managedColorTokens ?? []),
            ]),
          ],
        });
        state.designImportStatus = `${parsed.tokens.length} token${
          parsed.tokens.length === 1 ? "" : "s"
        } imported. Matching values were updated; semantic mappings and patterns were preserved.`;
        if (ta) ta.value = "";
      },
      // The Define… loop: an unresolved chip jumps here with the token name
      // prefilled (ambiguous prefixes: the guess is editable).
      defineFromChip(d: Dataset) {
        if (!d.ns || !d.suffix) return;
        state.defineName = `${d.ns}-${d.suffix}`;
        state.defineShown = true;
        state.designModeActive = true;
        state.designWorkspaceOpen = true;
        state.designWorkspacePage = "advanced";
        state.designTokenTransferShown = false;
        state.designTokenLibraryShown = true;
        syncDesignPanel();
      },
      designDefine(d: Dataset, ctx: { event: Event }) {
        const wrap = (ctx.event.target as Element).closest("[data-define]");
        const [nameInput, valueInput] = wrap
          ? [...wrap.querySelectorAll<HTMLInputElement>("input")]
          : [];
        const name = nameInput?.value.trim().replace(/^--/, "");
        const value = valueInput?.value.trim();
        if (!name || !value) return;
        applyTheme([...activeTheme().tokens.filter((t) => t.name !== name), { name, value }]);
        state.defineShown = false;
        state.defineName = "";
      },
      defineDismiss() {
        state.defineShown = false;
        state.defineName = "";
      },
      // E5 (future capability): engine-translated CSS → classes. Hidden until
      // an engine implements classesFromCss.
      cssToClasses(d: Dataset, ctx: { event: Event }) {
        const ta = (ctx.event.target as Element)
          .closest("[data-css-import]")
          ?.querySelector("textarea");
        if (!cssEngine?.classesFromCss || !ta) return;
        void cssEngine.classesFromCss(ta.value).then((cls) => {
          state.cssImportResult = cls.join(" ");
        });
      },
      // Dimensions (C3): a scale key sets the prop; the "none" segment (and
      // re-clicking the active step) clears it.
      applyDimension(d: Dataset) {
        const id = panelTarget();
        if (!id || !d.prop || !d.key) return;
        const key = d.key === "none" ? "" : d.key;
        writeStyle(id, d.prop, key === readStyle(id, d.prop) ? "" : key);
      },
      applyTokenScale(d: Dataset, ctx: { event: Event }) {
        const id = panelTarget();
        const row = tokenScaleRow(d);
        if (!id || !row) return;
        const index = Number((ctx.event.target as HTMLInputElement).value);
        const value = index > 0 ? (row.options[index - 1]?.key ?? "") : "";
        if (d.kind === "padding" || d.kind === "margin" || d.kind === "border")
          writeBoxSpacing(id, d.kind, value, d.prop);
        else if (d.prop) writeStyle(id, d.prop, value);
      },
      previewTokenScale(d: Dataset, ctx: { event: Event }) {
        const row = tokenScaleRow(d);
        if (!row) return;
        const index = Number((ctx.event.target as HTMLInputElement).value);
        row.rangeIndex = index;
        row.thumbPosition = `calc(8px + (100% - 16px) * ${index / Math.max(1, row.rangeMax)})`;
        row.valueLabel = index > 0 ? (row.options[index - 1]?.label ?? "None") : "None";
        row.options.forEach((option, optionIndex) => {
          option.active = index > 0 && optionIndex < index;
        });
      },
      toggleTokenScaleCustom(d: Dataset) {
        const row = tokenScaleRow(d);
        if (!row) return;
        if (d.kind === "padding" || d.kind === "margin")
          state.boxEditorCustomOpen = !row.customOpen;
        else if (d.kind === "border" && d.prop) state.tokenScaleCustom[d.prop] = !row.customOpen;
        else if (d.prop) state.tokenScaleCustom[d.prop] = !row.customOpen;
        syncBlockPanel();
      },
      applyTokenScaleCustom(d: Dataset, ctx: { event: Event }) {
        const id = panelTarget();
        const component = (ctx.event.target as Element).closest<HTMLElement>(
          '[data-publr-component="token-scale"]',
        );
        const number = component?.querySelector<HTMLInputElement>('input[type="number"]');
        const unit = component?.querySelector<HTMLSelectElement>("select");
        const raw = number?.value.trim() ?? "";
        if (!id || !raw || !Number.isFinite(Number(raw)) || !unit) return;
        const value = `${raw}${unit.value}`;
        if (d.kind === "padding" || d.kind === "margin" || d.kind === "border")
          writeBoxSpacing(id, d.kind, value, d.prop);
        else if (d.prop) writeStyle(id, d.prop, value);
      },
      previewTokenScaleCustom(d: Dataset, ctx: { event: Event }) {
        const row = tokenScaleRow(d);
        const value = Number((ctx.event.target as HTMLInputElement).value);
        if (!row || !Number.isFinite(value)) return;
        row.customNumber = String(value);
        row.customRangeValue = value;
        const ratio =
          (value - row.customMin) / Math.max(row.customStep, row.customMax - row.customMin);
        row.customTrackFill = `${ratio * 100}%`;
        row.customThumbPosition = `calc(8px + (100% - 16px) * ${ratio})`;
      },
      applyTokenScaleCustomRange(d: Dataset, ctx: { event: Event }) {
        const id = panelTarget();
        const row = tokenScaleRow(d);
        const value = Number((ctx.event.target as HTMLInputElement).value);
        if (!id || !row || !Number.isFinite(value)) return;
        const raw = `${value}${row.customUnit}`;
        if (d.kind === "padding" || d.kind === "margin" || d.kind === "border")
          writeBoxSpacing(id, d.kind, raw, d.prop);
        else if (d.prop) writeStyle(id, d.prop, raw);
      },
      applyBoxBorderColor(d: Dataset) {
        const id = panelTarget();
        if (!id || d.value === undefined) return;
        applyBoxBorderColorValue(id, d.value);
      },
      setBorderColorTier(d: Dataset) {
        const tier = ["recommended", "semantic", "tokens", "custom"].find(
          (candidate) => candidate === d.tier,
        ) as BorderColorTier | undefined;
        if (!tier) return;
        state.borderColorTier = tier;
        syncBlockPanel();
      },
      applyBoxBorderCustomColor(_d: Dataset, ctx: { event: Event }) {
        const id = panelTarget();
        const value = (ctx.event.target as HTMLInputElement).value.trim();
        if (!id || !value) return;
        applyBoxBorderColorValue(id, value);
      },
      previewBoxLayer(d: Dataset, ctx: { event: Event }) {
        const event = ctx.event as PointerEvent;
        event.stopPropagation();
        const layer = event.currentTarget;
        if (!(layer instanceof HTMLElement)) return;
        const related = event.relatedTarget;
        if (related instanceof Node && layer.contains(related)) return;
        const kind =
          d.kind === "margin"
            ? "margin"
            : d.kind === "padding"
              ? "padding"
              : d.kind === "border"
                ? "border"
                : null;
        if (kind) showBoxLayerPreview(kind);
      },
      clearBoxLayerPreview(_d: Dataset, ctx: { event: Event }) {
        const event = ctx.event as PointerEvent;
        event.stopPropagation();
        const layer = event.currentTarget;
        const related = event.relatedTarget;
        if (layer instanceof HTMLElement && related instanceof Node && layer.contains(related))
          return;
        clearBoxLayerPreview();
      },
      selectBoxSide(d: Dataset, ctx: { event: Event }) {
        const id = panelTarget();
        const kind =
          d.kind === "margin"
            ? "margin"
            : d.kind === "padding"
              ? "padding"
              : d.kind === "border"
                ? "border"
                : null;
        const side = spacingSides.find((value) => value === d.side);
        if (!id || !kind || !side) return;
        const sameKindPane =
          state.boxEditorOpen &&
          state.boxEditorTargetId === id &&
          state.boxActiveKind === kind &&
          !state.boxEditorRadiusOnly;
        const shift = (ctx.event as MouseEvent).shiftKey;
        if (shift && sameKindPane) {
          const selected = new Set(state.boxEditorSelectedSides);
          if (selected.has(side)) selected.delete(side);
          else selected.add(side);
          const next = orderedSpacingSides([...selected]);
          if (!next.length) {
            state.boxEditorOpen = false;
            state.boxEditorTargetId = "";
            syncBlockPanel();
            return;
          }
          state.boxEditorSelectedSides = next;
          state.boxActiveSide = selected.has(side) ? side : next[0];
        } else {
          const sameSingleControl =
            sameKindPane &&
            state.boxEditorSelectedSides.length === 1 &&
            state.boxEditorSelectedSides[0] === side;
          if (sameSingleControl) {
            state.boxEditorOpen = false;
            state.boxEditorTargetId = "";
            syncBlockPanel();
            return;
          }
          state.boxEditorSelectedSides = [side];
          state.boxActiveSide = side;
        }
        state.boxActiveKind = kind;
        state.boxEditorRadiusOnly = false;
        state.boxEditorOpen = true;
        state.boxEditorTargetId = id;
        setSpacingCustomMode(id, kind, state.boxActiveSide as BoxSpacingSide);
        if (ctx.event.currentTarget instanceof HTMLElement)
          positionBoxEditor(ctx.event.currentTarget);
        syncBlockPanel();
      },
      selectBorderRadiusCorner(d: Dataset, ctx: { event: Event }) {
        const id = panelTarget();
        const corner = borderRadiusCorners.find(({ prop }) => prop === d.corner)?.prop;
        if (!id || !corner) return;
        const sameRadiusPane =
          state.boxEditorOpen && state.boxEditorTargetId === id && state.boxEditorRadiusOnly;
        const shift = (ctx.event as MouseEvent).shiftKey;
        if (shift && sameRadiusPane) {
          const selected = new Set(state.boxEditorSelectedCorners);
          if (selected.has(corner)) selected.delete(corner);
          else selected.add(corner);
          const next = orderedBorderRadiusCorners([...selected]);
          if (!next.length) {
            state.boxEditorOpen = false;
            state.boxEditorTargetId = "";
            syncBlockPanel();
            return;
          }
          state.boxEditorSelectedCorners = next;
        } else {
          const sameSingleControl =
            sameRadiusPane &&
            state.boxEditorSelectedCorners.length === 1 &&
            state.boxEditorSelectedCorners[0] === corner;
          if (sameSingleControl) {
            state.boxEditorOpen = false;
            state.boxEditorTargetId = "";
            syncBlockPanel();
            return;
          }
          state.boxEditorSelectedCorners = [corner];
        }
        state.boxActiveKind = "border";
        state.boxEditorRadiusOnly = true;
        state.boxEditorOpen = true;
        state.boxEditorTargetId = id;
        if (ctx.event.currentTarget instanceof HTMLElement)
          positionBoxEditor(ctx.event.currentTarget);
        syncBlockPanel();
      },
      openSpacingSync(d: Dataset, ctx: { event: Event }) {
        const id = panelTarget();
        const kind =
          d.kind === "margin"
            ? "margin"
            : d.kind === "padding"
              ? "padding"
              : d.kind === "border"
                ? "border"
                : null;
        if (!id || !kind) return;
        const sameControl =
          state.boxEditorOpen &&
          state.boxEditorTargetId === id &&
          state.boxActiveKind === kind &&
          !state.boxEditorRadiusOnly &&
          sameSpacingSides(state.boxEditorSelectedSides, spacingSides);
        if (sameControl) {
          state.boxEditorOpen = false;
          state.boxEditorTargetId = "";
          syncBlockPanel();
          return;
        }
        state.boxActiveKind = kind;
        state.boxEditorRadiusOnly = false;
        state.boxActiveSide = "Top";
        state.boxEditorSelectedSides = [...spacingSides];
        state.boxEditorOpen = true;
        state.boxEditorTargetId = id;
        setSpacingCustomMode(id, kind, "Top");
        if (ctx.event.currentTarget instanceof HTMLElement)
          positionBoxEditor(ctx.event.currentTarget);
        syncBlockPanel();
      },
      setSpacingSync(d: Dataset) {
        if (d.mode !== "pair" && d.mode !== "all") return;
        const activeSide = spacingSides.find((side) => side === state.boxActiveSide) ?? "Top";
        const next =
          d.mode === "all"
            ? [...spacingSides]
            : activeSide === "Top" || activeSide === "Bottom"
              ? (["Top", "Bottom"] as BoxSpacingSide[])
              : (["Left", "Right"] as BoxSpacingSide[]);
        state.boxEditorSelectedSides = sameSpacingSides(state.boxEditorSelectedSides, next)
          ? [activeSide]
          : next;
        syncBlockPanel();
      },
      setBorderRadiusAll() {
        if (!state.boxEditorRadiusOnly) return;
        const activeCorner =
          orderedBorderRadiusCorners(state.boxEditorSelectedCorners)[0] ?? "borderTopLeftRadius";
        state.boxEditorSelectedCorners = state.boxEditorRadiusAllPressed
          ? [activeCorner]
          : borderRadiusCorners.map(({ prop }) => prop);
        syncBlockPanel();
      },
      closeSpacingEditor() {
        state.boxEditorOpen = false;
        state.boxEditorTargetId = "";
        syncBlockPanel();
      },
      applyStyleInput(d: Dataset, ctx: { event: Event }) {
        const id = panelTarget();
        if (!id || !d.prop) return;
        writeStyle(id, d.prop, (ctx.event.target as HTMLInputElement).value.trim());
      },
      // select / text / number commit on change. Numbers are coerced with a
      // NaN guard — an unparsable value never reaches the model; the panel
      // re-sync restores the input from the model instead.
      applyInputSetting(d: Dataset, ctx: { event: Event }) {
        const input = ctx.event.target as HTMLInputElement | HTMLSelectElement;
        if (!d.id || (!d.setting && !d.field && !d.style)) return;
        if (d.kind === "number" && d.setting) {
          const numberInput = input as HTMLInputElement;
          const n = Number(numberInput.value);
          const min = numberInput.min === "" ? null : Number(numberInput.min);
          const max = numberInput.max === "" ? null : Number(numberInput.max);
          const valid =
            numberInput.value.trim() !== "" &&
            Number.isFinite(n) &&
            (min === null || n >= min) &&
            (max === null || n <= max);
          if (valid) {
            if (d.key) delete state.settingErrors[d.key];
            editor.setSetting(d.id, d.setting, n);
          } else {
            if (d.key)
              state.settingErrors[d.key] =
                min !== null && max !== null
                  ? `Enter a value from ${min} to ${max}.`
                  : min !== null
                    ? `Enter a value of at least ${min}.`
                    : max !== null
                      ? `Enter a value no greater than ${max}.`
                      : "Enter a valid number.";
            syncBlockPanel();
          }
        } else if (d.style) {
          if (d.key) delete state.settingErrors[d.key];
          editor.setStyle(d.id, d.style, input.value, activeStyleBreakpoint());
        } else if (d.setting) {
          if (d.key) delete state.settingErrors[d.key];
          editor.setSetting(d.id, d.setting, input.value);
        } else if (d.field) {
          if (d.key) delete state.settingErrors[d.key];
          editor.setField(d.id, d.field, input.value);
        }
      },

      // --- media control (upload / browse / URL / alt on image-carrier
      // fields). Writes go through setField with the FULL image object — the
      // carrier value is one fact; parts never write independently. All
      // persistence goes through the resolved media adapter; failures land on
      // the row's error line (state.settingErrors).
      async uploadMedia(d: Dataset, ctx: { event: Event }) {
        const input = ctx.event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = ""; // same-file re-selects must fire change again
        if (!d.id || !d.field || !file || !mediaAdapter.upload) return;
        if (d.key) {
          delete state.settingErrors[d.key];
          state.mediaBusy[d.key] = "Uploading…"; // row swaps to the spinner
          syncBlockPanel();
        }
        const cur = imageValue(d.id, d.field);
        try {
          const value = await mediaAdapter.upload(file);
          editor.setField(d.id, d.field, await toImageValue(value, { file, prevAlt: cur.alt }));
        } catch (err) {
          console.error("[publr-editor] media upload failed:", err);
          if (d.key) state.settingErrors[d.key] = "Upload failed.";
        } finally {
          if (d.key) delete state.mediaBusy[d.key];
          syncBlockPanel();
        }
      },
      async browseMedia(d: Dataset) {
        if (!d.id || !d.field || !mediaAdapter.browse) return;
        if (d.key) {
          delete state.settingErrors[d.key];
          // guard against double-opens; the host's library UI is the main
          // feedback while browse is pending
          state.mediaBusy[d.key] = "Media library open…";
          syncBlockPanel();
        }
        const cur = imageValue(d.id, d.field);
        try {
          const picked = await mediaAdapter.browse(cur.src ? { ...cur } : undefined);
          if (picked)
            editor.setField(d.id, d.field, await toImageValue(picked, { prevAlt: cur.alt }));
        } catch (err) {
          console.error("[publr-editor] media browse failed:", err);
          if (d.key) state.settingErrors[d.key] = "Couldn't get media from the library.";
        } finally {
          if (d.key) delete state.mediaBusy[d.key];
          syncBlockPanel();
        }
      },
      applyMediaUrl(d: Dataset, ctx: { event: Event }) {
        const input = ctx.event.target as HTMLInputElement;
        if (!d.id || !d.field) return;
        const cur = imageValue(d.id, d.field);
        // external source: intrinsic dims are unknown — cleared, not stale
        editor.setField(d.id, d.field, {
          src: input.value.trim(),
          alt: cur.alt,
          width: "",
          height: "",
        });
      },
      applyMediaAlt(d: Dataset, ctx: { event: Event }) {
        const input = ctx.event.target as HTMLInputElement;
        if (!d.id || !d.field) return;
        const cur = imageValue(d.id, d.field);
        editor.setField(d.id, d.field, { ...cur, alt: input.value });
      },
      clearMedia(d: Dataset) {
        if (d.id && d.field)
          editor.setField(d.id, d.field, {
            src: "",
            alt: "",
            width: "",
            height: "",
          });
      },

      // --- block library (left rail) ----------------------------------------
      toggleInserter: () => setInserterOpen(!state.inserterOpen),
      closeInserter() {
        setInserterOpen(false);
        document.getElementById("inserter-toggle")?.focus();
      },
      setInserterTab(d: Dataset) {
        if (!d.itab) return;
        state.inserterTab = d.itab;
        if (d.itab === "patterns") setSidebarOpen(false);
        requestAnimationFrame(() =>
          document
            .getElementById(d.itab === "patterns" ? "pattern-search" : "library-search")
            ?.focus(),
        );
      },
      pickBlock(d: Dataset) {
        if (d.blockType) insertFromLibrary(d.blockType); // panel stays open
      },
      libraryPickFirst() {
        const first = state.shelves[0]?.blocks[0];
        if (first) insertFromLibrary(first.type);
      },
      // --- patterns tab (left rail) -------------------------------------------
      pickPatternGroup(d: Dataset) {
        if (!d.group) return;
        // second click on the open group folds its flyout (toggling)
        state.patternGroup = state.patternGroup === d.group ? "" : d.group;
      },
      closePatternFlyout() {
        state.patternGroup = "";
        state.patternQuery = "";
      },
      pickPattern(d: Dataset) {
        if (d.pattern) insertFromLibrary(`pattern:${d.pattern}`); // pane stays open, like blocks
      },
      openPatternExplorer: () => openExplorer(),
      closePatternExplorer: closeExplorer,
      setExplorerGroup(d: Dataset) {
        if (d.group) state.explorerGroup = d.group;
      },
      explorerPick(d: Dataset) {
        if (!d.pattern) return;
        closeExplorer(); // first — so the insert's carrier focus wins the day
        insertFromLibrary(`pattern:${d.pattern}`);
      },
      // --- pattern identity (sidebar card + template editor) ------------------
      toggleDocumentTemplateVisibility() {
        state.documentTemplateVisible = !state.documentTemplateVisible;
        clearTemplateNodeSelection();
        if (state.documentTemplateVisible) mountDocumentFrame();
        else mountBareCanvas();
        syncTree();
        refreshEngineCss();
      },
      selectDocumentTemplateSlot(d: Dataset) {
        if (d.id) selectTemplateNode(d.id);
      },
      editDocumentTemplate() {
        if (state.documentTemplateName) openPageTemplateEditor(state.documentTemplateName);
      },
      sidebarEditPattern() {
        // inner selections remapped to the root — edit THIS copy
        if (state.blockPatternRoot) openInstanceEditor(state.blockPatternRoot);
      },
      sidebarEditTemplatePart() {
        if (state.selectedTemplateNodeId) {
          const node = documentTemplateNodes().find(
            (candidate) => candidate.id === state.selectedTemplateNodeId,
          );
          if (node?.kind === "part") openDocumentTemplatePartEditor(node.name);
          return;
        }
        const id = panelTarget();
        if (id) openTemplatePartEditor(id);
      },
      applyPatternColorContext(d: Dataset) {
        if (state.blockPatternRoot && d.context) {
          const definition = state.blockPattern ? getPattern(state.blockPattern) : undefined;
          const preserveContext = definition?.disabledColorContexts?.includes(
            state.blockPatternActiveContext,
          )
            ? state.blockPatternActiveContext
            : undefined;
          editor.setPatternColorContext(state.blockPatternRoot, d.context, preserveContext);
          syncBlockPanel();
        }
      },
      selectPatternDefaultColorContext(d: Dataset) {
        if (!state.patternColorSchemesShown || !d.context) return;
        const context = state.patternColorSchemes.find((option) => option.key === d.context);
        if (!context) return;
        if (state.templateMode === "instance") {
          if (
            state.patternDisabledColorContexts.includes(state.patternDefaultColorContext) &&
            !state.patternLegacyColorContexts.includes(state.patternDefaultColorContext)
          )
            state.patternLegacyColorContexts = [
              ...state.patternLegacyColorContexts,
              state.patternDefaultColorContext,
            ];
          state.patternDefaultColorContext = context.key;
          editor.setDocumentColorContext(context.key);
          syncBlockPanel();
          state.sidebarTab = "document";
          return;
        }
        if (state.templateMode !== "definition") return;
        if (context.disabled) return;
        state.patternDefaultColorContext = context.key;
        state.patternDisabledColorContexts = state.patternDisabledColorContexts.filter(
          (key) => key !== context.key,
        );
        editor.setDocumentColorContext(context.key);
        syncBlockPanel();
        state.sidebarTab = "document";
      },
      togglePatternColorContextAvailability(d: Dataset) {
        if (
          state.templateMode !== "definition" ||
          !state.patternColorSchemesShown ||
          !d.context ||
          d.context === state.patternDefaultColorContext ||
          !state.patternColorSchemes.some((option) => option.key === d.context)
        )
          return;
        const disabled = new Set(state.patternDisabledColorContexts);
        if (disabled.has(d.context)) disabled.delete(d.context);
        else disabled.add(d.context);
        state.patternDisabledColorContexts = [...disabled];
        syncBlockPanel();
      },
      editDefinition(d: Dataset) {
        if (d.pattern) openTemplateEditor(d.pattern); // the library's edit affordance
      },
      editDefinitionFromExplorer(d: Dataset) {
        if (!d.pattern) return;
        closeExplorer(); // the dialog folds; the isolation mode takes over
        openTemplateEditor(d.pattern);
      },
      selectPatternChild(d: Dataset) {
        if (d.id) editor.selectBlock(d.id);
      },
      openIsolationBreadcrumb(d: Dataset) {
        const index = Number(d.index);
        if (Number.isInteger(index)) navigateIsolationBreadcrumb(index);
      },
      saveTemplate,
      cancelTemplate,
      // --- list view (left rail) ---------------------------------------------
      toggleTree: () => setTreeOpen(!state.treeOpen),
      closeTree() {
        setTreeOpen(false);
        document.getElementById("tree-toggle")?.focus();
      },
      setTreeTab(d: Dataset) {
        if (!d.ttab) return;
        if (state.templateIsPrimitive && d.ttab === "outline") return;
        // Preserve the exact canvas target before moving focus into the
        // pattern search. Picks from this tab then replace/insert at the same
        // anchor as picks from the + library.
        if (d.ttab === "patterns") inserterAnchorId = singleTarget();
        state.treeTab = d.ttab;
        if (d.ttab === "patterns") setSidebarOpen(false);
        if (d.ttab === "patterns")
          requestAnimationFrame(() => document.getElementById("tree-pattern-search")?.focus());
      },
      // Purely visual: flips the row's disclosure, never touches selection —
      // collapsing a container with an inner block selected must stick.
      treeToggle(d: Dataset) {
        if (!d.id) return;
        if (d.id.startsWith("template:") && !(d.id in state.treeExpanded))
          state.treeExpanded[d.id] = false;
        else state.treeExpanded[d.id] = !state.treeExpanded[d.id];
      },
      treeDragStart(d: Dataset, ctx: { event: Event }) {
        const event = ctx.event as DragEvent;
        if (!d.id || !editor.canMove(d.id) || !event.dataTransfer) {
          event.preventDefault();
          return;
        }
        treeDraggedId = d.id;
        treeRowsElement()?.setAttribute("data-tree-dragging", "");
        const row = treeRowElement(d.id);
        row?.setAttribute("data-tree-drag-source", "");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-publr-block", d.id);
        event.dataTransfer.setData("text/plain", d.id);

        // Compact type badge + grip while leaving the full tree row untouched
        // in its original position.
        treeDragPreview = document.createElement("div");
        treeDragPreview.className = "pbe-tree-drag-preview";
        const badge =
          row
            ?.querySelector<HTMLButtonElement>("button:not([aria-label]) > span")
            ?.cloneNode(true) ?? document.createElement("span");
        const grip = document.createElement("span");
        grip.innerHTML =
          '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
          '<circle cx="7" cy="5" r="1.35"/><circle cx="13" cy="5" r="1.35"/>' +
          '<circle cx="7" cy="10" r="1.35"/><circle cx="13" cy="10" r="1.35"/>' +
          '<circle cx="7" cy="15" r="1.35"/><circle cx="13" cy="15" r="1.35"/></svg>';
        treeDragPreview.append(badge, grip);
        document.body.appendChild(treeDragPreview);
        event.dataTransfer.setDragImage(treeDragPreview, 44, 22);
        window.setTimeout(() => treeDragPreview?.remove(), 0);
      },
      treeDragOver(_d: Dataset, ctx: { event: Event }) {
        if (!treeDraggedId) return;
        const event = ctx.event as DragEvent;
        event.preventDefault();
        const drop = treeDestinationAt(event);
        if (!drop || treeDropIsOrigin(drop)) {
          clearTreeDropIndicator();
          return;
        }
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        showTreeDropIndicator(drop);

        const panel = document.getElementById("tpanel-list");
        if (panel) {
          const rect = panel.getBoundingClientRect();
          if (event.clientY < rect.top + 40) panel.scrollTop -= 12;
          else if (event.clientY > rect.bottom - 40) panel.scrollTop += 12;
        }
      },
      treeDrop(_d: Dataset, ctx: { event: Event }) {
        if (!treeDraggedId || !treeDrop) return;
        const event = ctx.event as DragEvent;
        event.preventDefault();
        const id = treeDraggedId;
        const { parentId, index } = treeDrop;
        endTreeDrag();
        if (parentId) state.treeExpanded[parentId] = true;
        editor.moveBlockTo(id, parentId, index);
      },
      treeDragEnd: endTreeDrag,
      treeSelect(d: Dataset, ctx: { event: Event }) {
        if (!d.id) return;
        if (d.id.startsWith("template:")) {
          selectTemplateNode(d.id);
          return;
        }
        clearTemplateNodeSelection();
        // Same modifier vocabulary as the canvas — selectBlock delegates to
        // the identical blockSel gestures, so tree and canvas can't drift.
        const e = ctx.event as MouseEvent;
        // center: a tree click is a "take me there" jump — landing the block
        // mid-viewport reads better than edge-sticking at the scroll boundary.
        if (e.metaKey || e.ctrlKey) editor.selectBlock(d.id, { toggle: true, center: true });
        else if (e.shiftKey) editor.selectBlock(d.id, { range: true, center: true });
        else editor.selectBlock(d.id, { block: true, center: true });
      },
    },

    setup({ el }: { el: HTMLElement }) {
      // The icon sprite first: every <use href="#pbe-i-…"> below resolves
      // against it (one hidden <symbol> set, bindable refs — see icons.ts).
      mountIconSprite();
      shellRootEl = el;
      const viewportEl = el.querySelector<HTMLElement>(".pbe-canvas-viewport")!;
      const viewportResizeHandle = viewportEl.querySelector<HTMLElement>(".pbe-viewport-resizer")!;
      editorContentEl = el.querySelector<HTMLElement>("#editor-content")!;
      responsiveDeckEl = el.querySelector<HTMLElement>(".pbe-responsive-deck")!;
      responsiveCanonicalSurface = el.querySelector<HTMLElement>(
        ".pbe-responsive-surface--canonical",
      )!;
      wrapEl = viewportEl.querySelector<HTMLElement>(".pbe-frame-wrap")!;

      // A width-constrained div is not a viewport: @media still evaluates
      // against the browser window. Host the authored document in a
      // same-origin iframe so Mobile/Small/Tablet/Desktop use real media
      // queries and the editable canvas shares the published cascade.
      canvasFrame = document.createElement("iframe");
      canvasFrame.id = "editor-frame";
      canvasFrame.title = "Editable page canvas";
      canvasFrame.style.cssText =
        "display:block;width:100%;height:100%;min-height:100%;border:0;background:transparent";
      wrapEl.replaceWith(canvasFrame);
      canvasDocument = canvasFrame.contentDocument!;
      canvasDocument.open();
      canvasDocument.write("<!doctype html><html><head></head><body></body></html>");
      canvasDocument.close();
      const opts = shellOptions ?? { container: el };

      const base = canvasDocument.createElement("base");
      base.href = document.baseURI;
      canvasDocument.head.appendChild(base);
      for (const source of document.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
        'style:not(#pbe-engine-css),link[rel="stylesheet"]',
      )) {
        canvasDocument.head.appendChild(source.cloneNode(true));
      }
      for (const sheet of document.adoptedStyleSheets ?? []) {
        try {
          const adopted = canvasDocument.createElement("style");
          adopted.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
          canvasDocument.head.appendChild(adopted);
        } catch {
          // A matching <link> above still loads cross-origin stylesheets.
        }
      }
      const contentStyle = canvasDocument.createElement("style");
      contentStyle.id = "pbe-editor-content-css";
      contentStyle.textContent = composeContentCss([
        baseCss,
        themeBaseCss(),
        previewCss,
        siteCss,
        `html,body{margin:0!important;min-height:100%!important;background:transparent!important}
         body{overflow:auto!important}
         #canvas:empty{min-height:24px}
         [data-pbe-template-node-kind="part"]{cursor:pointer}
         [data-pbe-template-node-id]:focus-visible,[data-pbe-template-selected]{outline:2px solid #7c3aed!important;outline-offset:-2px}
         [data-pbe-template-node-kind="slot"][data-pbe-template-node-name="content"][data-pbe-template-selected] #canvas{outline:2px solid #7c3aed!important;outline-offset:-2px}`,
      ]);
      canvasDocument.head.appendChild(contentStyle);
      responsiveContainerStyle = canvasDocument.createElement("style");
      responsiveContainerStyle.id = "pbe-responsive-container-css";
      responsiveContainerStyle.textContent = responsiveContainerCss();
      canvasDocument.head.appendChild(responsiveContainerStyle);
      engineTag = canvasDocument.createElement("style");
      engineTag.id = "pbe-engine-css";
      canvasDocument.head.appendChild(engineTag);
      canvasDocument.addEventListener("click", onTemplateNodeClick, true);
      canvasDocument.addEventListener("keydown", onTemplateNodeKeydown, true);
      mountDocumentFrame();
      canvasEl = wrapEl.querySelector<HTMLElement>("#canvas")!;
      canvasEl.setAttribute("data-pbe-template-width", shellOptions?.templateWidth ?? "full");
      isolationCanvasObserver = new ResizeObserver(() => {
        if (state.templateCanvasShown) requestAnimationFrame(syncIsolationCanvasHeight);
      });
      isolationCanvasObserver.observe(canvasEl);
      // `setup` is mounted ON #editor-shell, so querySelector alone returns
      // null (it only searches descendants). That left iframe chrome on its
      // light fallbacks even while the surrounding editor was dark.
      const shellSurface = el.matches("#editor-shell")
        ? el
        : el.querySelector<HTMLElement>("#editor-shell");
      copyComputedCustomProperties(shellSurface, wrapEl);
      copyShellChromeTokens(shellSurface, wrapEl);
      mountIconSprite(canvasDocument);

      // Upload availability settles after first paint (OPFS worker) —
      // re-derive the panel so a selected media block's Upload button appears
      // without reselecting.
      void mediaAdapter.ready.then(() => {
        state.documentCanUpload = mediaAdapter.uploadAvailable();
        state.documentCanBrowse = !!mediaAdapter.browse;
        syncBlockPanel();
      });

      editor = createEditor({
        canvas: canvasEl,
        defaultBlock: opts.defaultBlock ?? "paragraph",
        groupBlock: opts.groupBlock ?? "group", // Cmd+G wraps the selection in one of these
        // The full product shell starts from its visible Hearth system. A
        // customized host theme wins; the legacy neutral POC seed is upgraded
        // and receives the contextual roles used by registered patterns.
        theme: withHearthDefaults(opts.theme),
        styleBackend: opts.styleBackend,
        policy: opts.policy,
        placeholder: opts.placeholder,
        debug: opts.debug,
        onChange: () => {
          state.wireEditing = editor.serialize();
          state.wireData = editor.serialize({ pipeline: "data" });
          refreshEngineCss(); // E3: recompile the live class universe (debounced)
          syncBlockPanel(); // a transform changes the block's type under the same selection
          syncBreadcrumb();
          state.docEpoch++; // wakes effect(syncTree) — tracked, unlike a direct call
          if (state.templateCanvasShown) requestAnimationFrame(syncIsolationCanvasHeight);
          if (state.canvasResponsiveCompare) requestAnimationFrame(syncResponsiveComparison);
          // Host persistence NEVER sees isolation mode: while a pattern is
          // being edited the page document is PARKED and the canvas holds
          // only the isolated fragment — mirroring that into the host's
          // save path would replace the whole entry with the fragment.
          // The host hears again when Save/Cancel restores the page
          // (loadHtml fires onChange with the real document back).
          if (!state.templateMode) opts.onChange?.(editor); // the host's persistence hook
        },
      });
      Publr.editor = editor; // poke at it from the console: Publr.editor.debug = true

      // The editable document lives in an iframe, so its own outside-click
      // listener cannot see the surrounding shell. Inert shell space—most
      // notably the gray stage around an isolated pattern—releases the block
      // selection. Buttons, fields, sidebar controls, and other interactive
      // surfaces keep it because they act on the current selection.
      const shellDocument = el.ownerDocument;
      const onShellBackgroundMouseDown = (event: MouseEvent) => {
        if (event.button !== 0 || event.defaultPrevented || targetsInteractiveControl(event))
          return;
        editor.clearSelection();
        inspectedId = null;
        clearTemplateNodeSelection();
        syncBlockPanel();
        syncBreadcrumb();
        syncTree();
      };
      shellDocument.addEventListener("mousedown", onShellBackgroundMouseDown);
      const shellView = shellDocument.defaultView ?? window;
      const onShellViewportResize = () => scheduleBoxEditorPosition();
      shellView.addEventListener("resize", onShellViewportResize);
      shellView.visualViewport?.addEventListener("resize", onShellViewportResize);

      // Breakpoint buttons are useful presets, but the iframe can be inspected
      // at every width between them. Because the canvas stays centered, a
      // right-edge pointer delta changes the width by twice that delta so the
      // resize rail remains under the pointer. The current mobile-first
      // breakpoint follows the live width and therefore keeps the inspector's
      // authoring scope aligned with the media queries visible in the iframe.
      let activeResize:
        | {
            pointerId: number;
            move: (event: PointerEvent) => void;
            finish: (event: PointerEvent) => void;
          }
        | undefined;
      const canvasWidthBounds = (): { min: number; max: number } => {
        const style = getComputedStyle(editorContentEl);
        const horizontalPadding =
          (Number.parseFloat(style.paddingLeft) || 0) +
          (Number.parseFloat(style.paddingRight) || 0);
        const available = Math.max(1, editorContentEl.clientWidth - horizontalPadding);
        const configuredMaximum = Math.max(
          available,
          ...styleBreakpoints().map((breakpoint) => cssLengthPx(breakpoint.viewport) ?? 0),
        );
        return {
          min: Math.min(280, available),
          max: state.canvasViewportFit ? configuredMaximum : available,
        };
      };
      const clampCanvasWidth = (width: number): number => {
        const bounds = canvasWidthBounds();
        return Math.min(bounds.max, Math.max(bounds.min, width));
      };
      const stopCanvasResize = (pointerId?: number): void => {
        if (!activeResize) return;
        viewportResizeHandle.removeEventListener("pointermove", activeResize.move);
        viewportResizeHandle.removeEventListener("pointerup", activeResize.finish);
        viewportResizeHandle.removeEventListener("pointercancel", activeResize.finish);
        try {
          if (pointerId != null && viewportResizeHandle.hasPointerCapture?.(pointerId))
            viewportResizeHandle.releasePointerCapture(pointerId);
        } catch {
          // The capture is already gone when the pointer leaves the window.
        }
        activeResize = undefined;
        state.canvasViewportResizing = false;
      };
      const onCanvasResizeStart = (event: PointerEvent): void => {
        if (state.canvasViewportFull || event.button !== 0) return;
        event.preventDefault();
        stopCanvasResize();
        const startX = event.clientX;
        const startWidth =
          state.canvasViewportPixelWidth ||
          viewportEl.offsetWidth ||
          viewportEl.getBoundingClientRect().width ||
          cssLengthPx(state.canvasViewportWidth) ||
          390;
        const move = (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== event.pointerId) return;
          setCanvasViewportWidth(
            clampCanvasWidth(
              startWidth +
                ((moveEvent.clientX - startX) * 2) / Math.max(0.01, state.canvasViewportScale),
            ),
          );
        };
        const finish = (finishEvent: PointerEvent) => {
          if (finishEvent.pointerId !== event.pointerId) return;
          stopCanvasResize(finishEvent.pointerId);
        };
        activeResize = { pointerId: event.pointerId, move, finish };
        state.canvasViewportResizing = true;
        viewportResizeHandle.addEventListener("pointermove", move);
        viewportResizeHandle.addEventListener("pointerup", finish);
        viewportResizeHandle.addEventListener("pointercancel", finish);
        try {
          viewportResizeHandle.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is absent in a few embedded/web-test contexts.
        }
      };
      const onCanvasResizeKeydown = (event: KeyboardEvent): void => {
        if (state.canvasViewportFull || (event.key !== "ArrowLeft" && event.key !== "ArrowRight"))
          return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const step = event.shiftKey ? 50 : 10;
        const current =
          state.canvasViewportPixelWidth ||
          viewportEl.getBoundingClientRect().width ||
          cssLengthPx(state.canvasViewportWidth) ||
          390;
        setCanvasViewportWidth(clampCanvasWidth(current + direction * step));
      };
      viewportResizeHandle.addEventListener("pointerdown", onCanvasResizeStart);
      viewportResizeHandle.addEventListener("keydown", onCanvasResizeKeydown);
      viewportFitObserver = new ResizeObserver(syncCanvasViewportFit);
      viewportFitObserver.observe(editorContentEl);
      requestAnimationFrame(syncCanvasViewportFit);

      // The CORE as a shared store in the island chain (data-p-store="editor"
      // sits on the shell wrapper, above the chrome island): markup binds straight to
      // core state (history.canUndo) and core actions (undo/redo) — chrome
      // never mirrors what the editor already owns. Chrome state below is
      // presentation-only.
      Publr.store("editor", {
        state: { history: editor.history, selection: editor.selection },
        actions: { undo: () => editor.undo(), redo: () => editor.redo() },
      });

      // The IN-CANVAS chrome is the shipped batteries-included layer — the
      // same attachInlineChrome every embedder gets (floating toolbar, "/"
      // quick picker, inline + inserter). The shell hand-builds only PAGE
      // chrome: top bar, rails, sidebar, breadcrumb — and plugs its library
      // rail into the inserter's Browse-all slot: the panel's target block
      // becomes the library's insertion anchor, so picking from the rail
      // still transforms the empty block the + belonged to.
      attachInlineChrome(editor, {
        container: wrapEl,
        breakpoint: activeStyleBreakpoint,
        // one media story for the whole shell: the canvas chrome resolves the
        // same option (the shell already registered the OPFS worker when the
        // default applies — resolving twice is stateless).
        media: opts.media,
        onBrowseAll: (anchorId, placement) => {
          setInserterOpen(true);
          if (anchorId) inserterAnchorId = anchorId;
          inserterPlacement = placement ?? null;
        },
        // the toolbar's "Edit pattern" — edits THAT COPY in isolation
        onEditPattern: (_name, blockId) => openInstanceEditor(blockId),
        // the pickers' "Pattern" entry — open the full pattern dialog,
        // anchored at the target (an empty default block is replaced by the
        // dialog's eventual pick). The left rail remains a separate browsing
        // entry point, matching the CMS interaction model.
        onBrowsePatterns: (anchorId, placement) => openExplorer(anchorId, placement),
        allowBlock: (type) => {
          const definition = getBlockType(type);
          return (
            !definition?.templateOnly ||
            (!!state.templateMode && state.templateMode !== "primitive")
          );
        },
      });
      refs.syncAppearance = () => {
        const inlineChrome = wrapEl.querySelector<HTMLElement>("[data-pbe-inline-chrome]");
        copyShellChromeTokens(shellSurface, wrapEl, ...(inlineChrome ? [inlineChrome] : []));
      };

      // Library shelves ← search query, grouped by the registry's category
      // metadata; fixed shelf order, unknown categories trail.
      const CATEGORY_ORDER = ["Text", "Media", "Design"];
      const rank = (c: string) => {
        const i = CATEGORY_ORDER.indexOf(c);
        return i === -1 ? CATEGORY_ORDER.length : i;
      };
      effect(() => {
        void state.libraryEpoch; // re-derive on every open (live registry)
        const q = state.query.toLowerCase();
        const shelves = new Map<string, BlockItem[]>();
        for (const b of blockTypes()) {
          if (b.internal) continue; // parent-scoped types (list-item) never reach the inserter
          if (b.templateOnly && (!state.templateMode || state.templateMode === "primitive"))
            continue;
          const it = asItem(b);
          if (!matches(it, q)) continue;
          const cat = b.category ?? "Text";
          if (!shelves.has(cat)) shelves.set(cat, []);
          shelves.get(cat)!.push(it);
        }
        // Blocks only — patterns are compositions, not blocks: they live in
        // the Patterns tab (group flyout + explorer), never on these shelves.
        state.shelves = [...shelves.entries()]
          .sort(([a], [z]) => rank(a) - rank(z))
          .map(([name, blocks]) => ({ name, blocks }));
        state.noResults = state.shelves.length === 0;
      });

      // Patterns tab: groups from the registry's category metadata ("All"
      // leads; selection highlights both here and in the explorer).
      effect(() => {
        void state.libraryEpoch;
        const patterns = patternTypes();
        const counts = new Map<string, number>();
        for (const pattern of patterns) {
          const category = pattern.category ?? "Uncategorized";
          counts.set(category, (counts.get(category) ?? 0) + 1);
        }
        const names = ["All", ...counts.keys()];
        state.patternGroups = names.map((name) => ({
          name,
          count: name === "All" ? patterns.length : (counts.get(name) ?? 0),
          selected: name === (state.patternGroup || null),
        }));
        state.explorerGroups = names.map((name) => ({
          name,
          count: name === "All" ? patterns.length : (counts.get(name) ?? 0),
          selected: name === state.explorerGroup,
        }));
      });

      // Flyout contents: a typed search beats the group pick;
      // the pane shows whenever the Patterns tab has either.
      effect(() => {
        const q = state.patternQuery.trim().toLowerCase();
        const group = state.patternGroup;
        state.patternItems = patternTypes()
          .filter((p) =>
            q
              ? p.label.toLowerCase().includes(q) || p.name.includes(q)
              : group === "All" || (p.category ?? "Uncategorized") === group,
          )
          .map((p) => ({ name: p.name, label: p.label }));
        state.patternFlyoutTitle = q ? "Search results" : group;
        const patternsSurfaceOpen =
          (state.inserterOpen && state.inserterTab === "patterns") ||
          (state.treeOpen && state.treeTab === "patterns");
        state.patternFlyoutOpen = patternsSurfaceOpen && (!!q || !!group);
        state.patternNoResults = state.patternFlyoutOpen && state.patternItems.length === 0;
      });

      // Explorer contents: category narrows, search filters within it.
      effect(() => {
        const q = state.explorerQuery.trim().toLowerCase();
        const g = state.explorerGroup;
        state.explorerItems = patternTypes()
          .filter((p) => g === "All" || (p.category ?? "Uncategorized") === g)
          .filter((p) => !q || p.label.toLowerCase().includes(q) || p.name.includes(q))
          .map((p) => ({ name: p.name, label: p.label }));
        state.explorerNoResults = state.explorerItems.length === 0;
      });

      // Live previews are IMPERATIVE by necessity: PublrJS has no
      // HTML-injection binding (by design — same reason icons ride a sprite),
      // so the templates render empty card shells (data-pattern-preview) and
      // this pass fills each one once with the pattern's rendered fragment,
      // scaled to the card. Runs after the bindings flush (rAF).
      effect(() => {
        void state.patternItems;
        void state.explorerItems;
        void state.patternFlyoutOpen;
        void state.explorerOpen;
        void state.designPatternItems;
        void state.designWorkspaceOpen;
        void state.designWorkspacePage;
        requestAnimationFrame(fillPatternPreviews);
      });

      // List view rows: tracked via effect(syncTree) for the reactive reads
      // (selection highlight, collapse map) and called from onChange for
      // model edits — the model itself is NOT reactive by design.
      effect(syncTree);
      effect(syncOutline); // tracks docEpoch only — the outline ignores selection

      // Reveal the selection: selecting inside a collapsed container (from
      // the canvas) expands its ancestors so the highlight is visible.
      // Deliberately WRITE-ONLY on treeExpanded (no read → no subscription):
      // the effect re-runs on selection moves only, so manually collapsing a
      // container while an inner block stays selected sticks instead of
      // being re-expanded on the spot.
      effect(() => {
        const id = editor.selection.active ?? editor.selection.blocks[0];
        if (!id) return;
        const path = pathToBlock(editor.getModel().blocks, id);
        if (!path) return;
        for (const b of path.slice(0, -1)) state.treeExpanded[b.id] = true;
      });

      // Bridges: the editor's reactive selection → chrome's derived view state.
      effect(syncBlockPanel);
      effect(syncBreadcrumb);
      effect(() => {
        const compare = state.canvasResponsiveCompare;
        const mode = state.canvasViewportMode;
        const epoch = state.docEpoch;
        void mode;
        void epoch;
        if (compare) requestAnimationFrame(syncResponsiveComparison);
      });
      effect(() => {
        const selected = [...editor.selection.blocks];
        const active = editor.selection.active;
        const compare = state.canvasResponsiveCompare;
        void selected;
        void active;
        syncResponsivePreviewSelection();
        if (compare && (active ?? selected[0]))
          requestAnimationFrame(() => syncResponsiveBlockScroll(active ?? selected[0]));
      });

      // Landing on a block opens the Block tab; deselecting falls back to
      // Document. Only selection TRANSITIONS switch — editing
      // the selected block, or manually picking a tab, never fights this.
      let prevTarget = "";
      effect(() => {
        const ids = editor.selection.blocks;
        // The STICKY target counts too: while focus transits to sidebar
        // chrome (mousedown blur → focusin), the live selection reads empty
        // for a tick — flipping to the Document tab then yanks the very
        // button being clicked out from under the pointer.
        const editorTarget =
          (editor.selection.active ?? (ids.length ? ids.join(" ") : "")) || (panelTarget() ?? "");
        if (editorTarget && state.selectedTemplateNodeId) clearTemplateNodeSelection();
        const target = editorTarget || state.selectedTemplateNodeId;
        if (target === prevTarget) return;
        prevTarget = target;
        const templateNode = documentTemplateNodes().find(
          (candidate) => candidate.id === state.selectedTemplateNodeId,
        );
        state.sidebarTab = templateNode?.kind === "slot" || !target ? "document" : "block";
      });

      // The library's insertion anchor follows the caret while the panel is up.
      const onSelectionChange = () => {
        if (state.inserterOpen) inserterAnchorId = singleTarget() ?? inserterAnchorId;
      };
      canvasDocument.addEventListener("selectionchange", onSelectionChange);
      const onResponsiveCanvasClick = (event: MouseEvent) => {
        if (!state.canvasResponsiveCompare) return;
        const target =
          event.target && typeof (event.target as Element).closest === "function"
            ? (event.target as Element).closest("[data-pb-id]")
            : null;
        if (!target) return;
        const id = responsiveSelectionTarget();
        const anchorVisualTop = id ? responsiveBlockVisualTop(canvasDocument, id) : null;
        requestAnimationFrame(() => syncResponsiveBlockScroll(id, anchorVisualTop));
      };
      canvasDocument.addEventListener("click", onResponsiveCanvasClick);

      // The canvas stays structurally full-bleed. A host may apply a
      // template-level semantic content boundary through `templateWidth`;
      // themeBaseCss turns that into canvas padding, without inventing a
      // Group/container in the document model.

      // E3 boot: mount the injection target, install the host's engine (if
      // any — the demo probes wasm/dev-bridge asynchronously and installs
      // via shell.setCssEngine).
      const setEngine = (engine: typeof cssEngine, label?: string) => {
        cssEngine = engine;
        state.engineActive = !!engine;
        state.engineLabel = label ?? (engine ? "live (host engine)" : "none — build-time CSS only");
        if (engine) refreshEngineCss();
        syncDesignPanel();
      };
      setEngine(cssEngine, opts.engineLabel);
      syncCanvasThemeTokens();

      // Hand the shell object its handles (captured per boot — see ShellRefs).
      refs.editor = editor;
      refs.refreshCss = refreshEngineCss;
      refs.isIsolated = () => !!state.templateMode;
      refs.syncDesignPanel = syncDesignPanel;
      refs.applyTheme = (theme) =>
        Array.isArray(theme) ? applyTheme(theme) : applyThemeDocument(theme);
      refs.getSiteDesign = () => structuredClone(activeTheme());
      refs.hasSiteDesignChanges = () => JSON.stringify(activeTheme()) !== siteDesignSavedJson;
      refs.markSiteDesignSaved = () => {
        siteDesignSavedJson = JSON.stringify(activeTheme());
      };
      refs.openSiteDesign = () => {
        if (opts.openSiteDesign) {
          opts.openSiteDesign(editor);
          return;
        }
        state.designModeActive = true;
        state.designWorkspaceOpen = true;
        state.designWorkspacePage = "foundations";
        state.designWorkspaceHome = true;
        state.designWorkspaceSidebarShown = false;
        setInserterOpen(false);
        setTreeOpen(false);
        syncDesignPanel();
        requestAnimationFrame(fillPatternPreviews);
      };
      refs.setEngine = setEngine;
      refs.updateDocument = (document) => {
        if (document.title !== undefined) {
          state.documentTitle = document.title;
          if (!state.documentRenameOpen) state.documentRenameDraft = document.title;
        }
        if (document.featuredImage !== undefined) setDocumentImageState(document.featuredImage);
        if (!state.templateMode) mountDocumentFrame();
      };

      // Load last: onChange (wire panes + geometry syncs) touches everything
      // above. History starts clean — the initial content is not an edit.
      if (opts.content != null) {
        editor.loadHtml(opts.content);
        refreshEngineCss();
      }
      if (opts.initialDesignOpen && !opts.openSiteDesign) refs.openSiteDesign();

      return () => {
        if (primitiveToastTimer) clearTimeout(primitiveToastTimer);
        cancelResponsiveBoundaryDrag?.();
        endTreeDrag();
        window.clearTimeout(engineTimer);
        stopCanvasResize();
        viewportResizeHandle.removeEventListener("pointerdown", onCanvasResizeStart);
        viewportResizeHandle.removeEventListener("keydown", onCanvasResizeKeydown);
        viewportFitObserver?.disconnect();
        viewportFitObserver = null;
        isolationCanvasObserver?.disconnect();
        isolationCanvasObserver = null;
        canvasDocument.removeEventListener("selectionchange", onSelectionChange);
        canvasDocument.removeEventListener("click", onResponsiveCanvasClick);
        canvasDocument.removeEventListener("click", onTemplateNodeClick, true);
        canvasDocument.removeEventListener("keydown", onTemplateNodeKeydown, true);
        shellDocument.removeEventListener("mousedown", onShellBackgroundMouseDown);
        shellView.removeEventListener("resize", onShellViewportResize);
        shellView.visualViewport?.removeEventListener("resize", onShellViewportResize);
        if (boxEditorPositionFrame) shellView.cancelAnimationFrame(boxEditorPositionFrame);
        boxEditorPositionFrame = 0;
        shellRootEl = null;
        state.canvasResponsiveCompare = false;
        clearResponsiveComparison();
        removeTemplateNodeToolbar();
        clearBoxLayerPreview();
      };
    },
  };
});

// --- host UI (actions + panels) ----------------------------------------------
// Imperative on purpose: host-supplied UI is not part of the declarative
// chrome island — it renders once from options, like chrome-inline does.

const ACTION_PRIMARY =
  "flex h-8 cursor-pointer items-center rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const ACTION_QUIET =
  "flex h-8 cursor-pointer items-center rounded-lg border border-border bg-background px-3 text-[13px] font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
// aria-expanded (not aria-pressed): the shell skin already styles expanded
// top-bar toggles as tertiary selected controls (see chrome.css) — the same
// treatment the tree/inserter toggles get.
const PANEL_TOGGLE =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-xs text-foreground hover:bg-ui-accent focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-accent)] focus-visible:outline-none";

function renderHostUi(
  container: HTMLElement,
  editor: Editor,
  options: EditorShellOptions,
): (id: string, open?: boolean) => void {
  const actionsEl = container.querySelector<HTMLElement>("#host-actions");
  for (const action of options.actions ?? []) {
    if (!actionsEl) break;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.hostAction = action.id;
    btn.textContent = action.label;
    if (action.title) btn.title = action.title;
    if (action.primary) btn.dataset.hostPrimary = "";
    btn.className = action.primary ? ACTION_PRIMARY : ACTION_QUIET;
    btn.addEventListener("click", (ev) => action.onClick(editor, ev));
    actionsEl.appendChild(btn);
  }

  const togglesEl = container.querySelector<HTMLElement>("#host-panel-toggles");
  const panelsEl = container.querySelector<HTMLElement>("#host-panels");
  const toggles = new Map<string, HTMLButtonElement>();
  const panels = new Map<string, HTMLElement>();

  // A host panel REPLACES the block-settings sidebar while open (one right
  // rail at a time — the host panel is "the other mode" of that rail).
  const settingsSidebar = container.querySelector<HTMLElement>("#sidebar");
  const setOpen = (id: string, open?: boolean) => {
    const aside = panels.get(id);
    if (!aside) return;
    const next = open ?? aside.hidden;
    // One host panel at a time — opening one closes the others.
    if (next) {
      for (const [otherId, other] of panels) {
        if (otherId === id) continue;
        other.hidden = true;
        toggles.get(otherId)?.setAttribute("aria-expanded", "false");
      }
    }
    aside.hidden = !next;
    toggles.get(id)?.setAttribute("aria-expanded", String(next));
    if (settingsSidebar) {
      const anyOpen = [...panels.values()].some((p) => !p.hidden);
      settingsSidebar.style.display = anyOpen ? "none" : "";
    }
  };

  for (const panel of options.panels ?? []) {
    if (!togglesEl || !panelsEl) break;

    const aside = document.createElement("aside");
    aside.dataset.hostPanel = panel.id;
    // pbe-ui: the [hidden] armor in chrome.css — without it the `flex`
    // utility out-cascades the hidden attribute's UA display:none.
    aside.className =
      "pbe-ui flex w-80 shrink-0 flex-col overflow-hidden border-l border-border bg-background max-sm:hidden";
    aside.hidden = !panel.open;

    const head = document.createElement("div");
    head.className =
      "flex h-11 shrink-0 items-center justify-between border-b border-border px-4 text-sm font-semibold";
    const title = document.createElement("span");
    title.textContent = panel.title;
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", `Close ${panel.title}`);
    close.className =
      "flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs text-muted-foreground hover:bg-ui-accent hover:text-foreground";
    close.textContent = "×";
    close.addEventListener("click", () => setOpen(panel.id, false));
    head.append(title, close);

    const body = document.createElement("div");
    body.className = "min-h-0 flex-1 overflow-y-auto";

    aside.append(head, body);
    panelsEl.appendChild(aside);
    panels.set(panel.id, aside);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = panel.title;
    btn.setAttribute("aria-label", `Toggle ${panel.title}`);
    btn.setAttribute("aria-expanded", String(!!panel.open));
    btn.className = PANEL_TOGGLE;
    if (panel.icon) btn.innerHTML = panel.icon;
    else {
      const badge = document.createElement("span");
      badge.className = "text-[13px] font-semibold";
      badge.textContent = (panel.title[0] ?? "?").toUpperCase();
      btn.appendChild(badge);
    }
    btn.addEventListener("click", () => setOpen(panel.id));
    togglesEl.appendChild(btn);
    toggles.set(panel.id, btn);

    panel.mount(body, editor);
    if (panel.open) setOpen(panel.id, true);
  }

  return setOpen;
}

// --- the public entry ---------------------------------------------------------

/**
 * Mount the full editor harness into `container` and boot the editor inside
 * it. Resolves once the shell is hydrated and the initial content is loaded
 * (it awaits PublrJS's initial auto-hydrate pass first — see above).
 */
export async function createEditorShell(options: EditorShellOptions): Promise<EditorShell> {
  await autoHydrateDone;

  const initialTheme = withHearthDefaults(options.theme);
  if (options.patternLibrary === "theme-only") {
    for (const pattern of patternTypes()) unregisterPattern(pattern.name);
  }
  syncThemePatterns(initialTheme);
  syncThemeTemplates(initialTheme);
  shellOptions = { ...options, theme: initialTheme };
  siteDesignSavedJson = JSON.stringify(initialTheme);
  baseCss = options.baseCss ?? "";
  siteCss = options.siteCss ?? "";
  cssEngine = options.cssEngine ?? null;
  currentEngineCss = "";
  mediaAdapter = resolveMediaAdapter(options.media, { register: true });

  const container = options.container;
  container.innerHTML = shellHtml.replaceAll("<!-- pbe-token-scale -->", tokenScaleHtml);
  const shellRoot = container.querySelector<HTMLElement>("#editor-shell");
  const designBaseStyle = document.createElement("style");
  designBaseStyle.dataset.designBaseCss = "";
  designBaseStyle.textContent = `${themeBaseCss()}\n${responsiveContainerCss()}`;
  shellRoot?.appendChild(designBaseStyle);
  let appearanceItem =
    container.querySelector<HTMLButtonElement>("#menu-toggle-appearance") ?? undefined;
  let appearanceCheck =
    appearanceItem?.querySelector<SVGElement>("[data-appearance-check]") ?? undefined;
  if (options.showAppearanceToggle === false) {
    container.querySelector("#menu-appearance-control")?.remove();
    appearanceItem = undefined;
    appearanceCheck = undefined;
  }
  const setAppearance = (mode: "dark" | "light") => {
    const light = mode === "light";
    shellRoot?.classList.toggle("dark", !light);
    appearanceItem?.setAttribute("aria-checked", String(light));
    appearanceCheck?.toggleAttribute("hidden", !light);
    refs.syncAppearance?.();
  };
  appearanceItem?.addEventListener("click", () => {
    setAppearance(shellRoot?.classList.contains("dark") ? "light" : "dark");
  });
  setAppearance(options.appearance ?? "dark");
  // preview:false = the host has no preview surface; drop the button before
  // hydration rather than leaving a dead control.
  if (options.preview === false) container.querySelector("#preview")?.remove();
  if (options.showSiteDesignButton === false)
    container.querySelector("#design-system-toggle")?.remove();
  // Host tools join the ⋮ Tools menu BEFORE hydration: hydrating wires
  // data-p-portal and moves the menu to the portal root, so a later
  // container query would miss it. The items carry data-publr-part="item"
  // and inherit the menu's dismiss/keyboard handling when it hydrates;
  // clicks resolve the editor lazily (refs.editor exists once booted).
  {
    const menuEl = container.querySelector<HTMLElement>("#menu-copy-data")?.parentElement;
    for (const tool of options.tools ?? []) {
      if (!menuEl) break;
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.dataset.publrPart = "item";
      item.dataset.hostTool = tool.id;
      item.className =
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-[7px] text-left text-sm font-medium text-zinc-900 hover:bg-canvas-accent hover:text-white focus-visible:bg-canvas-accent focus-visible:text-white focus-visible:outline-none";
      item.textContent = tool.label;
      if (tool.title) item.title = tool.title;
      item.addEventListener("click", (ev) => {
        if (refs.editor) tool.onClick(refs.editor, ev);
      });
      menuEl.appendChild(item);
    }
  }
  hydrate(container);

  const editor = refs.editor;
  if (!editor) {
    throw new Error(
      "[publr-editor] createEditorShell: shell failed to boot (chrome island did not initialize)",
    );
  }

  const openPanel = renderHostUi(container, editor, options);

  return {
    editor,
    container,
    setCssEngine: (engine, label) => refs.setEngine?.(engine, label),
    refreshCss: () => refs.refreshCss?.(),
    isIsolated: () => refs.isIsolated?.() ?? false,
    syncDesignPanel: () => refs.syncDesignPanel?.(),
    applyTheme: (tokens) => refs.applyTheme?.(tokens),
    getSiteDesign: () => refs.getSiteDesign?.() ?? structuredClone(activeTheme()),
    hasSiteDesignChanges: () => refs.hasSiteDesignChanges?.() ?? false,
    markSiteDesignSaved: () => refs.markSiteDesignSaved?.(),
    openSiteDesign: () => refs.openSiteDesign?.(),
    setAppearance,
    openPanel,
    updateDocument: (document) => refs.updateDocument?.(document),
    destroy: () => {
      destroy(container);
      container.innerHTML = "";
      for (const name of installedThemePatterns) unregisterPattern(name);
      installedThemePatterns.clear();
    },
  };
}
