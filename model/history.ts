// Snapshot history. Every commit records the model and selection as they were before
// it; typing in one field coalesces into one entry while it keeps coming within half a
// second, every structural edit is an entry of its own. Making an edit after undoing
// discards what could have been redone.
import type { Model } from "./types";

/** Where the caret is: a field of a block, as character offsets into its text. */
export type Caret = { block: string; field: string; start: number; end: number };

/** What is selected: whole blocks, or a caret (or text range) in one field. */
export type Selection = { blocks: string[]; caret: Caret | null };

export const noSelection = (): Selection => ({ blocks: [], caret: null });

export type Snapshot = { model: Model; selection: Selection };

const COALESCE_MS = 500;
const DEPTH_MAX = 500;

export class History {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private lastKey: string | null = null;
  private lastAt = 0;

  /** Records `before` unless it continues the previous coalescing run. */
  record(before: Snapshot, key: string | null, now: number): boolean {
    const continues = key !== null && key === this.lastKey && now - this.lastAt < COALESCE_MS;
    this.lastKey = key;
    this.lastAt = now;
    this.redoStack = [];
    if (continues) return false;
    this.undoStack.push(clone(before));
    if (this.undoStack.length > DEPTH_MAX) this.undoStack.shift();
    return true;
  }

  /** Ends any coalescing run, so the next edit starts an entry of its own. */
  seal(): void {
    this.lastKey = null;
  }

  undo(current: Snapshot): Snapshot | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(clone(current));
    this.lastKey = null;
    return previous;
  }

  redo(current: Snapshot): Snapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(clone(current));
    this.lastKey = null;
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = null;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get undoDepth() {
    return this.undoStack.length;
  }

  get redoDepth() {
    return this.redoStack.length;
  }
}

export const clone = (snapshot: Snapshot): Snapshot => structuredClone(snapshot);
