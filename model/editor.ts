// The editing core: the model, the selection, history and policy, and every operation
// that changes them. Every change goes through `commit()`, so history, selection and
// listeners stay correct; nothing here touches the canvas. The canvas and chrome call
// these operations and redraw from the changes they announce.
import { downcast, fresh, upcast } from "./codec";
import type { Pipeline } from "./codec";
import { escapeHtml } from "./carriers";
import { applyMark, normalize, plainText, setLink, splitAt, textLength, toggleMark } from "./format";
import type { MarkName } from "./format";
import { History, noSelection } from "./history";
import type { Caret, Selection, Snapshot } from "./history";
import { Policy } from "./policy";
import type { PolicyConfig } from "./policy";
import { blockType } from "./registry";
import type { BlockType } from "./registry";
import { flatten, locate, pathTo } from "./tree";
import type { Location } from "./tree";
import type { Block, FieldValue, Fields, Model, Settings } from "./types";
import { RAW_TYPE } from "./types";

/** Where a block goes: a parent's slot (null parent: the top level) at an index. */
export type Place = { parent: string | null; slot: string | null; index: number };

export type ChangeKind = "load" | "content" | "structure" | "selection" | "history";

/** What a change touched. `source: "input"` means the canvas already shows it. */
export type Change = { kind: ChangeKind; ids: string[]; source?: "input" };

export type CommitOptions = {
  /** Commits sharing a key within half a second are one history entry (typing). */
  key?: string | null;
  selection?: Selection;
  kind?: ChangeKind;
  ids?: string[];
  source?: "input";
};

export type EditorOptions = {
  content?: string;
  policy?: PolicyConfig;
  /** The block type Enter creates at the end of a block, and an empty document starts with. */
  defaultBlock?: string;
  /** Plain HTML content opens as paragraphs (a rich field written before the editor). */
  plain?: boolean;
  debug?: boolean;
};

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class Editor {
  model: Model = { blocks: [] };
  selection: Selection = noSelection();
  readonly history = new History();
  policy: Policy;
  defaultBlock: string;
  debug: boolean;
  plain: boolean;
  /** Bumps on every change; chrome compares it to know when to redraw. */
  revision = 0;
  private listeners = new Set<(change: Change) => void>();

  constructor(options: EditorOptions = {}) {
    this.policy = new Policy(options.policy);
    this.defaultBlock = options.defaultBlock ?? "paragraph";
    this.debug = options.debug ?? false;
    this.plain = options.plain ?? false;
    this.load(options.content ?? "");
  }

  // ── events ──────────────────────────────────────────────────────────────

  subscribe(listener: (change: Change) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: Change): void {
    this.revision++;
    if (this.debug) console.log(`[publr-editor] ${change.kind}${change.source ? ` (${change.source})` : ""} ${change.ids.join(",")} undo=${this.history.undoDepth} redo=${this.history.redoDepth}`);
    for (const listener of this.listeners) listener(change);
  }

  // ── content in and out ──────────────────────────────────────────────────

  load(html: string): void {
    this.model = upcast(html, { plain: this.plain });
    if (this.model.blocks.length === 0) this.model.blocks.push(this.emptyDefault());
    this.selection = noSelection();
    this.history.clear();
    this.emit({ kind: "load", ids: [] });
  }

  serialize(pipeline: Pipeline = "editing"): string {
    return downcast(this.model, pipeline);
  }

  setPolicy(config: PolicyConfig): void {
    this.policy = new Policy(config);
    this.emit({ kind: "structure", ids: [] });
  }

  // ── commit and history ──────────────────────────────────────────────────

  private snapshot(): Snapshot {
    return { model: this.model, selection: this.selection };
  }

  /** The one way the model changes: records history, applies, announces. */
  commit(mutate: () => void, options: CommitOptions = {}): void {
    this.history.record(this.snapshot(), options.key ?? null, now());
    mutate();
    if (options.selection) this.selection = options.selection;
    this.emit({ kind: options.kind ?? "structure", ids: options.ids ?? [], source: options.source });
  }

  undo(): boolean {
    const previous = this.history.undo(this.snapshot());
    if (!previous) return false;
    this.model = previous.model;
    this.selection = previous.selection;
    this.emit({ kind: "history", ids: [] });
    return true;
  }

  redo(): boolean {
    const next = this.history.redo(this.snapshot());
    if (!next) return false;
    this.model = next.model;
    this.selection = next.selection;
    this.emit({ kind: "history", ids: [] });
    return true;
  }

  // ── reading ─────────────────────────────────────────────────────────────

  getBlock(id: string): Block | null {
    return locate(this.model, id)?.block ?? null;
  }

  locate(id: string): Location | null {
    return locate(this.model, id);
  }

  path(id: string): Block[] {
    return pathTo(this.model, id);
  }

  /** The block the selection is about: the caret's, or a single selected block. */
  get activeId(): string | null {
    if (this.selection.caret) return this.selection.caret.block;
    return this.selection.blocks.length === 1 ? this.selection.blocks[0] : null;
  }

  // ── selection (no history) ──────────────────────────────────────────────

  select(selection: Selection): void {
    const same = JSON.stringify(selection) === JSON.stringify(this.selection);
    this.selection = selection;
    this.history.seal();
    if (!same) this.emit({ kind: "selection", ids: [] });
  }

  /** Moves the caret silently (typing keeps it current without a redraw). */
  trackCaret(caret: Caret | null): void {
    this.selection = { blocks: [], caret };
  }

  selectBlocks(ids: string[]): void {
    this.select({ blocks: ids, caret: null });
  }

  // ── fields, settings, classes ───────────────────────────────────────────

  setField(id: string, field: string, value: FieldValue, options: { source?: "input"; key?: string | null } = {}): boolean {
    const block = this.getBlock(id);
    if (!block || !(field in block.fields)) return false;
    if (options.source === "input" && !this.policy.isEditable(block)) return false;
    if (JSON.stringify(block.fields[field]) === JSON.stringify(value)) return false;
    const typing = options.source === "input";
    this.commit(
      () => {
        block.fields[field] = structuredClone(value);
      },
      { key: options.key !== undefined ? options.key : typing ? `${id}:${field}` : null, kind: "content", ids: [id], source: options.source },
    );
    return true;
  }

  /** Writes an island setting; a value equal to its declared default drops the key. */
  setSetting(id: string, name: string, value: unknown, options: { key?: string | null } = {}): boolean {
    const block = this.getBlock(id);
    const type = block ? blockType(block.type) : null;
    if (!block || !type) return false;
    const fallback = type.defaults[name];
    const current = name in block.settings ? block.settings[name] : fallback;
    if (JSON.stringify(current) === JSON.stringify(value)) return false;
    this.commit(
      () => {
        if (fallback !== undefined && JSON.stringify(value) === JSON.stringify(fallback)) delete block.settings[name];
        else if (value === undefined) delete block.settings[name];
        else block.settings[name] = structuredClone(value);
      },
      { key: options.key ?? null, kind: "content", ids: [id] },
    );
    return true;
  }

  setSettings(id: string, settings: Settings): boolean {
    const block = this.getBlock(id);
    if (!block) return false;
    this.commit(
      () => {
        block.settings = structuredClone(settings);
      },
      { kind: "content", ids: [id] },
    );
    return true;
  }

  setClasses(id: string, classes: string, options: { key?: string | null } = {}): boolean {
    const block = this.getBlock(id);
    if (!block || block.type === RAW_TYPE) return false;
    const normalized = [...new Set(classes.split(/\s+/).filter(Boolean))].join(" ");
    if (normalized === block.classes) return false;
    this.commit(
      () => {
        block.classes = normalized;
      },
      { key: options.key ?? null, kind: "content", ids: [id] },
    );
    return true;
  }

  setInteractions(id: string, interactions: Record<string, string>): boolean {
    const block = this.getBlock(id);
    if (!block) return false;
    this.commit(
      () => {
        block.interactions = { ...interactions };
      },
      { kind: "content", ids: [id] },
    );
    return true;
  }

  // ── inline formatting ───────────────────────────────────────────────────

  /** Toggles a mark over a range of a rich field; one history entry, the range stays selected. */
  format(id: string, field: string, start: number, end: number, mark: MarkName, href?: string, target = ""): boolean {
    const block = this.getBlock(id);
    const type = block ? blockType(block.type) : null;
    const schema = type?.fields.find((candidate) => candidate.name === field);
    if (!block || !schema || schema.kind !== "rich" || start >= end) return false;
    if (!this.policy.isEditable(block) || !this.policy.formats(block).includes(mark)) return false;
    const html = String(block.fields[field]);
    const next = mark === "link" ? setLink(html, start, end, href ?? null, target) : toggleMark(html, start, end, mark);
    if (next === html) return false;
    this.commit(
      () => {
        block.fields[field] = next;
      },
      { kind: "content", ids: [id], selection: { blocks: [], caret: { block: id, field, start, end } } },
    );
    return true;
  }

  /** Sets a mark on or off over a range (the toolbar's explicit state). */
  setMark(id: string, field: string, start: number, end: number, mark: MarkName, on: boolean): boolean {
    const block = this.getBlock(id);
    if (!block || start >= end || !this.policy.formats(block).includes(mark)) return false;
    const html = String(block.fields[field]);
    const next = applyMark(html, start, end, mark, on);
    if (next === html) return false;
    this.commit(
      () => {
        block.fields[field] = next;
      },
      { kind: "content", ids: [id], selection: { blocks: [], caret: { block: id, field, start, end } } },
    );
    return true;
  }

  // ── structure ───────────────────────────────────────────────────────────

  private listAt(parent: string | null, slot: string | null): Block[] | null {
    if (parent === null) return this.model.blocks;
    const block = this.getBlock(parent);
    if (!block || !slot || !block.slots?.[slot]) return null;
    return block.slots[slot];
  }

  /** The place right after (or before) a block, in its own list. */
  placeBeside(id: string, after = true): Place | null {
    const location = this.locate(id);
    if (!location) return null;
    return { parent: location.parent?.id ?? null, slot: location.slot, index: location.index + (after ? 1 : 0) };
  }

  /** The end of the document. */
  placeAtEnd(): Place {
    return { parent: null, slot: null, index: this.model.blocks.length };
  }

  emptyDefault(): Block {
    const type = blockType(this.defaultBlock);
    if (!type) throw new Error(`editor: the default block "${this.defaultBlock}" is not registered`);
    return fresh(type);
  }

  /** Whether blocks of these types may go at `place`. */
  canPlace(place: Place, types: string[]): boolean {
    return types.every((type) => this.policy.canInsert(this.model, place.parent, place.slot, type));
  }

  /** Inserts blocks at a place; returns their ids, or [] when policy refuses. */
  insertBlocks(blocks: Block[], place: Place, options: { select?: "caret" | "block" | "none" } = {}): string[] {
    const list = this.listAt(place.parent, place.slot);
    if (!list || !this.canPlace(place, blocks.map((block) => block.type))) return [];
    const ids = blocks.map((block) => block.id);
    const mode = options.select ?? "caret";
    const first = blocks[0];
    const firstType = first ? blockType(first.type) : null;
    const caretField = firstType ? this.firstEditableField(first, firstType) : null;
    const selection: Selection =
      mode === "none"
        ? this.selection
        : mode === "caret" && caretField
          ? { blocks: [], caret: { block: first.id, field: caretField, start: 0, end: 0 } }
          : { blocks: ids, caret: null };
    this.commit(
      () => {
        list.splice(Math.min(place.index, list.length), 0, ...blocks);
      },
      { selection, ids },
    );
    return ids;
  }

  /** A fresh block of `type` at `place`. Containers land block-selected; text blocks get the caret. */
  insertType(type: string, place: Place): string | null {
    const definition = blockType(type);
    if (!definition) return null;
    const block = fresh(definition);
    const container = definition.slots.length > 0;
    const ids = this.insertBlocks([block], place, { select: container ? "block" : "caret" });
    return ids[0] ?? null;
  }

  /** The first text or rich field of a block a caret can go into. */
  firstEditableField(block: Block, type: BlockType): string | null {
    if (type.selectOnClick) return null;
    return type.fields.find((field) => field.kind === "text" || field.kind === "rich")?.name ?? null;
  }

  /** Removes blocks policy allows removing, in one entry. Returns the ids removed. */
  removeBlocks(ids: string[]): string[] {
    const removable = ids.filter((id) => {
      const block = this.getBlock(id);
      return block !== null && this.policy.canRemove(block);
    });
    if (removable.length === 0) return [];
    const first = this.locate(removable[0])!;
    const before = first.index > 0 ? first.list[first.index - 1] : null;
    this.commit(
      () => {
        for (const id of removable) {
          const location = this.locate(id);
          if (location) location.list.splice(location.index, 1);
        }
        if (this.model.blocks.length === 0) this.model.blocks.push(this.emptyDefault());
      },
      { selection: before ? this.caretAtEnd(before) : noSelection(), ids: removable },
    );
    return removable;
  }

  /** A selection with the caret at the end of a block's last text field, else the block selected. */
  caretAtEnd(block: Block): Selection {
    const type = blockType(block.type);
    if (!type || block.type === RAW_TYPE || type.selectOnClick) return { blocks: [block.id], caret: null };
    const field = [...type.fields].reverse().find((candidate) => candidate.kind === "text" || candidate.kind === "rich");
    if (!field) return { blocks: [block.id], caret: null };
    const value = String(block.fields[field.name] ?? "");
    const length = field.kind === "rich" ? textLength(value) : value.length;
    return { blocks: [], caret: { block: block.id, field: field.name, start: length, end: length } };
  }

  canMove(id: string, delta: number): boolean {
    const location = this.locate(id);
    if (!location || !this.policy.canMove(this.model, location.block)) return false;
    const target = location.index + delta;
    return target >= 0 && target < location.list.length;
  }

  /** Moves a block among its siblings; the selection follows. */
  moveBlock(id: string, delta: number): boolean {
    if (!this.canMove(id, delta)) return false;
    const location = this.locate(id)!;
    this.commit(
      () => {
        const [block] = location.list.splice(location.index, 1);
        location.list.splice(location.index + delta, 0, block);
      },
      { selection: this.selection, ids: [id] },
    );
    return true;
  }

  /** Moves blocks to a place (drag and drop, the list view). */
  moveTo(ids: string[], place: Place): boolean {
    const blocks = ids.map((id) => this.getBlock(id)).filter((block): block is Block => block !== null);
    if (blocks.length === 0 || blocks.some((block) => !this.policy.canMove(this.model, block))) return false;
    if (!this.canPlace(place, blocks.map((block) => block.type))) return false;
    if (place.parent && ids.some((id) => id === place.parent || this.path(place.parent!).some((ancestor) => ancestor.id === id))) return false;
    this.commit(
      () => {
        const target = this.listAt(place.parent, place.slot)!;
        let index = place.index;
        for (const id of ids) {
          const location = this.locate(id)!;
          if (location.list === target && location.index < index) index--;
          location.list.splice(location.index, 1);
        }
        target.splice(Math.min(index, target.length), 0, ...blocks);
      },
      { selection: { blocks: ids, caret: null }, ids },
    );
    return true;
  }

  /** Copies blocks right after the last of them, with fresh ids. */
  duplicate(ids: string[]): string[] {
    const blocks = ids.map((id) => this.getBlock(id)).filter((block): block is Block => block !== null);
    if (blocks.length === 0 || blocks.some((block) => !this.policy.canDuplicate(this.model, block))) return [];
    const last = this.locate(blocks[blocks.length - 1].id)!;
    const copies = blocks.map((block) => reidentified(block));
    return this.insertBlocks(copies, { parent: last.parent?.id ?? null, slot: last.slot, index: last.index + 1 }, { select: "block" });
  }

  /** A fresh block of `type` in place of `id` (picked from an empty block). */
  replaceBlock(id: string, type: string): string | null {
    const location = this.locate(id);
    const definition = blockType(type);
    if (!location || !definition) return null;
    if (!this.policy.canInsert(this.model, location.parent?.id ?? null, location.slot, type)) return null;
    const block = fresh(definition);
    const field = this.firstEditableField(block, definition);
    const container = definition.slots.length > 0;
    this.commit(
      () => {
        location.list.splice(location.index, 1, block);
      },
      {
        selection: !container && field ? { blocks: [], caret: { block: block.id, field, start: 0, end: 0 } } : { blocks: [block.id], caret: null },
        ids: [block.id],
      },
    );
    return block.id;
  }

  /** Replaces a block with others (a pattern stamp over an empty paragraph). */
  replaceWith(id: string, blocks: Block[], select: "block" | "caret" = "block"): string[] {
    const location = this.locate(id);
    if (!location) return [];
    const place = { parent: location.parent?.id ?? null, slot: location.slot, index: location.index };
    if (!this.canPlace(place, blocks.map((block) => block.type))) return [];
    const ids = blocks.map((block) => block.id);
    this.commit(
      () => {
        location.list.splice(location.index, 1, ...blocks);
      },
      { selection: select === "block" ? { blocks: ids, caret: null } : this.caretAtEnd(blocks[0]), ids },
    );
    return ids;
  }

  /** Switches a block's type in place: id, position, classes, children and same-named fields carry over. */
  transformBlock(id: string, type: string): boolean {
    const location = this.locate(id);
    const target = blockType(type);
    if (!location || !target || location.block.type === type) return false;
    const block = location.block;
    const source = blockType(block.type);
    if (!this.policy.canInsert(this.model, location.parent?.id ?? null, location.slot, type)) return false;
    const children = Object.entries(block.slots ?? {}).filter(([, list]) => list.length > 0);
    if (children.some(([slot]) => !target.slots.includes(slot)) && !(children.length === 1 && target.slots.length === 1)) return false;
    const next = fresh(target);
    next.id = block.id;
    next.classes = block.classes;
    next.interactions = { ...block.interactions };
    for (const field of target.fields) {
      const same = source?.fields.find((candidate) => candidate.name === field.name && candidate.kind === field.kind);
      if (same) next.fields[field.name] = structuredClone(block.fields[field.name]);
    }
    if (source?.primary && target.primary && !source.fields.some((field) => field.name === target.primary && field.kind === target.fields.find((f) => f.name === target.primary)?.kind)) {
      next.fields[target.primary] = convertText(block.fields[source.primary], source.fields.find((f) => f.name === source.primary)!.kind, target.fields.find((f) => f.name === target.primary)!.kind);
    }
    for (const name of Object.keys(target.defaults)) if (name in block.settings) next.settings[name] = structuredClone(block.settings[name]);
    if (children.length > 0 && next.slots) {
      if (children.length === 1 && target.slots.length === 1) next.slots[target.slots[0]] = children[0][1];
      else for (const [slot, list] of children) next.slots[slot] = list;
    }
    this.commit(
      () => {
        location.list.splice(location.index, 1, next);
      },
      { selection: this.selection, ids: [id] },
    );
    return true;
  }

  /** Wraps sibling blocks in a new block of `type` (a group by default). */
  group(ids: string[], type = "group"): string | null {
    const definition = blockType(type);
    if (!definition || ids.length === 0 || definition.slots.length === 0) return null;
    const locations = ids.map((id) => this.locate(id)).filter((location): location is Location => location !== null);
    if (locations.length !== ids.length) return null;
    const list = locations[0].list;
    if (locations.some((location) => location.list !== list)) return null;
    const ordered = [...locations].sort((a, b) => a.index - b.index);
    const parent = locations[0].parent?.id ?? null;
    const slot = locations[0].slot;
    if (!this.policy.canInsert(this.model, parent, slot, type)) return null;
    if (ordered.some((location) => !this.policy.canMove(this.model, location.block))) return null;
    const wrapper = fresh(definition);
    const inner = definition.slots[0];
    wrapper.slots![inner] = ordered.map((location) => location.block);
    this.commit(
      () => {
        for (const location of [...ordered].reverse()) list.splice(location.index, 1);
        list.splice(ordered[0].index, 0, wrapper);
      },
      { selection: { blocks: [wrapper.id], caret: null }, ids: [wrapper.id] },
    );
    return wrapper.id;
  }

  /** Splices a container's children into its place. */
  ungroup(id: string): string[] {
    const location = this.locate(id);
    if (!location || !location.block.slots) return [];
    const slots = Object.values(location.block.slots);
    if (slots.length !== 1 || !this.policy.canRemove(location.block)) return [];
    const children = slots[0];
    const place = { parent: location.parent?.id ?? null, slot: location.slot, index: location.index };
    if (!this.canPlace(place, children.map((child) => child.type))) return [];
    const ids = children.map((child) => child.id);
    this.commit(
      () => {
        location.list.splice(location.index, 1, ...children);
      },
      { selection: { blocks: ids, caret: null }, ids },
    );
    return ids;
  }

  /** Replaces a container slot's children (applying an isolated edit back). */
  setBlockChildren(id: string, slot: string, blocks: Block[]): boolean {
    const block = this.getBlock(id);
    if (!block?.slots || !(slot in block.slots)) return false;
    this.commit(
      () => {
        block.slots![slot] = structuredClone(blocks);
      },
      { selection: { blocks: [id], caret: null }, ids: [id] },
    );
    return true;
  }

  // ── typing structure: Enter and Backspace ───────────────────────────────

  /**
   * Enter at a caret: splits the field there into this block and a new sibling. At the
   * end of a block the sibling is the default block (or the same type for list items);
   * an empty list item leaves its list. Returns false when Enter should stay native.
   */
  split(id: string, field: string, offset: number): boolean {
    const location = this.locate(id);
    if (!location) return false;
    const block = location.block;
    const type = blockType(block.type);
    const schema = type?.fields.find((candidate) => candidate.name === field);
    if (!type || !schema || !schema.split || !this.policy.isEditable(block)) return false;

    const value = String(block.fields[field] ?? "");
    const length = schema.kind === "rich" ? textLength(value) : value.length;
    const [left, right] = schema.kind === "rich" ? splitAt(value, offset) : [value.slice(0, offset), value.slice(offset)];
    const parent = location.parent?.id ?? null;

    // An empty list item leaves the list: it becomes a default block after the list.
    if (type.splitSame && length === 0 && location.parent && location.list.length > 0) {
      const list = this.locate(location.parent.id);
      if (list && this.policy.canInsert(this.model, list.parent?.id ?? null, list.slot, this.defaultBlock)) {
        const paragraph = this.emptyDefault();
        const field = blockType(this.defaultBlock)!.primary!;
        this.commit(
          () => {
            location.list.splice(location.index, 1);
            const after = this.locate(location.parent!.id)!;
            after.list.splice(after.index + 1, 0, paragraph);
            if (location.list.length === 0) after.list.splice(after.index, 1);
          },
          { selection: { blocks: [], caret: { block: paragraph.id, field, start: 0, end: 0 } }, ids: [paragraph.id] },
        );
        return true;
      }
    }

    const atEnd = offset >= length && !type.splitSame;
    const nextType = atEnd ? blockType(type.splitInto ?? this.defaultBlock) : type;
    if (!nextType || !nextType.primary) return false;
    if (!this.policy.canInsert(this.model, parent, location.slot, nextType.type)) return false;

    const sibling = fresh(nextType);
    if (!atEnd) {
      // The same type keeps its structure (a heading's level, a list's tag); other content
      // stays with the first half.
      if (nextType.type === type.type) for (const other of type.fields) if (other.kind === "tag") sibling.fields[other.name] = block.fields[other.name];
      sibling.settings = structuredClone(block.settings);
      sibling.classes = block.classes;
      const targetKind = nextType.fields.find((candidate) => candidate.name === nextType.primary)!.kind;
      sibling.fields[nextType.primary] = nextType.type === type.type && field === nextType.primary ? right : convertText(right, schema.kind, targetKind);
    }
    this.commit(
      () => {
        block.fields[field] = atEnd ? value : left;
        location.list.splice(location.index + 1, 0, sibling);
      },
      { selection: { blocks: [], caret: { block: sibling.id, field: nextType.primary, start: 0, end: 0 } }, ids: [id, sibling.id] },
    );
    return true;
  }

  /**
   * Backspace at the start of a block's primary field. An empty block goes away; one
   * after a mergeable block joins it, markup kept (rich into text loses the markup,
   * text into rich is escaped); one after an unmergeable block selects that block.
   * Returns false when nothing happened and the key should do nothing.
   */
  mergeBackward(id: string): boolean {
    const location = this.locate(id);
    if (!location) return false;
    const block = location.block;
    const type = blockType(block.type);
    if (!type?.primary || !this.policy.canRemove(block) || !this.policy.isEditable(block)) return false;
    if (Object.values(block.slots ?? {}).some((children) => children.length > 0)) return false;
    const previous = location.index > 0 ? location.list[location.index - 1] : null;
    const value = String(block.fields[type.primary] ?? "");
    const kind = type.fields.find((field) => field.name === type.primary)!.kind;
    const empty = (kind === "rich" ? plainText(value) : value).length === 0 && !/<(img|svg|br|math|video|audio|iframe)/i.test(value);

    if (!previous) {
      // The first block of a list item leaves its list, like an empty item would.
      if (empty && location.parent && type.splitSame) return this.split(id, type.primary, 0);
      return false;
    }
    const previousType = blockType(previous.type);
    const mergeable = previous.type !== RAW_TYPE && previousType?.primary && !previousType.selectOnClick && this.policy.isEditable(previous);

    if (empty) {
      this.commit(
        () => {
          location.list.splice(location.index, 1);
        },
        { selection: mergeable ? this.caretAtEnd(previous) : { blocks: [previous.id], caret: null }, ids: [id] },
      );
      return true;
    }
    if (!mergeable) {
      this.select({ blocks: [previous.id], caret: null });
      return true;
    }
    const into = previousType!.primary!;
    const intoKind = previousType!.fields.find((field) => field.name === into)!.kind;
    const before = String(previous.fields[into] ?? "");
    const join = intoKind === "rich" ? textLength(before) : before.length;
    const appended = before + convertText(value, kind, intoKind);
    const joined = intoKind === "rich" ? normalize(appended) : appended;
    this.commit(
      () => {
        previous.fields[into] = joined;
        location.list.splice(location.index, 1);
      },
      { selection: { blocks: [], caret: { block: previous.id, field: into, start: join, end: join } }, ids: [previous.id, id] },
    );
    return true;
  }

  /** Delete at the end of a block's primary field: the next block joins this one. */
  mergeForward(id: string): boolean {
    const location = this.locate(id);
    if (!location) return false;
    const next = location.list[location.index + 1];
    if (!next) return false;
    const nextType = blockType(next.type);
    if (!nextType?.primary || next.type === RAW_TYPE) {
      this.select({ blocks: [next.id], caret: null });
      return true;
    }
    return this.mergeBackward(next.id);
  }

  /** Every block in document order. */
  allBlocks(): Block[] {
    return flatten(this.model.blocks);
  }
}

/** A deep copy of a block with fresh ids throughout. */
export function reidentified(block: Block): Block {
  const copy = structuredClone(block);
  const visit = (current: Block) => {
    current.id = `b_${Math.random().toString(36).slice(2, 10)}`;
    for (const children of Object.values(current.slots ?? {})) children.forEach(visit);
  };
  visit(copy);
  return copy;
}

/** A text or rich value as another kind: rich into text loses its markup, text into rich is escaped. */
export function convertText(value: FieldValue, from: string, to: string): FieldValue {
  const text = String(value ?? "");
  if (from === to) return text;
  if (from === "rich" && to === "text") return plainText(text);
  if (from === "text" && to === "rich") return escapeHtml(text);
  return text;
}

export type { Fields };
