// history.ts — snapshot stacks + coalescing + reactive flags. Knows nothing
// about models, canvases, or selections: entries are opaque values supplied
// by the caller (the editor passes {model, selection} snapshots). Entry
// arguments are thunks so no snapshot is built when a record coalesces away
// or a travel is a no-op.
//
// canUndo/canRedo live in a PublrJS reactive store so chrome can bind to
// them; the bulk stacks stay plain arrays.
//
// NOTE (packaging, deliberately deferred): the vendored publr.js auto-hydrates
// on import and claims window.Publr — fine for the dev demo, but bundle-vs-
// host runtime coexistence must be settled in the packaging step before the
// editor is embedded in a page running its own PublrJS.

import { reactive } from "./publr-runtime";

export interface HistoryFlags {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
}

export interface HistoryOptions {
  now?: () => number;
  coalesceMs?: number;
  limit?: number;
}

export function createHistory<Entry>({
  now = Date.now,
  coalesceMs = 500,
  limit = 100,
}: HistoryOptions = {}) {
  const flags = reactive<HistoryFlags>({
    canUndo: false,
    canRedo: false,
    undoDepth: 0,
    redoDepth: 0,
  });
  let past: Entry[] = [];
  let future: Entry[] = [];
  let lastKey: string | null = null; // coalescing: key of the last record ("field:<id>:<name>")
  let lastTime = -Infinity;

  function sync() {
    flags.canUndo = past.length > 0;
    flags.canRedo = future.length > 0;
    flags.undoDepth = past.length;
    flags.redoDepth = future.length;
  }

  // Undo and redo are the same move in opposite directions: park the current
  // state on one stack, hand back the top of the other.
  function travel(from: Entry[], to: Entry[], getCurrent: () => Entry): Entry | null {
    if (!from.length) return null;
    lastKey = null; // typing after time travel starts a fresh entry
    to.push(getCurrent());
    const entry = from.pop()!;
    sync();
    return entry;
  }

  return {
    flags, // reactive { canUndo, canRedo, undoDepth, redoDepth }

    // Record the pre-mutation state. A `key` marks the record as coalescable:
    // consecutive records with the same key inside the window extend the
    // previous entry (one undo step per typing run); keyless records always
    // get their own entry. Any record clears the redo stack.
    // Returns true when a new entry was pushed, false when it coalesced.
    record(getEntry: () => Entry, key: string | null = null): boolean {
      const t = now();
      const fresh = !(key && key === lastKey && t - lastTime < coalesceMs);
      if (fresh) {
        past.push(getEntry());
        if (past.length > limit) past.shift();
      }
      lastKey = key;
      lastTime = t;
      future.length = 0;
      sync();
      return fresh;
    },

    undo: (getCurrent: () => Entry) => travel(past, future, getCurrent),
    redo: (getCurrent: () => Entry) => travel(future, past, getCurrent),

    // Discard the newest past entry WITHOUT restoring it — for callers that
    // revert the recorded mutation themselves (canceling a provisional
    // append that never got content). Undo with the redo thrown away: the
    // record is erased as if it never happened.
    drop(): Entry | null {
      const entry = past.pop() ?? null;
      lastKey = null;
      sync();
      return entry;
    },

    reset() {
      past = [];
      future = [];
      lastKey = null;
      sync();
    },
  };
}

export type History<Entry> = ReturnType<typeof createHistory<Entry>>;
