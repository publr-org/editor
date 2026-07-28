// persistence-adapter.ts — the host seam for document persistence. The shell
// funnels load-on-boot and autosave through ONE resolved adapter, so a host
// swaps the whole persistence story with a single `persistence` option:
//
//   persistence: false | undefined  none (the default). The host seeds via
//                                   `content` and persists via onChange — a
//                                   CMS with its own save pipeline keeps
//                                   today's contract untouched.
//   persistence: true               the built-in browser store (localStorage,
//                                   see browserPersistence below) — the demo
//                                   runs CMS-free on this.
//   persistence: PersistenceAdapter the host's own load()/save() — a CMS
//                                   points these at its content API and the
//                                   shell drives load-on-boot + debounced
//                                   autosave for it.
//
// Unlike `media` (default on), `persistence` defaults OFF: silently loading
// stale local content would surprise every host that owns `content`.
//
// What is stored is the EDITOR wire pipeline (`editor.serialize()`), the
// round-trippable annotated-HTML form — never the published "data" pipeline.
// The shell never saves while isolation is open (serialize() would yield the
// isolated fragment, not the page document — see EditorShell.isIsolated).

/**
 * A host's document persistence. All members are optional: a save-only host
 * keeps seeding through `content`; a load-only host is read-only.
 */
export interface PersistenceAdapter {
  /** Yield the stored wire HTML; null/undefined = nothing stored (the shell
   * then falls back to `EditorShellOptions.content`, the first-run seed). */
  load?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Persist the wire HTML. Debouncing is the shell's job — this is called
   * once per settled burst of edits, plus a final flush on pagehide/destroy.
   * NOTE: the pagehide flush cannot await; hosts needing delivery guarantees
   * on unload should send via navigator.sendBeacon here. */
  save?: (html: string) => void | Promise<void>;
  /** Discard the stored document (host reset flows). */
  clear?: () => void | Promise<void>;
}

/**
 * The internal, always-resolved form the shell consumes. Not part of the
 * public API (index.ts exports only PersistenceAdapter/browserPersistence).
 */
export interface ResolvedPersistenceAdapter {
  load: (() => Promise<string | null>) | null;
  save: ((html: string) => Promise<void>) | null;
  clear: (() => Promise<void>) | null;
}

export const BROWSER_PERSISTENCE_KEY = "publr-editor.document.v1";

/**
 * The built-in browser store: one localStorage entry holding the wire HTML.
 * localStorage over OPFS/IndexedDB deliberately: the document is a single
 * modest HTML string (media blobs already live in the OPFS media store and
 * enter the document only as `/media/*` URLs), writes are synchronous — so
 * the pagehide flush actually lands — and it works everywhere, including
 * non-secure contexts where OPFS is unavailable. Storage failures (privacy
 * modes, quota) degrade to session-only editing instead of throwing.
 */
export function browserPersistence(opts: { key?: string } = {}): PersistenceAdapter {
  const key = opts.key ?? BROWSER_PERSISTENCE_KEY;
  return {
    load: () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    save: (html) => {
      try {
        localStorage.setItem(key, html);
      } catch {
        // Privacy mode / quota — the in-memory document keeps working.
      }
    },
    clear: () => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Nothing stored anywhere that can fail to clear meaningfully.
      }
    },
  };
}

/** Resolve the public `persistence` option (see the header table). */
export function resolvePersistenceAdapter(
  option: boolean | PersistenceAdapter | undefined,
): ResolvedPersistenceAdapter {
  if (option === false || option === undefined) return { load: null, save: null, clear: null };
  const adapter = option === true ? browserPersistence() : option;
  return {
    load: adapter.load ? async () => (await adapter.load!()) ?? null : null,
    save: adapter.save
      ? async (html) => {
          await adapter.save!(html);
        }
      : null,
    clear: adapter.clear
      ? async () => {
          await adapter.clear!();
        }
      : null,
  };
}
