// Demo shell — a HOST of the library's full harness (src/shell.ts).
//
// Everything the builder UI is — topbar, rails, sidebar, patterns explorer,
// the chrome island — lives in the library now (createEditorShell +
// shell.html); this file only supplies what a real host would: block
// registration, the site theme, a CSS engine, persistence hooks (none here —
// the wire panes are the demo's "persistence"), and content: the #seed
// template or a ?fixture= URL.
//
// Even "core" blocks go through the public registration API — there is no
// privileged path: Publr core, plugins, and the devtools console all call
// registerBlock the same way. A definition is just { label, render }. Try it
// live:
//
//   Publr.Editor.registerBlock("marquee", {
//     label: "Marquee",
//     render: (f) => `<marquee data-pb-block="marquee" data-pb-text="text">${f.text ?? "hi"}</marquee>`,
//   });

import * as PublrEditor from "./index";
import { probeWasmCssEngine } from "./wasm-engine";
import preflightCss from "../vendor/jit/preflight.css?raw";
import { registerCoreBlocks, registerCorePatterns } from "./blocks";
import { registerHomepagePatterns } from "./blocks/homepage-patterns";
import "./styles.css";

const {
  createEditorShell,
  DEFAULT_THEME,
  inlineBackend,
  probeCssEngine,
  setActiveTheme,
  themeFromTokens,
} = PublrEditor;

// Fixtures the ?fixture= URL can seed the shell from, inlined at build time
// (same glob the manual harness uses — src/manual.ts). A build-time import is
// the point: fetching /tests/manual/<id>.md raw only works under `vp dev` and
// 404s on the deployed static demo, where tests/ is not shipped.
const fixtureFiles = import.meta.glob("../tests/manual/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

// --- the demo SITE THEME (E1) -----------------------------------------------
//
// A site curates its theme; the full Tailwind default is what you start FROM.
// This one picks a subset of the default (values stay 1:1 — picked, not
// copied) plus one custom token, `color-brand`, which is also declared in
// styles.css's @theme so the demo's build-time Tailwind resolves the brand
// utilities (the wasm engine takes over that job in E3). Style controls
// derive their options from THIS document — add a token here (or via a
// fixture's theme fence) and the matching control grows.
const DEMO_PICK = new Set([
  "spacing",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "color-white",
  "color-neutral-100",
  "color-neutral-500",
  "color-neutral-900",
  "color-amber-300",
  "radius-sm",
  "radius-md",
  "radius-lg",
  "radius-xl",
  "leading-tight",
  "leading-normal",
  "leading-relaxed",
  "tracking-tight",
  "tracking-normal",
  "tracking-wide",
]);
const DEMO_THEME: PublrEditor.Theme = {
  tokens: [
    ...DEFAULT_THEME.tokens.filter((t) => DEMO_PICK.has(t.name)),
    { name: "color-brand", value: "#3858e9" },
  ],
};

// --- style backend switch (E2a) ----------------------------------------------
//
// ?inline runs the demo on the INLINE backend: lens writes go to the style
// attribute as var(--token) declarations, and the theme's :root variables are
// injected below — zero Tailwind involved (pasted utility classes stay
// opaque, exactly the documented boundary).
const INLINE_MODE = new URLSearchParams(location.search).has("inline");
const inlineThemeTag = document.createElement("style");
inlineThemeTag.id = "pbe-inline-theme";

function refreshInlineThemeCss(): void {
  if (INLINE_MODE) inlineThemeTag.textContent = inlineBackend.css?.() ?? "";
}

// Core blocks live in src/blocks/ — one file per block, registered through
// the same public API a plugin would use. Patterns register second: their
// fragments validate against the block registry.
registerCoreBlocks();
registerCorePatterns();
// The Tailwind Plus homepage, sliced into per-section patterns (demo showcase
// of Phase B patterns over real content — see poc-homepage fixture).
registerHomepagePatterns();

// The seed template rides index.html's own indentation — dedent so raw-html
// passthroughs don't carry the page's formatting onto the wire.
const dedent = (html: string): string => {
  const lines = html.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length);
  const cut = Math.min(...indents);
  return lines
    .map((l) => l.slice(cut))
    .join("\n")
    .trim();
};

// --- ?media-adapter: a stand-in host media library ---------------------------
// Exercises the MediaAdapter seam end-to-end without a CMS: upload() keeps
// the file as an object URL (no service worker involved — the point is the
// adapter path, not persistence), browse() opens a minimal picker overlay
// with a few generated samples. Also the /verify harness's e2e hook.
function demoMediaAdapter(): PublrEditor.MediaAdapter {
  const sample = (label: string, fill: string, w: number, h: number) => ({
    src: `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/><text x="50%" y="50%" fill="#fff" font-size="24" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`,
    )}`,
    alt: label,
    width: w,
    height: h,
  });
  const samples = [
    sample("Meadow", "#3f6212", 800, 500),
    sample("Harbor", "#1e3a8a", 800, 500),
    sample("Dune", "#b45309", 640, 800),
  ];
  return {
    upload: async (file) => ({ src: URL.createObjectURL(file) }),
    browse: (current) =>
      new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6";
        const done = (value: PublrEditor.MediaValue | null) => {
          overlay.remove();
          resolve(value);
        };
        const panel = document.createElement("div");
        panel.className = "max-w-xl rounded-xl bg-white p-4 shadow-2xl";
        panel.innerHTML = `<p class="m-0 mb-3 font-semibold text-neutral-900">Demo media library</p>`;
        const grid = document.createElement("div");
        grid.className = "mb-3 flex gap-2";
        for (const s of samples) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `cursor-pointer rounded-lg border-2 p-1 ${
            current?.src === s.src
              ? "border-blue-600"
              : "border-transparent hover:border-neutral-300"
          }`;
          btn.innerHTML = `<img src="${s.src}" alt="${s.alt}" class="h-24 w-36 rounded-md object-cover">`;
          btn.addEventListener("click", () => done(s));
          grid.appendChild(btn);
        }
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className =
          "cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => done(null));
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) done(null);
        });
        panel.append(grid, cancel);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
      }),
  };
}

// Async IIFE, deliberately not top-level await: createEditorShell waits for
// PublrJS's DOMContentLoaded auto-hydrate pass, and a module blocking on TLA
// would keep DOMContentLoaded from ever firing — a deadlock.
void (async () => {
  const params = new URLSearchParams(location.search);

  const shell = await createEditorShell({
    container: document.getElementById("shell-mount")!,
    theme: DEMO_THEME, // the demo SITE's curated theme (fixtures may override)
    styleBackend: INLINE_MODE ? inlineBackend : undefined, // ?inline (E2a)
    // Edit tracing in the console: ?debug in the URL, or `editor.debug = true`.
    debug: params.has("debug"),
    wide: params.has("wide"),
    // ?media-adapter: run the media surfaces through a stand-in host library.
    media: params.has("media-adapter") ? demoMediaAdapter() : undefined,
    baseCss: preflightCss, // the Preview export's reset
    engineLabel: INLINE_MODE ? "inline backend — no engine needed" : undefined,
    onThemeCss: refreshInlineThemeCss, // design-tab edits refresh the :root vars
  });
  const editor = shell.editor;

  // E3 boot: inline mode needs no engine at all — the theme's :root vars
  // suffice. Otherwise prefer the self-contained wasm engine (JIT-in-a-
  // Worker): it compiles the live class universe with NO backend, so the
  // canvas styles itself on a static deploy too. Fall back to the dev /__jit
  // bridge only if the wasm can't load, then to build-time CSS.
  if (INLINE_MODE) {
    document.head.appendChild(inlineThemeTag);
    refreshInlineThemeCss();
  } else {
    void probeWasmCssEngine()
      .then((wasm) =>
        wasm
          ? { engine: wasm, label: "live (wasm engine)" }
          : probeCssEngine("/__jit").then((bridge) => ({
              engine: bridge,
              label: bridge ? "live (dev jit bridge)" : "none — build-time CSS only",
            })),
      )
      .then(({ engine, label }) => shell.setCssEngine(engine, label));
  }

  // ?fixture=<group>/<name> (the manual-test harness, manual.html) seeds
  // the shell from tests/manual/<id>.md's ```html fence instead — the md
  // is inlined at build time (fixtureFiles), so a fixture URL is directly
  // shareable and works on the deployed static demo, not just `vp dev`.
  const fixtureId = params.get("fixture");
  if (fixtureId && /^[\w-]+(\/[\w-]+)+$/.test(fixtureId)) {
    const fixtureMd = fixtureFiles[`../tests/manual/${fixtureId}.md`];
    void (
      fixtureMd !== undefined ? Promise.resolve(fixtureMd) : Promise.reject(new Error("HTTP 404"))
    )
      .then((md) => {
        const fence = md.match(/^```html\r?\n([\s\S]*?)^```/m);
        if (!fence) throw new Error("no ```html fence");
        // `wide: true` in the fixture frontmatter → full-bleed canvas
        // (page-scale fixtures), without needing the ?wide URL param.
        if (/^wide:\s*true\s*$/m.test(md.split("```")[0])) shell.setWide();
        // Optional ```json fences configure the run: one with a `tokens`
        // key is the SITE THEME (E1 — replaces the demo theme so a fixture
        // can grow/shrink the control scales); any other is the editor
        // POLICY — applied as config, never read off the fixture HTML
        // (thoughts/010). JSON.parse tolerates the formatter's reflow;
        // applied before load so the first render already carries both.
        for (const m of md.matchAll(/^```json\r?\n([\s\S]*?)^```/gm)) {
          try {
            const parsed: unknown = JSON.parse(m[1]);
            if (parsed && typeof parsed === "object" && "tokens" in parsed) {
              // {"tokens": "default"} = the full vendored Tailwind default
              // (fixtures carrying real-world templates need the whole
              // palette, not the demo's curated subset).
              const t = (parsed as { tokens: Record<string, string> | "default" }).tokens;
              setActiveTheme(t === "default" ? DEFAULT_THEME : themeFromTokens(t));
              refreshInlineThemeCss();
              shell.syncDesignPanel();
            } else {
              editor.setPolicy(parsed as PublrEditor.PolicyConfig);
            }
          } catch (e) {
            console.warn("[manual] ignoring invalid json fence:", e);
          }
        }
        editor.loadHtml(dedent(fence[1]));
        // Compile the loaded content NOW (belt-and-suspenders vs the
        // probe/load race): if the engine is already up, style it
        // immediately instead of waiting for the next edit.
        shell.refreshCss();
      })
      .catch((err: unknown) => {
        editor.loadHtml(
          `<p data-pb-block="paragraph" data-pb-rich="body">Fixture <code>${fixtureId}</code> failed to load: ${String(err instanceof Error ? err.message : err)}</p>`,
        );
      });
  } else {
    editor.loadHtml(dedent(document.getElementById("seed")!.innerHTML));
    shell.refreshCss();
  }
})();
