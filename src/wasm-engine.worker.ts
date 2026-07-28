// The CSS-engine Web Worker. Loads the vendored Publr JIT wasm (freestanding,
// no WASI) and compiles class lists off the main thread — this is what lets the
// static demo style itself with NO server: no /__jit bridge, no backend. The
// worker owns the linear-memory marshaling (alloc → write classes → compile →
// read CSS → free); the main thread just posts classes and gets CSS back.
//
// tsconfig is DOM-only (no WebWorker lib), so the worker global is reached
// through a narrow typed cast rather than DedicatedWorkerGlobalScope.

import wasmUrl from "../vendor/jit/jit_engine.wasm?url";

// The linear-memory ABI exported by jit/src/wasm.zig.
interface JitExports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  free(ptr: number, len: number): void;
  compile(ptr: number, len: number): number;
  compileWithTheme(
    classesPtr: number,
    classesLen: number,
    themePtr: number,
    themeLen: number,
  ): number;
  outLen(): number;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (msg: unknown) => void;
};

// Instantiate once. arrayBuffer (not instantiateStreaming) so a mis-set
// Content-Type on the static host can't break loading. No imports: the module
// is self-contained (std's wasm page allocator uses memory.grow instructions).
const ready: Promise<JitExports> = (async () => {
  const res = await fetch(wasmUrl);
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
  return instance.exports as unknown as JitExports;
})();

function compileClasses(
  ex: JitExports,
  classes: string[],
  theme: { tokens: { name: string; value: string }[] },
): string {
  const input = new TextEncoder().encode(classes.join(" "));
  const themeInput = new TextEncoder().encode(JSON.stringify(theme));
  const inPtr = ex.alloc(input.length);
  if (inPtr === 0) throw new Error("wasm alloc failed");
  const themePtr = ex.alloc(themeInput.length);
  if (themePtr === 0) {
    ex.free(inPtr, input.length);
    throw new Error("wasm theme alloc failed");
  }
  // Re-read .buffer after every wasm call: alloc/compile may grow memory,
  // which detaches any earlier ArrayBuffer view.
  new Uint8Array(ex.memory.buffer, inPtr, input.length).set(input);
  new Uint8Array(ex.memory.buffer, themePtr, themeInput.length).set(themeInput);

  const cssPtr = ex.compileWithTheme(inPtr, input.length, themePtr, themeInput.length);
  const n = ex.outLen();
  let css = "";
  if (cssPtr !== 0 && n !== 0) {
    // Copy out of wasm memory before freeing.
    css = new TextDecoder().decode(new Uint8Array(ex.memory.buffer, cssPtr, n).slice());
    ex.free(cssPtr, n);
  }
  ex.free(themePtr, themeInput.length);
  ex.free(inPtr, input.length);
  if (cssPtr === 0) throw new Error("wasm compile failed");
  return css;
}

interface Req {
  id: number;
  classes: string[];
  theme: { tokens: { name: string; value: string }[] };
}

ctx.onmessage = (e: MessageEvent) => {
  const { id, classes, theme } = e.data as Req;
  ready.then(
    (ex) => {
      try {
        ctx.postMessage({ id, css: compileClasses(ex, classes, theme) });
      } catch (err) {
        ctx.postMessage({ id, error: String(err instanceof Error ? err.message : err) });
      }
    },
    // wasm failed to load — reject every request so the engine probe falls back.
    (err: unknown) =>
      ctx.postMessage({ id, error: String(err instanceof Error ? err.message : err) }),
  );
};
