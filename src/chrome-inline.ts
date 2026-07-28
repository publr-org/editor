// chrome-inline.ts — the DEFAULT in-canvas UI, batteries included (story
// #313). The core stays headless: nothing here runs unless the host calls
// attachInlineChrome(editor), and bundlers tree-shake the whole module when
// it goes unused. Hosts that want their own UI import just the core.
//
// What attaches, per editor instance (N instances on a page never cross):
// - "/" in an empty default block → quick block picker: the MOST-USED shelf
//   by default, live-filtered as the user keeps typing ("/gro" → Group). The
//   caret never leaves the block — the menu is driven from the document.
// - hovering a block's top/bottom edge reveals an insertion line + → the
//   block INSERTER (search + grid), anchored before/after that exact sibling
// - both pickers offer a "Pattern" entry when the host provides
//   onBrowsePatterns — the escalation into the host's full pattern dialog
//   (patterns themselves never leak into the block lists)
// - the floating block toolbar: block indicator, move up/down, an alignment
//   DROPDOWN, bold/italic/link, and a policy-aware ⋮ action menu — dropdowns over inline
//   buttons on purpose: the toolbar will grow. A multi-selection swaps the
//   whole strip for the Group action. A block TYPE can declare its own
//   controls (registry `toolbar`) through one descriptor renderer. Inline
//   formats surface only while a rich carrier is active; media-level Link and
//   rich-text Link never share the strip.
// - the media placeholder: empty media blocks (image/video/audio/cover/
//   media-text/embed) grow a placeholder card — drag-drop / Upload (OPFS via
//   the /media/* worker) / Insert from URL.
//
// Styling is Tailwind utilities written as literals below — chrome.css
// (imported here) compiles them into dist/publr-editor.css, the lib's one
// CSS artifact. These are raw-HTML versions of Publr design-system recipes:
// semantic token colors, 8px surfaces, quiet borders, and compact controls.
//
// Two behavioral laws carried over from the demos (both were re-discovered
// the hard way — see story #313):
// - The slash check rides MODEL changes only, never selectionchange: an
//   Escape-refocused caret sitting in a block that still reads "/" must not
//   reopen the menu it just closed.
// - Chrome swallows mousedown (except the inserter's search field) so
//   clicking a control never blurs the carrier or collapses the text
//   selection it is about to act on.

import { effect } from "./publr-runtime";
import type { FieldValue } from "./carriers";
import type { Editor } from "./editor";
import { iconSvg } from "./icons";
import { resolveMediaAdapter, toImageValue } from "./media-adapter";
import type { MediaAdapter } from "./media-adapter";
import { getPattern, PATTERN_ROOT_TYPE } from "./patterns";
import { blockTypes, getBlockType } from "./registry";
import type { ToolbarSpec } from "./registry";
import { containerWidths } from "./theme";
import { locateBlock } from "./tree";
import { styleBreakpoints } from "./style";
import type { StyleBreakpoint } from "./style";
// The stylesheet behind the class literals below. The lib build extracts it
// into dist/publr-editor.css (the emitted JS carries no CSS import).
import "./chrome.css";
// The same compiled sheet is also embedded into the private in-canvas chrome
// root. The global artifact still owns canvas/component + full-shell rules;
// toolbar/picker utilities resolve inside this shadow tree as well.
import chromeCss from "./chrome.css?inline";

export interface InlineChromeOptions {
  /**
   * Positioned ancestor the floating UI parks in (defaults to the canvas's
   * parent; given position:relative when static).
   */
  container?: HTMLElement;
  /** "/" quick picker (default true). */
  slash?: boolean;
  /** Hover-edge + inserter between blocks (default true). */
  inserter?: boolean;
  /**
   * Renders a "Browse all" footer in the + inserter panel — the escalation
   * slot for hosts that have a bigger block library (the demo shell opens
   * its library rail). Hover-edge insertion supplies the exact before/after
   * placement; slash/legacy insertion supplies only the target id.
   */
  onBrowseAll?: (targetId: string | null, placement?: InlineInsertionPlacement) => void;
  /**
   * Renders a "Pattern" entry in the "/" quick picker and the + inserter
   * grid — the escalation into the host's FULL pattern selection dialog
   * (the demo shell opens its pattern explorer). Receives the same target and
   * optional placement as onBrowseAll. Absent = no entry, the pickers stay
   * blocks-only.
   */
  onBrowsePatterns?: (targetId: string | null, placement?: InlineInsertionPlacement) => void;
  /** Floating block toolbar (default true). */
  toolbar?: boolean;
  /**
   * Renders an "Edit pattern" button in the toolbar's pattern strip — the
   * hook for hosts with an isolation-editing mode over THIS COPY's blocks
   * (instances are fully decoupled; thoughts/012). Absent = no strip.
   */
  onEditPattern?: (name: string, blockId: string) => void;
  /**
   * Placeholder card on media blocks whose primary media is empty
   * (drag-drop / Upload / Insert from URL), injected next to the empty
   * carrier — canvas chrome only, serialize never sees it (default true).
   */
  mediaPlaceholder?: boolean;
  /**
   * Media persistence seam (see media-adapter.ts). true/undefined = the
   * built-in OPFS `/media/*` store (upload gated on the service worker the
   * HOST registers — standalone chrome never registers it); false = no
   * uploads (URL insertion stays); a MediaAdapter plugs the host's own
   * upload()/browse() — browse() adds "Media Library" entries to the
   * placeholder card and the toolbar's Replace menu.
   */
  media?: boolean | MediaAdapter;
  /** Host mode gate for registry blocks (for example template-only slots). */
  allowBlock?: (type: string) => boolean;
  /** Responsive authoring scope supplied by a host with viewport controls.
   * Standalone chrome edits the mobile/base scope. */
  breakpoint?: () => StyleBreakpoint;
}

export interface InlineInsertionPlacement {
  anchorId: string;
  edge: "before" | "after";
}

// --- class vocabulary (literals — the Tailwind scanner reads this file) ------

const BTN =
  "flex h-9 min-w-9 cursor-pointer items-center justify-center gap-0.5 rounded-md px-1.5 text-sm font-semibold text-foreground hover:bg-ui-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent";
// `pbe-ui` so a hidden segment actually collapses: the .flex here would beat
// the UA [hidden] rule, and only .pbe-ui[hidden] (chrome.css, unlayered) wins.
const SEGMENT = "pbe-ui flex items-stretch gap-0.5 border-r border-border p-1 last:border-r-0";
const PANEL =
  "pbe-ui absolute z-40 min-w-56 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg";
const PANEL_LABEL = "block px-2 py-1.5 text-xs font-semibold text-muted-foreground";
const ITEM =
  "flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-popover-foreground hover:bg-ui-accent hover:text-accent-foreground focus-visible:bg-ui-accent focus-visible:text-accent-foreground focus-visible:outline-none disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent";
// The current choice inside a menu (e.g. the active alignment) — the
// conventional accent ring on the selected item.
const ITEM_ACTIVE = "shadow-[inset_0_0_0_1.5px_var(--color-pbe-accent)]";
// A toggled-on toolbar button (bold while bold): a solid dark fill.
// Conflicting utilities SWAP, never stack (same layer + specificity means
// stylesheet order would decide, and text-zinc-900 happens to out-sort
// text-white) — the on-state removes the base color/hover classes.
const BTN_ON = ["bg-ui-accent", "text-accent-foreground"];
const BTN_ON_SWAPS = ["text-foreground", "hover:bg-ui-accent"];

// --- icons -------------------------------------------------------------------

const stroke = (paths: string) =>
  `<svg class="h-[15px] w-[15px]" viewBox="0 0 16 16" fill="none" aria-hidden="true">${paths}</svg>`;
const line = (d: string) =>
  `<path d="${d}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`;

const ICON_UP = iconSvg("chevron-up");
const ICON_DOWN = iconSvg("chevron-down");
const ICON_CHEVRON = iconSvg("chevron-down", "h-4 w-4");
const ICON_MORE = iconSvg("more");
const ICON_PLUS = iconSvg("plus", "h-5 w-5");
const ICON_GROUP = iconSvg("group-blocks", "h-5 w-5");
const ICON_UNGROUP = iconSvg("ungroup", "h-5 w-5");
const ICON_LINK = iconSvg("link");
const ICON_CAPTION = iconSvg("caption");

const ALIGNMENTS = [
  {
    key: "left",
    label: "Align text left",
    icon: stroke(line("M1 3.5h14") + line("M1 8h8") + line("M1 12.5h11")),
  },
  {
    key: "center",
    label: "Align text center",
    icon: stroke(line("M1 3.5h14") + line("M4 8h8") + line("M2.5 12.5h11")),
  },
  {
    key: "right",
    label: "Align text right",
    icon: stroke(line("M1 3.5h14") + line("M7 8h8") + line("M4 12.5h11")),
  },
];

// Block badges for the picker/inserter/indicator: the definition's declared
// icon name resolved against the shared set (src/icons.ts, self-contained
// inline SVG — this layer is imperative, no sprite needed); types without
// one fall back to their initial. Returns MARKUP — callers inject via h().
const badgeOf = (type: string): string => {
  const name = getBlockType(type)?.icon ?? (type === "raw-html" ? "html" : undefined);
  return (name && iconSvg(name, "h-5 w-5")) || (type[0] ?? "?").toUpperCase();
};

// --- small DOM helpers ---------------------------------------------------------

const setOn = (btn: HTMLButtonElement, on: boolean) => {
  BTN_ON.forEach((c) => btn.classList.toggle(c, on));
  BTN_ON_SWAPS.forEach((c) => btn.classList.toggle(c, !on));
};

// A reusable URL + open-in-new-tab popover, driven per open() by the caller's
// current value and apply/remove callbacks — shared by the block-level media
// link and the inline rich-text link (each supplies its own read/write).
interface LinkPopover {
  el: HTMLElement;
  open: (
    trigger: HTMLElement,
    opts: {
      href: string;
      target: string;
      canRemove: boolean;
      onApply: (href: string, target: string) => void;
      onRemove: () => void;
    },
  ) => void;
}

/**
 * Attach the default in-canvas UI to an editor instance. Everything is
 * scoped to that instance; returns a detach function that removes the UI and
 * all document-level listeners.
 */
export function attachInlineChrome(editor: Editor, options: InlineChromeOptions = {}): () => void {
  const withSlash = options.slash ?? true;
  const withInserter = options.inserter ?? true;
  const withToolbar = options.toolbar ?? true;
  const withMediaPlaceholder = options.mediaPlaceholder ?? true;
  const mediaAdapter = resolveMediaAdapter(options.media);
  const activeBreakpoint = (): StyleBreakpoint => options.breakpoint?.() ?? "base";

  const canvas = editor.canvas;
  const ownerDocument = canvas.ownerDocument;
  const ownerWindow = ownerDocument.defaultView ?? window;
  // Imperative chrome belongs to the editable document's realm. Keeping
  // creation and selection here is what makes the same layer work when the
  // canvas is hosted in an iframe for real responsive media queries.
  const h = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    html?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = ownerDocument.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  };
  const button = (className: string, html: string, title?: string): HTMLButtonElement => {
    const node = h("button", className, html);
    node.type = "button";
    if (title) {
      node.title = title;
      node.setAttribute("aria-label", title);
    }
    return node;
  };
  const copyText = async (text: string): Promise<void> => {
    if (ownerWindow.navigator.clipboard?.writeText) {
      await ownerWindow.navigator.clipboard.writeText(text);
      return;
    }
    const input = ownerDocument.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.cssText = "position:fixed;opacity:0";
    ownerDocument.body.appendChild(input);
    input.select();
    ownerDocument.execCommand("copy");
    input.remove();
  };
  const host = options.container ?? canvas.parentElement;
  if (!host) throw new Error("PublrEditor: attachInlineChrome needs a positioned container");
  if (ownerWindow.getComputedStyle(host).position === "static") host.style.position = "relative";
  canvas.classList.add("pbe-canvas"); // scope hook for the shipped canvas-owned CSS

  // All floating/in-canvas chrome shares one hard cascade boundary. The host
  // fills the positioning container but is pointer-transparent; its mounted
  // controls opt back into hit testing. Site CSS cannot select into this root,
  // and the utility sheet inside it cannot select website content outside.
  const chromeHost = ownerDocument.createElement("pbe-inline-chrome");
  chromeHost.setAttribute("data-pbe-inline-chrome", "");
  chromeHost.setAttribute("data-pbe-keep-selection", "");
  for (const name of [
    "background",
    "foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "border",
    "input",
    "ring",
  ]) {
    const property = `--pbe-chrome-${name}`;
    const value = ownerWindow.getComputedStyle(host).getPropertyValue(property).trim();
    if (value) chromeHost.style.setProperty(property, value);
  }
  const chromeRoot = chromeHost.attachShadow({ mode: "open" });
  const chromeStyle = ownerDocument.createElement("style");
  chromeStyle.textContent = `${chromeCss}\n
    :host {
      all: initial;
      position: absolute;
      inset: 0;
      display: block;
      overflow: visible;
      pointer-events: none;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .pbe-inline-chrome-layer {
      position: absolute;
      inset: 0;
      overflow: visible;
      pointer-events: none;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 16px;
      line-height: 1.5;
      color: var(--pbe-chrome-foreground, #18181b);
      --color-background: var(--pbe-chrome-background, #fff);
      --color-foreground: var(--pbe-chrome-foreground, #18181b);
      --color-popover: var(--pbe-chrome-popover, #fff);
      --color-popover-foreground: var(--pbe-chrome-popover-foreground, #18181b);
      --color-primary: var(--pbe-chrome-primary, #287cc1);
      --color-primary-foreground: var(--pbe-chrome-primary-foreground, #fff);
      --color-muted: var(--pbe-chrome-muted, #f4f4f5);
      --color-muted-foreground: var(--pbe-chrome-muted-foreground, #71717a);
      --color-ui-accent: var(--pbe-chrome-accent, #f4f4f5);
      --color-accent: var(--pbe-chrome-primary, #287cc1);
      --color-accent-foreground: var(--pbe-chrome-accent-foreground, #27272a);
      --color-border: var(--pbe-chrome-border, #e4e4e7);
      --color-input: var(--pbe-chrome-input, #d4d4d8);
      --color-ring: var(--pbe-chrome-ring, #287cc1);
      --color-pbe-accent: var(--pbe-chrome-ring, #287cc1);
      --spacing: 0.25rem;
      --text-sm: 0.875rem;
      --text-sm--line-height: 1.25rem;
      --radius-md: 0.375rem;
      --radius-lg: 0.5rem;
    }
    .pbe-inline-chrome-layer > * { pointer-events: auto; }
    .pbe-hover-outline,
    .pbe-hover-outline *,
    .pbe-hover-label,
    .pbe-hover-label * {
      pointer-events: none;
    }
  `;
  const chromeLayer = ownerDocument.createElement("div");
  chromeLayer.className = "pbe-inline-chrome-layer";
  chromeRoot.append(chromeStyle, chromeLayer);
  host.appendChild(chromeHost);

  let detached = false;
  const disposers: (() => void)[] = [];
  const mounted: HTMLElement[] = [];
  const mount = <T extends HTMLElement>(el: T): T => {
    chromeLayer.appendChild(el);
    mounted.push(el);
    return el;
  };
  const listen = <K extends keyof DocumentEventMap>(
    type: K,
    fn: (e: DocumentEventMap[K]) => void,
  ) => {
    ownerDocument.addEventListener(type, fn);
    disposers.push(() => ownerDocument.removeEventListener(type, fn));
  };

  const rootOf = (id: string) =>
    canvas.querySelector<HTMLElement>(`[data-pb-id="${CSS.escape(id)}"]`);

  // ---------------------------------------------------------------------------
  // block hover preselection
  // ---------------------------------------------------------------------------
  // Default-mode blocks use the same inspect-then-act vocabulary as browser
  // DevTools: moving over the canvas reveals the exact block box and its
  // identity; clicking that surface hands off to the editor's existing
  // caret/block flow. Content-only descendants of an opaque placed pattern
  // deliberately opt out — direct copy editing there remains unchanged.

  canvas.classList.add("pbe-block-hover-model");
  const hoverOutline = withToolbar
    ? mount(h("div", "pbe-ui pbe-hover-outline absolute z-20"))
    : null;
  const hoverLabel = withToolbar
    ? mount(
        h(
          "div",
          "pbe-ui pbe-hover-label absolute z-20 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-semibold shadow-md",
        ),
      )
    : null;
  const hoverIcon = hoverLabel ? h("span", "flex size-4 items-center justify-center") : null;
  const hoverName = hoverLabel ? h("span", "whitespace-nowrap") : null;
  const hoverBoxClip = hoverOutline ? h("div", "pbe-hover-box-clip") : null;
  if (hoverOutline && hoverBoxClip) hoverOutline.appendChild(hoverBoxClip);
  const hoverPart = (name: string, clipped = true) => {
    const part = h("div", `pbe-hover-box-part pbe-hover-${name}`);
    part.dataset.boxPart = name;
    (clipped ? hoverBoxClip : hoverOutline)?.appendChild(part);
    return part;
  };
  const hoverBoxParts = hoverOutline
    ? {
        content: hoverPart("content"),
        paddingTop: hoverPart("padding-top"),
        paddingRight: hoverPart("padding-right"),
        paddingBottom: hoverPart("padding-bottom"),
        paddingLeft: hoverPart("padding-left"),
        borderTop: hoverPart("border-top"),
        borderRight: hoverPart("border-right"),
        borderBottom: hoverPart("border-bottom"),
        borderLeft: hoverPart("border-left"),
        marginTop: hoverPart("margin-top", false),
        marginRight: hoverPart("margin-right", false),
        marginBottom: hoverPart("margin-bottom", false),
        marginLeft: hoverPart("margin-left", false),
      }
    : null;
  if (hoverLabel && hoverIcon && hoverName) {
    hoverLabel.append(hoverIcon, hoverName);
    hoverLabel.setAttribute("aria-hidden", "true");
  }
  if (hoverOutline) hoverOutline.hidden = true;
  if (hoverLabel) hoverLabel.hidden = true;

  let hoverId: string | null = null;
  let hoverLayoutParts: HTMLElement[] = [];

  const radiusPair = (value: string): [number, number] => {
    const parts = value.split(/\s+/).map((part) => Number.parseFloat(part) || 0);
    return [parts[0] ?? 0, parts[1] ?? parts[0] ?? 0];
  };

  // DOM hit testing uses an element's rectangular border box even where a
  // rounded corner paints nothing. Skip such a child and reveal its
  // underlying block parent, matching the DevTools element picker.
  const pointHitsPaintedBox = (
    root: HTMLElement,
    x: number,
    y: number,
    rect = root.getBoundingClientRect(),
    style = ownerWindow.getComputedStyle(root),
  ): boolean => {
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
    const corners = [
      ["borderTopLeftRadius", rect.left, rect.top, 1, 1],
      ["borderTopRightRadius", rect.right, rect.top, -1, 1],
      ["borderBottomRightRadius", rect.right, rect.bottom, -1, -1],
      ["borderBottomLeftRadius", rect.left, rect.bottom, 1, -1],
    ] as const;
    for (const [prop, edgeX, edgeY, dirX, dirY] of corners) {
      const [rx0, ry0] = radiusPair(style[prop]);
      const rx = Math.min(rx0, rect.width / 2);
      const ry = Math.min(ry0, rect.height / 2);
      if (!rx || !ry) continue;
      const dx = (x - (edgeX + dirX * rx)) / rx;
      const dy = (y - (edgeY + dirY * ry)) / ry;
      const inCorner = dirX > 0 ? x < edgeX + rx : x > edgeX - rx;
      const inCornerY = dirY > 0 ? y < edgeY + ry : y > edgeY - ry;
      if (inCorner && inCornerY && dx * dx + dy * dy > 1) return false;
    }
    return true;
  };

  const blockDepth = (root: HTMLElement): number => {
    let depth = 0;
    for (
      let parent = root.parentElement;
      parent && parent !== canvas;
      parent = parent.parentElement
    )
      if (parent.matches("[data-pb-id]")) depth++;
    return depth;
  };

  const expandedByMargins = (rect: DOMRect, style: CSSStyleDeclaration): DOMRect => {
    const margin = (prop: "marginTop" | "marginRight" | "marginBottom" | "marginLeft") =>
      Number.parseFloat(style[prop]) || 0;
    const top = rect.top - margin("marginTop");
    const left = rect.left - margin("marginLeft");
    return new ownerWindow.DOMRect(
      left,
      top,
      rect.width + margin("marginLeft") + margin("marginRight"),
      rect.height + margin("marginTop") + margin("marginBottom"),
    );
  };

  const containsPoint = (rect: DOMRect, x: number, y: number) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

  const hoverEligible = (root: HTMLElement): boolean => {
    const id = root.dataset.pbId;
    if (!id || editor.editingMode(id) !== "default") return false;
    // A placed pattern in the page editor remains its established direct
    // content-editing surface. Isolation editors remove this class, making
    // every nested block eligible again.
    return !(canvas.classList.contains("pbe-patterns-opaque") && editor.patternContext(id));
  };

  // Event targets cannot describe layout space: a child's margin belongs to
  // its parent for DOM hit testing, and flex/grid gaps and container padding
  // often target an otherwise unhelpful descendant. Inspect every block box
  // geometrically instead. The deepest matching box wins; margin boxes count
  // as part of their block, while an unpainted rounded corner deliberately
  // falls through to the enclosing container.
  const hoverTargetAt = (clientX: number, clientY: number): HTMLElement | null => {
    const candidates: Array<{
      root: HTMLElement;
      depth: number;
      area: number;
    }> = [];
    for (const root of canvas.querySelectorAll<HTMLElement>("[data-pb-id]")) {
      if (!hoverEligible(root)) continue;
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = ownerWindow.getComputedStyle(root);
      const inBorderBox = containsPoint(rect, clientX, clientY);
      const inMarginBox =
        inBorderBox || containsPoint(expandedByMargins(rect, style), clientX, clientY);
      if (!inMarginBox) continue;
      if (inBorderBox && !pointHitsPaintedBox(root, clientX, clientY, rect, style)) continue;
      candidates.push({
        root,
        depth: blockDepth(root),
        area: rect.width * rect.height,
      });
    }
    return candidates.sort((a, b) => b.depth - a.depth || a.area - b.area)[0]?.root ?? null;
  };

  const hideHover = () => {
    hoverId = null;
    hoverLayoutParts.forEach((part) => part.remove());
    hoverLayoutParts = [];
    if (hoverOutline) {
      delete hoverOutline.dataset.target;
      delete hoverOutline.dataset.layout;
      hoverOutline.hidden = true;
    }
    if (hoverLabel) {
      delete hoverLabel.dataset.target;
      hoverLabel.hidden = true;
    }
  };

  const px = (value: string): number => Math.max(0, Number.parseFloat(value) || 0);
  const signedPx = (value: string): number => Number.parseFloat(value) || 0;

  const placeHoverPart = (
    part: HTMLElement,
    left: number,
    top: number,
    width: number,
    height: number,
  ) => {
    const visible = width > 0 && height > 0;
    part.hidden = !visible;
    if (!visible) return;
    part.style.left = `${left}px`;
    part.style.top = `${top}px`;
    part.style.width = `${width}px`;
    part.style.height = `${height}px`;
  };

  const syncHoverBoxModel = (
    rect: DOMRect,
    style: CSSStyleDeclaration,
  ): { left: number; top: number; width: number; height: number } => {
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
    const innerBorderWidth = Math.max(0, rect.width - border.left - border.right);
    const innerBorderHeight = Math.max(0, rect.height - border.top - border.bottom);
    const content = {
      left: border.left + padding.left,
      top: border.top + padding.top,
      width: Math.max(0, innerBorderWidth - padding.left - padding.right),
      height: Math.max(0, innerBorderHeight - padding.top - padding.bottom),
    };

    if (hoverBoxParts) {
      placeHoverPart(
        hoverBoxParts.marginTop,
        -margin.left,
        -margin.top,
        rect.width + margin.left + margin.right,
        margin.top,
      );
      placeHoverPart(hoverBoxParts.marginRight, rect.width, 0, margin.right, rect.height);
      placeHoverPart(
        hoverBoxParts.marginBottom,
        -margin.left,
        rect.height,
        rect.width + margin.left + margin.right,
        margin.bottom,
      );
      placeHoverPart(hoverBoxParts.marginLeft, -margin.left, 0, margin.left, rect.height);

      placeHoverPart(hoverBoxParts.borderTop, 0, 0, rect.width, border.top);
      placeHoverPart(
        hoverBoxParts.borderRight,
        rect.width - border.right,
        border.top,
        border.right,
        innerBorderHeight,
      );
      placeHoverPart(
        hoverBoxParts.borderBottom,
        0,
        rect.height - border.bottom,
        rect.width,
        border.bottom,
      );
      placeHoverPart(hoverBoxParts.borderLeft, 0, border.top, border.left, innerBorderHeight);

      placeHoverPart(
        hoverBoxParts.paddingTop,
        border.left,
        border.top,
        innerBorderWidth,
        padding.top,
      );
      placeHoverPart(
        hoverBoxParts.paddingRight,
        rect.width - border.right - padding.right,
        border.top + padding.top,
        padding.right,
        content.height,
      );
      placeHoverPart(
        hoverBoxParts.paddingBottom,
        border.left,
        rect.height - border.bottom - padding.bottom,
        innerBorderWidth,
        padding.bottom,
      );
      placeHoverPart(
        hoverBoxParts.paddingLeft,
        border.left,
        border.top + padding.top,
        padding.left,
        content.height,
      );
      placeHoverPart(
        hoverBoxParts.content,
        content.left,
        content.top,
        content.width,
        content.height,
      );
    }
    return content;
  };

  const syncHoverLayout = (
    root: HTMLElement,
    block: NonNullable<ReturnType<Editor["getBlock"]>>,
    rect: DOMRect,
    style: CSSStyleDeclaration,
    content: { left: number; top: number; width: number; height: number },
  ) => {
    hoverLayoutParts.forEach((part) => part.remove());
    hoverLayoutParts = [];
    if (!hoverOutline) return;
    const display = style.display;
    const layout = display.includes("grid") ? "grid" : display.includes("flex") ? "flex" : null;
    if (!layout) {
      delete hoverOutline.dataset.layout;
      return;
    }
    hoverOutline.dataset.layout = layout;

    const children = (block.children ?? [])
      .map((child) => rootOf(child.id))
      .filter((child): child is HTMLElement => !!child)
      .map((child) => ({
        child,
        rect: child.getBoundingClientRect(),
        style: ownerWindow.getComputedStyle(child),
      }))
      .filter(({ rect: childRect }) => childRect.width > 0 && childRect.height > 0);

    const addLayoutPart = (
      kind: "item" | "gap",
      left: number,
      top: number,
      width: number,
      height: number,
    ) => {
      if (width <= 0 || height <= 0) return;
      const part = h("div", `pbe-hover-layout-${kind}`);
      part.dataset.layoutPart = kind;
      (hoverBoxClip ?? hoverOutline).appendChild(part);
      placeHoverPart(part, left, top, width, height);
      hoverLayoutParts.push(part);
    };

    // Mark distributed free space as well as authored `gap`: DevTools' flex
    // and grid overlays explain where layout space comes from even when
    // justify-content, track sizing, or spanning creates more than the literal
    // row/column-gap value.
    const gapKeys = new Set<string>();
    const addGap = (left: number, top: number, width: number, height: number) => {
      const key = [left, top, width, height].map((value) => Math.round(value * 10) / 10).join(":");
      if (gapKeys.has(key)) return;
      gapKeys.add(key);
      addLayoutPart("gap", left - rect.left, top - rect.top, width, height);
    };

    const contentRect = {
      left: rect.left + content.left,
      top: rect.top + content.top,
      right: rect.left + content.left + content.width,
      bottom: rect.top + content.top + content.height,
      width: content.width,
      height: content.height,
    };

    // A non-wrapping flex container is one-dimensional. DevTools visualizes
    // its SLOTS, not each child's incidental max-width: item bands and all
    // leading/inter-item/trailing free space span the full cross axis.
    if (layout === "flex" && style.flexWrap === "nowrap") {
      const column = style.flexDirection.startsWith("column");
      const ordered = children
        .map(({ rect: childRect, style: childStyle }) => ({
          rect: childRect,
          marginStart: column ? signedPx(childStyle.marginTop) : signedPx(childStyle.marginLeft),
          marginEnd: column ? signedPx(childStyle.marginBottom) : signedPx(childStyle.marginRight),
        }))
        .sort((a, b) => (column ? a.rect.top - b.rect.top : a.rect.left - b.rect.left));
      for (const { rect: childRect, marginStart, marginEnd } of ordered) {
        if (column) {
          const top = Math.max(contentRect.top, childRect.top - marginStart);
          const bottom = Math.min(contentRect.bottom, childRect.bottom + marginEnd);
          addLayoutPart("item", content.left, top - rect.top, content.width, bottom - top);
        } else {
          const left = Math.max(contentRect.left, childRect.left - marginStart);
          const right = Math.min(contentRect.right, childRect.right + marginEnd);
          addLayoutPart("item", left - rect.left, content.top, right - left, content.height);
        }
      }
      if (ordered.length) {
        let edge = column ? contentRect.top : contentRect.left;
        for (const { rect: childRect, marginStart, marginEnd } of ordered) {
          const start = (column ? childRect.top : childRect.left) - marginStart;
          const end = (column ? childRect.bottom : childRect.right) + marginEnd;
          if (start - edge > 0.5) {
            if (column) addGap(contentRect.left, edge, contentRect.width, start - edge);
            else addGap(edge, contentRect.top, start - edge, contentRect.height);
          }
          edge = Math.max(edge, end);
        }
        const end = column ? contentRect.bottom : contentRect.right;
        if (end - edge > 0.5) {
          if (column) addGap(contentRect.left, edge, contentRect.width, end - edge);
          else addGap(edge, contentRect.top, end - edge, contentRect.height);
        }
      }
      return;
    }

    // Resolved grid templates are reported in pixels by getComputedStyle.
    // Use those tracks directly so max-width content still reads as occupying
    // its full grid cell, and gutters span the entire opposing axis.
    const trackSizes = (value: string): number[] =>
      [...value.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)px(?=\s|$)/g)]
        .map((match) => Number.parseFloat(match[1]))
        .filter((size) => size > 0);
    if (layout === "grid") {
      const columns = trackSizes(style.gridTemplateColumns);
      const rows = trackSizes(style.gridTemplateRows);
      if (columns.length || rows.length) {
        const columnGap = px(style.columnGap);
        const rowGap = px(style.rowGap);
        const columnTracks = columns.length ? columns : [content.width];
        const rowTracks = rows.length ? rows : [content.height];
        let top = content.top;
        for (let row = 0; row < rowTracks.length; row++) {
          let left = content.left;
          for (let column = 0; column < columnTracks.length; column++) {
            addLayoutPart("item", left, top, columnTracks[column], rowTracks[row]);
            left += columnTracks[column];
            if (column < columnTracks.length - 1) left += columnGap;
          }
          top += rowTracks[row];
          if (row < rowTracks.length - 1) top += rowGap;
        }
        let gapLeft = content.left;
        for (let column = 0; column < columnTracks.length - 1; column++) {
          gapLeft += columnTracks[column];
          addLayoutPart("gap", gapLeft, content.top, columnGap, content.height);
          gapLeft += columnGap;
        }
        let gapTop = content.top;
        for (let row = 0; row < rowTracks.length - 1; row++) {
          gapTop += rowTracks[row];
          addLayoutPart("gap", content.left, gapTop, content.width, rowGap);
          gapTop += rowGap;
        }
        return;
      }
    }

    // Wrapped flex and implicit-grid fallback: literal item bounds plus the
    // nearest horizontal/vertical free-space relationships remain the most
    // truthful geometry when the browser exposes no resolved track list.
    for (const { rect: childRect, style: childStyle } of children) {
      const margin =
        layout === "flex"
          ? {
              top: signedPx(childStyle.marginTop),
              right: signedPx(childStyle.marginRight),
              bottom: signedPx(childStyle.marginBottom),
              left: signedPx(childStyle.marginLeft),
            }
          : { top: 0, right: 0, bottom: 0, left: 0 };
      addLayoutPart(
        "item",
        childRect.left - margin.left - rect.left,
        childRect.top - margin.top - rect.top,
        childRect.width + margin.left + margin.right,
        childRect.height + margin.top + margin.bottom,
      );
    }
    for (const { rect: from } of children) {
      const rightNeighbor = children
        .map(({ rect: candidate }) => candidate)
        .filter(
          (candidate) =>
            candidate.left >= from.right - 0.5 &&
            Math.min(from.bottom, candidate.bottom) - Math.max(from.top, candidate.top) > 1,
        )
        .sort((a, b) => a.left - b.left)[0];
      if (rightNeighbor && rightNeighbor.left - from.right > 0.5) {
        const top = Math.max(from.top, rightNeighbor.top);
        const bottom = Math.min(from.bottom, rightNeighbor.bottom);
        addGap(from.right, top, rightNeighbor.left - from.right, bottom - top);
      }

      const belowNeighbor = children
        .map(({ rect: candidate }) => candidate)
        .filter(
          (candidate) =>
            candidate.top >= from.bottom - 0.5 &&
            Math.min(from.right, candidate.right) - Math.max(from.left, candidate.left) > 1,
        )
        .sort((a, b) => a.top - b.top)[0];
      if (belowNeighbor && belowNeighbor.top - from.bottom > 0.5) {
        const left = Math.max(from.left, belowNeighbor.left);
        const right = Math.min(from.right, belowNeighbor.right);
        addGap(left, from.bottom, right - left, belowNeighbor.top - from.bottom);
      }
    }
  };

  const positionHover = () => {
    if (!hoverId || !hoverOutline || !hoverLabel) return;
    const root = rootOf(hoverId);
    const block = editor.getBlock(hoverId);
    if (!root || !block) return hideHover();
    const rect = root.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return hideHover();

    hoverOutline.hidden = false;
    hoverOutline.dataset.target = hoverId;
    hoverOutline.style.width = `${rect.width}px`;
    hoverOutline.style.height = `${rect.height}px`;
    park(hoverOutline, rect.top, rect.left);
    const style = ownerWindow.getComputedStyle(root);
    for (const prop of [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
    ] as const) {
      hoverOutline.style[prop] = style[prop];
      if (hoverBoxClip) hoverBoxClip.style[prop] = style[prop];
    }
    const content = syncHoverBoxModel(rect, style);
    syncHoverLayout(root, block, rect, style, content);

    const def = getBlockType(block.type);
    hoverIcon!.innerHTML = badgeOf(block.type);
    hoverName!.textContent = def?.label ?? (block.type === "raw-html" ? "HTML" : block.type);
    hoverLabel.hidden = false;
    hoverLabel.dataset.target = hoverId;
    let labelLeft = Math.min(
      Math.max(rect.left + 4, canvasRect.left + 4),
      Math.max(canvasRect.left + 4, canvasRect.right - hoverLabel.offsetWidth - 4),
    );
    const above = rect.top - hoverLabel.offsetHeight - 4;
    let labelTop =
      above >= canvasRect.top
        ? above
        : Math.min(rect.top + 4, canvasRect.bottom - hoverLabel.offsetHeight - 4);

    // Floating editor chrome may occupy the same space above a neighboring
    // block. Treat the open edit toolbar and visible add-block sentinel as
    // obstacles, lifting the compact identity bar above each collision.
    // Re-check after every move because clearing the sentinel can place the
    // label into a toolbar immediately above it.
    const obstacles: DOMRect[] = [];
    if (toolbar && !toolbar.hidden) obstacles.push(toolbar.getBoundingClientRect());
    if (appender.style.visibility === "visible") obstacles.push(appender.getBoundingClientRect());
    for (let attempt = 0; attempt <= obstacles.length; attempt++) {
      const labelRight = labelLeft + hoverLabel.offsetWidth;
      const labelBottom = labelTop + hoverLabel.offsetHeight;
      const collision = obstacles.find(
        (obstacle) =>
          labelLeft < obstacle.right &&
          labelRight > obstacle.left &&
          labelTop < obstacle.bottom &&
          labelBottom > obstacle.top,
      );
      if (!collision) break;
      const chromeGap = 4;
      const aboveChrome = collision.top - hoverLabel.offsetHeight - chromeGap;
      if (aboveChrome >= 0) {
        labelTop = aboveChrome;
      } else if (collision.right + chromeGap + hoverLabel.offsetWidth <= canvasRect.right) {
        labelLeft = collision.right + chromeGap;
        labelTop = Math.max(0, collision.top);
      } else {
        labelTop = collision.bottom + chromeGap;
      }
    }
    park(hoverLabel, labelTop, labelLeft);
  };

  const isCanvasRootContainer = (root: HTMLElement): boolean => {
    const parentBlock = root.parentElement?.closest<HTMLElement>("[data-pb-id]");
    if (
      !root.classList.contains("pbe-container") ||
      (parentBlock && canvas.contains(parentBlock)) ||
      !canvas.contains(root)
    )
      return false;
    const topLevel = [...canvas.querySelectorAll<HTMLElement>("[data-pb-id]")].filter(
      (candidate) => {
        const parent = candidate.parentElement?.closest<HTMLElement>("[data-pb-id]");
        return !parent || !canvas.contains(parent);
      },
    );
    return topLevel.length === 1 && topLevel[0] === root;
  };

  const toolbarProtectsHoverRoot = (root: HTMLElement): boolean => {
    if (!toolbar || toolbar.hidden || !toolbarAnchorId) return false;
    // The composition's outer boundary must always stay discoverable. It is
    // the one ancestor whose markers remain available even while its own
    // toolbar—or a descendant's toolbar—is active.
    if (isCanvasRootContainer(root)) return false;
    const targetIds = new Set([
      toolbarAnchorId,
      ...(editor.selection.active ? [editor.selection.active] : []),
      ...editor.selection.blocks,
    ]);
    for (const id of targetIds) {
      const target = rootOf(id);
      if (target && (root === target || root.contains(target))) return true;
    }
    return false;
  };

  const syncHoverAt = (event: PointerEvent) => {
    if (!hoverOutline || !hoverLabel || event.buttons) return hideHover();
    const root = hoverTargetAt(event.clientX, event.clientY);
    const id = root?.dataset.pbId ?? null;
    if (!root || !id) return hideHover();
    // Once a toolbar is active, its target is already in the edit phase.
    // Suppress the inspect veil for that target and every enclosing block:
    // otherwise hovering selected media tints it, while hovering around an
    // active text carrier paints its parent Group/Grid over the live toolbar.
    // Descendants and unrelated siblings remain inspectable.
    if (toolbarProtectsHoverRoot(root)) return hideHover();
    hoverId = id;
    positionHover();
  };

  // The inspect layer never owns a click. It only retires its current visual
  // marker while the authoritative editor selection/caret path handles the
  // gesture.
  listen("mousedown", () => hideHover());

  const deepActiveElement = (): Element | null => {
    let active: Element | null = ownerDocument.activeElement;
    while (active instanceof ownerWindow.HTMLElement && active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  };

  const plainText = (html: FieldValue | undefined): string => {
    const d = ownerDocument.createElement("div");
    d.innerHTML = typeof html === "string" ? html : "";
    return d.textContent ?? "";
  };

  // Escape from a block-anchored panel: put the caret back at the end.
  const refocusCarrier = (id: string) => {
    const root = rootOf(id);
    const carrier =
      root &&
      (root.matches("[data-pb-rich],[data-pb-text]")
        ? root
        : root.querySelector<HTMLElement>("[data-pb-rich],[data-pb-text]"));
    if (!carrier) return;
    carrier.focus({ preventScroll: true });
    const range = ownerDocument.createRange();
    range.selectNodeContents(carrier);
    range.collapse(false);
    const sel = ownerWindow.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  // Park `el` against the host at viewport coords (top/left in px).
  const park = (el: HTMLElement, top: number, left: number) => {
    const fr = host.getBoundingClientRect();
    el.style.top = `${top - fr.top}px`;
    el.style.left = `${Math.max(0, left - fr.left)}px`;
  };

  // The scrolling ancestor the sticky toolbar clamps against — the canvas
  // viewport, not the whole page. Null when nothing above host scrolls (the
  // toolbar then just floats above its block, no sticking needed).
  const scrollParent = (el: HTMLElement): HTMLElement | null => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const oy = ownerWindow.getComputedStyle(p).overflowY;
      if (oy === "auto" || oy === "scroll") return p;
    }
    return null;
  };
  const scroller = scrollParent(host);
  const STICKY_GAP = 10; // toolbar-to-block breathing room while floating above
  const STICKY_MARGIN = 8; // gap from the viewport top once stuck

  // Linear keyboard nav shared by every menu-shaped panel.
  const wireMenuKeys = (panel: HTMLElement, onEscape: () => void) =>
    panel.addEventListener("keydown", (e) => {
      const items = [...panel.querySelectorAll<HTMLButtonElement>("button:not([hidden])")].filter(
        (b) => !b.disabled,
      );
      const cur = items.indexOf(deepActiveElement() as HTMLButtonElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next =
          e.key === "ArrowDown"
            ? cur < items.length - 1
              ? cur + 1
              : 0
            : cur > 0
              ? cur - 1
              : items.length - 1;
        items[next]?.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      }
    });

  // ONE floating surface open at a time, across all parts of this instance.
  type Panel = { el: HTMLElement; onClose?: () => void };
  let openPanel: Panel | null = null;
  function showPanel(p: Panel) {
    closePanel();
    openPanel = p;
    p.el.hidden = false;
  }
  function closePanel() {
    if (!openPanel) return;
    const p = openPanel;
    openPanel = null;
    p.el.hidden = true;
    p.onClose?.();
  }

  // Slash/legacy pickers transform targetId. The hover-edge inserter instead
  // carries an explicit sibling placement and inserts without a placeholder.
  let targetId: string | null = null;
  let insertionPlacement: InlineInsertionPlacement | null = null;
  let insertionAtEmptyRoot = false;

  const pickBlock = (type: string) => {
    const id = targetId;
    const placement = insertionPlacement;
    const atEmptyRoot = insertionAtEmptyRoot;
    targetId = null;
    insertionPlacement = null;
    insertionAtEmptyRoot = false;
    closePanel();
    if (placement) editor.insertBlockAdjacent(placement.anchorId, placement.edge, type);
    else if (atEmptyRoot) editor.insertBlock(type);
    else if (id && editor.getBlock(id)) editor.replaceBlock(id, type); // focuses the fresh block
  };

  // Inserter hygiene (story #370): the pickers offer what the TARGET's slot
  // takes — a declared allowedChildren list verbatim (internal types
  // included: inside an accordion the item IS the offering), otherwise every
  // non-internal type. Mirrors the replaceBlock slot gate, so nothing listed
  // ever no-ops, and parent-scoped types (list-item, column, accordion-item,
  // social-link) never leak into a foreign context. Patterns are deliberately
  // NOT offered here — they are compositions, not blocks, and live in the
  // host's Patterns surface (demo: the rail's Patterns tab + explorer).
  const parentIdOf = (id: string | null) =>
    (id ? locateBlock(editor.getModel().blocks, id)?.parent?.id : null) ?? null;
  const pickerTypes = (id: string | null) => {
    const parentId = parentIdOf(id);
    if (parentId && editor.editingMode(parentId) !== "default") return [];
    // Nested slot → block-def allowedChildren ∩ slot policy (D2); ROOT → the
    // editor's allowedBlocks policy (B2). Both via canInsertInto so the picker
    // never offers a type the primitive would refuse. Empty at root → inserter hidden.
    return blockTypes().filter(
      (b) =>
        (parentId || !b.internal) &&
        (options.allowBlock?.(b.type) ?? !b.templateOnly) &&
        editor.canInsertInto(parentId, b.type),
    );
  };

  // The pickers' DEFAULT shelf: FIVE most-used types (a most-used list),
  // topped up from the slot's offering when some aren't available — the
  // "Pattern" entry leads the shelf, making six rows total. Search/typing
  // reaches the full offering — this only curates the resting state so
  // neither picker opens as a 40-block wall.
  const MOST_USED = ["paragraph", "heading", "image", "quote", "list", "group"];
  const QUICK_LIMIT = 5;
  const mostUsedOf = <T extends { type: string }>(types: T[]): T[] => {
    const picks = MOST_USED.map((t) => types.find((b) => b.type === t)).filter((b): b is T => !!b);
    for (const b of types) {
      if (picks.length >= QUICK_LIMIT) break;
      if (!picks.includes(b)) picks.push(b);
    }
    return picks.slice(0, QUICK_LIMIT);
  };

  // ---------------------------------------------------------------------------
  // "/" quick picker
  // ---------------------------------------------------------------------------

  const quick = withSlash ? mount(h("div", `${PANEL} pbe-quick`)) : null;

  // The caret STAYS in the block while the menu is up (typing keeps
  // filtering), so "active item" is a highlight the document-level keys move,
  // not focus. Same swap-not-stack rule as BTN_ON.
  const QUICK_ON = ["bg-ui-accent", "text-accent-foreground"];
  const QUICK_ON_SWAPS = ["text-foreground", "hover:bg-ui-accent"];
  let quickItems: HTMLButtonElement[] = [];
  let quickActive = 0;
  const setQuickActive = (i: number) => {
    quickActive = i;
    quickItems.forEach((el, j) => {
      QUICK_ON.forEach((c) => el.classList.toggle(c, j === i));
      QUICK_ON_SWAPS.forEach((c) => el.classList.toggle(c, j !== i));
    });
  };

  // The quick picker's "Pattern" pick: consume the slash command (the host's
  // eventual pick must find an EMPTY default block to replace), then
  // escalate to the host's first-class Patterns surface.
  const browsePatternsFromQuick = () => {
    const id = targetId;
    targetId = null;
    insertionPlacement = null;
    insertionAtEmptyRoot = false;
    closePanel();
    if (!id) return;
    const block = editor.getBlock(id);
    const field =
      block && getBlockType(block.type)?.fields.find((f) => f.type === "rich" || f.type === "text");
    if (block && field && plainText(block.fields[field.name]).trim().startsWith("/"))
      editor.setField(id, field.name, "");
    options.onBrowsePatterns!(id);
  };

  if (quick) {
    quick.hidden = true;
    quick.setAttribute("role", "menu");
    quick.addEventListener("mousedown", (e) => e.preventDefault());
    quick.addEventListener("click", (e) => {
      const item =
        e.target instanceof ownerWindow.Element
          ? e.target.closest<HTMLButtonElement>("button[data-type], button[data-browse-patterns]")
          : null;
      if (!item) return;
      if (item.dataset.browsePatterns) browsePatternsFromQuick();
      else pickBlock(item.dataset.type!);
    });
    // Menu keys ride the DOCUMENT (capture): focus is in the carrier, and the
    // canvas's own Enter/arrow handling must never see these strokes.
    const onQuickKeys = (e: KeyboardEvent) => {
      if (openPanel?.el !== quick) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        const n = quickItems.length;
        if (n)
          setQuickActive(e.key === "ArrowDown" ? (quickActive + 1) % n : (quickActive + n - 1) % n);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        quickItems[quickActive]?.click();
      } else if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        targetId = null;
        insertionPlacement = null;
        insertionAtEmptyRoot = false;
        closePanel(); // the caret never left the block — nothing to refocus
      }
    };
    ownerDocument.addEventListener("keydown", onQuickKeys, true);
    disposers.push(() => ownerDocument.removeEventListener("keydown", onQuickKeys, true));
  }

  // (Re)build the menu for the text typed after "/": empty query = the
  // most-used shelf, anything else filters the slot's full offering. Returns
  // false when nothing matches (the caller closes the panel).
  function buildQuickItems(q: string): boolean {
    if (!quick || !targetId) return false;
    const query = q.trim().toLowerCase();
    const types = pickerTypes(targetId);
    const list = (
      query
        ? types.filter((b) => b.type.includes(query) || b.label.toLowerCase().includes(query))
        : mostUsedOf(types)
    ).slice(0, QUICK_LIMIT);
    // "Pattern" rides along while it matches the query — it opens the host's
    // Patterns surface; it is not itself a block.
    const withPatterns = !!options.onBrowsePatterns && (!query || "patterns".includes(query));
    quick.textContent = "";
    quickItems = [];
    if (!list.length && !withPatterns) return false;
    // Pattern LEADS the menu — the composition escalation before the blocks.
    if (withPatterns) {
      quick.appendChild(h("span", PANEL_LABEL, "Patterns"));
      const item = button(ITEM, "", undefined);
      item.dataset.browsePatterns = "1";
      item.setAttribute("role", "menuitem");
      item.append(
        h(
          "span",
          "flex h-5 w-5 items-center justify-center font-bold",
          iconSvg("pattern", "h-5 w-5") || "P",
        ),
        "Pattern",
      );
      quick.appendChild(item);
      quickItems.push(item);
    }
    if (list.length) quick.appendChild(h("span", PANEL_LABEL, "Blocks"));
    for (const b of list) {
      const item = button(ITEM, "", undefined);
      item.dataset.type = b.type;
      item.setAttribute("role", "menuitem");
      item.append(
        h("span", "flex h-5 w-5 items-center justify-center font-bold", badgeOf(b.type)),
        b.label,
      );
      quick.appendChild(item);
      quickItems.push(item);
    }
    setQuickActive(0);
    return true;
  }

  function openQuick(id: string) {
    const root = quick && rootOf(id);
    if (!quick || !root) return;
    targetId = id;
    insertionPlacement = null;
    insertionAtEmptyRoot = false;
    if (!buildQuickItems("")) {
      targetId = null; // B2: nothing insertable here → no picker
      return;
    }
    const rr = root.getBoundingClientRect();
    park(quick, rr.bottom + 6, rr.left);
    showPanel({ el: quick });
    // focus stays in the carrier — syncSlash refilters as typing continues
  }

  // ---------------------------------------------------------------------------
  // + appender → block inserter (search + grid)
  // ---------------------------------------------------------------------------

  const inserter = withInserter
    ? mount(
        h(
          "div",
          "pbe-ui pbe-inserter absolute z-40 w-[300px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
        ),
      )
    : null;
  const search = h(
    "input",
    "pbe-search m-3 mb-1 block w-[calc(100%-24px)] rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25",
  );
  const grid = h("div", "pbe-grid grid grid-cols-3 gap-1 px-2 pt-2 pb-3");
  const noResults = h(
    "div",
    "pbe-noresults px-3 pt-1 pb-4 text-center text-[13px] text-muted-foreground",
    "No blocks found",
  );
  const browseAll = options.onBrowseAll
    ? button(
        "pbe-browseall block w-full cursor-pointer border-t border-border bg-primary p-3 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring",
        "Browse all",
      )
    : null;
  const appender = mount(
    button(
      "pbe-ui pbe-appender absolute z-30 h-6 cursor-pointer text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      `<span class="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-primary"></span>` +
        `<span class="pointer-events-none absolute top-1/2 left-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">${ICON_PLUS}</span>`,
      "Add block",
    ),
  );
  appender.style.visibility = "hidden";
  appender.style.pointerEvents = "none";
  const spacerHandle = mount(
    button(
      "pbe-ui pbe-spacer-handle absolute z-30 h-3 w-12 cursor-ns-resize rounded-full border border-input bg-background shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      "",
      "Resize spacer",
    ),
  );
  spacerHandle.hidden = true;

  spacerHandle.addEventListener("pointerdown", (event) => {
    const id = spacerHandle.dataset.target;
    const root = id ? rootOf(id) : null;
    if (!id || !root || !editor.canStyle(id)) return;
    event.preventDefault();
    spacerHandle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = root.getBoundingClientRect().height;
    const originalHeight = root.style.height;
    let nextHeight = Math.max(8, Math.round(startHeight));
    const move = (moveEvent: PointerEvent) => {
      nextHeight = Math.max(8, Math.round(startHeight + moveEvent.clientY - startY));
      root.style.height = `${nextHeight}px`;
      syncSpacerResizer();
    };
    const finish = () => {
      spacerHandle.removeEventListener("pointermove", move);
      spacerHandle.removeEventListener("pointerup", finish);
      spacerHandle.removeEventListener("pointercancel", finish);
      root.style.height = originalHeight;
      editor.setStyle(id, "height", `${nextHeight}px`);
    };
    spacerHandle.addEventListener("pointermove", move);
    spacerHandle.addEventListener("pointerup", finish);
    spacerHandle.addEventListener("pointercancel", finish);
  });

  // In-canvas image resize (Gutenberg-style): a full-edge accent line with a
  // circular grab dot at its center. The vertical line rides the img's RIGHT
  // edge; when that edge is clipped offscreen (image wider than the visible
  // pane) the LEFT edge takes over — the image stays left-aligned, so
  // dragging the left handle outward still means "grow". The horizontal line
  // rides the BOTTOM edge and scales the image by its height; both edges
  // keep the natural ratio and commit the same width + height:auto pair.
  const RESIZE_DOT =
    `<span class="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 ` +
    `-translate-y-1/2 rounded-full border-[3px] border-[var(--color-pbe-accent)] bg-background"></span>`;
  const imageResizeHandle = (name: string, line: string, cursor: string, label: string) =>
    mount(
      button(
        `pbe-ui ${name} absolute z-30 ${cursor} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`,
        `<span class="pointer-events-none absolute ${line} rounded-full bg-[var(--color-pbe-accent)]"></span>${RESIZE_DOT}`,
        label,
      ),
    );
  const imageHandleX = imageResizeHandle(
    "pbe-image-width-handle",
    "inset-y-0 left-1/2 w-[3px] -translate-x-1/2",
    "w-3 cursor-ew-resize",
    "Resize image width",
  );
  const imageHandleY = imageResizeHandle(
    "pbe-image-height-handle",
    "inset-x-0 top-1/2 h-[3px] -translate-y-1/2",
    "h-3 cursor-ns-resize",
    "Resize image height",
  );
  imageHandleX.hidden = true;
  imageHandleY.hidden = true;

  const imageOf = (id: string): HTMLImageElement | null =>
    rootOf(id)?.querySelector<HTMLImageElement>("img[data-pb-image]") ?? null;

  const wireImageHandle = (handle: HTMLButtonElement, axis: "x" | "y") => {
    handle.addEventListener("pointerdown", (event) => {
      const id = handle.dataset.target;
      const root = id ? rootOf(id) : null;
      const img = id ? imageOf(id) : null;
      if (!id || !root || !img || !editor.canStyle(id)) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const fromLeft = handle.dataset.edge === "left";
      const start = axis === "x" ? event.clientX : event.clientY;
      const startRect = img.getBoundingClientRect();
      const ratio = startRect.width / startRect.height;
      // The figure is the layout ceiling (max-w-full caps the img there anyway).
      const maxWidth = Math.max(root.getBoundingClientRect().width, startRect.width);
      const originalWidth = img.style.width;
      const originalHeight = img.style.height;
      let nextWidth = Math.round(startRect.width);
      const move = (moveEvent: PointerEvent) => {
        const delta = (axis === "x" ? moveEvent.clientX : moveEvent.clientY) - start;
        // Bottom-edge drags express a height; the ratio converts it so ONE
        // dimension (width) stays the committed source of truth.
        const target =
          axis === "x"
            ? startRect.width + (fromLeft ? -delta : delta)
            : (startRect.height + delta) * ratio;
        nextWidth = Math.round(Math.min(maxWidth, Math.max(32, target)));
        img.style.width = `${nextWidth}px`;
        img.style.height = "auto";
        syncImageResizer();
      };
      const finish = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
        img.style.width = originalWidth;
        img.style.height = originalHeight;
        // height:auto neutralizes the render's height attribute so the ratio
        // holds at every viewport (a fixed px height would distort under
        // max-w-full). One transaction — one undo step.
        editor.setStyles(id, { width: `${nextWidth}px`, height: "auto" });
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    });
  };
  wireImageHandle(imageHandleX, "x");
  wireImageHandle(imageHandleY, "y");

  if (inserter) {
    inserter.hidden = true;
    search.type = "text";
    search.placeholder = "Search";
    search.autocomplete = "off";
    search.setAttribute("aria-label", "Search for blocks");
    noResults.hidden = true;
    inserter.append(search, grid, noResults);
    if (browseAll) {
      inserter.append(browseAll);
      browseAll.addEventListener("click", () => {
        const id = targetId;
        const placement = insertionPlacement ?? undefined;
        targetId = null;
        insertionPlacement = null;
        insertionAtEmptyRoot = false;
        closePanel();
        options.onBrowseAll!(id, placement);
      });
    }

    const gridItems = () => [...grid.querySelectorAll<HTMLButtonElement>("button[data-type]")];
    const visibleItems = () => gridItems().filter((el) => !el.hidden);
    // Resting state = the most-used shelf (data-quick rows); a query searches
    // the FULL offering — every type is in the DOM, filtering just unhides.
    const filterGrid = () => {
      const q = search.value.trim().toLowerCase();
      for (const el of gridItems())
        el.hidden = q
          ? !el.dataset.type!.includes(q) && !el.dataset.label!.includes(q)
          : el.dataset.quick !== "1";
      noResults.hidden = visibleItems().length > 0;
    };
    // One routing for click/Enter: the "Pattern" tile escalates to the host's
    // full pattern dialog; everything else is a block pick.
    const chooseGridItem = (item: HTMLButtonElement) => {
      if (item.dataset.browsePatterns) {
        const id = targetId;
        const placement = insertionPlacement ?? undefined;
        targetId = null;
        insertionPlacement = null;
        insertionAtEmptyRoot = false;
        closePanel();
        options.onBrowsePatterns!(id, placement);
      } else {
        pickBlock(item.dataset.type!);
      }
    };

    search.addEventListener("input", filterGrid);
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const first = visibleItems()[0];
        if (first) chooseGridItem(first);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        visibleItems()[0]?.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        const id = targetId;
        targetId = null;
        insertionPlacement = null;
        insertionAtEmptyRoot = false;
        closePanel();
        if (id) refocusCarrier(id);
      }
    });
    grid.addEventListener("click", (e) => {
      const item =
        e.target instanceof ownerWindow.Element
          ? e.target.closest<HTMLButtonElement>("button[data-type]")
          : null;
      if (item) chooseGridItem(item);
    });
    grid.addEventListener("keydown", (e) => {
      const items = visibleItems();
      const cur = items.indexOf(deepActiveElement() as HTMLButtonElement);
      const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"];
      if (keys.includes(e.key)) {
        e.preventDefault();
        const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
        if (fwd) items[cur < items.length - 1 ? cur + 1 : 0]?.focus();
        else if (cur > 0) items[cur - 1].focus();
        else search.focus(); // past the top: back to the search box
      } else if (e.key === "Escape") {
        e.preventDefault();
        const id = targetId;
        targetId = null;
        insertionPlacement = null;
        insertionAtEmptyRoot = false;
        closePanel();
        if (id) refocusCarrier(id);
      }
    });

    appender.addEventListener("mousedown", (e) => e.preventDefault());
    appender.addEventListener("click", () => {
      const id = appender.dataset.target ?? null;
      const edge = appender.dataset.edge;
      if (edge === "empty") {
        targetId = null;
        insertionPlacement = null;
        insertionAtEmptyRoot = true;
      } else {
        if (!id || !editor.getBlock(id) || (edge !== "before" && edge !== "after")) return;
        targetId = id;
        insertionPlacement = { anchorId: id, edge };
        insertionAtEmptyRoot = false;
      }
      search.value = "";
      grid.textContent = "";
      const GRID_ITEM =
        "flex cursor-pointer flex-col items-center gap-2 rounded-md px-1 pt-3.5 pb-2.5 text-[13px] font-medium text-popover-foreground hover:bg-ui-accent hover:text-accent-foreground focus-visible:bg-ui-accent focus-visible:outline-none";
      // the "Pattern" tile LEADS the shelf — the composition escalation
      // before the blocks; it opens the host's full pattern dialog
      if (options.onBrowsePatterns) {
        const item = button(GRID_ITEM, "");
        item.dataset.type = "pattern"; // filter vocabulary only — never inserted
        item.dataset.label = "pattern";
        item.dataset.quick = "1";
        item.dataset.browsePatterns = "1";
        item.append(
          h("span", "text-lg leading-none font-bold", iconSvg("pattern", "h-5 w-5") || "P"),
          "Pattern",
        );
        grid.appendChild(item);
      }
      // then the most-used shelf (the resting view), the rest behind the search
      const types = pickerTypes(id);
      const quickShelf = mostUsedOf(types);
      const shelf = new Set(quickShelf.map((b) => b.type));
      const ordered = [...quickShelf, ...types.filter((b) => !shelf.has(b.type))];
      for (const b of ordered) {
        const item = button(GRID_ITEM, "");
        item.dataset.type = b.type;
        item.dataset.label = b.label.toLowerCase();
        if (shelf.has(b.type)) item.dataset.quick = "1";
        item.append(h("span", "text-lg leading-none font-bold", badgeOf(b.type)), b.label);
        grid.appendChild(item);
      }
      filterGrid();
      const ar = appender.getBoundingClientRect();
      const fr = host.getBoundingClientRect();
      appender.style.visibility = "hidden";
      appender.style.pointerEvents = "none";
      inserter.hidden = false; // measurable before parking
      inserter.style.top = `${ar.bottom - fr.top + 6}px`;
      inserter.style.left = `${Math.max(0, ar.right - fr.left - inserter.offsetWidth)}px`;
      showPanel({ el: inserter });
      search.focus();
    });
  }

  // ---------------------------------------------------------------------------
  // floating block toolbar
  // ---------------------------------------------------------------------------

  const toolbar = withToolbar
    ? mount(
        h(
          "div",
          "pbe-ui pbe-toolbar absolute z-30 flex items-stretch rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
        ),
      )
    : null;

  // built below when withToolbar; declared here so syncs can reference them
  let indicator!: HTMLElement;
  let segShell!: HTMLElement;
  let btnUp!: HTMLButtonElement;
  let btnDown!: HTMLButtonElement;
  let segFormat!: HTMLElement;
  let btnBold!: HTMLButtonElement;
  let btnItalic!: HTMLButtonElement;
  let btnFmtLink!: HTMLButtonElement; // inline link over selected rich text
  // Every block-owned control is generated into this segment from descriptors.
  let segChoices!: HTMLElement;
  let segOther!: HTMLElement;
  let linkPopover!: LinkPopover;
  let buildReplacePanel!: (panel: HTMLElement, id: string, field: string) => void;
  let moreTrigger!: HTMLButtonElement;
  let segMore!: HTMLElement;
  let morePanel!: HTMLElement;
  let itemConvertPattern!: HTMLButtonElement;
  let itemUngroup!: HTMLButtonElement;
  let itemDuplicate!: HTMLButtonElement;
  let itemRemove!: HTMLButtonElement;
  let singleStrip!: HTMLElement;
  let multiStrip!: HTMLElement;
  let segPattern!: HTMLElement;
  let btnEditPattern!: HTMLButtonElement;
  let toolbarId: string | null = null; // the block the toolbar currently rides
  let toolbarPatternId: string | null = null;
  let toolbarPatternName: string | null = null;
  // The block the toolbar is anchored to for POSITIONING. Same as toolbarId for
  // a single selection, but a multi-selection (toolbarId null) still rides the
  // first block's box — the sticky reposition on scroll needs this either way.
  let toolbarAnchorId: string | null = null;

  if (toolbar) {
    toolbar.hidden = true;
    toolbar.addEventListener("mousedown", (e) => e.preventDefault());

    singleStrip = h("div", "pbe-ui flex items-stretch");
    multiStrip = h("div", "pbe-ui flex items-stretch");
    toolbar.append(singleStrip, multiStrip);

    // segment 1: block indicator + movers
    segShell = h("div", SEGMENT);
    indicator = h(
      "span",
      "flex h-9 min-w-9 items-center justify-center px-1 text-[15px] font-bold text-foreground",
    );
    btnUp = button(BTN, ICON_UP, "Move up");
    btnDown = button(BTN, ICON_DOWN, "Move down");
    btnUp.addEventListener("click", () => toolbarId && editor.moveBlock(toolbarId, -1));
    btnDown.addEventListener("click", () => toolbarId && editor.moveBlock(toolbarId, 1));
    segShell.append(indicator, btnUp, btnDown);

    // pattern segment: a block carrying pattern provenance is a fully
    // DECOUPLED copy (thoughts/012) — the strip offers exactly one thing:
    // "Edit pattern", editing THIS copy in the host's isolation mode (there
    // is no "source" from the instance's point of view).
    segPattern = h("div", SEGMENT);
    segPattern.hidden = true;
    btnEditPattern = button(`${BTN} px-2 whitespace-nowrap`, "Edit pattern");
    btnEditPattern.addEventListener("click", () => {
      if (toolbarPatternName && toolbarPatternId)
        options.onEditPattern!(toolbarPatternName, toolbarPatternId);
    });
    if (options.onEditPattern) segPattern.append(btnEditPattern);

    // Inline formats (bold / italic / link over the text selection).
    segFormat = h("div", SEGMENT);
    btnBold = button(BTN, iconSvg("bold", "h-5 w-5"), "Bold");
    btnItalic = button(BTN, iconSvg("italic", "h-5 w-5"), "Italic");
    btnFmtLink = button(BTN, ICON_LINK, "Link");
    const fmt = (cmd: string) => {
      editor.format(cmd);
      syncToolbar();
    };
    btnBold.addEventListener("click", () => fmt("bold"));
    btnItalic.addEventListener("click", () => fmt("italic"));
    // Inline link over the selected rich text. Focusing the popover's URL
    // input replaces the document selection, so the caption range is SAVED at
    // click time and restored (carrier refocused) before applyLink reads it.
    btnFmtLink.addEventListener("click", () => {
      const sel = ownerWindow.getSelection();
      const saved = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      const restore = () => {
        if (!saved) return;
        const c = saved.commonAncestorContainer;
        const carrier = (
          c instanceof ownerWindow.Element ? c : c.parentElement
        )?.closest<HTMLElement>("[data-pb-rich]");
        carrier?.focus({ preventScroll: true });
        const s = ownerWindow.getSelection();
        s?.removeAllRanges();
        s?.addRange(saved);
      };
      const cur = editor.linkState();
      linkPopover.open(btnFmtLink, {
        href: cur?.href ?? "",
        target: cur?.target ?? "",
        canRemove: !!cur,
        onApply: (href, target) => {
          restore();
          editor.applyLink(href, target);
        },
        onRemove: () => {
          restore();
          editor.applyLink("", "");
        },
      });
    });
    segFormat.append(btnBold, btnItalic, btnFmtLink);

    // One segment for every block-owned descriptor control.
    linkPopover = createLinkPopover();
    segChoices = h("div", "pbe-ui flex items-stretch");
    segChoices.hidden = true;
    segOther = h("div", "pbe-ui flex items-stretch");
    segOther.hidden = true;

    // segment 4: ⋮ options menu — the growth point for future block actions
    segMore = h("div", SEGMENT);
    moreTrigger = button(BTN, ICON_MORE, "Options");
    moreTrigger.setAttribute("aria-haspopup", "menu");
    moreTrigger.setAttribute("aria-expanded", "false");
    segMore.append(moreTrigger);
    morePanel = mount(h("div", `${PANEL} pbe-more`));
    morePanel.hidden = true;
    morePanel.setAttribute("role", "menu");
    itemConvertPattern = button(ITEM, "", "Convert to blocks");
    itemConvertPattern.setAttribute("role", "menuitem");
    itemConvertPattern.append(
      h("span", "flex h-5 w-5 items-center justify-center", ICON_UNGROUP),
      "Convert to blocks",
    );
    itemConvertPattern.addEventListener("click", () => {
      closePanel();
      if (toolbarId) editor.convertPatternToBlocks(toolbarId);
    });
    itemUngroup = button(ITEM, "", "Ungroup (⇧⌘G)");
    itemUngroup.setAttribute("role", "menuitem");
    itemUngroup.append(
      h("span", "flex h-5 w-5 items-center justify-center", ICON_UNGROUP),
      "Ungroup",
    );
    itemUngroup.addEventListener("click", () => {
      closePanel();
      editor.ungroupBlock(toolbarId ?? undefined);
    });
    itemDuplicate = button(ITEM, "", "Duplicate");
    itemDuplicate.setAttribute("role", "menuitem");
    itemDuplicate.append(
      h("span", "flex h-5 w-5 items-center justify-center", iconSvg("duplicate", "h-5 w-5")),
      "Duplicate",
    );
    itemDuplicate.addEventListener("click", () => {
      closePanel();
      if (toolbarId) editor.duplicateBlock(toolbarId);
    });
    itemRemove = button(ITEM, "", "Remove");
    itemRemove.setAttribute("role", "menuitem");
    itemRemove.append(
      h("span", "flex h-5 w-5 items-center justify-center", iconSvg("trash", "h-5 w-5")),
      "Remove",
    );
    itemRemove.addEventListener("click", () => {
      closePanel();
      if (toolbarId) editor.removeBlock(toolbarId);
    });
    morePanel.append(itemConvertPattern, itemUngroup, itemDuplicate, itemRemove);

    singleStrip.append(segShell, segPattern, segChoices, segFormat, segOther, segMore);

    // multi-selection strip: the Group action
    const segMulti = h("div", SEGMENT);
    const btnGroup = button(`${BTN} px-2`, "", "Group (⌘G)");
    btnGroup.append(h("span", "flex h-5 w-5 items-center justify-center", ICON_GROUP), "Group");
    btnGroup.addEventListener("click", () => void editor.groupBlocks());
    segMulti.append(btnGroup);
    multiStrip.append(segMulti);

    // dropdown plumbing: panels swallow mousedown (the carrier/selection must
    // survive), Escape returns focus to the trigger
    for (const [trigger, panel] of [[moreTrigger, morePanel]] as const) {
      panel.addEventListener("mousedown", (e) => e.preventDefault());
      wireMenuKeys(panel, () => {
        closePanel();
        trigger.focus();
      });
      trigger.addEventListener("click", () => {
        if (openPanel?.el === panel) {
          closePanel();
          return;
        }
        const tr = trigger.getBoundingClientRect();
        park(panel, tr.bottom + 6, tr.left);
        showPanel({
          el: panel,
          onClose: () => trigger.setAttribute("aria-expanded", "false"),
        });
        trigger.setAttribute("aria-expanded", "true");
        panel.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
      });
    }

    // Escape anywhere in the strip: caret back into the block.
    toolbar.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !openPanel && toolbarId) refocusCarrier(toolbarId);
    });

    // Rebuild the Replace dropdown for the current media field: Media Library
    // (when the adapter browses) / Upload / Insert from URL / Reset, plus the
    // current source. Reuses browseTo/uploadTo/uploadsReady (the media
    // plumbing the empty-block placeholder uses, defined below).
    buildReplacePanel = (panel: HTMLElement, id: string, field: string): void => {
      const block = editor.getBlock(id);
      if (!block) return;
      const cur = block.fields[field];
      const value =
        cur && typeof cur === "object" ? cur : { src: "", alt: "", width: "", height: "" };
      panel.textContent = "";

      if (mediaAdapter.browse) {
        const lib = button(`${ITEM} pbe-replace-browse`, "");
        lib.append(
          h("span", "flex h-5 w-5 items-center justify-center", iconSvg("gallery", "h-5 w-5")),
          "Media Library",
        );
        lib.addEventListener("click", () => {
          closePanel();
          void browseTo(id, field);
        });
        panel.appendChild(lib);
      }

      if (uploadsReady()) {
        const up = h("label", `${ITEM} cursor-pointer`);
        up.innerHTML = `<span class="flex h-5 w-5 items-center justify-center">${iconSvg("image", "h-5 w-5")}</span>Upload<input type="file" class="hidden">`;
        const fileInput = up.querySelector<HTMLInputElement>("input")!;
        fileInput.addEventListener("change", () => {
          const file = fileInput.files?.[0];
          fileInput.value = "";
          closePanel();
          if (file) void uploadTo(id, field, file);
        });
        panel.appendChild(up);
      }

      const urlBtn = button(ITEM, "");
      urlBtn.append(
        h("span", "flex h-5 w-5 items-center justify-center", iconSvg("globe", "h-5 w-5")),
        "Insert from URL",
      );
      const urlForm = h("form", "mt-1 mb-1 flex items-center gap-1.5 px-1");
      urlForm.hidden = true;
      const urlInput = h(
        "input",
        "h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25",
      ) as HTMLInputElement;
      urlInput.type = "text";
      urlInput.placeholder = "Paste or type URL";
      const urlApply = button(
        "flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "↵",
        "Apply",
      );
      urlApply.type = "submit";
      urlForm.append(urlInput, urlApply);
      urlBtn.addEventListener("click", () => {
        urlForm.hidden = !urlForm.hidden;
        if (!urlForm.hidden) {
          urlInput.value = value.src;
          urlInput.focus();
        }
      });
      urlForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const src = urlInput.value.trim();
        closePanel();
        // external source: intrinsic dims unknown — cleared, not stale
        editor.setField(id, field, {
          src,
          alt: value.alt,
          width: "",
          height: "",
        });
      });
      panel.append(urlBtn, urlForm);

      const reset = button(ITEM, "");
      reset.append(
        h("span", "flex h-5 w-5 items-center justify-center", iconSvg("reset", "h-5 w-5")),
        "Reset",
      );
      reset.disabled = !value.src;
      reset.addEventListener("click", () => {
        closePanel();
        editor.setField(id, field, {
          src: "",
          alt: value.alt,
          width: "",
          height: "",
        });
      });
      panel.appendChild(reset);

      if (value.src) {
        const meta = h("div", "mt-1.5 border-t border-border px-2.5 pt-2");
        meta.append(h("span", PANEL_LABEL + " px-0", "Current media URL"));
        const link = h(
          "a",
          "block truncate text-[13px] text-pbe-accent underline",
        ) as HTMLAnchorElement;
        link.href = value.src;
        link.textContent = value.src;
        link.target = "_blank";
        link.rel = "noopener";
        meta.appendChild(link);
        panel.appendChild(meta);
      }
    };

    // The shared link popover — factory here so its DOM/handlers live with the
    // rest of the toolbar wiring (referenced above by both link buttons).
    function createLinkPopover(): LinkPopover {
      const el = mount(h("div", `${PANEL} pbe-link w-80`));
      el.hidden = true;
      el.setAttribute("role", "dialog");
      const form = h("form", "flex items-center gap-1.5");
      const input = h(
        "input",
        "h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25",
      ) as HTMLInputElement;
      input.type = "text";
      input.placeholder = "Paste URL or type…";
      const apply = button(
        "flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "↵",
        "Apply",
      );
      apply.type = "submit";
      form.append(input, apply);
      const newTabRow = h(
        "label",
        "mt-2.5 flex cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground",
      );
      const newTab = h("input", "size-4 accent-[var(--color-pbe-accent)]") as HTMLInputElement;
      newTab.type = "checkbox";
      newTabRow.append(newTab, ownerDocument.createTextNode("Open in new tab"));
      const remove = button(`${ITEM} mt-1`, "");
      remove.append(
        h("span", "flex h-5 w-5 items-center justify-center", ICON_LINK),
        "Remove link",
      );
      el.append(form, newTabRow, remove);

      // The input must take focus (clicking it is not swallowed); a click
      // anywhere else in the popover is, so it never collapses a selection.
      el.addEventListener("mousedown", (e) => {
        if (e.target !== input) e.preventDefault();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          const trigger = cur?.trigger;
          closePanel();
          trigger?.focus();
        }
      });

      let cur: {
        trigger: HTMLElement;
        onApply: (h: string, t: string) => void;
        onRemove: () => void;
      } | null = null;
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const c = cur;
        const href = input.value.trim();
        const target = newTab.checked ? "_blank" : "none";
        closePanel();
        c?.onApply(href, target);
      });
      remove.addEventListener("click", () => {
        const c = cur;
        closePanel();
        c?.onRemove();
      });

      return {
        el,
        open(trigger, opts) {
          cur = { trigger, onApply: opts.onApply, onRemove: opts.onRemove };
          input.value = opts.href;
          newTab.checked = opts.target === "_blank";
          remove.hidden = !opts.canRemove;
          const tr = trigger.getBoundingClientRect();
          el.hidden = false; // measurable before parking
          park(el, tr.bottom + 6, tr.left);
          showPanel({ el });
          input.focus();
          input.select();
        },
      };
    }
  }

  function buildDeclaredControls(specs: readonly ToolbarSpec[], id: string): void {
    segChoices.textContent = "";
    segOther.textContent = "";
    const block = editor.getBlock(id);
    const def = block ? getBlockType(block.type) : undefined;
    if (!block) {
      segChoices.hidden = segOther.hidden = true;
      return;
    }

    const grouped = new Map<string, HTMLElement[]>();
    const add = (spec: ToolbarSpec, control: HTMLElement) => {
      const group = spec.group ?? "block";
      const controls = grouped.get(group) ?? [];
      controls.push(control);
      grouped.set(group, controls);
    };
    const settingValue = (name: string): unknown =>
      block.settings && name in block.settings
        ? block.settings[name]
        : def?.settings?.find((setting) => setting.setting === name)?.default;
    const styleValue = (name: string, fallback = ""): string => {
      const breakpoints = styleBreakpoints();
      const activeIndex = Math.max(
        0,
        breakpoints.findIndex(({ key }) => key === activeBreakpoint()),
      );
      for (let index = activeIndex; index >= 0; index -= 1) {
        const value = editor.getStyle(id, name, breakpoints[index].key);
        if (value) return value;
      }
      return fallback;
    };
    const openMenu = (trigger: HTMLButtonElement, panel: HTMLElement, focusFirst = true): void => {
      const rect = trigger.getBoundingClientRect();
      panel.hidden = false;
      park(panel, rect.bottom + 6, rect.left);
      showPanel({
        el: panel,
        onClose: () => {
          trigger.setAttribute("aria-expanded", "false");
          panel.remove();
        },
      });
      trigger.setAttribute("aria-expanded", "true");
      if (focusFirst) panel.querySelector<HTMLElement>("button:not([disabled]), input")?.focus();
    };

    for (const spec of specs) {
      if (
        (spec.style === "containerWidth" || spec.style === "containerBleed") &&
        styleValue("containerEnabled", "false") !== "true"
      )
        continue;
      if (spec.control === "add-child" && spec.type) {
        const trigger = button(`${BTN} px-2 whitespace-nowrap`, spec.label, spec.label);
        trigger.addEventListener("click", () => editor.appendChild(id, spec.type!));
        add(spec, trigger);
        continue;
      }
      if (spec.control === "toggle-setting" && spec.setting) {
        const icon = spec.icon ? iconSvg(spec.icon) : "";
        const toggle = icon
          ? button(BTN, icon, spec.label)
          : button(`${BTN} px-2 whitespace-nowrap`, spec.label, spec.label);
        setOn(toggle, settingValue(spec.setting) === true);
        toggle.addEventListener("click", () => {
          const currentBlock = editor.getBlock(id);
          const current =
            currentBlock?.settings && spec.setting! in currentBlock.settings
              ? currentBlock.settings[spec.setting!]
              : def?.settings?.find((setting) => setting.setting === spec.setting)?.default;
          editor.setSetting(id, spec.setting!, !current);
        });
        add(spec, toggle);
        continue;
      }
      if (spec.control === "toggle-style" && spec.style && spec.value) {
        const active = styleValue(spec.style) === spec.value;
        const icon = iconSvg(
          active ? (spec.activeIcon ?? spec.icon ?? "") : (spec.icon ?? ""),
          "h-5 w-5",
        );
        const toggle = icon
          ? button(BTN, icon, spec.label)
          : button(`${BTN} px-2 whitespace-nowrap`, spec.label, spec.label);
        setOn(toggle, active);
        toggle.setAttribute("aria-pressed", String(active));
        toggle.addEventListener("click", () => {
          editor.setStyle(id, spec.style!, active ? "" : spec.value!, activeBreakpoint());
        });
        add(spec, toggle);
        continue;
      }

      if (spec.control === "text-align") {
        const active = styleValue("textAlign");
        const selected = ALIGNMENTS.find((alignment) => alignment.key === active);
        const trigger = button(
          BTN,
          `${selected?.icon ?? ALIGNMENTS[0].icon}${ICON_CHEVRON}`,
          spec.label,
        );
        trigger.setAttribute("aria-haspopup", "menu");
        trigger.setAttribute("aria-expanded", "false");
        trigger.addEventListener("click", () => {
          const panel = mount(h("div", `${PANEL} pbe-align`));
          panel.setAttribute("role", "menu");
          panel.addEventListener("mousedown", (event) => event.preventDefault());
          for (const alignment of ALIGNMENTS) {
            const item = button(`${ITEM}${alignment.key === active ? ` ${ITEM_ACTIVE}` : ""}`, "");
            item.setAttribute("role", "menuitem");
            item.append(
              h("span", "flex h-5 w-5 items-center justify-center", alignment.icon),
              alignment.label,
            );
            item.addEventListener("click", () => {
              closePanel();
              editor.setStyle(
                id,
                "textAlign",
                alignment.key === active ? "" : alignment.key,
                activeBreakpoint(),
              );
              refocusCarrier(id);
            });
            panel.appendChild(item);
          }
          wireMenuKeys(panel, () => {
            closePanel();
            trigger.focus();
          });
          openMenu(trigger, panel);
        });
        add(spec, trigger);
        continue;
      }

      if (spec.control === "replace" && spec.field) {
        const icon = spec.icon ? iconSvg(spec.icon) : "";
        const trigger = icon
          ? button(BTN, `${icon}${ICON_CHEVRON}`, spec.label)
          : button(`${BTN} px-2 whitespace-nowrap`, `${spec.label}${ICON_CHEVRON}`, spec.label);
        trigger.setAttribute("aria-haspopup", "menu");
        trigger.setAttribute("aria-expanded", "false");
        trigger.addEventListener("click", () => {
          const panel = mount(h("div", `${PANEL} pbe-replace w-72`));
          panel.setAttribute("role", "menu");
          panel.addEventListener("mousedown", (event) => {
            if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
          });
          buildReplacePanel(panel, id, spec.field!);
          panel.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closePanel();
              trigger.focus();
            }
          });
          openMenu(trigger, panel, false);
        });
        add(spec, trigger);
        continue;
      }

      if (spec.control === "link" && (spec.field || spec.setting)) {
        const trigger = button(BTN, ICON_LINK, spec.label);
        const rawHref = spec.field ? block.fields[spec.field] : settingValue(spec.setting!);
        const href = typeof rawHref === "string" ? rawHref : "";
        setOn(trigger, href.trim() !== "");
        trigger.addEventListener("click", () => {
          const current = editor.getBlock(id);
          if (!current) return;
          const currentHref = spec.field
            ? current.fields[spec.field]
            : (current.settings?.[spec.setting!] ??
              def?.settings?.find((setting) => setting.setting === spec.setting)?.default);
          const target = spec.targetSetting
            ? (current.settings?.[spec.targetSetting] ??
              def?.settings?.find((setting) => setting.setting === spec.targetSetting)?.default)
            : "";
          linkPopover.open(trigger, {
            href: typeof currentHref === "string" ? currentHref : "",
            target: typeof target === "string" ? target : "",
            canRemove: typeof currentHref === "string" && currentHref.trim() !== "",
            onApply: (nextHref, nextTarget) => {
              if (spec.field) editor.setField(id, spec.field, nextHref);
              else editor.setSetting(id, spec.setting!, nextHref);
              if (spec.targetSetting)
                editor.setSetting(
                  id,
                  spec.targetSetting,
                  nextTarget === "_blank" ? "_blank" : "none",
                );
            },
            onRemove: () => {
              if (spec.field) editor.setField(id, spec.field, "");
              else editor.setSetting(id, spec.setting!, "");
            },
          });
        });
        add(spec, trigger);
        continue;
      }

      if (spec.control === "caption" && spec.field && spec.setting) {
        const caption = button(BTN, ICON_CAPTION, spec.label);
        const content = plainText(block.fields[spec.field]).trim();
        setOn(caption, settingValue(spec.setting) === true || content !== "");
        caption.addEventListener("click", () => {
          const current = editor.getBlock(id);
          if (!current) return;
          const currentContent = plainText(current.fields[spec.field!]).trim();
          const shown =
            (current.settings?.[spec.setting!] ??
              def?.settings?.find((setting) => setting.setting === spec.setting)?.default) ===
              true || currentContent !== "";
          if (shown) {
            if (currentContent) editor.setField(id, spec.field!, "");
            editor.setSetting(id, spec.setting!, false);
          } else {
            editor.setSetting(id, spec.setting!, true);
            refocusCarrier(id);
          }
        });
        add(spec, caption);
        continue;
      }

      if (spec.control === "copy" && spec.field) {
        const copy = button(`${BTN} px-2 whitespace-nowrap`, spec.label, spec.label);
        const current = block.fields[spec.field];
        copy.disabled = typeof current !== "string" || !current.trim();
        copy.addEventListener("click", () => {
          const value = editor.getBlock(id)?.fields[spec.field!];
          if (typeof value === "string" && value) void copyText(value);
        });
        add(spec, copy);
        continue;
      }

      if (spec.control === "text" && (spec.field || spec.setting)) {
        const edit = button(`${BTN} px-2 whitespace-nowrap`, spec.label, spec.label);
        edit.setAttribute("aria-haspopup", "dialog");
        edit.setAttribute("aria-expanded", "false");
        edit.addEventListener("click", () => {
          const panel = mount(h("div", `${PANEL} w-72`));
          panel.setAttribute("role", "dialog");
          panel.setAttribute("aria-label", spec.label);
          const form = h("form", "flex items-center gap-1.5");
          const input = h(
            "input",
            "h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25",
          ) as HTMLInputElement;
          const current = spec.field ? block.fields[spec.field] : settingValue(spec.setting!);
          input.type = "text";
          input.value = typeof current === "string" ? current : "";
          input.setAttribute("aria-label", spec.label);
          const apply = button(
            "flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "↵",
            "Apply",
          );
          apply.type = "submit";
          form.append(input, apply);
          panel.appendChild(form);
          panel.addEventListener("mousedown", (event) => {
            if (event.target !== input) event.preventDefault();
          });
          panel.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closePanel();
              edit.focus();
            }
          });
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            closePanel();
            if (spec.field) editor.setField(id, spec.field, input.value);
            else editor.setSetting(id, spec.setting!, input.value);
          });
          openMenu(edit, panel, false);
          input.focus();
          input.select();
        });
        add(spec, edit);
        continue;
      }

      if (
        spec.control !== "field-options" &&
        spec.control !== "setting-options" &&
        spec.control !== "transform-options" &&
        spec.control !== "style-options"
      )
        continue;
      if (!spec.options) continue;

      const value =
        spec.control === "transform-options"
          ? block.type
          : spec.control === "style-options"
            ? styleValue(
                spec.style!,
                def?.settings?.find((setting) => setting.style === spec.style)?.default as
                  | string
                  | undefined,
              )
            : spec.field
              ? block.fields[spec.field]
              : settingValue(spec.setting!);
      const active = spec.options.find((option) => option.value === value);
      const containerOptionLabel = (option: { value: string; label: string }): string => {
        if (spec.style !== "containerWidth") return option.label;
        const widths = containerWidths();
        if (option.value === "content") return `${option.label} · Max ${widths.content}`;
        if (option.value === "wide") return `${option.label} · Max ${widths.wide}`;
        return option.label;
      };
      const activeIcon = iconSvg(active?.icon ?? spec.icon ?? "", "h-5 w-5");
      const trigger = activeIcon
        ? button(BTN, `${activeIcon}${ICON_CHEVRON}`, spec.label)
        : button(
            `${BTN} px-2 whitespace-nowrap`,
            `${active?.label ?? spec.label}${ICON_CHEVRON}`,
            spec.label,
          );
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      trigger.addEventListener("click", () => {
        const panel = mount(h("div", `${PANEL} pbe-toolbar-options`));
        panel.setAttribute("role", "menu");
        panel.addEventListener("mousedown", (event) => event.preventDefault());
        for (const option of spec.options!) {
          const optionIcon = iconSvg(option.icon ?? "", "h-5 w-5");
          const optionLabel = containerOptionLabel(option);
          const item = button(
            `${ITEM}${option.value === value ? ` ${ITEM_ACTIVE}` : ""}`,
            optionIcon
              ? `<span class="flex h-5 w-5 shrink-0 items-center justify-center">${optionIcon}</span>${optionLabel}`
              : optionLabel,
          );
          item.setAttribute("role", "menuitem");
          item.addEventListener("click", () => {
            closePanel();
            if (spec.control === "transform-options") editor.transformBlock(id, option.value);
            else if (spec.control === "style-options")
              editor.setStyle(
                id,
                spec.style!,
                option.value === value ? "" : option.value,
                activeBreakpoint(),
              );
            else if (spec.field) editor.setField(id, spec.field, option.value);
            else editor.setSetting(id, spec.setting!, option.value);
            refocusCarrier(id);
          });
          panel.appendChild(item);
        }
        wireMenuKeys(panel, () => {
          closePanel();
          trigger.focus();
        });
        openMenu(trigger, panel);
      });
      add(spec, trigger);
    }

    for (const group of ["parent", "block", "inline", "other"] as const) {
      const controls = grouped.get(group);
      if (!controls?.length) continue;
      const segment = h("div", SEGMENT);
      segment.dataset.toolbarGroup = group;
      segment.append(...controls);
      (group === "other" ? segOther : segChoices).appendChild(segment);
    }
    segChoices.hidden = !segChoices.childElementCount;
    segOther.hidden = !segOther.childElementCount;
  }

  function syncToolbar() {
    if (!toolbar) return;
    // While chrome holds focus (open dropdown, tabbed-to button) the caret is
    // gone but the toolbar must not vanish under the user.
    if (openPanel || toolbar.contains(deepActiveElement())) return;

    const ids = editor.selection.blocks;
    const multi = ids.length > 1;
    const id = multi ? ids[0] : (editor.selection.active ?? ids[0] ?? null);
    const block = id ? editor.getBlock(id) : null;
    const root = id ? rootOf(id) : null;
    if (!id || !block || !root) {
      toolbar.hidden = true;
      toolbarId = null;
      return;
    }
    toolbarId = multi ? null : id;
    singleStrip.hidden = multi;
    multiStrip.hidden = !multi;

    if (!multi) {
      const mode = editor.editingMode(id);
      const patternDef = block.pattern ? getPattern(block.pattern) : undefined;
      toolbarPatternId = patternDef ? id : null;
      toolbarPatternName = patternDef ? block.pattern! : null;
      segPattern.hidden = !patternDef || !options.onEditPattern;
      indicator.innerHTML = patternDef ? badgeOf(PATTERN_ROOT_TYPE) : badgeOf(block.type);
      indicator.title = patternDef
        ? patternDef.label
        : (blockTypes().find((b) => b.type === block.type)?.label ?? block.type);

      // A block whose policy pins it (movable:false, or the container is not
      // orderable) shows NO move buttons; otherwise they disable at the edges.
      const movable = mode === "default" && editor.canMove(id);
      btnUp.hidden = btnDown.hidden = !movable;
      const at = locateBlock(editor.getModel().blocks, id);
      btnUp.disabled = !at || at.index <= 0;
      btnDown.disabled = !at || at.index >= at.list.length - 1;

      const richCarriers = [
        ...(root.matches("[data-pb-rich]") ? [root] : []),
        ...root.querySelectorAll<HTMLElement>("[data-pb-rich]"),
      ].filter((carrier) => carrier.closest("[data-pb-id]") === root);
      const activeRich = deepActiveElement()?.closest?.("[data-pb-rich]");
      const hasActiveRich = !!activeRich && richCarriers.includes(activeRich as HTMLElement);

      const declared = patternDef ? [] : (getBlockType(block.type)?.toolbar ?? []);
      const tbSpecs = declared.filter(
        (spec) => mode === "default" || (mode === "content-only" && spec.role === "content"),
      );
      // Bound block controls and carrier formatting are mutually exclusive: the
      // format segment only appears once the user SELECTS caption text
      // (selecting the leaf image drops a collapsed caret in the caption, which
      // must NOT count as "formatting"), and the block controls step aside for
      // it — one strip, no duplicate Link buttons.
      const winSel = ownerWindow.getSelection();
      const hasTextSel =
        editor.selection.active === id &&
        hasActiveRich &&
        !!winSel?.rangeCount &&
        !winSel.isCollapsed;
      const boundControls = new Set(["replace", "link", "caption"]);
      const ownsBlockControls = tbSpecs.some((spec) => boundControls.has(spec.control));
      buildDeclaredControls(
        hasTextSel ? tbSpecs.filter((spec) => !boundControls.has(spec.control)) : tbSpecs,
        id,
      );
      segFormat.hidden = ownsBlockControls ? !hasTextSel : !hasActiveRich;
      segShell.hidden = mode !== "default";
      const canConvertPattern = editor.canConvertPattern(id);
      itemConvertPattern.hidden = !canConvertPattern;
      itemConvertPattern.disabled = !canConvertPattern;
      const ungroupTarget = editor.ungroupTarget(id);
      itemUngroup.hidden = !ungroupTarget;
      itemUngroup.disabled = !ungroupTarget;
      itemDuplicate.disabled = !editor.canDuplicate(id);
      itemRemove.disabled = !editor.canRemove(id);
      segMore.hidden =
        mode !== "default" ||
        (!canConvertPattern && !ungroupTarget && itemDuplicate.disabled && itemRemove.disabled);

      const marks = editor.formatState();
      // allowedFormats hides a disallowed mark's button entirely (null = all,
      // [] = plain text) — same effective policy editor.format() enforces.
      const allowed = editor.blockPolicy(id).allowedFormats;
      const canFmt = (m: string) => allowed === null || allowed.includes(m);
      btnBold.hidden = !canFmt("bold");
      btnItalic.hidden = !canFmt("italic");
      btnBold.disabled = btnItalic.disabled = !hasActiveRich;
      setOn(btnBold, !!marks.bold);
      setOn(btnItalic, !!marks.italic);

      // Inline link: needs selected text to wrap; lights up when the selection
      // already sits in a link. Same allowedFormats gate ("link").
      const lk = canFmt("link") ? editor.linkState() : null;
      btnFmtLink.hidden = !canFmt("link");
      btnFmtLink.disabled = !hasTextSel;
      setOn(btnFmtLink, !!lk);
    }

    toolbarAnchorId = id;
    toolbar.hidden = false; // unhide before measuring — offsetHeight needs layout
    if (hoverId) {
      const hoverRoot = rootOf(hoverId);
      if (hoverRoot && toolbarProtectsHoverRoot(hoverRoot)) hideHover();
    }
    positionToolbar();
  }

  // Sticky placement: the toolbar floats above its block, but once the block
  // scrolls up under the canvas viewport's top edge it sticks there, staying
  // visible — then rides back down with the block's bottom edge as the block
  // finally leaves, so it never detaches from the block it belongs to.
  //
  // Crucially this must be LAG-FREE: each phase is positioned so the browser
  // tracks it natively, with no per-scroll-frame JS correction that would
  // trail the scroll. Floating/trailing use position:absolute — the toolbar's
  // offset inside the scrolling host is constant, so it rides with the block
  // for free. Stuck uses position:fixed — the browser pins it to the viewport
  // on the compositor. The scroll handler only flips between the two at the
  // phase boundaries; a late handler is invisible because the CSS holds.
  function positionToolbar() {
    if (!toolbar || toolbar.hidden || !toolbarAnchorId) return;
    const root = rootOf(toolbarAnchorId);
    if (!root) return;
    const rr = root.getBoundingClientRect();
    const th = toolbar.offsetHeight;
    const floating = rr.top - th - STICKY_GAP; // resting spot above the block
    const stuck = (scroller ? scroller.getBoundingClientRect().top : 0) + STICKY_MARGIN;
    const trailing = rr.bottom - th; // pinned to the block's bottom as it exits
    const top = Math.min(Math.max(floating, stuck), trailing); // viewport coords

    if (top === stuck && floating < stuck && stuck < trailing) {
      // Stuck to the viewport top — fixed, so scroll doesn't move it at all.
      toolbar.style.position = "fixed";
      toolbar.style.top = `${top}px`;
      toolbar.style.left = `${Math.max(0, rr.left)}px`;
    } else {
      // Floating above / trailing the block — absolute, offset within the host
      // (constant across scroll, so the toolbar tracks the block natively).
      toolbar.style.position = "absolute";
      park(toolbar, top, rr.left);
    }
  }

  // ---------------------------------------------------------------------------
  // syncs + wiring
  // ---------------------------------------------------------------------------

  // "/" rides MODEL changes only (see the header note). Opening still takes
  // an EXACT "/" (a fresh slash just typed — Escape at "/gro" must not
  // reopen on the next keystroke); once open, every model change re-filters
  // the menu from whatever follows the slash, and losing the slash (or the
  // block, or the caret) closes it.
  const slashTextOf = (id: string | null): string | null => {
    const block = id ? editor.getBlock(id) : null;
    if (!block || block.type !== editor.defaultBlock) return null;
    const field = getBlockType(block.type)?.fields.find(
      (f) => f.type === "rich" || f.type === "text",
    );
    return field ? plainText(block.fields[field.name]).trim() : null;
  };
  function syncSlash() {
    if (!withSlash || !quick) return;
    if (openPanel?.el === quick) {
      const text = slashTextOf(targetId);
      if (text == null || !text.startsWith("/") || editor.selection.active !== targetId) {
        targetId = null;
        closePanel();
        return;
      }
      if (!buildQuickItems(text.slice(1))) {
        targetId = null;
        closePanel();
      }
      return;
    }
    if (openPanel) return;
    const id = editor.selection.active;
    if (id && slashTextOf(id) === "/") openQuick(id);
  }

  // One global edge affordance replaces the old trailing empty-block row.
  // It is projected over the nearest visible block edge without entering the
  // authored DOM, so serialization and document layout remain untouched.
  const hideAppender = () => {
    appender.style.visibility = "hidden";
    appender.style.pointerEvents = "none";
    delete appender.dataset.target;
    delete appender.dataset.edge;
  };
  // Document-level pointermove clears these markers while moving through
  // empty canvas space, but no further move is delivered after the pointer
  // crosses the editable canvas/iframe boundary. Retire both hover affordances
  // there so neither freezes at its last content position.
  const clearCanvasHover = () => {
    hideHover();
    hideAppender();
  };
  canvas.addEventListener("pointerleave", clearCanvasHover);
  disposers.push(() => canvas.removeEventListener("pointerleave", clearCanvasHover));

  const edgeDepth = (root: HTMLElement): number => {
    let depth = 0;
    for (
      let parent = root.parentElement;
      parent && parent !== canvas;
      parent = parent.parentElement
    )
      if (parent.matches("[data-pb-id]")) depth++;
    return depth;
  };
  function syncAppenderAt(event: PointerEvent) {
    if (!withInserter || openPanel) return hideAppender();
    const target = event.target;
    if (!(target instanceof ownerWindow.Element) || !canvas.contains(target)) return hideAppender();

    const canvasRect = canvas.getBoundingClientRect();
    if (!editor.getModel().blocks.length) {
      appender.dataset.edge = "empty";
      delete appender.dataset.target;
      appender.setAttribute("aria-label", "Add first block");
      appender.title = "Add first block";
      appender.style.width = `${canvasRect.width}px`;
      park(appender, canvasRect.top, canvasRect.left);
      appender.style.visibility = "visible";
      appender.style.pointerEvents = "auto";
      return;
    }
    const candidates: {
      id: string;
      root: HTMLElement;
      edge: "before" | "after";
      distance: number;
      depth: number;
      lineY: number;
    }[] = [];
    const seen = new Set<string>();
    for (const rawRoot of canvas.querySelectorAll<HTMLElement>("[data-pb-id]")) {
      const rawId = rawRoot.dataset.pbId;
      if (!rawId) continue;
      const pattern = editor.patternContext(rawId);
      const id = pattern?.id ?? rawId;
      if (seen.has(id) || !pickerTypes(id).length) continue;
      seen.add(id);
      const root = rootOf(id);
      if (!root) continue;
      const rect = root.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        event.clientX < rect.left - 8 ||
        event.clientX > rect.right + 8
      )
        continue;
      const at = locateBlock(editor.getModel().blocks, id);
      if (!at) continue;

      // Every sibling junction is owned by the block AFTER it. The active
      // hit area spans the whole visual gap (collapsed margins included), and
      // the line sits at its midpoint. This gives internal boundaries the
      // same reliable target as the document's outer edges.
      const previous = at.list[at.index - 1];
      const previousRoot = previous ? rootOf(previous.id) : null;
      const previousRect = previousRoot?.getBoundingClientRect();
      // A preceding model sibling can be beside this block (grid/flex), not
      // above it. Treating two side-by-side blocks' overlapping Y ranges as a
      // vertical "gap" projected an inserter across the middle of media and
      // stole its clicks. Only offer the horizontal line when the siblings
      // occupy the same horizontal run.
      const sharesHorizontalRun =
        !previousRect ||
        Math.min(previousRect.right, rect.right) - Math.max(previousRect.left, rect.left) > 1;
      if (sharesHorizontalRun) {
        const gapStart = previousRect ? Math.min(previousRect.bottom, rect.top) : rect.top;
        const gapEnd = previousRect ? Math.max(previousRect.bottom, rect.top) : rect.top;
        const beforeDistance =
          event.clientY < gapStart
            ? gapStart - event.clientY
            : event.clientY > gapEnd
              ? event.clientY - gapEnd
              : 0;
        if (beforeDistance <= 12) {
          candidates.push({
            id,
            root,
            edge: "before",
            distance: beforeDistance,
            depth: edgeDepth(root),
            lineY: (gapStart + gapEnd) / 2,
          });
        }
      }

      // The final sibling owns the trailing document/container boundary.
      if (at.index === at.list.length - 1) {
        const afterDistance = Math.abs(event.clientY - rect.bottom);
        if (afterDistance <= 12) {
          candidates.push({
            id,
            root,
            edge: "after",
            distance: afterDistance,
            depth: edgeDepth(root),
            lineY: rect.bottom,
          });
        }
      }
    }
    const candidate = candidates.sort((a, b) => a.distance - b.distance || b.depth - a.depth)[0];
    if (!candidate) return hideAppender();

    const rect = candidate.root.getBoundingClientRect();
    const left = Math.max(canvasRect.left, rect.left);
    const right = Math.min(canvasRect.right, rect.right);
    if (right - left < 24) return hideAppender();
    appender.dataset.target = candidate.id;
    appender.dataset.edge = candidate.edge;
    appender.style.visibility = "visible";
    appender.style.pointerEvents = "auto";
    appender.setAttribute(
      "aria-label",
      `Add block ${candidate.edge === "before" ? "before" : "after"}`,
    );
    appender.title = appender.getAttribute("aria-label")!;
    appender.style.width = `${right - left}px`;
    park(appender, candidate.lineY - 12, left);
  }

  listen("pointermove", (event) => {
    const path = event.composedPath();
    // Position the sentinel first so hover-label collision placement sees its
    // box in this same pointer frame. Events over the sentinel itself retain
    // its last valid placement but still update geometric block inspection.
    if (!path.includes(appender) && !(inserter && path.includes(inserter))) syncAppenderAt(event);
    syncHoverAt(event);
  });

  function syncSpacerResizer() {
    const ids = editor.selection.blocks;
    const id = editor.selection.active ?? (ids.length === 1 ? ids[0] : null);
    const block = id ? editor.getBlock(id) : null;
    const root = id ? rootOf(id) : null;
    if (
      !id ||
      !block ||
      block.type !== "spacer" ||
      editor.editingMode(id) !== "default" ||
      !editor.canStyle(id) ||
      !root
    ) {
      spacerHandle.hidden = true;
      delete spacerHandle.dataset.target;
      return;
    }
    const rect = root.getBoundingClientRect();
    spacerHandle.dataset.target = id;
    park(spacerHandle, rect.bottom - 6, rect.left + rect.width / 2 - 24);
    spacerHandle.hidden = false;
  }

  function syncImageResizer() {
    const hide = () => {
      for (const handle of [imageHandleX, imageHandleY]) {
        handle.hidden = true;
        delete handle.dataset.target;
      }
    };
    const ids = editor.selection.blocks;
    const id = editor.selection.active ?? (ids.length === 1 ? ids[0] : null);
    const block = id ? editor.getBlock(id) : null;
    const img = id ? imageOf(id) : null;
    if (
      !id ||
      !block ||
      block.type !== "image" ||
      editor.editingMode(id) !== "default" ||
      !editor.canStyle(id) ||
      !img ||
      !img.getAttribute("src") // placeholder card, nothing to size yet
    )
      return hide();
    // A ratio preset pins [&_img]:w-full (its selector outranks a width
    // class), and a gallery grid owns its children's sizing — no handle.
    const ratio = block.settings?.aspectRatio;
    if (typeof ratio === "string" && ratio !== "auto") return hide();
    const parent = parentIdOf(id);
    if (parent && editor.getBlock(parent)?.type === "gallery") return hide();
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return hide();
    // The 12px-wide grab strip must stay reachable: when the img's right edge
    // (plus the strip's outer half) is clipped offscreen, the LEFT edge takes
    // over for width drags.
    const limit = Math.min(
      ownerDocument.documentElement.clientWidth,
      scroller ? scroller.getBoundingClientRect().right : Infinity,
    );
    const fromLeft = rect.right + 6 > limit;
    imageHandleX.dataset.target = id;
    imageHandleX.dataset.edge = fromLeft ? "left" : "right";
    imageHandleX.style.height = `${rect.height}px`;
    park(imageHandleX, rect.top, (fromLeft ? rect.left : rect.right) - 6);
    imageHandleX.hidden = false;
    imageHandleY.dataset.target = id;
    imageHandleY.style.width = `${rect.width}px`;
    park(imageHandleY, rect.bottom - 6, rect.left);
    imageHandleY.hidden = false;
  }

  // --- media placeholder --------------------------------------------------
  // A block whose PRIMARY media is empty (the field a "media" control binds)
  // gets a placeholder card next to the empty carrier: drag-drop / Upload /
  // Insert from URL (plus Media Library when the adapter browses). Chrome
  // DOM only — serialize re-renders from the model and never sees it. All
  // persistence goes through the resolved media adapter; the URL path works
  // everywhere.

  const uploadsReady = () => mediaAdapter.uploadAvailable();

  const mediaFieldOf = (type: string | null): string | null => {
    const spec = type
      ? getBlockType(type)?.settings?.find((s) => s.control === "media")
      : undefined;
    return spec?.field ?? null;
  };

  // Busy/error surface: the placeholder card, when one exists for the block.
  // Toolbar-initiated work on a filled field has no card — errors log only.
  const cardOf = (id: string): HTMLElement | null =>
    [...canvas.querySelectorAll<HTMLElement>(".pbe-media-ph")].find(
      (el) => el.closest("[data-pb-block]")?.getAttribute("data-pb-id") === id,
    ) ?? null;

  // Visible in-flight feedback for adapter work (uploads can take a moment
  // against a real backend). The placeholder card shows a spinner row and
  // goes inert (aria-busy — chrome.css dims it); work on a filled field has
  // no card, so a floating spinner pill parks over the block instead.
  const SPINNER_SVG = `<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25" stroke-width="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;

  // This chrome island lives INSIDE the website canvas, where host selectors
  // and utility classes are intentionally unrestricted. A shadow root is the
  // only hard cascade boundary: namespacing/specificity can reduce collisions,
  // but cannot prevent a later host rule from winning. Private --pbe-chrome-*
  // values cross the boundary intentionally; no public site token does.
  const MEDIA_PLACEHOLDER_CSS = `
    :host {
      display: block;
      margin: 0.25rem 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 16px;
      line-height: 1.5;
      color-scheme: light dark;
    }
    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .card {
      border: 1px solid var(--pbe-chrome-border, #e4e4e7);
      border-radius: 0.5rem;
      background: var(--pbe-chrome-muted, #f4f4f5);
      padding: 1rem;
      color: var(--pbe-chrome-foreground, #18181b);
      transition: border-color 120ms ease, opacity 120ms ease;
    }
    :host([aria-busy="true"]) .card { opacity: 0.6; pointer-events: none; }
    .card.drag-active { border-color: var(--pbe-chrome-ring, #287cc1); }
    .title { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; font-weight: 600; }
    .title svg { width: 1.25rem; height: 1.25rem; }
    .description { margin: 0 0 0.75rem; color: var(--pbe-chrome-muted-foreground, #71717a); font-size: 0.875rem; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    button, .upload {
      display: inline-flex;
      height: 2.5rem;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      border-radius: 0.5rem;
      padding: 0 0.875rem;
      font: 600 0.875rem/1 ui-sans-serif, system-ui, sans-serif;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
    }
    button { appearance: none; }
    .upload {
      border: 1px solid transparent;
      background: var(--pbe-chrome-primary, #287cc1);
      color: var(--pbe-chrome-primary-foreground, #fff);
    }
    .upload:hover { filter: brightness(0.94); }
    .upload input { display: none; }
    .secondary {
      border: 1px solid var(--pbe-chrome-input, #d4d4d8);
      background: var(--pbe-chrome-background, #fff);
      color: var(--pbe-chrome-foreground, #18181b);
    }
    .secondary:hover, .apply:hover { background: var(--pbe-chrome-accent, #f4f4f5); }
    button:focus-visible, .upload:focus-within, input:focus-visible {
      outline: 2px solid var(--pbe-chrome-ring, #287cc1);
      outline-offset: 2px;
    }
    .url-row { display: flex; align-items: center; gap: 0.375rem; margin-top: 0.5rem; }
    .url-input {
      width: 100%;
      max-width: 24rem;
      height: 2.5rem;
      border: 1px solid var(--pbe-chrome-input, #d4d4d8);
      border-radius: 0.375rem;
      background: var(--pbe-chrome-background, #fff);
      padding: 0 0.625rem;
      color: var(--pbe-chrome-foreground, #18181b);
      font: 400 0.875rem/1 ui-sans-serif, system-ui, sans-serif;
    }
    .url-input::placeholder { color: var(--pbe-chrome-muted-foreground, #71717a); }
    .apply {
      min-width: 2.5rem;
      border: 1px solid transparent;
      background: transparent;
      color: var(--pbe-chrome-foreground, #18181b);
      padding: 0 0.5rem;
    }
    .busy { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.75rem; color: var(--pbe-chrome-muted-foreground, #71717a); font-size: 0.875rem; font-weight: 500; }
    .busy svg { width: 1rem; height: 1rem; }
    .error { margin: 0.5rem 0 0; color: #dc2626; font-size: 0.875rem; }
    @keyframes pbe-mph-spin { to { transform: rotate(360deg); } }
    .animate-spin { animation: pbe-mph-spin 1s linear infinite; }
  `;

  const busyPills = new Map<string, HTMLElement>();

  /** Show busy feedback for block `id`; returns the cleanup. `label` null =
   * inert guard only (browse — the host's own UI is the feedback). */
  function beginMediaBusy(id: string, label: string | null): () => void {
    const card = cardOf(id);
    if (card) {
      card.setAttribute("aria-busy", "true");
      const err = card.shadowRoot?.querySelector<HTMLElement>(".pbe-mph-error");
      if (err) err.hidden = true; // a new attempt clears the previous failure
      const busy = card.shadowRoot?.querySelector<HTMLElement>(".pbe-mph-busy");
      if (busy && label) {
        busy.querySelector("span")!.textContent = label;
        busy.hidden = false;
      }
      return () => {
        card.removeAttribute("aria-busy");
        if (busy) busy.hidden = true;
      };
    }
    const root = rootOf(id);
    if (!label || !root || busyPills.has(id)) return () => {};
    const pill = mount(
      h(
        "div",
        "pbe-ui pbe-media-busy absolute z-40 flex items-center gap-2 rounded-full border border-border bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-lg",
      ),
    );
    pill.setAttribute("role", "status");
    pill.innerHTML = `${SPINNER_SVG}<span>${label}</span>`;
    const rect = root.getBoundingClientRect();
    park(
      pill,
      rect.top + rect.height / 2 - pill.offsetHeight / 2,
      rect.left + rect.width / 2 - pill.offsetWidth / 2,
    );
    busyPills.set(id, pill);
    return () => {
      pill.remove();
      busyPills.delete(id);
    };
  }

  function setCardError(id: string, message: string) {
    const err = cardOf(id)?.shadowRoot?.querySelector<HTMLElement>(".pbe-mph-error");
    if (!err) return;
    err.textContent = message;
    err.hidden = false;
  }

  const prevAltOf = (id: string, field: string): string => {
    const cur = editor.getBlock(id)?.fields[field];
    return typeof cur === "object" && cur !== null ? cur.alt : "";
  };

  async function uploadTo(id: string, field: string, file: File) {
    if (!mediaAdapter.upload) return;
    const prevAlt = prevAltOf(id, field);
    const done = beginMediaBusy(id, "Uploading…");
    try {
      const value = await mediaAdapter.upload(file);
      editor.setField(id, field, await toImageValue(value, { file, prevAlt }));
    } catch (err) {
      console.error("[publr-editor] media upload failed:", err);
      setCardError(id, "Upload failed.");
    } finally {
      done();
    }
  }

  async function browseTo(id: string, field: string) {
    if (!mediaAdapter.browse) return;
    const cur = editor.getBlock(id)?.fields[field];
    const current =
      typeof cur === "object" && cur !== null && cur.src !== "" ? { ...cur } : undefined;
    // No spinner label: the host's own library UI is the visible feedback
    // while browse is pending; the card just goes inert against double-opens.
    const done = beginMediaBusy(id, null);
    try {
      const picked = await mediaAdapter.browse(current);
      if (picked) editor.setField(id, field, await toImageValue(picked, { prevAlt: current?.alt }));
    } catch (err) {
      console.error("[publr-editor] media browse failed:", err);
      setCardError(id, "Couldn't get media from the library.");
    } finally {
      done();
    }
  }

  function buildMediaPlaceholder(id: string, field: string, type: string): HTMLElement {
    const def = getBlockType(type)!;
    const noun = def.label.toLowerCase();
    const card = ownerDocument.createElement("pbe-media-placeholder");
    card.className = "pbe-media-ph";
    card.contentEditable = "false";
    const shadow = card.attachShadow({ mode: "open" });
    shadow.innerHTML =
      `<style>${MEDIA_PLACEHOLDER_CSS}</style>` +
      `<div class="card">` +
      `<div class="title">${iconSvg(def.icon ?? "")}<span>${def.label}</span></div>` +
      `<p class="description">Drag and drop ${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun} file, upload, or insert from URL.</p>` +
      `<div class="actions">` +
      `<label class="pbe-mph-upload upload"${uploadsReady() ? "" : " hidden"}>Upload<input type="file"></label>` +
      (mediaAdapter.browse
        ? `<button type="button" class="pbe-mph-browse secondary">Media Library</button>`
        : "") +
      `<button type="button" class="pbe-mph-url-btn secondary">Insert from URL</button>` +
      `</div>` +
      `<form class="pbe-mph-url-row url-row" hidden>` +
      `<input type="text" placeholder="Paste or type URL" class="url-input">` +
      `<button type="submit" class="apply" aria-label="Apply">↵</button>` +
      `</form>` +
      `<div class="pbe-mph-busy busy" role="status" hidden>${SPINNER_SVG}<span>Uploading…</span></div>` +
      `<p class="pbe-mph-error error" role="alert" hidden></p>` +
      `</div>`;

    // The card is interactive chrome inside the contenteditable canvas:
    // keep its events out of the editor's selection/keyboard machinery
    // (Enter must submit the URL form, never split a block) — but clicking
    // it still SELECTS the block, so the sidebar shows its options.
    card.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      editor.selectBlock(id);
    });
    card.addEventListener("keydown", (e) => e.stopPropagation());

    const fileInput = shadow.querySelector<HTMLInputElement>("input[type=file]")!;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) void uploadTo(id, field, file);
    });

    shadow
      .querySelector<HTMLButtonElement>(".pbe-mph-browse")
      ?.addEventListener("click", () => void browseTo(id, field));

    const urlRow = shadow.querySelector<HTMLFormElement>(".pbe-mph-url-row")!;
    const urlInput = urlRow.querySelector<HTMLInputElement>("input")!;
    shadow.querySelector<HTMLButtonElement>(".pbe-mph-url-btn")!.addEventListener("click", () => {
      urlRow.hidden = !urlRow.hidden;
      if (!urlRow.hidden) urlInput.focus();
    });
    urlRow.addEventListener("submit", (e) => {
      e.preventDefault();
      const src = urlInput.value.trim();
      if (!src) return;
      const cur = editor.getBlock(id)?.fields[field];
      const alt = typeof cur === "object" && cur !== null ? cur.alt : "";
      editor.setField(id, field, { src, alt, width: "", height: "" });
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      shadow.querySelector(".card")?.classList.add("drag-active");
    });
    card.addEventListener("dragleave", () =>
      shadow.querySelector(".card")?.classList.remove("drag-active"),
    );
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      shadow.querySelector(".card")?.classList.remove("drag-active");
      const file = e.dataTransfer?.files?.[0];
      if (file && uploadsReady()) void uploadTo(id, field, file);
    });
    return card;
  }

  function syncMediaPlaceholders() {
    if (!withMediaPlaceholder) return;
    for (const root of canvas.querySelectorAll<HTMLElement>("[data-pb-block]")) {
      const id = root.getAttribute("data-pb-id");
      const field = mediaFieldOf(root.getAttribute("data-pb-block"));
      const existing = [...root.querySelectorAll<HTMLElement>(".pbe-media-ph")].find(
        (el) => el.parentElement?.closest("[data-pb-block]") === root,
      );
      const value = id && field ? editor.getBlock(id)?.fields[field] : undefined;
      const empty = typeof value === "object" && value !== null && value.src === "";
      if (!id || !field || !empty) {
        existing?.remove();
        continue;
      }
      if (existing) {
        // SW readiness can flip after mount — keep the Upload button honest
        const upload = existing.shadowRoot?.querySelector<HTMLElement>(".pbe-mph-upload");
        if (upload) upload.hidden = !uploadsReady();
        continue;
      }
      const carrier = [...root.querySelectorAll<HTMLElement>(`[data-pb-image]`)].find(
        (el) =>
          el.getAttribute("data-pb-image") === field && el.closest("[data-pb-block]") === root,
      );
      carrier?.insertAdjacentElement(
        "afterend",
        buildMediaPlaceholder(id, field, root.getAttribute("data-pb-block")!),
      );
    }
  }

  // Upload availability can settle asynchronously (the OPFS worker claims
  // clients after first load) — refresh the affordances once it does.
  void mediaAdapter.ready.then(() => {
    if (!detached) syncMediaPlaceholders();
  });
  disposers.push(() => {
    for (const el of canvas.querySelectorAll(".pbe-media-ph")) el.remove();
    for (const pill of busyPills.values()) pill.remove();
    busyPills.clear();
  });

  // --- drag-to-replace on image blocks ------------------------------------
  // Dragging an image file over the canvas lights every image block up as a
  // drop target (canvas-level pbe-file-drag class — chrome.css draws the
  // outlines); dropping uploads through the media adapter and replaces the
  // block's image field, exactly like the toolbar's Replace. Empty blocks
  // keep the placeholder card's own drop handling (it consumes the event
  // before this bubbles). All state is chrome-only — a class on the canvas
  // plus a data attribute on the hovered root, never classes on content
  // elements, which upcast would harvest as authored.

  const DROP_ACTIVE = "data-pbe-drop-active";

  const dropRootOf = (t: EventTarget | null): HTMLElement | null =>
    t instanceof ownerWindow.Element ? t.closest<HTMLElement>('[data-pb-block="image"]') : null;

  let dropActiveRoot: HTMLElement | null = null;
  const setDropActive = (root: HTMLElement | null) => {
    if (root === dropActiveRoot) return;
    dropActiveRoot?.removeAttribute(DROP_ACTIVE);
    dropActiveRoot = root;
    root?.setAttribute(DROP_ACTIVE, "");
  };

  let fileDragDepth = 0;
  const endFileDrag = () => {
    fileDragDepth = 0;
    canvas.classList.remove("pbe-file-drag");
    setDropActive(null);
  };

  // A drag qualifies while it plausibly carries an image FILE. Some platforms
  // hide item types mid-drag (empty string) — light up anyway and let the
  // drop handler check the real File.
  const isImageFileDrag = (e: DragEvent): boolean => {
    if (!uploadsReady()) return false;
    const items = e.dataTransfer?.items;
    if (items?.length) {
      return [...items].some(
        (it) => it.kind === "file" && (it.type === "" || it.type.startsWith("image/")),
      );
    }
    return !!e.dataTransfer?.types.includes("Files");
  };

  const canvasOn = <K extends keyof HTMLElementEventMap>(
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    capture?: boolean,
  ) => {
    canvas.addEventListener(type, fn, capture);
    disposers.push(() => canvas.removeEventListener(type, fn, capture));
  };

  // dragenter/dragleave fire per descendant — depth counting nets them out.
  canvasOn("dragenter", (e) => {
    if (!isImageFileDrag(e)) return;
    fileDragDepth++;
    canvas.classList.add("pbe-file-drag");
  });
  canvasOn("dragleave", () => {
    if (fileDragDepth > 0 && --fileDragDepth === 0) endFileDrag();
  });
  canvasOn("dragover", (e) => {
    if (!canvas.classList.contains("pbe-file-drag")) return;
    const root = dropRootOf(e.target);
    setDropActive(root);
    if (!root) return;
    e.preventDefault(); // over an image block the drop is ours
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  // Capture phase: the highlight must clear even when the placeholder card
  // consumes the drop (it stopPropagation()s into its own upload path).
  canvasOn("drop", endFileDrag, true);
  canvasOn("drop", (e) => {
    const root = dropRootOf(e.target);
    const id = root?.getAttribute("data-pb-id");
    const field = mediaFieldOf(root?.getAttribute("data-pb-block") ?? null);
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith("image/"));
    if (!root || !id || !field || !file) return;
    e.preventDefault();
    if (uploadsReady()) void uploadTo(id, field, file);
  });
  // External OS drags never fire dragend on our elements when they leave the
  // window — the document-level dragend/drop are the safety net.
  listen("dragend", endFileDrag);
  listen("drop", endFileDrag);
  disposers.push(endFileDrag);

  // Click anywhere outside an open panel dismisses it. DOM constructors are
  // realm-specific, so never gate an iframe event through the host window's
  // `Node`. Also listen in the parent document: events do not bubble across
  // an iframe boundary, but sidebar/topbar clicks are still outside clicks.
  const dismissOpenPanel = (e: MouseEvent) => {
    if (!openPanel) return;
    if (!e.composedPath().includes(openPanel.el)) closePanel();
  };
  listen("mousedown", dismissOpenPanel);
  if (ownerDocument !== document) {
    document.addEventListener("mousedown", dismissOpenPanel);
    disposers.push(() => document.removeEventListener("mousedown", dismissOpenPanel));
  }

  // Caret movement WITHIN a block changes mark states and the +'s row without
  // any store change. Cheap when another instance owns the caret: active=null.
  listen("selectionchange", () => {
    if (detached) return;
    syncToolbar();
    syncSpacerResizer();
    syncImageResizer();
  });

  const unsubscribe = editor.subscribe(() => {
    if (detached) return;
    syncSlash();
    hideAppender();
    syncToolbar();
    syncSpacerResizer();
    syncImageResizer();
    syncMediaPlaceholders();
  });
  syncMediaPlaceholders(); // content may already be loaded when chrome attaches
  disposers.push(unsubscribe);

  // Block-selection changes (cmd+click, Escape, drag promotion) ride the
  // editor's reactive selection store.
  effect(() => {
    if (detached) return;
    syncToolbar();
    syncSpacerResizer();
    syncImageResizer();
  });

  // Scrolling and resizing don't touch the model or selection, but the sticky
  // toolbar has to re-clamp against the viewport on both — a cheap reposition,
  // no button-state rebuild. Listen on the scroll container (falling back to
  // the window if the canvas isn't the scroller).
  const reposition = () => {
    // An open dropdown is parked against the toolbar's current spot — moving
    // the toolbar out from under it would separate the two. Leave both put.
    if (!detached && !openPanel) {
      hideAppender();
      positionToolbar();
      positionHover();
      syncSpacerResizer();
      syncImageResizer();
    }
  };
  (scroller ?? ownerWindow).addEventListener("scroll", reposition, {
    passive: true,
  });
  ownerWindow.addEventListener("resize", reposition);
  disposers.push(() => (scroller ?? ownerWindow).removeEventListener("scroll", reposition));
  disposers.push(() => ownerWindow.removeEventListener("resize", reposition));

  return function detach() {
    detached = true;
    closePanel();
    disposers.forEach((d) => d());
    mounted.forEach((el) => el.remove());
    chromeHost.remove();
    canvas.classList.remove("pbe-canvas", "pbe-block-hover-model");
  };
}
