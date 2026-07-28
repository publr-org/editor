// wasmCssEngine — the browser-native CSS engine. Same CssEngine contract as
// httpCssEngine (css-engine.ts), but instead of POSTing to the dev /__jit
// bridge it drives the vendored Publr JIT compiled to wasm, running in a Web
// Worker. That makes it a drop-in for the demo boot that ALSO works on a static
// deploy (Vercel) with no backend — the whole point of shipping the JIT to the
// browser. Lives demo-side (not in the library's css-engine.ts) so the 310K
// wasm + worker never weigh down the embeddable library build; hosts that want
// a batteries-included browser engine can promote it later.

import type { CssEngine, CssEngineResult } from "./css-engine";
import { unresolvedUtilities } from "./style";
import { activeTheme } from "./theme";

interface Reply {
  id: number;
  css?: string;
  error?: string;
}

/** A CssEngine backed by the JIT wasm in a Web Worker. */
export function wasmCssEngine(): CssEngine {
  const worker = new Worker(new URL("./wasm-engine.worker.ts", import.meta.url), {
    type: "module",
  });
  let nextId = 1;
  const pending = new Map<number, { resolve: (css: string) => void; reject: (e: Error) => void }>();

  worker.onmessage = (e: MessageEvent) => {
    const { id, css, error } = e.data as Reply;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error !== undefined) p.reject(new Error(error));
    else p.resolve(css ?? "");
  };

  return {
    compile(classes, theme = activeTheme()): Promise<CssEngineResult> {
      const css = new Promise<string>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, classes: [...classes], theme: { tokens: theme.tokens } });
      });
      // Diagnostics come from the editor-side shape detector, exactly as
      // httpCssEngine does (the jit doesn't report its drop list yet — #432).
      return css.then((text) => ({
        css: text,
        unresolved: unresolvedUtilities(classes, theme).map((u) => u.cls),
      }));
    },
  };
}

/** Build the wasm engine and confirm it compiles; null if the wasm can't load
 * (→ boot falls back to the dev /__jit bridge, then to build-time CSS). */
export async function probeWasmCssEngine(): Promise<CssEngine | null> {
  try {
    const engine = wasmCssEngine();
    await engine.compile(["p-1"]);
    return engine;
  } catch {
    return null;
  }
}
