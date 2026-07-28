// The document persistence seam: resolvePersistenceAdapter's tri-state
// option, the browser store, and the shell wiring — load-on-boot beats the
// `content` seed, autosave is debounced and armed only after boot, destroy
// flushes the pending write, and a `persistence: true` shell round-trips a
// document across a full destroy/re-create.

import { afterEach, describe, expect, test, vi } from "vitest";
import { createEditorShell, type EditorShellOptions } from "../src/shell";
import {
  BROWSER_PERSISTENCE_KEY,
  browserPersistence,
  resolvePersistenceAdapter,
} from "../src/persistence-adapter";
import { registerCoreBlocks } from "../src/blocks";
import { getBlockType } from "../src/registry";
import { DEFAULT_THEME } from "../src/theme";

if (!getBlockType("paragraph")) registerCoreBlocks();

const SEED = '<p data-pb-block="paragraph" data-pb-rich="body">seed</p>';
const STORED = '<p data-pb-block="paragraph" data-pb-rich="body">stored</p>';
const EDITED = '<p data-pb-block="paragraph" data-pb-rich="body">edited</p>';
const TEST_KEY = "publr-editor.test.document.v1";

let host!: HTMLElement;
let destroyShell: (() => void) | undefined;

const bootShell = (options: Partial<EditorShellOptions>) =>
  createEditorShell({
    container: host,
    content: SEED,
    media: false,
    theme: DEFAULT_THEME,
    ...options,
  });

afterEach(() => {
  destroyShell?.();
  destroyShell = undefined;
  host?.remove();
  localStorage.removeItem(TEST_KEY);
  localStorage.removeItem(BROWSER_PERSISTENCE_KEY);
});

describe("resolvePersistenceAdapter", () => {
  test("false and undefined resolve inert; partial adapters keep missing members null", async () => {
    for (const option of [false, undefined] as const) {
      const resolved = resolvePersistenceAdapter(option);
      expect(resolved.load).toBeNull();
      expect(resolved.save).toBeNull();
      expect(resolved.clear).toBeNull();
    }
    const saveOnly = resolvePersistenceAdapter({ save: () => {} });
    expect(saveOnly.load).toBeNull();
    expect(saveOnly.save).not.toBeNull();
    expect(saveOnly.clear).toBeNull();
    // A load() yielding undefined normalizes to null (the "nothing stored" signal).
    const loadOnly = resolvePersistenceAdapter({ load: () => undefined });
    await expect(loadOnly.load!()).resolves.toBeNull();
  });

  test("the browser store round-trips through localStorage under its key", async () => {
    const store = resolvePersistenceAdapter(browserPersistence({ key: TEST_KEY }));
    await expect(store.load!()).resolves.toBeNull();
    await store.save!(STORED);
    expect(localStorage.getItem(TEST_KEY)).toBe(STORED);
    await expect(store.load!()).resolves.toBe(STORED);
    await store.clear!();
    await expect(store.load!()).resolves.toBeNull();
  });
});

describe("shell persistence wiring", () => {
  test("stored content wins over the content seed; boot alone never saves", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const save = vi.fn();
    const shell = await bootShell({ persistence: { load: () => STORED, save } });
    destroyShell = shell.destroy;

    expect(shell.editor.serialize()).toContain("stored");
    expect(shell.editor.serialize()).not.toContain("seed");
    // The boot load's onChange fires before autosave arms — a host backend
    // must not receive a spurious write of the content it just served.
    await new Promise((r) => setTimeout(r, 600));
    expect(save).not.toHaveBeenCalled();
  });

  test("an empty store falls back to the content seed; a failing load() does too", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await bootShell({ persistence: { load: () => null } });
    expect(shell.editor.serialize()).toContain("seed");
    shell.destroy();

    const failing = await bootShell({
      persistence: {
        load: () => {
          throw new Error("backend down");
        },
      },
    });
    destroyShell = failing.destroy;
    expect(failing.editor.serialize()).toContain("seed");
  });

  test("edits autosave debounced with the editor wire pipeline", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const save = vi.fn();
    const shell = await bootShell({ persistence: { save } });
    destroyShell = shell.destroy;

    shell.editor.loadHtml(EDITED);
    await vi.waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 3000 });
    expect(save).toHaveBeenCalledTimes(1);
    const [html] = save.mock.calls[0] as [string];
    expect(html).toContain("edited");
    expect(html).toContain('data-pb-block="paragraph"'); // editor pipeline, round-trippable
  });

  test("destroy flushes a pending debounced save", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const save = vi.fn();
    const shell = await bootShell({ persistence: { save } });

    shell.editor.loadHtml(EDITED);
    await Promise.resolve(); // let the deferred notify schedule the save
    shell.destroy(); // well inside the debounce window
    expect(save).toHaveBeenCalledTimes(1);
    expect((save.mock.calls[0] as [string])[0]).toContain("edited");
  });

  test("a rejecting save() is contained and later saves still go through", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const save = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("quota");
    });
    const shell = await bootShell({ persistence: { save } });
    destroyShell = shell.destroy;

    shell.editor.loadHtml(EDITED);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "[publr-editor] persistence save failed",
        expect.anything(),
      ),
    );
    shell.editor.loadHtml(STORED);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2), { timeout: 3000 });
    warn.mockRestore();
  });

  test("persistence: true survives a full shell destroy/re-create (the demo story)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const first = await bootShell({ persistence: true });
    expect(first.editor.serialize()).toContain("seed");
    first.editor.loadHtml(EDITED);
    await Promise.resolve(); // let the deferred notify schedule the save
    first.destroy(); // flush → localStorage
    host.remove();

    host = document.createElement("div");
    document.body.appendChild(host);
    const second = await bootShell({ persistence: true });
    destroyShell = second.destroy;
    expect(second.editor.serialize()).toContain("edited");
    expect(second.editor.serialize()).not.toContain("seed");
  });
});
