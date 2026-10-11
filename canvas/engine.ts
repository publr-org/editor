// Classes to CSS in the browser with the jit engine (wasm), one instance per page. The
// canvas frame is compiled against the site's theme, into the frame only, so the site's
// CSS never meets the editor's. Standalone pages also compile their own chrome with it;
// in the admin the chrome's classes are in the admin's build-time stylesheet.

export type ThemeToken = { name: string; value: string };

interface Exports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  free(ptr: number, len: number): void;
  compileWithTheme(classes: number, classesLen: number, theme: number, themeLen: number): number;
  resolveClassesWithTheme(classes: number, classesLen: number, theme: number, themeLen: number): number;
  outLen(): number;
}

type Call = "compileWithTheme" | "resolveClassesWithTheme";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let loading: Promise<Exports> | null = null;
let engine: Exports | null = null;

export function loadEngine(url: string): Promise<Exports> {
  loading ??= fetch(url)
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      engine = result.instance.exports as unknown as Exports;
      return engine;
    });
  return loading;
}

export const engineReady = () => engine !== null;

export function compile(fn: Call, classes: string, theme: Uint8Array): string {
  const ex = engine;
  if (!ex) return fn === "compileWithTheme" ? "" : "[]";
  const input = encoder.encode(classes);
  const inPtr = ex.alloc(Math.max(1, input.length));
  const themePtr = ex.alloc(theme.length);
  if (!inPtr || !themePtr) throw new Error("jit: allocation failed");
  try {
    new Uint8Array(ex.memory.buffer, inPtr, input.length).set(input);
    new Uint8Array(ex.memory.buffer, themePtr, theme.length).set(theme);
    const out = ex[fn](inPtr, input.length, themePtr, theme.length);
    const len = ex.outLen();
    if (!out) throw new Error(`jit: ${fn} failed`);
    try {
      return decoder.decode(new Uint8Array(ex.memory.buffer, out, len));
    } finally {
      ex.free(out, len);
    }
  } finally {
    ex.free(themePtr, theme.length);
    ex.free(inPtr, Math.max(1, input.length));
  }
}

export const encodeTheme = (tokens: readonly ThemeToken[]) => encoder.encode(JSON.stringify({ tokens }));

/** Keeps one document's compiled sheet equal to the classes its elements name. */
export class Watcher {
  private seen = new Set<string>();
  private dirty = false;
  private scheduled = false;
  private sheet: HTMLStyleElement | null = null;
  private observer: MutationObserver;
  private theme: Uint8Array;
  private doc: Document;
  /** Every utility the sheet carries, for "not in your theme" checks. */
  compiled = "";

  constructor(doc: Document, tokens: readonly ThemeToken[]) {
    this.doc = doc;
    this.theme = encodeTheme(tokens);
    const view = doc.defaultView ?? window;
    this.observer = new view.MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") this.collect(record.target);
        for (const node of record.addedNodes) this.collect(node);
      }
      if (this.dirty) this.schedule();
    });
    this.collect(doc);
    this.recompile();
    this.observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  }

  setTheme(tokens: readonly ThemeToken[]): void {
    this.theme = encodeTheme(tokens);
    this.dirty = true;
    this.recompile();
  }

  /** Classes to compile though no element names them yet. */
  add(classes: readonly string[]): void {
    for (const name of classes) {
      if (!this.seen.has(name)) {
        this.seen.add(name);
        this.dirty = true;
      }
    }
    if (this.dirty) this.schedule();
  }

  private collect(root: Node): void {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    const visit = (element: Element) => {
      for (const name of element.classList) {
        if (!this.seen.has(name)) {
          this.seen.add(name);
          this.dirty = true;
        }
      }
    };
    if (root.nodeType === 1) visit(root as Element);
    for (const element of (root as ParentNode).querySelectorAll("[class]")) visit(element);
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    (this.doc.defaultView ?? window).requestAnimationFrame(() => this.recompile());
  }

  recompile(): void {
    this.scheduled = false;
    if (!this.dirty || !engine) return;
    this.dirty = false;
    this.sheet ??= this.doc.head.appendChild(this.doc.createElement("style"));
    this.sheet.setAttribute("data-canvas-engine", "");
    this.compiled = compile("compileWithTheme", [...this.seen].join(" "), this.theme);
    this.sheet.textContent = this.compiled;
  }

  /** Whether the engine produced a rule for `name` under the current theme. */
  resolves(name: string): boolean {
    if (!engine) return true;
    const view = (this.doc.defaultView ?? window) as Window & { CSS: { escape(value: string): string } };
    return compile("compileWithTheme", name, this.theme).includes(`.${view.CSS.escape(name)}`);
  }

  disconnect(): void {
    this.observer.disconnect();
  }
}
