// selection.ts — block-level multiselection. The moment the native selection
// spans more than one block root, selection PROMOTES from text-level to
// block-level (familiar block-editor semantics): the contiguous run of blocks between the
// endpoints — in model order, including non-editable raw-html blocks caught
// in the middle — is selected whole, so block ops (delete, group, later
// move/copy) operate on entire blocks. With nesting, endpoints at different
// depths normalize to the SIBLING LIST of their deepest common ancestor
// (tree.ts siblingRun) — a selection never straddles levels.
//
// The mirror only OBSERVES the native selection (ids + a pbe-selected class
// per root; the id list lives in a PublrJS reactive store for chrome).
//
// The gesture needs help, though: selection is constrained per EDITING HOST
// (the highest editable ancestor), and every carrier is its own island — a
// drag that starts inside one can never extend into another; Chromium
// re-anchors the drag into whichever host the pointer enters instead
// ("the selection jumps between blocks"). Fighting the drag doesn't work
// (preventDefault on mousemove does not stop selection updates). So, the
// moment a drag crosses a block boundary, we make the CANVAS itself
// contenteditable for the remainder of the gesture: all carriers merge into
// one editing host, the native drag legally spans blocks, and the mirror
// reads it — the browser does the work. On mouseup the canvas reverts and
// the selection is re-asserted as a root-level range (element endpoints are
// always legal for programmatic selection, editable or not).
//
// A standard block-editor trick, for the same reason. Shift+click on another
// block extends from the caret's block. Keyboard multiselection
// (Shift+arrows) is a later, deliberate feature.

import { reactive } from "./publr-runtime";
import { EDITABLE_SELECTOR, RAW_TYPE } from "./carriers";
import type { Block } from "./carriers";
import { flattenBlocks, locateBlock, pathToBlock, siblingRun } from "./tree";

export interface SelectionState {
  /** Selected block ids, document order — block-level multiselection. */
  blocks: string[];
  /** The block holding the caret (or a within-block text selection), if focus is in the canvas. */
  active: string | null;
}

export interface BlockSelectionOptions {
  canvas: HTMLElement;
  getBlocks: () => Block[];
  onChange?: (ids: string[]) => void;
  /**
   * Remaps a gesture's target block id before selection acts on it — the
   * editor uses this to make pattern instances opaque (a click on a
   * structural child selects the instance; content blocks pass through).
   * Identity when absent.
   */
  resolveTarget?: (id: string, point?: { clientX: number; clientY: number }) => string;
}

export function createBlockSelection({
  canvas,
  getBlocks,
  onChange,
  resolveTarget,
}: BlockSelectionOptions) {
  const ownerDocument = canvas.ownerDocument;
  const ownerWindow = ownerDocument.defaultView ?? window;
  const state = reactive<SelectionState>({ blocks: [], active: null });
  let ids: string[] = [];
  const resolve = (id: string | null, point?: { clientX: number; clientY: number }) =>
    id && resolveTarget ? resolveTarget(id, point) : id;

  // Two selection sources feed one state: the MIRROR (native selection
  // spanning blocks — always a contiguous run) and EXPLICIT selection
  // (clicks: a raw-html block's only interaction surface, and Cmd/Ctrl+click
  // toggling individual blocks — which may be NON-contiguous; the id list is
  // the source of truth, so everything downstream already copes). A real
  // block-spanning selection always wins over an explicit one; clicking into
  // editable content hands control back to the caret.
  let explicitIds: string[] = []; // kept in document (model) order regardless of click order

  function endpointId(node: Node | null): string | null {
    const el = node instanceof ownerWindow.Element ? node : node?.parentElement;
    const root = el?.closest("[data-pb-id]"); // NEAREST root — may be a nested block
    return resolve(root && canvas.contains(root) ? root.getAttribute("data-pb-id") : null);
  }

  function compute(): string[] {
    const sel = ownerWindow.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return [];
    const a = endpointId(sel.anchorNode);
    const f = endpointId(sel.focusNode);
    if (!a || !f || a === f) return []; // one block (or outside) = text selection, not ours
    const run = siblingRun(getBlocks(), a, f); // backwards drags + depths normalize
    return run ? run.list.slice(run.lo, run.hi + 1).map((b) => b.id) : [];
  }

  function apply(next: string[]) {
    if (next.length === ids.length && next.every((id, i) => id === ids[i])) return;
    ids = next;
    for (const el of canvas.querySelectorAll(".pbe-selected")) el.classList.remove("pbe-selected");
    for (const id of ids)
      canvas.querySelector(`[data-pb-id="${CSS.escape(id)}"]`)?.classList.add("pbe-selected");
    state.blocks = [...ids];
    onChange?.(ids);
  }

  function refresh() {
    const computed = compute();
    if (computed.length) explicitIds = []; // a real block-spanning selection wins
    apply(computed.length ? computed : [...explicitIds]);

    // Track the ACTIVE block — the one containing the selection, collapsed
    // (caret) or not (a text selection being formatted). Chrome anchors to
    // it: the toolbar must stay up, and stay targeted, while text inside one
    // block is selected — that is exactly when bold/italic apply.
    // FOCUS is required: a selection object survives focus loss (clicking
    // outside often blurs without moving the caret), and chrome must follow
    // attention, not a lingering range.
    const sel = ownerWindow.getSelection();
    let active: string | null = null;
    if (canvas.contains(ownerDocument.activeElement) && sel?.rangeCount) {
      const rootAt = (node: Node | null) => {
        const el = node instanceof ownerWindow.Element ? node : node?.parentElement;
        const root = el?.closest("[data-pb-id]");
        return root && canvas.contains(root) ? root : null;
      };
      const a = rootAt(sel.anchorNode);
      if (a && a === rootAt(sel.focusNode)) active = a.getAttribute("data-pb-id");
    }
    if (state.active !== active) state.active = active;
  }

  // Explicit selection means the BLOCK is the unit — there is no caret in
  // that mode; a lingering caret would let typing edit a block while others
  // read as selected.
  function dropCaret() {
    ownerWindow.getSelection()?.removeAllRanges();
    // Removing ranges does NOT move DOM focus — a carrier would keep its
    // :focus ring under the new block selection. Canvas clicks get the blur
    // natively (unprevented mousedown moves focus); programmatic selects and
    // prevented-mousedown gestures (tree view, Cmd/Ctrl+click) must release
    // it here: the block is the focus of attention now.
    const focused = ownerDocument.activeElement;
    if (focused instanceof ownerWindow.HTMLElement && canvas.contains(focused)) focused.blur();
  }

  // An explicit block selection is keyboard-active. Before the canvas moved
  // into an iframe, leaving focus on parent chrome still happened to deliver
  // Backspace to the editor's document listener. Across a browsing-context
  // boundary it cannot: focus must live inside the iframe for Delete,
  // Backspace, Enter-after-block, and grouping shortcuts to reach the editor.
  const focusCanvas = () => canvas.focus({ preventScroll: true });

  function select(id: string) {
    id = resolve(id)!;
    explicitIds = [id];
    dropCaret();
    apply([id]);
    focusCanvas();
  }

  function toggle(id: string) {
    // Seed from the CURRENT selection whichever source produced it: a mirror
    // run (native shift-range) converts to an explicit selection on the
    // first toggle — otherwise Cmd+click after Shift+click would drop the
    // run and restart from the clicked block. dropCaret below removes the
    // native range, so the mirror can't reassert the old run afterwards.
    id = resolve(id)!;
    const current = explicitIds.length ? explicitIds : [...ids];
    if (current.includes(id)) {
      explicitIds = current.filter((x) => x !== id);
    } else {
      const wanted = new Set([...current, id]);
      explicitIds = flattenBlocks(getBlocks())
        .map((b) => b.id)
        .filter((x) => wanted.has(x)); // document order, nested blocks included
    }
    dropCaret();
    apply([...explicitIds]);
    focusCanvas();
  }

  // Explicitly select a set of blocks (ungroup selects the released run).
  function selectMany(idsIn: string[]) {
    const wanted = new Set(idsIn.map((id) => resolve(id)!));
    explicitIds = flattenBlocks(getBlocks())
      .map((b) => b.id)
      .filter((id) => wanted.has(id));
    dropCaret();
    apply([...explicitIds]);
    focusCanvas();
  }

  function clear() {
    explicitIds = [];
    apply([]);
  }

  const isRaw = (id: string) =>
    flattenBlocks(getBlocks()).find((b) => b.id === id)?.type === RAW_TYPE;
  // Containers carry children; their own surface (padding, gaps between
  // children) is selection surface, like a raw block's whole body.
  const isContainer = (id: string) =>
    !!flattenBlocks(getBlocks()).find((b) => b.id === id)?.children;

  ownerDocument.addEventListener("selectionchange", refresh);
  // Focus transitions don't fire selectionchange, but they change `active`
  // (blur to the page background leaves the caret behind).
  ownerDocument.addEventListener("focusin", refresh);
  ownerDocument.addEventListener("focusout", refresh);

  // Escape drops any block selection.
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && ids.length) {
      clear();
      ownerWindow.getSelection()?.removeAllRanges();
    }
  }
  ownerDocument.addEventListener("keydown", onKeyDown);

  // --- Cmd/Ctrl+A: the select-all ladder ---------------------------------------
  // Each press widens the selection one ring: all text in the carrier (native,
  // not ours) → the block → every sibling in its list → every block at the
  // parent's level → … → all top-level blocks. Walking level by level keeps
  // "select everything in this group" one keystroke away from "select
  // everything", without a separate shortcut.

  // Native select-all owns the first press; ours starts once the carrier's
  // text is already fully covered (an empty carrier trivially is).
  function carrierFullySelected(carrier: HTMLElement): boolean {
    const text = carrier.textContent ?? "";
    if (!text) return true;
    const sel = ownerWindow.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    if (!carrier.contains(range.startContainer) || !carrier.contains(range.endContainer))
      return false;
    return range.toString().length >= text.length;
  }

  function onSelectAll(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.defaultPrevented) return;
    if (event.key.toLowerCase() !== "a") return;
    const blocks = getBlocks();
    if (!blocks.length) return;

    // Never steal Cmd+A from editable chrome outside the canvas (inserter
    // search etc.), even while a block selection is up.
    const focused = ownerDocument.activeElement;
    if (
      focused instanceof ownerWindow.HTMLElement &&
      !canvas.contains(focused) &&
      (focused.matches("input, textarea, select") || focused.isContentEditable)
    )
      return;

    // A block selection escalates: whole sibling list first, then up a level.
    if (ids.length) {
      event.preventDefault();
      const at = locateBlock(blocks, ids[0]);
      if (!at) return;
      const listIds = at.list.map((b) => b.id);
      if (!listIds.every((x) => ids.includes(x))) return selectMany(listIds);
      if (at.parent) {
        const up = locateBlock(blocks, at.parent.id)!;
        selectMany(up.list.map((b) => b.id));
      }
      return; // whole document already selected — the ladder tops out
    }

    // No block selection: only a caret/selection inside the canvas is ours.
    if (!focused || !canvas.contains(focused)) return;
    const carrier = focused.closest<HTMLElement>(EDITABLE_SELECTOR);
    const rootEl = focused.closest("[data-pb-id]");
    if (carrier && rootEl && !carrierFullySelected(carrier)) return; // native select-all's turn
    event.preventDefault();
    if (rootEl) select(rootEl.getAttribute("data-pb-id")!);
    else selectMany(blocks.map((b) => b.id)); // canvas itself holds focus — everything
  }
  ownerDocument.addEventListener("keydown", onSelectAll);

  // --- the promotion gesture -------------------------------------------------

  let anchorId: string | null = null; // block where a primary-button gesture started
  let merged = false; // canvas is temporarily one editing host
  let ownedGesture = false; // surface-click origin: WE prevented the native caret

  function rootIdOf(
    target: EventTarget | Element | null,
    point?: { clientX: number; clientY: number },
  ): string | null {
    const root = target instanceof ownerWindow.Element ? target.closest("[data-pb-id]") : null;
    return resolve(root && canvas.contains(root) ? root.getAttribute("data-pb-id") : null, point);
  }

  // Root-level range across the run — element endpoints sit outside the
  // editable islands, which programmatic selection is always free to do.
  // siblingRun normalizes cross-depth endpoints to one sibling list.
  function selectBlockRange(fromId: string, toId: string) {
    const run = siblingRun(getBlocks(), fromId, toId);
    if (!run) return;
    const first = canvas.querySelector(`[data-pb-id="${CSS.escape(run.list[run.lo].id)}"]`);
    const last = canvas.querySelector(`[data-pb-id="${CSS.escape(run.list[run.hi].id)}"]`);
    if (!first || !last) return;
    focusCanvas();
    ownerWindow.getSelection()?.setBaseAndExtent(first, 0, last, last.childNodes.length);
    refresh(); // selectionchange is async — reflect immediately
  }

  // Track the pointer during a gesture at the document level, hit-testing its
  // position — event targets and boundary events are unreliable while a
  // selection drag is in flight.
  function onDragTrack(event: MouseEvent) {
    if (!(event.buttons & 1)) return endGesture();
    // Surface-origin gesture: the mousedown was prevented, so no native drag
    // selection exists to promote — extend the block run OURSELVES from the
    // anchor to whatever block the pointer is over.
    if (ownedGesture) {
      const overId = rootIdOf(ownerDocument.elementFromPoint(event.clientX, event.clientY), event);
      if (overId && overId !== anchorId && anchorId) selectBlockRange(anchorId, overId);
      else if (overId && overId === anchorId && ids.length > 1) select(anchorId);
      return;
    }
    if (merged) return; // host is merged — the native drag handles the rest
    const overId = rootIdOf(ownerDocument.elementFromPoint(event.clientX, event.clientY), event);
    if (overId && overId !== anchorId) {
      merged = true;
      canvas.contentEditable = "true"; // one editing host for the rest of the drag
    }
  }

  function onMouseDown(event: MouseEvent) {
    // A prevented mousedown is an owned gesture (the appender claiming a
    // click on a container's surface) — never also a selection click.
    if (event.button !== 0 || event.defaultPrevented) return;
    const targetId = rootIdOf(event.target, event);
    if (!targetId) return;

    // Cmd/Ctrl+click toggles individual blocks in and out of the selection —
    // any block type, possibly non-contiguous. The block is the unit, so the
    // click must not place a caret, and a toggle never starts a drag gesture.
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggle(targetId);
      return;
    }

    if (event.shiftKey) {
      // Shift+click is ALWAYS block-level (the browser's native shift-extend
      // inside a carrier selects arbitrary text spans — never wanted here):
      // with an anchor in another block it extends the contiguous run;
      // without one — or anchored to the clicked block itself — it selects
      // the clicked block whole, same as Cmd/Ctrl+click.
      event.preventDefault();

      // Re-shift-clicking INSIDE the selected block walks the selection UP:
      // block → parent container → … → top level (where it stays put).
      if (explicitIds.length === 1) {
        const selId = explicitIds[0];
        const targetPath = pathToBlock(getBlocks(), targetId);
        if (targetPath?.some((b) => b.id === selId)) {
          const selPath = pathToBlock(getBlocks(), selId)!;
          select(selPath[selPath.length - 2]?.id ?? selId);
          return;
        }
      }

      const sel = ownerWindow.getSelection();
      const node = sel?.anchorNode;
      const el = node instanceof ownerWindow.Element ? node : node?.parentElement;
      const caretId =
        el && canvas.contains(el) ? el.closest("[data-pb-id]")?.getAttribute("data-pb-id") : null;
      const fromId = caretId ?? explicitIds[explicitIds.length - 1];
      if (fromId && fromId !== targetId) selectBlockRange(fromId, targetId);
      else select(targetId);
      return;
    }

    // A plain click that lands OUTSIDE any editable carrier selects the
    // nearest block: raw blocks (no carriers at all), container surfaces
    // (padding, gaps between children — a child click never reaches this),
    // and non-editable content inside typed blocks — an image, a video, a
    // separator's hr (familiar block-editor semantics: media is clicked, not careted).
    // The zone BELOW a container's last child belongs to the appender (which
    // preventDefaults — caught above). Clicking an editable carrier releases
    // any explicit selection (the caret takes over).
    const inCarrier =
      event.target instanceof ownerWindow.Element &&
      !!event.target.closest("[data-pb-text],[data-pb-rich]");
    if (isRaw(targetId) || isContainer(targetId) || !inCarrier) {
      // WE own this gesture — without preventDefault, Chromium's default
      // places a caret at the nearest TEXT position, which for a click on a
      // container's surface is often a NEIGHBORING block's text: chrome then
      // reads that block as active, and one pixel of drag promotes the
      // phantom anchor into a cross-block run (the "clicking a pattern also
      // selects the raw block before it" bug).
      event.preventDefault();
      ownedGesture = true;
      select(targetId);
    } else if (explicitIds.length) clear();

    anchorId = targetId;
    ownerDocument.addEventListener("mousemove", onDragTrack, true);
  }

  function endGesture() {
    ownerDocument.removeEventListener("mousemove", onDragTrack, true);
    anchorId = null;
    ownedGesture = false;
    if (!merged) return;
    merged = false;
    canvas.removeAttribute("contenteditable");
    // Reverting the host may perturb the native selection — re-assert the
    // block run as a root-level range (also gives whole-block copy semantics).
    if (ids.length > 1) selectBlockRange(ids[0], ids[ids.length - 1]);
  }

  // Clicking outside any block deselects an explicit selection — parity with
  // the mirror, whose native selection collapses (and so clears) on outside
  // clicks automatically. Chrome that preventDefaults its mousedown (toolbar
  // buttons) opts out, exactly like native selections surviving those clicks.
  // Chrome that NEEDS real focus (sidebar inputs — a settings panel driven
  // by this very selection) opts out with data-pbe-keep-selection instead:
  // interacting with a block's options must never deselect the block.
  function onDocMouseDown(event: MouseEvent) {
    if (event.button !== 0 || event.defaultPrevented || !explicitIds.length) return;
    if (rootIdOf(event.target, event)) return; // clicks on blocks are handled in onMouseDown
    if (
      event.target instanceof ownerWindow.Element &&
      event.target.closest("[data-pbe-keep-selection]")
    )
      return;
    clear();
  }

  canvas.addEventListener("mousedown", onMouseDown);
  ownerDocument.addEventListener("mousedown", onDocMouseDown); // bubble: runs after onMouseDown
  ownerDocument.addEventListener("mouseup", endGesture);

  return {
    state, // reactive { blocks: [id, …], active } — chrome binds to this

    get ids(): string[] {
      return [...ids];
    },

    active: () => ids.length > 0,
    select, // explicit single-block selection (chrome will use this too)
    selectMany, // explicit multi-block selection (ungroup selects the released run)
    toggle, // Cmd/Ctrl+click semantics: add/remove one block, non-contiguous ok
    range: selectBlockRange, // Shift semantics: sibling run from→to as a native root-level range
    clear,

    destroy() {
      ownerDocument.removeEventListener("selectionchange", refresh);
      ownerDocument.removeEventListener("focusin", refresh);
      ownerDocument.removeEventListener("focusout", refresh);
      ownerDocument.removeEventListener("keydown", onKeyDown);
      ownerDocument.removeEventListener("keydown", onSelectAll);
      ownerDocument.removeEventListener("mousedown", onDocMouseDown);
      ownerDocument.removeEventListener("mouseup", endGesture);
      ownerDocument.removeEventListener("mousemove", onDragTrack, true);
      canvas.removeEventListener("mousedown", onMouseDown);
    },
  };
}

export type BlockSelection = ReturnType<typeof createBlockSelection>;
