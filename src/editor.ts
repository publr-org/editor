// editor.ts — createEditor: the contenteditable canvas over a block model.
//
// Two invariants everything here obeys:
// - Every model mutation flows through one commit() choke point, where
//   history is recorded. Nothing mutates `model` anywhere else.
// - The canvas is an uncontrolled contenteditable surface: model → DOM only
//   via explicit renders (renderCanvas / time travel), DOM → model only via
//   input events. Native browser undo is DISOWNED (intercepted and routed to
//   our history) — it would revert the DOM behind the model's back.

import {
  EDITABLE_SELECTOR,
  RAW_TYPE,
  classList,
  cloneValue,
  escHtml,
  mintId,
  readCarrier,
  scopedCarriers,
  str,
} from "./carriers";
import type { Block, CarrierKind, FieldValue, Model } from "./carriers";
import { blockToElement, downcast, upcast } from "./cast";
import type { DowncastPipeline } from "./cast";
import {
  applyLink as applyLinkFmt,
  formatState,
  linkState as readLinkState,
  removeLink as removeLinkFmt,
  selectItemRange,
  toggleMark,
} from "./format";
import { createHistory } from "./history";
import {
  DEFAULT_BLOCK_POLICY,
  intersectFormats,
  isContentOnlyPreset,
  resolveBlockPolicy,
  resolveRootPolicy,
  resolveSlotPolicy,
  summarizeRootPolicy,
} from "./policy";
import type { BlockPolicy, EditorPolicy, PolicyConfig, RootPolicy } from "./policy";
import {
  PATTERN_ROOT_TYPE,
  getPattern,
  isPatternContentBlock,
  patternContentBlocks,
} from "./patterns";
import { getBlockType } from "./registry";
import type { BlockType, ControlRole, SettingSpec } from "./registry";
import { createBlockSelection } from "./selection";
import { STYLE_PROPS, blockSupportsStyle, styleBreakpoints, variantClasses } from "./style";
import type { StyleBreakpoint, StyleSupports } from "./style";
import { classesBackend } from "./style-backend";
import type { StyleBackend } from "./style-backend";
import { activeTheme, hasToken, semanticColorRoles, setActiveTheme } from "./theme";
import type { Theme } from "./theme";
import { flattenBlocks, locateBlock, pathToBlock } from "./tree";

export interface EditorOptions {
  /** HTMLElement the editor renders into. */
  canvas: HTMLElement;
  /** Block type Enter-splitting creates (e.g. "paragraph"). */
  defaultBlock: string;
  /**
   * Container type Cmd+G wraps a selection in (e.g. "group") — must be a
   * registered type whose render emits a data-pb-children slot. Grouping is
   * disabled when absent.
   */
  groupBlock?: string;
  /** Fired after every committed model change (incl. undo/redo). */
  onChange?: () => void;
  /** Clock override for tests (defaults to Date.now). */
  now?: () => number;
  /** Log every edit to the console (also toggleable: editor.debug = true). */
  debug?: boolean;
  /**
   * Ghost prompt shown on an empty default block (canvas chrome, never
   * serialized); pass "" to disable.
   */
  placeholder?: string;
  /**
   * Editing policy for this editor (instance/global scope): allowed blocks,
   * orderability, a preset (e.g. "content-only"), and per-type overrides. A
   * runtime schema layer — never serialized, never read off the DOM
   * (thoughts/010). Enforced: editable/allowedFormats (A2), movable/orderable
   * (A3), removable (A4); preset expansion (A5). allowedBlocks insertion gating
   * lands in Phase B.
   */
  policy?: PolicyConfig;
  /**
   * The SITE theme style values resolve against (E1, css-engine): token
   * scales populate the style controls, and styleClasses maps token values to
   * utilities. Page-scoped by design — a page is one site, every instance
   * shares it (theme.ts setActiveTheme). Absent = keep the page's current
   * theme (initially the vendored Tailwind default).
   */
  theme?: Theme;
  /**
   * The STYLE BACKEND (E2a, css-engine): how lens facts materialize in the
   * ownerDocument. Default = the classes backend (utility classes in the class
   * attr — Tailwind-native, engine-compiled). `inlineBackend` writes CSS
   * declarations with var(--token) refs instead (zero tooling; the host
   * injects backend.css()). Third parties may bring their own.
   */
  styleBackend?: StyleBackend;
}

// Where the user is: block + carrier field + character offset of the caret
// within the carrier (measured over text content, so it survives the
// re-render — the restored DOM has different nodes but the same text).
interface CaretSnapshot {
  blockId: string;
  field?: string | null;
  offset?: number;
}

// History entries are {model, selection} snapshots; the model is plain JSON
// by construction (round-trip law), so structuredClone is a complete snapshot.
interface HistoryEntry {
  model: Model;
  selection: CaretSnapshot | null;
}

export type EditingMode = "default" | "content-only" | "disabled";

export function createEditor({
  canvas,
  defaultBlock,
  groupBlock,
  onChange,
  now = Date.now,
  debug = false,
  placeholder = "Type / to choose a block",
  policy: policyConfig = {},
  theme,
  styleBackend = classesBackend,
}: EditorOptions) {
  let model: Model = { blocks: [] };
  // The editable surface may live in a same-origin iframe. Every selection,
  // focus, range, and document listener must follow the canvas's realm rather
  // than the shell's global document; otherwise responsive preview works but
  // editing silently stays wired to the parent page.
  const ownerDocument = canvas.ownerDocument;
  const ownerWindow = ownerDocument.defaultView ?? window;

  // Site theme (E1): install when given; absent leaves the page's theme alone
  // (a second themeless instance must not clobber the first's site theme).
  if (theme) setActiveTheme(theme);

  // Variant carrier (E2): an `is-style-<name>` marker class + the resolved
  // recipe classes, both in block.classes — recognition survives the
  // user tweaking individual classes (the marker stays), and switching
  // removes exactly the OLD variant's resolved recipe classes. Definitions
  // contain semantic style values; utility classes never enter the public API.
  const VARIATION_MARKER = /^is-style-(.+)$/;
  function readVariation(block: Block): string {
    for (const cls of classList(block.classes)) {
      const m = VARIATION_MARKER.exec(cls);
      if (m) return m[1];
    }
    return "";
  }
  function writeVariation(block: Block, name: string): void {
    const def = getBlockType(block.type);
    const oldSet = new Set(variantClasses(def?.variants, readVariation(block)));
    const classes = classList(block.classes).filter(
      (c) => !VARIATION_MARKER.test(c) && !oldSet.has(c),
    );
    if (name) classes.push(`is-style-${name}`, ...variantClasses(def?.variants, name));
    block.classes = classes.join(" ");
  }

  // The policy layer: resolved from config, held in the running instance, never
  // on the block model (policy on Block.* would ride structuredClone into
  // history yet be dropped by downcast → break the round-trip law) and never
  // serialized. Per-block effective policy is DERIVED on query (thoughts/010).
  // Mutable: setPolicy swaps it at runtime (host context changes, patterns, A5).
  let rootPolicy: RootPolicy = resolveRootPolicy(policyConfig);

  // The undo/redo keys are canvas-scoped (a host page's own Cmd+Z must not
  // reach us), so the canvas must be able to HOLD focus when no carrier can —
  // e.g. after deleting every block. tabindex=-1: programmatically focusable,
  // not in the tab order.
  if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = -1;

  // Editor-driven mutations must never drop focus out of the editor —
  // keyboard undo dies the moment focus lands on <body>.
  function ensureCanvasFocus() {
    if (!canvas.contains(ownerDocument.activeElement)) canvas.focus({ preventScroll: true });
  }

  // onChange fires on a microtask, AFTER the editor settles: mid-commit the
  // model is mutated but the canvas isn't re-rendered yet, and chrome reading
  // both would see torn state (a DOM root whose block no longer exists).
  // Subscribers ride the same microtask: layered chrome (attachInlineChrome)
  // observes changes WITHOUT stealing the host's onChange slot.
  const subscribers = new Set<() => void>();
  const notify = () =>
    queueMicrotask(() => {
      onChange?.();
      for (const fn of subscribers) fn();
    });

  // Debug tracing: every model change (commit, undo/redo, load) in one line.
  // console.log, not console.debug — tracing is explicitly opt-in, and
  // DevTools hides the Verbose level (console.debug) by default.
  let debugOn = !!debug;
  const trace = (...args: unknown[]) => debugOn && console.log("[publr-editor]", ...args);
  const depths = () => `undo ${history.flags.undoDepth} · redo ${history.flags.redoDepth}`;

  const typeOverrides = Object.keys(policyConfig.blocks ?? {}).length;
  trace(
    `policy: ${summarizeRootPolicy(rootPolicy)}${typeOverrides ? ` · ${typeOverrides} type-override${typeOverrides === 1 ? "" : "s"}` : ""}`,
  );

  // --- history ---------------------------------------------------------------

  const history = createHistory<HistoryEntry>({ now });
  const snapshot = (): HistoryEntry => ({
    model: structuredClone(model),
    selection: captureSelection(),
  });

  // Undo-of-split restores exactly: the snapshot is taken before the
  // mutation, while the caret still sits at the split point. For typing, the
  // input event fires after the DOM changed, so the captured offset can sit
  // one keystroke past the run's start — clamped on restore, close enough.
  function captureSelection(): CaretSnapshot | null {
    const el = ownerDocument.activeElement;
    const root = el && canvas.contains(el) ? el.closest("[data-pb-id]") : null;
    if (!el || !root) return null;
    const out: CaretSnapshot = { blockId: root.getAttribute("data-pb-id")! };
    const carrier = el.closest(EDITABLE_SELECTOR);
    const sel = ownerWindow.getSelection();
    if (carrier && sel?.rangeCount && carrier.contains(sel.getRangeAt(0).startContainer)) {
      const at = sel.getRangeAt(0);
      const r = ownerDocument.createRange();
      r.selectNodeContents(carrier);
      r.setEnd(at.startContainer, at.startOffset);
      out.field = carrier.getAttribute("data-pb-text") ?? carrier.getAttribute("data-pb-rich");
      out.offset = r.toString().length;
    }
    return out;
  }

  // Put the caret back: at the captured character offset when we have one
  // (walking the restored carrier's text nodes, clamped to its end), else at
  // the end of the block's last editable carrier.
  function restoreSelection(s: CaretSnapshot | null) {
    if (!s) return;
    const root = rootOf(s.blockId);
    if (!root) return;
    const carrier =
      s.offset != null &&
      scopedCarriers(root).find(
        (el) =>
          el.isContentEditable &&
          (el.getAttribute("data-pb-text") === s.field ||
            el.getAttribute("data-pb-rich") === s.field),
      );
    if (!carrier) return focusEdge(s.blockId, "end");

    carrier.focus({ preventScroll: true });
    const range = ownerDocument.createRange();
    let remaining = s.offset!;
    let placed = false;
    const walker = ownerDocument.createTreeWalker(carrier, ownerWindow.NodeFilter.SHOW_TEXT);
    for (let node: Text | null; (node = walker.nextNode() as Text | null); ) {
      if (remaining <= node.data.length) {
        range.setStart(node, remaining);
        range.collapse(true);
        placed = true;
        break;
      }
      remaining -= node.data.length;
    }
    if (!placed) {
      range.selectNodeContents(carrier);
      range.collapse(false); // offset beyond the restored text — clamp to end
    }
    const sel = ownerWindow.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // THE mutation choke point. meta.key marks the commit as coalescable —
  // typing passes one, structural edits don't (see history.record);
  // meta.label names the edit for debug tracing.
  function commit(mutate: (model: Model) => void, meta: { key?: string; label?: string } = {}) {
    const fresh = history.record(snapshot, meta.key ?? null);
    mutate(model);
    trace(
      `commit: ${meta.label ?? meta.key ?? "edit"}`,
      fresh ? "· new entry" : "· coalesced",
      `· ${depths()}`,
    );
    notify();
  }

  // Restore a history entry: swap the model, re-derive the canvas from it
  // (the canvas never changes any other way), put the caret back.
  function timeTravel(op: (getCurrent: () => HistoryEntry) => HistoryEntry | null, label: string) {
    const entry = op(snapshot);
    if (!entry) return trace(`${label}: nothing to ${label}`);
    model = entry.model;
    renderCanvas();
    restoreSelection(entry.selection);
    trace(
      `${label} → ${model.blocks.length} block${model.blocks.length === 1 ? "" : "s"}`,
      `· ${depths()}`,
    );
    notify();
  }

  const undo = () => timeTravel(history.undo, "undo");
  const redo = () => timeTravel(history.redo, "redo");

  // --- block multiselection ----------------------------------------------------
  // Native selection crossing a block boundary promotes to block-level
  // selection (see selection.ts). Deletion of the selected run is handled at
  // the DOCUMENT level in the capture phase: after a mouse drag, focus isn't
  // reliably inside any carrier, so canvas-level keydown would miss the key —
  // and capture makes this win over the single-block Backspace handler below.

  // Pattern instances are OPAQUE to selection (thoughts/012): a gesture that
  // resolves to a structural child — layout containers, raw blocks, utility
  // blocks — selects the INSTANCE instead; only content blocks (the editable
  // units) pass through, and a click inside a content block's innards lands
  // on the unit itself. The full structure is the isolation editor's business
  // — chrome turns the opacity OFF there (setPatternsOpaque), because the
  // isolated content may itself carry pattern provenance (definition mode
  // loads the pattern's own fragment).
  // An instance root is EITHER the phantom pattern wrapper (stamps) or any
  // block carrying resolvable pattern provenance (documents authored with
  // data-pb-pattern on a real container — the fixture homepage sections).
  let patternsOpaque = true;
  canvas.classList.add("pbe-patterns-opaque"); // CSS hook: chrome hides intra-instance affordances
  const isInstanceRoot = (b: Block) =>
    b.type === PATTERN_ROOT_TYPE || !!(b.pattern && getPattern(b.pattern));
  const pointInsideBlock = (id: string, point: { clientX: number; clientY: number }): boolean => {
    const el = canvas.querySelector<HTMLElement>(`[data-pb-id="${CSS.escape(id)}"]`);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    // Geometry is unavailable in non-layout DOMs (and for a transiently
    // detached node). Preserve the id-based fallback there; a real visible
    // click always has a measurable border box.
    if (!rect.width && !rect.height) return true;
    return (
      point.clientX >= rect.left &&
      point.clientX <= rect.right &&
      point.clientY >= rect.top &&
      point.clientY <= rect.bottom
    );
  };
  const resolvePatternTarget = (
    id: string,
    point?: { clientX: number; clientY: number },
  ): string => {
    if (!patternsOpaque) return id;
    const path = pathToBlock(model.blocks, id);
    if (!path) return id;
    const rootIdx = path.findIndex(isInstanceRoot);
    if (rootIdx === -1) return id;
    const unit = path.slice(rootIdx + 1).find(isPatternContentBlock);
    if (!unit) return path[rootIdx].id;
    // Browser hit-testing can report a contenteditable child for clicks in
    // its margin or in nearby layout space. In an opaque pattern, content
    // blocks are reachable ONLY through their actual rendered border box;
    // all surrounding structure belongs to the pattern instance.
    return !point || pointInsideBlock(unit.id, point) ? unit.id : path[rootIdx].id;
  };

  const blockSel = createBlockSelection({
    canvas,
    getBlocks: () => model.blocks,
    resolveTarget: resolvePatternTarget,
    onChange: (ids) => {
      trace(ids.length ? `select: ${ids.length} blocks` : "select: none");
      // Escape (and other purely-explicit clears) change the selection with
      // NO selectionchange/focus event — the ghost check must ride this too.
      checkGhost();
    },
  });

  // Any click inside a pattern instance briefly flashes its editable units —
  // the affordance for "these parts are yours; Edit pattern owns the rest".
  function onPatternFlash(event: MouseEvent) {
    if (event.button !== 0 || !patternsOpaque) return;
    const el =
      event.target instanceof ownerWindow.Element ? event.target.closest("[data-pb-id]") : null;
    const path = el ? pathToBlock(model.blocks, el.getAttribute("data-pb-id")!) : null;
    if (!path) return;
    const rootIdx = path.findIndex(isInstanceRoot);
    if (rootIdx === -1) return;
    // Clicking INSIDE an editable unit needs no affordance — the click already
    // lands where editing happens. Flash only for clicks on the opaque rest.
    const root = path[rootIdx];
    if (resolvePatternTarget(path[path.length - 1].id, event) !== root.id) return;
    // DETACHED veils, not classes on the units: any style set on the unit
    // itself (position, ::after) can fight its own layout classes — a
    // fixed-position sibling in the body can't perturb anything. They live in
    // a clip box sized to the canvas so partially off-screen units never
    // bleed over the sidebars.
    for (const el of ownerDocument.querySelectorAll("[data-pbe-pattern-flash]")) el.remove(); // rapid re-clicks
    const cr = canvas.getBoundingClientRect();
    const overlay = ownerDocument.createElement("pbe-pattern-flash");
    overlay.setAttribute("data-pbe-pattern-flash", "");
    const shadow = overlay.attachShadow({ mode: "open" });
    const style = ownerDocument.createElement("style");
    style.textContent = `
      :host { all: initial; display: contents; }
      .clip { position: fixed; z-index: 40; overflow: hidden; pointer-events: none; }
      .veil {
        position: absolute;
        border-radius: 3px;
        background: rgb(86 93 217 / 24%);
        animation: pbe-flash 650ms ease-out forwards;
        pointer-events: none;
      }
      @keyframes pbe-flash { from { opacity: 1; } to { opacity: 0; } }
    `;
    const clip = ownerDocument.createElement("div");
    clip.className = "clip";
    clip.style.left = `${cr.left}px`;
    clip.style.top = `${cr.top}px`;
    clip.style.width = `${cr.width}px`;
    clip.style.height = `${cr.height}px`;
    for (const b of patternContentBlocks(root)) {
      const unit = canvas.querySelector<HTMLElement>(`[data-pb-id="${CSS.escape(b.id)}"]`);
      if (!unit) continue;
      const r = unit.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const veil = ownerDocument.createElement("div");
      veil.className = "veil";
      veil.style.left = `${r.left - cr.left - 3}px`;
      veil.style.top = `${r.top - cr.top - 3}px`;
      veil.style.width = `${r.width + 6}px`;
      veil.style.height = `${r.height + 6}px`;
      clip.appendChild(veil);
      veil.addEventListener(
        "animationend",
        () => {
          veil.remove();
          if (!clip.childElementCount) overlay.remove();
        },
        { once: true },
      );
    }
    if (clip.childElementCount) {
      shadow.append(style, clip);
      ownerDocument.body.appendChild(overlay);
    }
  }
  canvas.addEventListener("mousedown", onPatternFlash);

  function onMultiDelete(event: KeyboardEvent) {
    if (
      (event.key !== "Backspace" && event.key !== "Delete") ||
      event.defaultPrevented ||
      !blockSel.active()
    )
      return;
    event.preventDefault();
    // Pinned blocks (removable:false) are SKIPPED — the run deletes around them.
    const ids = blockSel.ids.filter(canRemoveBlock);
    if (!ids.length) return; // whole selection is pinned: keep it, delete nothing
    const first = locate(ids[0]);
    const prev = first && first.index > 0 ? first.list[first.index - 1] : undefined;
    commit(
      () => {
        // per-id: ids may live in different sibling lists (cmd+click), and
        // deleting a container already removed its descendants. dropBlock is the
        // one gated removal path (redundant with the filter above — belt + suspenders).
        for (const id of ids) dropBlock(id);
      },
      { label: `remove ${ids.length} block${ids.length === 1 ? "" : "s"}` },
    );
    renderCanvas();
    ownerWindow.getSelection()?.removeAllRanges();
    if (prev) focusEdge(prev.id, "end");
    else if (model.blocks.length) focusEdge(model.blocks[0].id, "start");
    ensureCanvasFocus(); // empty doc / raw-html-first: the canvas itself holds focus
  }
  ownerDocument.addEventListener("keydown", onMultiDelete, true);

  // --- model/DOM lookups -------------------------------------------------------
  // The model is a tree: every lookup that used to index model.blocks now
  // locates the SIBLING LIST containing the block (tree.ts) and splices that.

  const locate = (id: string) => locateBlock(model.blocks, id);
  const findBlock = (id: string) => locate(id)?.block;

  // Content-only is a CONTEXT, not just a root preset. In the page editor it
  // derives from pattern ancestry; the isolation editor disables opacity and
  // therefore restores the same blocks to full/default editing.
  const patternContextFor = (id: string): { id: string; name: string } | null => {
    const path = pathToBlock(model.blocks, id);
    const root = path?.find(isInstanceRoot);
    return root?.pattern ? { id: root.id, name: root.pattern } : null;
  };

  const isPatternContentOnly = (id: string): boolean => {
    if (!patternsOpaque) return false;
    const root = patternContextFor(id);
    return !!root && root.id !== id;
  };

  const editingModeFor = (id: string): EditingMode => {
    const block = findBlock(id);
    if (!block) return "disabled";
    const base = resolveBlockPolicy(policyConfig, block.type);
    if (!base.editable) return "disabled";
    if (isPatternContentOnly(id) || isContentOnlyPreset(policyConfig.preset)) return "content-only";
    return "default";
  };

  const settingRole = (def: BlockType | undefined, setting: SettingSpec): ControlRole => {
    if (setting.role) return setting.role;
    if (setting.transform) return "structure";
    const field = setting.field
      ? def?.fields.find((candidate) => candidate.name === setting.field)
      : undefined;
    return field?.type === "tag" ? "structure" : setting.field ? "content" : "advanced";
  };

  // Effective per-block policy: registry type rules ∩ createEditor override,
  // most-restrictive (thoughts/004). allowedFormats intersects across sources;
  // the boolean locks come from the createEditor config for now (registry/
  // pattern context merge in as later phases wire them). Never serialized.
  const effectiveBlockPolicy = (block: Block): BlockPolicy => {
    const base = resolveBlockPolicy(policyConfig, block.type);
    const typeFormats = getBlockType(block.type)?.allowedFormats ?? null;
    const effective = {
      ...base,
      allowedFormats: intersectFormats(typeFormats, base.allowedFormats),
    };
    if (!isPatternContentOnly(block.id)) return effective;
    return {
      ...effective,
      movable: false,
      removable: false,
      duplicable: false,
      stylable: false,
    };
  };

  // Orderability of a CONTAINER's direct children: the root uses top-level
  // policy; a nested slot uses its container type's slot policy (D2). Scoped,
  // never cascaded — root orderable does not reach into a slot (thoughts/006).
  const containerOrderable = (parent: Block | null): boolean =>
    (parent ? resolveSlotPolicy(policyConfig, parent.type).orderable : rootPolicy.orderable) !==
    false;

  // Reorder gate (A3 + D2): a block moves only when its own policy permits AND
  // its CONTAINER allows reordering. The moveBlock primitive and the toolbar
  // both consult this.
  const canMoveBlock = (id: string): boolean => {
    const at = locate(id);
    return !!at && effectiveBlockPolicy(at.block).movable && containerOrderable(at.parent);
  };

  // Cross-container reorder gate. Moving OUT still belongs to the source
  // container's orderability contract (canMoveBlock); moving IN additionally
  // belongs to the destination container's orderability + admission contract.
  // A container can never move into its own subtree.
  const canMoveBlockTo = (id: string, parentId: string | null): boolean => {
    const at = locate(id);
    if (!at || !canMoveBlock(id)) return false;
    if (parentId === id) return false;
    // Reordering in the slot that already owns the block is not insertion.
    // The document may contain permissively-upcast legacy content that a
    // current admission policy would no longer allow as a fresh child; that
    // must not make the existing child impossible to reorder.
    if ((at.parent?.id ?? null) === parentId) return true;
    const parent: Block | null = parentId ? (findBlock(parentId) ?? null) : null;
    if (parentId && (!parent?.children || !containerOrderable(parent))) return false;
    if (parent && patternsOpaque && isInstanceRoot(parent)) return false;
    if (!parentId && !containerOrderable(null)) return false;
    if (!slotAccepts(parent, at.block.type)) return false;
    return !parentId || !pathToBlock(at.block.children ?? [], parentId);
  };

  // Removal policy (A4), in one place.
  const canRemoveBlock = (id: string): boolean => {
    const block = findBlock(id);
    return !!block && effectiveBlockPolicy(block).removable;
  };

  // Root insertion policy (B2): may `type` be added at the ROOT? null = all,
  // false = none, list = allowlist. Folded into slotAccepts (below) so every
  // insertion path enforces it; nested slots keep block-def allowedChildren.
  const canInsert = (type: string): boolean => {
    const allowed = rootPolicy.allowedBlocks;
    return allowed === null ? true : allowed !== false && allowed.includes(type);
  };

  // THE block-removal choke point: every path that takes a block OUT of the tree
  // (multiselect delete, backspace/delete merge, ghost cleanup) splices through
  // here, so the `removable` gate lives in ONE place. Mutates the model — call
  // inside a commit()/history.drop the same way the raw splices it replaced did.
  // `force` bypasses the gate for internal, non-user removals (canceling an
  // uncommitted append) — policy governs what the USER deletes, not cleanup.
  const dropBlock = (id: string, opts?: { force?: boolean }): boolean => {
    if (!opts?.force && !canRemoveBlock(id)) return false;
    const at = locate(id);
    if (!at) return false;
    at.list.splice(at.index, 1);
    return true;
  };

  const rootOf = (id: string) =>
    canvas.querySelector<HTMLElement>(`[data-pb-id="${CSS.escape(id)}"]`);
  const blockAt = (el: Element | null | undefined): Block | undefined => {
    const root = el?.closest("[data-pb-block]"); // NEAREST root — nested carriers belong to the nested block
    return root ? findBlock(root.getAttribute("data-pb-id") ?? "") : undefined;
  };
  const carrierAt = (target: EventTarget | null): HTMLElement | null =>
    target instanceof ownerWindow.Element ? target.closest<HTMLElement>(EDITABLE_SELECTOR) : null;

  function makeBlock(type: string, seedChildren = true): Block {
    const def = getBlockType(type);
    const fields = Object.fromEntries(
      (def?.fields ?? []).map((f) => [f.name, cloneValue(f.default)]),
    );
    const block: Block = { type, id: mintId(), fields, classes: "" };
    // Sparse: {} = every island value at its declared default. Presence keyed
    // on the TYPE declaring island settings, mirroring `children` on containers.
    if (def?.islandSettings.length) block.settings = {};
    if (def?.acceptsChildren) {
      // A freshly inserted container starts with one empty default block —
      // the container itself has no carriers, so this is what makes it
      // immediately editable (ghost prompt live, caret has somewhere to go).
      // A declared childTemplate wins (the block's own seed template — a
      // list seeds one list-item, not a paragraph).
      const defaultDef = getBlockType(defaultBlock);
      block.children = !seedChildren
        ? []
        : def.childTemplate
          ? def.childTemplate.filter((t) => getBlockType(t)).map((t) => makeBlock(t))
          : defaultDef &&
              !defaultDef.acceptsChildren &&
              (!def.allowedChildren || def.allowedChildren.includes(defaultBlock))
            ? [makeBlock(defaultBlock)]
            : [];
    }
    return block;
  }

  const copyBlock = (source: Block): Block => ({
    type: source.type,
    id: mintId(),
    fields: Object.fromEntries(
      Object.entries(source.fields).map(([name, value]) => [name, cloneValue(value)]),
    ),
    ...(source.classes != null ? { classes: source.classes } : {}),
    ...(source.css != null ? { css: source.css } : {}),
    ...(source.settings != null
      ? { settings: JSON.parse(JSON.stringify(source.settings)) as Record<string, unknown> }
      : {}),
    ...(source.pattern != null ? { pattern: source.pattern } : {}),
    ...(source.children != null ? { children: source.children.map(copyBlock) } : {}),
  });

  // A slot's allowedChildren gates what the EDITOR puts there — split,
  // transform and replace are refused; upcast stays permissive. The document
  // root accepts everything.
  // Container admission — the single insertion gate. The ROOT uses the editor's
  // allowedBlocks policy (B2); a nested slot intersects its block-def
  // allowedChildren (the block author's type rule) with the container type's
  // slot policy (the template author's, D2) — most-restrictive, two-author
  // model (thoughts/004), never cascaded from root (006). Every insertion path
  // that knows its parent (replace, split, pattern-stamp, transform, append)
  // routes through here; the two root primitives that don't (insertBlock/
  // insertPattern) call canInsert directly.
  function slotAccepts(parent: Block | null, type: string): boolean {
    if (!parent) return canInsert(type); // root → policy
    if (editingModeFor(parent.id) !== "default") return false;
    const allow = getBlockType(parent.type)?.allowedChildren;
    if (allow && !allow.includes(type)) return false; // block-def type rule
    const slot = resolveSlotPolicy(policyConfig, parent.type).allowedBlocks; // template policy (D2)
    return slot === null ? true : slot !== false && slot.includes(type);
  }

  // A pattern stamp: upcast the registered fragment (the same path documents
  // load through) and re-mint EVERY id — patterns are independent copies,
  // never references, and ids authored in the fragment would collide from
  // the second stamp on.
  function stampPattern(name: string): Block[] | null {
    const pattern = getPattern(name);
    if (!pattern) return null;
    const tmp = ownerDocument.createElement("div");
    tmp.innerHTML = pattern.content;
    const blocks = upcast(tmp).blocks;
    for (const b of flattenBlocks(blocks)) b.id = mintId();
    // The stamp gets a real ROOT: the phantom pattern block carries the
    // identity — its own tree node, the home for future template-only
    // options, and NO published output (the data pipeline unwraps it).
    // Hosts that skip registering the phantom type fall back to bare roots,
    // identified by whatever provenance the fragment itself carries.
    if (!getBlockType(PATTERN_ROOT_TYPE)?.phantom) return blocks;
    for (const b of blocks) delete b.pattern; // the root owns the identity now
    return [
      {
        type: PATTERN_ROOT_TYPE,
        id: mintId(),
        fields: {},
        classes: "",
        children: blocks,
        pattern: name,
      },
    ];
  }

  // Vertical-only scroll: scrollIntoView has no "leave horizontal alone"
  // option, and its inline panning strands a wide canvas sideways with no
  // gesture to bring it back. Snapshot every ancestor's scrollLeft — walking
  // through same-origin iframe boundaries as well — let the browser do the
  // instant vertical reveal, then put every horizontal axis back. The
  // cross-frame walk matters in responsive comparison: selecting a projected
  // desktop block must not pan the outer breakpoint stage toward the live
  // iframe's previous position.
  function scrollBlockIntoView(el: Element, block: ScrollLogicalPosition = "nearest") {
    const saved: Array<[Element, number]> = [];
    const windows: Array<[Window, number]> = [];
    const seenWindows = new Set<Window>();
    let cursor: Element | null = el;
    let view: Window | null = el.ownerDocument.defaultView;
    while (cursor && view) {
      for (let n = cursor.parentElement; n; n = n.parentElement) saved.push([n, n.scrollLeft]);
      if (!seenWindows.has(view)) {
        seenWindows.add(view);
        windows.push([view, view.scrollX]);
      }
      try {
        const frame = view.frameElement;
        if (!frame) break;
        cursor = frame;
        view = frame.ownerDocument.defaultView;
      } catch {
        break; // a cross-origin embedding boundary cannot be inspected
      }
    }
    el.scrollIntoView({ block, inline: "nearest" });
    for (const [n, left] of saved) if (n.scrollLeft !== left) n.scrollLeft = left;
    for (const [win, left] of windows) if (win.scrollX !== left) win.scrollTo(left, win.scrollY);
  }

  // Where a fresh insert lands (call after renderCanvas): a CONTAINER selects
  // as a whole block — the user just placed a structure, and a caret in its
  // first text field misreads the intent (same rule as
  // selectBlock). Leaf blocks still take the caret.
  function landOnInserted(block: Block) {
    if (block.children) {
      const r = rootOf(block.id);
      if (r) scrollBlockIntoView(r);
      blockSel.select(block.id);
    } else {
      focusEdge(block.id, "start");
    }
    ensureCanvasFocus();
  }

  // A pattern stamp ALWAYS lands block-selected — it is a composition by
  // definition (a single root is necessarily a container; multiple roots
  // select as a run).
  function landOnStamp(stamped: Block[]) {
    const stampRoot = rootOf(stamped[0].id);
    if (stampRoot) scrollBlockIntoView(stampRoot);
    if (stamped.length > 1) blockSel.range(stamped[0].id, stamped[stamped.length - 1].id);
    else blockSel.select(stamped[0].id);
    ensureCanvasFocus();
  }

  // --- canvas rendering --------------------------------------------------------

  const isEmptyValue = (v: FieldValue | undefined) =>
    !str(v)
      .replace(/<br\s*\/?>/g, "")
      .trim();

  function decorate(root: HTMLElement, block: Block) {
    // Chrome uses the contextual mode as an interaction boundary: default
    // blocks get hover preselection, while content-only pattern descendants
    // keep their established direct-edit behavior. Editor-only DOM metadata;
    // it never enters the block model or serialized output.
    root.dataset.pbeEditing = editingModeFor(block.id);
    if (block.type === RAW_TYPE) {
      root.classList.add("pbe-raw"); // opaque, not untouchable: click selects the block
      return;
    }
    // Container blocks read as invisible wrappers; the class lets canvas
    // chrome (hover bounds) target them without knowing any type names.
    if (block.children) root.classList.add("pbe-container");
    // editable:false locks every carrier non-editable (explicit "false" wins
    // even when a drag briefly makes the whole canvas contentEditable). The
    // Enter/Backspace/input/format paths all gate on isContentEditable, so this
    // one flag is the whole enforcement (A2).
    const editable = effectiveBlockPolicy(block).editable;
    for (const carrier of scopedCarriers(root)) {
      if (!editable) {
        carrier.contentEditable = "false";
      } else if (carrier.hasAttribute("data-pb-text")) {
        try {
          carrier.contentEditable = "plaintext-only";
        } catch {
          carrier.contentEditable = "true";
        }
      } else if (carrier.hasAttribute("data-pb-rich")) {
        carrier.contentEditable = "true";
      }
    }
    // Ghost prompt while the block is empty — canvas chrome only, never part
    // of the serialized output. A block's own `placeholder` (declared
    // editor-UI metadata) wins; the default block falls back to the editor's
    // prompt ("Type / to choose a block").
    const ph =
      getBlockType(block.type)?.placeholder ?? (block.type === defaultBlock ? placeholder : null);
    if (ph) {
      const first = scopedCarriers(root).find(
        (el) => el.hasAttribute("data-pb-text") || el.hasAttribute("data-pb-rich"),
      );
      if (first) {
        const field = first.getAttribute("data-pb-text") ?? first.getAttribute("data-pb-rich");
        first.setAttribute("data-pbe-ph", ph);
        first.classList.toggle("pbe-empty", isEmptyValue(block.fields[field ?? ""]));
      }
    }
  }

  // Decoration recurses: every nested block's root gets its own carrier
  // wiring and ghost prompt (decorate() is scoped per root by design).
  function decorateTree(root: HTMLElement, block: Block) {
    decorate(root, block);
    for (const child of block.children ?? []) {
      const el = root.querySelector<HTMLElement>(`[data-pb-id="${CSS.escape(child.id)}"]`);
      if (el) decorateTree(el, child);
    }
  }

  function renderCanvas() {
    canvas.textContent = "";
    for (const block of model.blocks) {
      const root = blockToElement(block, ownerDocument);
      if (!root) continue;
      decorateTree(root, block);
      canvas.appendChild(root);
    }
    blockSel.clear(); // fresh roots — any block selection is stale now
  }

  // Re-render ONE block in place, preserving caret and block-selection state —
  // for edits that change a block's presentation without touching structure.
  function rerenderBlock(id: string) {
    const block = findBlock(id);
    const old = rootOf(id);
    if (!block || !old) return renderCanvas();
    const sel = captureSelection();
    const fresh = blockToElement(block, ownerDocument);
    if (!fresh) return;
    decorateTree(fresh, block);
    if (old.classList.contains("pbe-selected")) fresh.classList.add("pbe-selected");
    old.replaceWith(fresh);
    restoreSelection(sel);
  }

  // Caret to the start/end of a block's first/last editable carrier —
  // DELIBERATELY unscoped: a container's editable surface is its children's
  // carriers (the container itself has none).
  function focusEdge(id: string, edge: "start" | "end") {
    const root = rootOf(id);
    const carriers = root
      ? [
          ...(root.matches(EDITABLE_SELECTOR) ? [root] : []),
          ...root.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR),
        ].filter((el) => el.isContentEditable)
      : [];
    const target = edge === "start" ? carriers[0] : carriers[carriers.length - 1];
    if (!target) return;
    target.focus({ preventScroll: true });
    const range = ownerDocument.createRange();
    range.selectNodeContents(target);
    range.collapse(edge === "start");
    const sel = ownerWindow.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // --- canvas events: DOM → model, always through commit() ------------------

  // Native browser undo is disowned: both entry points — the keystroke and
  // the input event some UAs emit for menu-driven undo — are intercepted and
  // routed to our history.
  canvas.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (!(event.metaKey || event.ctrlKey) || (key !== "z" && key !== "y")) return;
    event.preventDefault();
    if (key === "y" || event.shiftKey) redo();
    else undo();
  });

  canvas.addEventListener("beforeinput", (event) => {
    if (event.inputType === "historyUndo") {
      event.preventDefault();
      undo();
    } else if (event.inputType === "historyRedo") {
      event.preventDefault();
      redo();
    }
  });

  canvas.addEventListener("input", (event) => {
    const carrier = carrierAt(event.target);
    const block = carrier && blockAt(carrier);
    // isContentEditable gate: a locked carrier (editable:false) never writes
    // back to the model, even if an edit is dispatched at it programmatically.
    if (!carrier || !block || !carrier.isContentEditable) return;
    const kind: CarrierKind = carrier.hasAttribute("data-pb-text") ? "text" : "rich";
    const field = carrier.getAttribute(`data-pb-${kind}`)!;
    commit(
      () => {
        block.fields[field] = readCarrier(carrier, kind);
      },
      { key: `field:${block.id}:${field}`, label: `type ${block.id}.${field}` },
    );
    if (carrier.hasAttribute("data-pbe-ph"))
      carrier.classList.toggle("pbe-empty", isEmptyValue(block.fields[field]));
  });

  // Enter splits at the caret: current block keeps the text before, a fresh
  // defaultBlock gets the text after and is inserted as the next sibling.
  // Slots that reject the default block still split — into a sibling of the
  // SAME type when the slot accepts it (familiar list-item semantics).
  // Fields where a newline is content (preformatted, noSplit) keep native
  // Enter instead.
  canvas.addEventListener("keydown", (event) => {
    const defaultDef = getBlockType(defaultBlock);
    if (event.key !== "Enter" || event.shiftKey || event.defaultPrevented || !defaultDef) return;
    const carrier = carrierAt(event.target);
    const block = carrier && blockAt(carrier);
    if (!carrier || !block || !carrier.isContentEditable) return;

    const kind: CarrierKind = carrier.hasAttribute("data-pb-text") ? "text" : "rich";
    const field = carrier.getAttribute(`data-pb-${kind}`)!;
    const def = getBlockType(block.type);
    const spec = def?.fields.find((f) => f.name === field);
    if (spec?.preformatted || def?.noSplit?.includes(field)) return; // native Enter

    const at0 = locate(block.id);
    if (!at0) return;
    let splitType = defaultBlock;
    let splitDef = defaultDef;
    if (!slotAccepts(at0.parent, defaultBlock)) {
      if (!slotAccepts(at0.parent, block.type) || !def) return; // the slot takes neither
      splitType = block.type;
      splitDef = def;
    }
    event.preventDefault();

    let before = readCarrier(carrier, kind);
    let after = "";
    const sel = ownerWindow.getSelection();
    if (sel?.rangeCount && carrier.contains(sel.getRangeAt(0).startContainer)) {
      const at = sel.getRangeAt(0);
      const half = (toStart: boolean) => {
        const r = ownerDocument.createRange();
        r.selectNodeContents(carrier);
        if (toStart) r.setEnd(at.startContainer, at.startOffset);
        else r.setStart(at.endContainer, at.endOffset);
        const tmp = ownerDocument.createElement("div");
        tmp.appendChild(r.cloneContents());
        return kind === "text" ? (tmp.textContent ?? "") : tmp.innerHTML;
      };
      before = half(true);
      after = half(false);
    }

    const next = makeBlock(splitType);
    const target = splitDef.fields.find((f) => f.type === "rich" || f.type === "text");
    if (target)
      next.fields[target.name] = kind === "text" && target.type === "rich" ? escHtml(after) : after;

    const at = locate(block.id);
    if (!at) return;
    commit(
      () => {
        block.fields[field] = before;
        at.list.splice(at.index + 1, 0, next); // sibling in the SAME container
      },
      { label: `split ${block.id} → ${next.id}` },
    );
    renderCanvas();
    focusEdge(next.id, "start");
  });

  // Backspace at the very START of a block merges it into the previous one
  // (the inverse of Enter-split). Kind conversion at the seam: rich→rich
  // keeps markup, rich→text strips it, text→rich escapes it. An empty source
  // is just removed; an unmergeable previous block (raw-html) gets SELECTED —
  // the second Backspace deletes it via the group-delete path.
  const richText = (html: string): string => {
    const d = ownerDocument.createElement("div");
    d.innerHTML = html;
    return d.textContent ?? "";
  };

  canvas.addEventListener("keydown", (event) => {
    if (event.key !== "Backspace" || event.defaultPrevented) return;
    const carrier = carrierAt(event.target);
    const block = carrier && blockAt(carrier);
    if (!carrier || !block || !carrier.isContentEditable) return;

    // caret must be collapsed at character offset 0 of the block's FIRST
    // editable carrier — everywhere else Backspace stays native
    const winSel = ownerWindow.getSelection();
    if (
      !winSel?.rangeCount ||
      !winSel.isCollapsed ||
      !carrier.contains(winSel.getRangeAt(0).startContainer)
    )
      return;
    const probe = ownerDocument.createRange();
    probe.selectNodeContents(carrier);
    probe.setEnd(winSel.getRangeAt(0).startContainer, winSel.getRangeAt(0).startOffset);
    if (probe.toString().length !== 0) return;
    const blockRoot = rootOf(block.id);
    const editables = blockRoot
      ? scopedCarriers(blockRoot).filter((el) => el.isContentEditable)
      : [];
    if (editables[0] !== carrier) return;

    const at = locate(block.id);
    if (!at) return;
    const prev = at.list[at.index - 1];
    if (!prev) return; // start of its container — nowhere to merge (POC: no group escape)
    // A4: a non-removable block can't be merged away — return BEFORE
    // preventDefault so native Backspace runs, and at offset 0 it is a no-op.
    if (!canRemoveBlock(block.id)) return;
    event.preventDefault();

    const kind: CarrierKind = carrier.hasAttribute("data-pb-text") ? "text" : "rich";
    const field = carrier.getAttribute(`data-pb-${kind}`)!;
    const source = str(block.fields[field]);
    const sourceEmpty = !source.replace(/<br\s*\/?>/g, "").trim();

    if (sourceEmpty) {
      commit(
        () => {
          dropBlock(block.id);
        },
        { label: `remove ${block.id} (${block.type})` },
      );
      renderCanvas();
      focusEdge(prev.id, "end");
      ensureCanvasFocus();
      return;
    }

    const target = getBlockType(prev.type)
      ?.fields.filter((f) => f.type === "text" || f.type === "rich")
      .pop();
    if (!target) {
      blockSel.select(prev.id); // unmergeable: select it; next Backspace deletes
      return;
    }

    const prevVal = str(prev.fields[target.name]);
    const joinOffset = target.type === "text" ? prevVal.length : richText(prevVal).length;
    const addition =
      target.type === "rich"
        ? kind === "rich"
          ? source
          : escHtml(source)
        : kind === "rich"
          ? richText(source)
          : source;

    commit(
      () => {
        prev.fields[target.name] = prevVal + addition;
        dropBlock(block.id);
      },
      { label: `merge ${block.id} into ${prev.id}` },
    );
    renderCanvas();
    restoreSelection({ blockId: prev.id, field: target.name, offset: joinOffset });
    ensureCanvasFocus();
  });

  // The legacy surface APPENDER is retained as a narrow fallback when chrome
  // is not mounted. Container padding is primarily the container's selection
  // surface: only the 12px strip immediately after its last child (or along
  // an empty container's bottom edge) may append. The visible chrome inserter
  // uses the same edge-sized target. Root canvas padding keeps its historical
  // behavior for hosts that use the core editor without chrome.
  canvas.addEventListener(
    "mousedown",
    (event) => {
      const defaultDef = getBlockType(defaultBlock);
      if (event.button !== 0 || !defaultDef) return;
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;

      let list: Block[];
      let containerId: string | null = null;
      if (event.target === canvas) {
        list = model.blocks;
      } else {
        // Nearest block root must be the container ITSELF — a click inside a
        // child never reaches this (its own root is nearer).
        const rootEl =
          event.target instanceof ownerWindow.Element ? event.target.closest("[data-pb-id]") : null;
        const block = rootEl ? findBlock(rootEl.getAttribute("data-pb-id") ?? "") : undefined;
        if (!block?.children) return;
        list = block.children;
        containerId = block.id;
      }

      // B2: the target container must admit the default block (root → policy).
      if (!slotAccepts(containerId ? (findBlock(containerId) ?? null) : null, defaultBlock)) return;

      const last = list[list.length - 1] as Block | undefined;
      const lastRoot = last && rootOf(last.id);
      if (lastRoot) {
        const bottom = lastRoot.getBoundingClientRect().bottom;
        if (event.clientY <= bottom) return;
        if (containerId && event.clientY > bottom + 12) return;
      } else if (containerId) {
        const containerRoot = rootOf(containerId);
        if (!containerRoot || event.clientY < containerRoot.getBoundingClientRect().bottom - 12)
          return;
      }
      event.preventDefault(); // we place the caret ourselves; also hands selection its keep-out signal

      const textish = defaultDef.fields.filter((f) => f.type === "text" || f.type === "rich");
      if (last?.type === defaultBlock && textish.every((f) => isEmptyValue(last.fields[f.name]))) {
        focusEdge(last.id, "end");
        return;
      }
      // Switching containers cancels a still-empty ghost from a previous
      // append — BEFORE this commit, so the cancel stays history-transparent.
      if (ghost) {
        const g = ghost;
        ghost = null;
        abandonGhost(g);
      }
      const next = makeBlock(defaultBlock);
      commit(
        () => {
          list.push(next);
        },
        { label: `append ${defaultBlock}${containerId ? ` in ${containerId}` : ""}` },
      );
      renderCanvas();
      focusEdge(next.id, "start");
      ensureCanvasFocus();
      // Container appends are PROVISIONAL: leave the paragraph without ever
      // giving it content and it disappears (see abandonGhost). Root appends
      // persist — the trailing empty is the document's writing prompt.
      ghost = containerId ? { id: next.id, depth: history.flags.undoDepth } : null;
    },
    true,
  );

  // --- ghost lifecycle: provisional container appends --------------------------
  // The ghost is the paragraph a container-append minted. The moment the
  // caret and block selection both move off it while it is still an empty
  // default block, it is removed — to the user it never existed.

  let ghost: { id: string; depth: number } | null = null;

  // When nothing else was recorded since the append, the removal is an UNDO
  // of the append with the redo discarded (history.drop): this mutates the
  // model outside commit() BY DESIGN — a committed removal would leave an
  // insert+remove pair in history for a block the user never touched. Either
  // way the DOM edit is surgical (no renderCanvas): the caret has just landed
  // wherever the user clicked and must survive.
  function abandonGhost(g: { id: string; depth: number }) {
    const at = locate(g.id);
    if (!at || !at.parent) return; // gone, or escaped to the root (ungroup) — not ours anymore
    const def = getBlockType(defaultBlock);
    const textish = (def?.fields ?? []).filter((f) => f.type === "text" || f.type === "rich");
    if (
      at.block.type !== defaultBlock ||
      !textish.every((f) => isEmptyValue(at.block.fields[f.name]))
    )
      return; // it grew content — a real block now
    const root = rootOf(g.id);
    if (history.flags.undoDepth === g.depth && history.flags.redoDepth === 0) {
      history.drop();
      dropBlock(g.id, { force: true }); // canceling an uncommitted append, not a user delete
      root?.remove();
      trace(`ghost ${g.id} abandoned — append canceled · ${depths()}`);
      notify();
    } else {
      commit(
        () => {
          dropBlock(g.id, { force: true });
        },
        { label: `remove abandoned ${g.id}` },
      );
      root?.remove();
    }
  }

  // Same signals that drive selection's refresh(), registered AFTER it so the
  // reactive state is fresh when read. Being block-selected counts as
  // attention — the cmd+A ladder must not eat its own first rung.
  function checkGhost() {
    if (!ghost) return;
    if (blockSel.state.active === ghost.id || blockSel.ids.includes(ghost.id)) return;
    const g = ghost;
    ghost = null;
    abandonGhost(g);
  }
  ownerDocument.addEventListener("selectionchange", checkGhost);
  ownerDocument.addEventListener("focusin", checkGhost);
  ownerDocument.addEventListener("focusout", checkGhost);

  // --- grouping: Cmd+G wraps, Shift+Cmd+G unwraps ------------------------------
  // Document-level capture for the same reason as multi-delete: after a drag
  // selection focus isn't reliably inside the canvas. Both are editor-context
  // keys — never allowed to fall through to the browser's find-next/previous.

  const groupDef = () => {
    const def = groupBlock ? getBlockType(groupBlock) : undefined;
    return def?.acceptsChildren ? def : undefined;
  };

  // The nearest enclosing real container — phantom wrappers are identity
  // nodes, not groups. Pattern conversion has its own explicit command.
  function containerOf(id: string | null | undefined): Block | null {
    const path = id ? pathToBlock(model.blocks, id) : null;
    if (!path) return null;
    for (let i = path.length - 1; i >= 0; i--) {
      // Pattern identity is a hard boundary: Ungroup must neither convert the
      // pattern root nor escape through it to an enclosing layout container.
      if (path[i].pattern) return null;
      if (path[i].children && !getBlockType(path[i].type)?.phantom) return path[i];
    }
    return null;
  }

  const canConvertPattern = (id: string): boolean => {
    const block = findBlock(id);
    return !!block?.pattern && editingModeFor(id) === "default";
  };

  // Remove pattern identity without changing published output. Current stamps
  // use a phantom root, which unwraps into its children. Legacy/imported roots
  // may carry provenance on a real layout block; those keep their wrapper and
  // lose only the pattern marker.
  function convertPatternToBlocks(id: string): boolean {
    if (!canConvertPattern(id)) return false;
    const at = locate(id);
    if (!at) return false;
    const phantom = !!getBlockType(at.block.type)?.phantom;
    const children = at.block.children ?? [];
    commit(
      () => {
        if (phantom) at.list.splice(at.index, 1, ...children);
        else delete at.block.pattern;
      },
      { label: `convert pattern ${id} to blocks` },
    );
    renderCanvas();
    if (!phantom) blockSel.select(id);
    else if (children.length) blockSel.selectMany(children.map((block) => block.id));
    else ensureCanvasFocus();
    return true;
  }

  // Wrap the ids (default: the block selection) in a fresh container. The ids
  // must be siblings — one list, any order/gaps; the wrapper lands at the
  // first member's position and the members keep their document order.
  function groupBlocks(ids: string[] = blockSel.ids): Block | null {
    if (!groupBlock || !groupDef() || !ids.length) return null;
    if (ids.some((id) => editingModeFor(id) !== "default")) return null;
    const located = ids.map((id) => locate(id));
    const first = located[0];
    if (!first || located.some((at) => !at || at.list !== first.list)) {
      trace(`group: ids are not siblings — refused`);
      return null;
    }
    const wrapper = makeBlock(groupBlock, false); // children come from the selection, not the seed
    const idSet = new Set(ids);
    const insertAt = Math.min(...located.map((at) => at!.index));
    commit(
      () => {
        const members: Block[] = [];
        for (let i = first.list.length - 1; i >= 0; i--) {
          if (idSet.has(first.list[i].id)) members.unshift(first.list.splice(i, 1)[0]);
        }
        wrapper.children = members;
        first.list.splice(insertAt, 0, wrapper);
      },
      { label: `group ${ids.length} block${ids.length === 1 ? "" : "s"} → ${wrapper.id}` },
    );
    renderCanvas();
    blockSel.select(wrapper.id);
    ensureCanvasFocus();
    return wrapper;
  }

  // Unwrap the nearest container of `id` (default: the selected block, else
  // the caret's block): its children splice into its place. A caret inside
  // survives; otherwise the released run reads as selected.
  function ungroupBlock(id?: string): boolean {
    const target = containerOf(id ?? blockSel.ids[0] ?? blockSel.state.active);
    const at = target && locate(target.id);
    if (!target || !at || editingModeFor(target.id) !== "default") return false;
    const kids = target.children ?? [];
    const sel = captureSelection();
    commit(
      () => {
        at.list.splice(at.index, 1, ...kids);
      },
      { label: `ungroup ${target.id} (${kids.length} released)` },
    );
    renderCanvas();
    if (sel && sel.blockId !== target.id) restoreSelection(sel);
    else if (kids.length) blockSel.selectMany(kids.map((b) => b.id));
    ensureCanvasFocus();
    return true;
  }

  // Enter with a BLOCK selection inserts a fresh default block below it —
  // the only "type after this" a carrier-less block (group, raw-html) can
  // offer. Document-level capture, same reason as multi-delete: after a
  // click-select, focus isn't reliably inside the canvas.
  function onBlockEnter(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.defaultPrevented || !blockSel.active()) return;
    if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    // Enter in chrome outside the canvas (inserter search, toolbar buttons)
    // belongs to that chrome, block selection or not.
    const focused = ownerDocument.activeElement;
    if (
      focused instanceof ownerWindow.HTMLElement &&
      !canvas.contains(focused) &&
      (focused.matches("input, textarea, select, button") || focused.isContentEditable)
    )
      return;
    const defaultDef = getBlockType(defaultBlock);
    if (!defaultDef) return;
    const ids = blockSel.ids;
    const at = locate(ids[ids.length - 1]); // below the selection = after its LAST block
    if (!at) return;
    if (!slotAccepts(at.parent, defaultBlock)) return; // B2: container must admit it
    event.preventDefault();
    const next = makeBlock(defaultBlock);
    commit(
      () => {
        at.list.splice(at.index + 1, 0, next);
      },
      { label: `enter after ${at.block.id} → ${next.id}` },
    );
    renderCanvas();
    ownerWindow.getSelection()?.removeAllRanges();
    focusEdge(next.id, "start");
    ensureCanvasFocus();
  }
  ownerDocument.addEventListener("keydown", onBlockEnter, true);

  function onGroupKeys(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.defaultPrevented) return;
    if (event.key.toLowerCase() !== "g") return;
    if (event.shiftKey) {
      const anchor = blockSel.ids[0] ?? blockSel.state.active;
      if (!anchor || !containerOf(anchor)) return; // not ours — no container in reach
      event.preventDefault();
      ungroupBlock();
    } else {
      if (!groupDef() || !blockSel.active()) return; // grouping needs a block selection
      event.preventDefault();
      groupBlocks();
    }
  }
  ownerDocument.addEventListener("keydown", onGroupKeys, true);

  // --- public API ------------------------------------------------------------

  return {
    history: history.flags, // reactive { canUndo, canRedo, undoDepth, redoDepth }
    selection: blockSel.state, // reactive { blocks: [id, …], active } — block-level multiselection
    undo,
    redo,

    /** The element the editor renders into — chrome parks floating UI against it. */
    canvas,

    /** The block type Enter-splitting creates — chrome scopes its slash/appender affordances to it. */
    defaultBlock,

    /** Observe committed model changes (incl. undo/redo/load) without claiming the onChange option. Returns unsubscribe. */
    subscribe(fn: () => void): () => void {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    /** Detach document-level listeners (selectionchange, multiselect + grouping keys, ghost tracking). */
    destroy() {
      ownerDocument.removeEventListener("keydown", onMultiDelete, true);
      ownerDocument.removeEventListener("keydown", onBlockEnter, true);
      ownerDocument.removeEventListener("keydown", onGroupKeys, true);
      ownerDocument.removeEventListener("selectionchange", checkGhost);
      ownerDocument.removeEventListener("focusin", checkGhost);
      ownerDocument.removeEventListener("focusout", checkGhost);
      blockSel.destroy();
    },

    // Console-toggleable edit tracing: editor.debug = true
    get debug() {
      return debugOn;
    },
    set debug(v: boolean) {
      debugOn = !!v;
    },

    getModel: (): Model => model,
    getBlock: (id: string): Block | undefined => findBlock(id),

    /**
     * The resolved editing policy (Phase A) — a runtime schema layer, sourced
     * from createEditor({ policy }), never from the DOM and never serialized
     * (thoughts/010). PARSE-FREE and enforcement-free today; A2+ reads it.
     */
    get policy(): EditorPolicy {
      return { root: rootPolicy };
    },

    /**
     * Effective policy for one block: registry type rules ∩ createEditor
     * override, most-restrictive (A2 wires allowedFormats; per-instance pattern
     * context merges in later). Unknown id → permissive default.
     */
    blockPolicy: (id: string): BlockPolicy => {
      const block = findBlock(id);
      return block ? effectiveBlockPolicy(block) : DEFAULT_BLOCK_POLICY;
    },

    /** Contextual editing mode: pattern descendants are content-only in the page and default in isolation. */
    editingMode: (id: string): EditingMode => editingModeFor(id),

    /** The nearest placed-pattern root for a block, used to split toolbar and inspector targets. */
    patternContext: (id: string): { id: string; name: string } | null => patternContextFor(id),

    /** Whether a block may be reordered (its `movable` policy AND the container's `orderable`) — chrome hides its move affordances when false. */
    canMove: (id: string): boolean => canMoveBlock(id),

    /** Whether a block may move into a destination container (`null` = document root). */
    canMoveTo: (id: string, parentId: string | null): boolean => canMoveBlockTo(id, parentId),

    /** Whether `type` may be inserted at the ROOT (the `allowedBlocks` policy, B2) — chrome filters its pickers and hides the inserter when nothing is insertable. */
    canInsert: (type: string): boolean => canInsert(type),

    /** Whether `type` may be inserted into container `parentId` (null/absent = root) — block-def ∩ slot policy (D2). Chrome filters nested pickers with this. */
    canInsertInto: (parentId: string | null, type: string): boolean =>
      slotAccepts(parentId ? (findBlock(parentId) ?? null) : null, type),

    /** True when the root permits ANY insertion (`allowedBlocks !== false`) — chrome hides the inserter/slash/appender when false. */
    get canInsertAny(): boolean {
      return rootPolicy.allowedBlocks !== false;
    },

    /**
     * Swap the editing policy at runtime and re-render so editable locks
     * re-apply (config-sourced, thoughts/010). Hosts use it to apply a context's
     * policy after construction — the manual-test harness applies a fixture's
     * policy this way; patterns/A5 will reuse the path.
     */
    setPolicy(config: PolicyConfig) {
      policyConfig = config;
      rootPolicy = resolveRootPolicy(policyConfig);
      renderCanvas();
      notify();
    },

    /**
     * Select a block programmatically (tree view / chrome): caret into its
     * first editable carrier when it has one; BLOCK selection otherwise —
     * containers select as a whole (their carriers belong to their children),
     * and so do opaque blocks (raw-html). Scrolls the block into view.
     *
     * Modifier semantics REUSE the canvas gestures: `toggle` = Cmd/Ctrl+click
     * (add/remove one block, non-contiguous ok), `range` = Shift+click
     * (sibling run from the current anchor — caret's block, else the
     * selection's first block — via the same native root-level range the
     * canvas asserts). `block` forces an editable leaf into explicit block
     * selection; List View uses it so keyboard block commands stay active.
     */
    /**
     * Toggle pattern-instance opacity (default on): whether selection remaps
     * gestures inside an instance to its content units / the instance itself.
     * Chrome turns it OFF while an isolation editor holds the canvas — there
     * every block is fair game — and back on when the page document returns.
     */
    setPatternsOpaque(on: boolean) {
      patternsOpaque = on;
      canvas.classList.toggle("pbe-patterns-opaque", on);
      // The mode is contextual rather than serialized; keep the editor-only
      // DOM annotation in sync without re-rendering (and disturbing a caret)
      // when a host enters or leaves pattern isolation.
      for (const root of canvas.querySelectorAll<HTMLElement>("[data-pb-id]")) {
        const id = root.dataset.pbId;
        if (id) root.dataset.pbeEditing = editingModeFor(id);
      }
    },

    clearSelection() {
      blockSel.clear();
      ownerWindow.getSelection()?.removeAllRanges();
    },

    selectBlock(
      id: string,
      opts: { toggle?: boolean; range?: boolean; center?: boolean; block?: boolean } = {},
    ) {
      const block = findBlock(id);
      const root = rootOf(id);
      if (!block || !root) return;
      scrollBlockIntoView(root, opts.center ? "center" : "nearest");
      if (opts.toggle) {
        blockSel.toggle(id);
        return;
      }
      if (opts.range) {
        const from = blockSel.state.active ?? blockSel.ids[0];
        if (from && from !== id) blockSel.range(from, id);
        else blockSel.select(id); // no anchor: Shift behaves like a block click
        return;
      }
      const carriers = [
        ...(root.matches(EDITABLE_SELECTOR) ? [root] : []),
        ...root.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR),
      ].filter((el) => el.isContentEditable);
      if (opts.block || block.children || !carriers.length) {
        blockSel.select(id);
      } else {
        // Same release rule as a canvas click on editable content: the caret
        // takes over, any explicit block selection lets go — a caret plus a
        // lingering block selection would read as both selected at once.
        blockSel.clear();
        focusEdge(id, "start");
      }
    },

    /** Move a block up/down by delta positions among its siblings. Caret and selection follow it. */
    moveBlock(id: string, delta: number) {
      if (!canMoveBlock(id)) return; // policy gate (A3) — the primitive, so every caller is covered
      const at = locate(id);
      if (!at) return;
      const j = at.index + delta;
      if (j < 0 || j >= at.list.length) return;
      const sel = captureSelection();
      const selected = blockSel.ids;
      commit(
        () => {
          at.list.splice(j, 0, at.list.splice(at.index, 1)[0]);
        },
        { label: `move ${id} ${delta > 0 ? "down" : "up"}` },
      );
      renderCanvas();
      if (sel) restoreSelection(sel);
      else if (selected.length === 1 && selected[0] === id) blockSel.select(id);
    },

    /**
     * Move a block to a final index in another (or the same) sibling list.
     * `index` is measured after removing the dragged block, which makes DOM
     * projections and model placement agree without same-list off-by-one
     * adjustments. One drop is one undo entry.
     */
    moveBlockTo(id: string, parentId: string | null, index: number): boolean {
      if (!canMoveBlockTo(id, parentId)) return false;
      const at = locate(id);
      const parent = parentId ? findBlock(parentId) : null;
      if (!at || (parentId && !parent?.children)) return false;
      const destination = parent ? parent.children! : model.blocks;
      const finalLength = destination.length - (destination === at.list ? 1 : 0);
      const target = Math.max(0, Math.min(index, finalLength));
      if (destination === at.list && target === at.index) return false;

      const sel = captureSelection();
      const selected = blockSel.ids;
      commit(
        () => {
          const [block] = at.list.splice(at.index, 1);
          destination.splice(target, 0, block);
        },
        { label: `move ${id} to ${parentId ?? "root"}:${target}` },
      );
      renderCanvas();
      if (sel) restoreSelection(sel);
      else if (selected.length === 1 && selected[0] === id) blockSel.select(id);
      return true;
    },

    /**
     * Toggle an inline mark ("bold" | "italic") over the current selection in
     * a rich carrier. Pure model transform (src/format.ts) — one history
     * entry, block re-rendered in place, selection restored over the span.
     */
    format(mark: string) {
      const winSel = ownerWindow.getSelection();
      if (!winSel?.rangeCount || winSel.isCollapsed) return;
      const range = winSel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = node instanceof ownerWindow.Element ? node : node.parentElement;
      const carrier = el?.closest<HTMLElement>("[data-pb-rich]");
      const block =
        carrier && canvas.contains(carrier) && carrier.isContentEditable ? blockAt(carrier) : null;
      if (!carrier || !block) return;
      // allowedFormats gate: reject a mark this block's policy forbids
      // (null = all allowed; [] = plain text). Same effective policy the
      // toolbar reads to hide the button.
      const allowed = effectiveBlockPolicy(block).allowedFormats;
      if (allowed !== null && !allowed.includes(mark)) return;
      const field = carrier.getAttribute("data-pb-rich")!;
      const result = toggleMark(carrier, range, mark);
      if (!result) return;
      commit(
        () => {
          block.fields[field] = result.html;
        },
        { label: `format ${mark} ${block.id}.${field}` },
      );
      rerenderBlock(block.id);
      const blockRoot = rootOf(block.id);
      const fresh =
        blockRoot &&
        scopedCarriers(blockRoot).find((c) => c.getAttribute("data-pb-rich") === field);
      if (fresh) selectItemRange(fresh, result.start, result.end);
    },

    /** {bold, italic} — true when the whole current selection carries the mark. Chrome binds button states to this. */
    formatState(): Record<string, boolean> {
      const winSel = ownerWindow.getSelection();
      if (!winSel?.rangeCount) return formatState(null, null);
      const range = winSel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = node instanceof ownerWindow.Element ? node : node.parentElement;
      const carrier = el?.closest("[data-pb-rich]");
      if (!carrier || !canvas.contains(carrier)) return formatState(null, null);
      return formatState(carrier, range);
    },

    /**
     * Link the current text selection — format()'s value-carrying sibling.
     * An empty href UNLINKS the span (the chrome's "Remove" path). Same
     * carrier resolution, allowedFormats gate ("link"), commit + reselect as
     * format(); no-ops on a collapsed selection or a non-rich target.
     */
    applyLink(href: string, target: string = "") {
      const winSel = ownerWindow.getSelection();
      if (!winSel?.rangeCount || winSel.isCollapsed) return;
      const range = winSel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = node instanceof ownerWindow.Element ? node : node.parentElement;
      const carrier = el?.closest<HTMLElement>("[data-pb-rich]");
      const block =
        carrier && canvas.contains(carrier) && carrier.isContentEditable ? blockAt(carrier) : null;
      if (!carrier || !block) return;
      const allowed = effectiveBlockPolicy(block).allowedFormats;
      if (allowed !== null && !allowed.includes("link")) return;
      const field = carrier.getAttribute("data-pb-rich")!;
      const trimmed = href.trim();
      const result = trimmed
        ? applyLinkFmt(carrier, range, trimmed, target)
        : removeLinkFmt(carrier, range);
      if (!result) return;
      commit(
        () => {
          block.fields[field] = result.html;
        },
        { label: `${trimmed ? "link" : "unlink"} ${block.id}.${field}` },
      );
      rerenderBlock(block.id);
      const blockRoot = rootOf(block.id);
      const fresh =
        blockRoot &&
        scopedCarriers(blockRoot).find((c) => c.getAttribute("data-pb-rich") === field);
      if (fresh) selectItemRange(fresh, result.start, result.end);
    },

    /** The link {href, target} over the current selection, or null — chrome prefills its popover from this. */
    linkState(): { href: string; target: string } | null {
      const winSel = ownerWindow.getSelection();
      if (!winSel?.rangeCount) return null;
      const range = winSel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = node instanceof ownerWindow.Element ? node : node.parentElement;
      const carrier = el?.closest("[data-pb-rich]");
      if (!carrier || !canvas.contains(carrier)) return null;
      return readLinkState(carrier, range);
    },

    /**
     * Wrap the given blocks (default: the current block selection) in a fresh
     * `groupBlock` container — Cmd+G's primitive. Siblings only; returns the
     * wrapper, or null when grouping is unavailable or the ids straddle lists.
     */
    groupBlocks,

    /**
     * Unwrap the nearest container of `id` (default: selected block, else the
     * caret's block) — Shift+Cmd+G's primitive. Returns false when there is
     * no container in reach.
     */
    ungroupBlock,

    /** The block ungroupBlock(id) would unwrap, or null — chrome binds its Ungroup control to this. */
    ungroupTarget: (id?: string | null): string | null =>
      containerOf(id ?? blockSel.ids[0] ?? blockSel.state.active)?.id ?? null,

    /** Whether `id` is a selected phantom pattern root that can become ordinary blocks. */
    canConvertPattern,

    /** Remove a pattern's phantom identity wrapper while preserving its child blocks. */
    convertPatternToBlocks,

    /** Whether the block may be duplicated under the effective policy. */
    canDuplicate: (id: string): boolean => {
      const block = findBlock(id);
      return !!block && effectiveBlockPolicy(block).duplicable;
    },

    /** Duplicate a block subtree after itself, minting fresh ids throughout. */
    duplicateBlock(id: string): Block | null {
      const at = locate(id);
      if (!at || !effectiveBlockPolicy(at.block).duplicable) return null;
      const duplicate = copyBlock(at.block);
      commit(() => at.list.splice(at.index + 1, 0, duplicate), { label: `duplicate ${id}` });
      renderCanvas();
      blockSel.select(duplicate.id);
      return duplicate;
    },

    /** Whether the block may be removed under the effective policy. */
    canRemove: canRemoveBlock,

    /** Remove one block through the same policy/history choke point as keyboard deletion. */
    removeBlock(id: string): boolean {
      const at = locate(id);
      if (!at || !canRemoveBlock(id)) return false;
      const next = at.list[at.index + 1] ?? at.list[at.index - 1];
      commit(() => void dropBlock(id), { label: `remove ${id}` });
      renderCanvas();
      blockSel.clear();
      if (next) focusEdge(next.id, "start");
      else ensureCanvasFocus();
      return true;
    },

    /** Append a fresh child through the parent's slot and policy contracts. */
    appendChild(parentId: string, type: string): Block | null {
      const parent = findBlock(parentId);
      if (
        !parent?.children ||
        editingModeFor(parentId) !== "default" ||
        !getBlockType(type) ||
        !slotAccepts(parent, type)
      )
        return null;
      const child = makeBlock(type);
      commit(() => parent.children!.push(child), {
        label: `append ${type} to ${parentId}`,
      });
      renderCanvas();
      blockSel.select(child.id);
      return child;
    },

    /** Insert a fresh block of `type` at `index` (default: end). Inserter chrome's primitive. */
    insertBlock(type: string, index: number = model.blocks.length): Block | null {
      if (!getBlockType(type) || !canInsert(type)) return null; // B2: root allowedBlocks
      const next = makeBlock(type);
      const i = Math.max(0, Math.min(index, model.blocks.length));
      commit(
        () => {
          model.blocks.splice(i, 0, next);
        },
        { label: `insert ${type}` },
      );
      renderCanvas();
      landOnInserted(next);
      return next;
    },

    /** Insert a fresh block immediately before/after an existing sibling at any depth. */
    insertBlockAdjacent(anchorId: string, edge: "before" | "after", type: string): Block | null {
      const at = locate(anchorId);
      if (
        !at ||
        !getBlockType(type) ||
        (at.parent && editingModeFor(at.parent.id) !== "default") ||
        !slotAccepts(at.parent, type)
      )
        return null;
      const next = makeBlock(type);
      const index = at.index + (edge === "after" ? 1 : 0);
      commit(() => at.list.splice(index, 0, next), {
        label: `insert ${type} ${edge} ${anchorId}`,
      });
      renderCanvas();
      landOnInserted(next);
      return next;
    },

    /**
     * Stamp a registered pattern into the root list at `index` (default:
     * end) — insertBlock's composition sibling. The stamp is an INDEPENDENT
     * COPY: fresh ids throughout, no reference back to the pattern (only the
     * informational `pattern` provenance the fragment itself may carry). One
     * commit — the whole composition is one undo entry. Returns the stamped
     * root blocks, or null on an unknown pattern.
     */
    insertPattern(name: string, index: number = model.blocks.length): Block[] | null {
      const stamped = stampPattern(name);
      if (!stamped?.length) return null;
      if (stamped.some((b) => !canInsert(b.type))) return null; // B2: every root type must be allowed
      const i = Math.max(0, Math.min(index, model.blocks.length));
      commit(
        () => {
          model.blocks.splice(i, 0, ...stamped);
        },
        { label: `insert pattern ${name}` },
      );
      renderCanvas();
      landOnStamp(stamped);
      return stamped;
    },

    /** Stamp a pattern immediately before/after an existing sibling at any depth. */
    insertPatternAdjacent(
      anchorId: string,
      edge: "before" | "after",
      name: string,
    ): Block[] | null {
      const at = locate(anchorId);
      const stamped = at && stampPattern(name);
      if (
        !at ||
        !stamped?.length ||
        (at.parent && editingModeFor(at.parent.id) !== "default") ||
        stamped.some((block) => !slotAccepts(at.parent, block.type))
      )
        return null;
      const index = at.index + (edge === "after" ? 1 : 0);
      commit(() => at.list.splice(index, 0, ...stamped), {
        label: `insert pattern ${name} ${edge} ${anchorId}`,
      });
      renderCanvas();
      landOnStamp(stamped);
      return stamped;
    },

    /**
     * Replace a block with a pattern stamp (slash command / inserter
     * semantics over the empty default block) — replaceBlock's composition
     * sibling. Refused when the containing slot rejects ANY of the stamp's
     * root types (a partial stamp would silently drop content). Returns the
     * stamped root blocks, or null.
     */
    replaceWithPattern(id: string, name: string): Block[] | null {
      const at = locate(id);
      const stamped = at && stampPattern(name);
      if (!stamped?.length) return null;
      if (stamped.some((b) => !slotAccepts(at!.parent, b.type))) return null;
      commit(
        () => {
          at!.list.splice(at!.index, 1, ...stamped);
        },
        { label: `replace ${id} with pattern ${name}` },
      );
      renderCanvas();
      landOnStamp(stamped);
      return stamped;
    },

    /**
     * Replace a container block's CHILDREN wholesale from an annotated-HTML
     * fragment — the isolation-edit apply (a pattern instance's "Edit
     * pattern" writes the sub-edited copy back; thoughts/012: instances are
     * fully decoupled, this touches nothing but THIS block). Permissive
     * upcast like any load; one commit, one undo entry; the block lands
     * selected. Refused on unknown blocks and non-containers.
     */
    setBlockChildren(id: string, html: string): Block | null {
      const block = findBlock(id);
      if (!block || !block.children) return null;
      const tmp = ownerDocument.createElement("div");
      tmp.innerHTML = html;
      const children = upcast(tmp).blocks;
      commit(
        () => {
          block.children = children;
        },
        { label: `set children of ${id} (${children.length} blocks)` },
      );
      renderCanvas();
      const newRoot = rootOf(id);
      if (newRoot) scrollBlockIntoView(newRoot);
      blockSel.select(id);
      ensureCanvasFocus();
      return block;
    },

    /**
     * Write one field on a block — the settings-control primitive. One
     * history entry per call (no coalescing: each pick is its own undo
     * step); the block re-renders in place with caret and block-selection
     * state preserved. No-ops on unknown blocks, fields the block's render
     * doesn't carry (an unreadable write would break the round-trip law),
     * and same-value writes (structural comparison — image values are
     * objects). Object values are cloned on write, never aliased.
     */
    setField(id: string, field: string, value: FieldValue) {
      const block = findBlock(id);
      const def = block && getBlockType(block.type);
      const spec = def?.fields.find((f) => f.name === field);
      const mode = editingModeFor(id);
      if (!def || !spec || mode === "disabled") return;
      if (mode === "content-only" && spec.type === "tag") return;
      if (JSON.stringify(block!.fields[field]) === JSON.stringify(value)) return;
      commit(
        () => {
          block!.fields[field] = cloneValue(value);
        },
        { label: `set ${id}.${field}` },
      );
      rerenderBlock(id);
    },

    /**
     * Write one island-bound setting on a block — setField's sibling for
     * values with no DOM carrier (they live in the data-pb-settings island).
     * Sparse semantics: writing the declared default DELETES the key — the
     * model stores divergence only, defaults are the registry's to fill at
     * the render seam. Same history and re-render contract as setField.
     * No-ops on unknown blocks, settings the type doesn't declare (an
     * undeclared write would have no canonical carrier), values that aren't
     * plain JSON, and writes that don't change the effective value.
     */
    setSetting(id: string, name: string, value: unknown) {
      const block = findBlock(id);
      const def = block && getBlockType(block.type);
      const spec = def?.islandSettings.find((s) => s.name === name);
      const role = def?.settings?.find((setting) => setting.setting === name)?.role ?? "advanced";
      const mode = editingModeFor(id);
      const json = JSON.stringify(value) as string | undefined; // undefined on non-JSON values
      if (!block || !spec || json === undefined || mode === "disabled") return;
      if (mode === "content-only" && role !== "content") return;
      const effective =
        block.settings && name in block.settings ? block.settings[name] : spec.default;
      if (json === JSON.stringify(effective)) return;
      commit(
        () => {
          block.settings ??= {};
          if (json === JSON.stringify(spec.default)) delete block.settings[name];
          else block.settings[name] = JSON.parse(json); // clone — the model never aliases caller objects
        },
        { label: `set ${id}.${name} = ${json}` },
      );
      rerenderBlock(id);
    },

    /** Reset one role-grouped settings section in a single history entry. */
    resetSettings(id: string, role: ControlRole, breakpoint: StyleBreakpoint = "base"): boolean {
      const block = findBlock(id);
      const def = block && getBlockType(block.type);
      const mode = editingModeFor(id);
      if (!block || !def || mode === "disabled") return false;
      if (mode === "content-only" && role !== "content") return false;
      const specs = (def.settings ?? []).filter(
        (setting) => !setting.transform && settingRole(def, setting) === role,
      );
      const changes = specs.filter((setting) => {
        if (setting.setting) return !!block.settings && setting.setting in block.settings;
        if (setting.style) return !!styleBackend.read(block, setting.style, undefined, breakpoint);
        const field = def.fields.find((candidate) => candidate.name === setting.field);
        return (
          !!field && JSON.stringify(block.fields[field.name]) !== JSON.stringify(field.default)
        );
      });
      if (!changes.length) return false;
      commit(
        () => {
          for (const setting of changes) {
            if (setting.setting) delete block.settings?.[setting.setting];
            else if (setting.style)
              styleBackend.write(block, setting.style, "", "element", undefined, breakpoint);
            else {
              const field = def.fields.find((candidate) => candidate.name === setting.field)!;
              block.fields[field.name] = cloneValue(field.default);
            }
          }
        },
        { label: `reset ${role} settings ${id}` },
      );
      rerenderBlock(id);
      return true;
    },

    /** Apply one governed semantic color context to an entire pattern copy.
     * Pattern recipes only reference semantic roles, so remapping those role
     * keys preserves every block's intent (surface, accent, muted, border)
     * while changing the palette as one undoable operation. */
    setPatternColorContext(id: string, context: string): boolean {
      const root = findBlock(id);
      if (!root?.pattern || root.type !== PATTERN_ROOT_TYPE) return false;
      const theme = activeTheme();
      const prefix = context === "default" ? "" : `${context}-`;
      if (
        context !== "default" &&
        (!hasToken(theme, `color-${prefix}surface`) ||
          !hasToken(theme, `color-${prefix}foreground`))
      )
        return false;
      const roles = semanticColorRoles(theme).sort((a, b) => b.key.length - a.key.length);
      const roleOf = (value: string) =>
        roles.find((role) => value === role.key || value.endsWith(`-${role.key}`))?.key;
      const changes: Array<{
        block: Block;
        prop: "textColor" | "backgroundColor" | "borderColor";
        breakpoint: StyleBreakpoint;
        value: string;
      }> = [];
      for (const block of flattenBlocks(root.children ?? [])) {
        for (const breakpoint of styleBreakpoints(theme).map((option) => option.key)) {
          for (const prop of ["textColor", "backgroundColor", "borderColor"] as const) {
            const current = styleBackend.read(block, prop, theme, breakpoint) ?? "";
            const role = roleOf(current);
            if (!role) continue;
            const value = `${prefix}${role}`;
            if (current !== value && hasToken(theme, `color-${value}`))
              changes.push({ block, prop, breakpoint, value });
          }
        }
      }
      const stored = root.settings?.colorContext;
      const nextStored = context === "default" ? "" : context;
      if (!changes.length && stored === nextStored) return false;
      commit(
        () => {
          root.settings ??= {};
          if (nextStored) root.settings.colorContext = nextStored;
          else delete root.settings.colorContext;
          for (const change of changes)
            styleBackend.write(
              change.block,
              change.prop,
              change.value,
              "element",
              theme,
              change.breakpoint,
            );
        },
        { label: `pattern ${id} color context = ${context}` },
      );
      // Rebuild only this copy so the root remains selected and its pattern
      // controls stay visible after changing context.
      rerenderBlock(id);
      return true;
    },

    /** Set several supported style values in one history transaction. */
    setStyles(
      id: string,
      values: Readonly<Record<string, string>>,
      breakpoint: StyleBreakpoint = "base",
    ): boolean {
      const block = findBlock(id);
      if (!block || !effectiveBlockPolicy(block).stylable) return false;
      const def = getBlockType(block.type);
      const changes = Object.entries(values).filter(([prop, value]) => {
        const supported =
          prop === "variation" ? !!def?.variants?.length : blockSupportsStyle(def?.supports, prop);
        const current =
          prop === "variation"
            ? readVariation(block)
            : (styleBackend.read(block, prop, undefined, breakpoint) ?? "");
        return supported && current !== value;
      });
      if (!changes.length) return false;
      commit(
        () => {
          for (const [prop, value] of changes) {
            if (prop === "variation") writeVariation(block, value);
            else styleBackend.write(block, prop, value, "element", undefined, breakpoint);
          }
        },
        { label: `style ${id}: ${changes.map(([prop]) => prop).join(", ")}` },
      );
      rerenderBlock(id);
      return true;
    },

    /**
     * Set a universal STYLE value: `prop` → `value` (a theme token key, step,
     * or raw CSS; "" clears it). Refused when the block's policy isn't
     * `stylable` (content-only locks style) or its type doesn't `supports`
     * the prop. Since E2 the CARRIER is the source of truth — the backend
     * REPLACES its own classes/declarations in place (a pasted `text-xl` is
     * replaced, never shadowed). One history entry; re-rendered in place.
     */
    setStyle(id: string, prop: string, value: string, breakpoint: StyleBreakpoint = "base") {
      const block = findBlock(id);
      if (!block || !effectiveBlockPolicy(block).stylable) return; // policy gate
      const def = getBlockType(block.type);
      // Capability gate: a universal prop needs `supports`; the internal
      // variation marker needs declared variants.
      const supported =
        prop === "variation" ? !!def?.variants?.length : blockSupportsStyle(def?.supports, prop);
      if (!supported) return;
      const current =
        prop === "variation"
          ? readVariation(block)
          : (styleBackend.read(block, prop, undefined, breakpoint) ?? "");
      if (current === value) return; // no-op
      commit(
        () => {
          if (prop === "variation") writeVariation(block, value);
          else styleBackend.write(block, prop, value, "element", undefined, breakpoint);
        },
        { label: `style ${id}.${prop} = ${value || "(cleared)"}` },
      );
      rerenderBlock(id);
    },

    /** Clear every supported style and variation in one history entry. */
    resetStyles(id: string): boolean {
      const block = findBlock(id);
      if (!block || !effectiveBlockPolicy(block).stylable) return false;
      const def = getBlockType(block.type);
      const responsiveProps = styleBreakpoints().flatMap(({ key: breakpoint }) =>
        Object.keys(STYLE_PROPS)
          .filter(
            (prop) =>
              blockSupportsStyle(def?.supports, prop) &&
              !!styleBackend.read(block, prop, undefined, breakpoint),
          )
          .map((prop) => ({ prop, breakpoint })),
      );
      const variation = def?.variants?.length ? readVariation(block) : "";
      if (!responsiveProps.length && !variation) return false;
      commit(
        () => {
          for (const { prop, breakpoint } of responsiveProps)
            styleBackend.write(block, prop, "", "element", undefined, breakpoint);
          if (variation) writeVariation(block, "");
        },
        { label: `reset styles ${id}` },
      );
      rerenderBlock(id);
      return true;
    },

    /** Clear one universal style panel in one history entry. */
    resetStylePanel(id: string, panel: string, breakpoint: StyleBreakpoint = "base"): boolean {
      const block = findBlock(id);
      if (!block || !effectiveBlockPolicy(block).stylable) return false;
      const def = getBlockType(block.type);
      const panels = panel.split(",").map((name) => name.trim());
      const props = Object.entries(STYLE_PROPS)
        .filter(
          ([prop, descriptor]) =>
            panels.includes(descriptor.panel) &&
            blockSupportsStyle(def?.supports, prop) &&
            !!styleBackend.read(block, prop, undefined, breakpoint),
        )
        .map(([prop]) => prop);
      const variation =
        panels.includes("styles") && def?.variants?.length ? readVariation(block) : "";
      if (!props.length && !variation) return false;
      commit(
        () => {
          for (const prop of props)
            styleBackend.write(block, prop, "", "element", undefined, breakpoint);
          if (variation) writeVariation(block, "");
        },
        { label: `reset ${panel} styles ${id}` },
      );
      rerenderBlock(id);
      return true;
    },

    /** The style panels a block's TYPE opts into (Phase C `supports`) — chrome renders the matching controls. */
    styleSupports: (id: string): StyleSupports | undefined =>
      getBlockType(findBlock(id)?.type ?? "")?.supports,

    /** The named semantic variants a block's type declares. */
    blockVariants: (id: string) => getBlockType(findBlock(id)?.type ?? "")?.variants,

    /** Whether the block's policy permits style edits (`stylable`) — chrome disables style controls when false. */
    canStyle: (id: string): boolean => {
      const block = findBlock(id);
      return !!block && effectiveBlockPolicy(block).stylable;
    },

    /** The block's current value for a style prop, read off its CARRIER by the
     * backend (lens read — pasted utilities register too); "" when unset. */
    getStyle: (id: string, prop: string, breakpoint: StyleBreakpoint = "base"): string => {
      const block = findBlock(id);
      if (!block) return "";
      return prop === "variation"
        ? readVariation(block)
        : (styleBackend.read(block, prop, undefined, breakpoint) ?? "");
    },

    /** The active style backend (chrome may surface the carrier + inject css()). */
    styleBackend: (): StyleBackend => styleBackend,

    /**
     * Swap the SITE THEME at runtime (E4's theme editor): installs it
     * page-wide and re-renders the canvas — carried token keys stay put;
     * their resolution (and the controls) follow the new theme.
     */
    setTheme(next: Theme): void {
      setActiveTheme(next);
      renderCanvas();
    },

    /**
     * Transform a block IN PLACE to another registered type — the element
     * switcher's primitive. Identity survives: same id, same position;
     * fields carry over by name where the target declares them (target
     * defaults fill the rest), authored classes ride along, children stay
     * when the target accepts them. Returns null (refuses) when the target
     * is unknown or already the block's type, on raw-html passthroughs
     * (nothing to carry), and when the block has children the target can't
     * take — that would silently drop content. Contrast replaceBlock: a
     * FRESH block of the new type (slash command / inserter semantics).
     */
    transformBlock(id: string, type: string): Block | null {
      if (editingModeFor(id) !== "default") return null;
      const at = locate(id);
      const def = getBlockType(type);
      if (!at || !def || at.block.type === type || at.block.type === RAW_TYPE) return null;
      if (!slotAccepts(at.parent, type)) return null; // the containing slot rejects the target
      const src = at.block;
      if (src.children?.length && !def.acceptsChildren) return null;
      const next: Block = { type, id, fields: {}, classes: src.classes ?? "" };
      for (const f of def.fields) next.fields[f.name] = cloneValue(src.fields[f.name] ?? f.default);
      if (def.acceptsChildren) next.children = src.children ?? [];
      // Island settings carry over by name like fields do — sparse values the
      // target also declares survive, the rest stay at the target's defaults.
      if (def.islandSettings.length) {
        next.settings = {};
        for (const s of def.islandSettings) {
          if (src.settings && s.name in src.settings) next.settings[s.name] = src.settings[s.name];
        }
      }
      commit(
        () => {
          at.list.splice(at.index, 1, next);
        },
        { label: `transform ${id} → ${type}` },
      );
      // Surgical swap (same id): caret inside a preserved child and the
      // block-selection highlight both survive via rerenderBlock.
      rerenderBlock(id);
      return next;
    },

    /** Replace a block with a fresh one of another type (slash command / inserter). */
    replaceBlock(id: string, type: string): Block | null {
      if (editingModeFor(id) !== "default") return null;
      const at = locate(id);
      if (!at || !getBlockType(type)) return null;
      if (!slotAccepts(at.parent, type)) return null; // the containing slot rejects the target
      const next = makeBlock(type);
      commit(
        () => {
          at.list.splice(at.index, 1, next);
        },
        { label: `transform ${id} → ${type}` },
      );
      renderCanvas();
      landOnInserted(next);
      return next;
    },

    /** Replace a block's authored classes (canonical in the class attribute). */
    setClasses(id: string, classes: string | null | undefined) {
      const block = findBlock(id);
      if (!block || editingModeFor(id) !== "default") return;
      commit(
        () => {
          block.classes = classes ?? "";
        },
        { label: `classes ${id}` },
      );
      rerenderBlock(id);
    },

    loadHtml(html: string) {
      const tmp = ownerDocument.createElement("div");
      tmp.innerHTML = html;
      // Content only — policy is config-sourced (thoughts/010), never read off
      // loaded HTML, so a pasted/AI-written/stale block can't smuggle its own
      // locks (the template-authoritative guardrail, A8). upcast keeps only
      // carriers/classes/children; policy-looking attributes are dropped.
      model = upcast(tmp.querySelector("[data-pb-doc]") ?? tmp);
      history.reset();
      ghost = null; // ids ride the HTML — a stale ghost could shadow a loaded block
      renderCanvas();
      trace(`load: ${model.blocks.length} blocks · history reset`);
      notify();
    },

    /**
     * Model → HTML. Default pipeline "editor" = full wire contract;
     * { pipeline: "data" } = published shape (data-pb-* and settings islands
     * stripped, data-p-* kept).
     */
    serialize: (options?: { pipeline?: DowncastPipeline }): string =>
      downcast(model, options?.pipeline),
  };
}

/** The editor instance createEditor returns. */
export type Editor = ReturnType<typeof createEditor>;
