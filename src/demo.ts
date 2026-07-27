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
import { registerCoreBlocks } from "./blocks";
import { HOMEPAGE_PATTERNS, registerHomepagePatterns } from "./blocks/homepage-patterns";
import siteCss from "./styles.css?inline";
import "./styles.css";

const {
  createEditorShell,
  DEFAULT_THEME,
  HEARTH_THEME,
  TAILWIND_COMPAT_THEME,
  inlineBackend,
  getPattern,
  PATTERN_ROOT_TYPE,
  probeCssEngine,
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
// A site curates its theme. This one picks a subset of Publr's semantic default
// (values stay 1:1 — picked, not copied). Style controls
// derive their options from THIS document — add a token here (or via a
// fixture's theme fence) and the matching control grows.
const DEMO_PICK = new Set([
  "spacing",
  "spacing-2xs",
  "spacing-xs",
  "spacing-s",
  "spacing-m",
  "spacing-l",
  "spacing-xl",
  "spacing-2xl",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
  "text-6xl",
  "text-7xl",
  "font-sans",
  "font-serif",
  "color-surface",
  "color-foreground",
  "color-accent-surface",
  "color-accent-foreground",
  "color-accent-border",
  "color-muted-surface",
  "color-muted-foreground",
  "color-muted-border",
  "color-border",
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
  "container-content",
  "container-wide",
  "container-gutter",
]);

const DEMO_TEMPLATE_STORAGE_KEY = "publr-editor.demo.templates.v1";
const DEFAULT_DEMO_TEMPLATE =
  '<div data-pb-block="template-part" data-pb-children data-publr-template-part="site-header"><script type="application/json" data-pb-settings>{"name":"site-header"}</script></div>' +
  '<div data-pb-block="template-slot" data-publr-slot="content"><script type="application/json" data-pb-settings>{"name":"content"}</script><span>Content</span></div>' +
  '<div data-pb-block="template-part" data-pb-children data-publr-template-part="site-footer"><script type="application/json" data-pb-settings>{"name":"site-footer"}</script></div>';
const LEGACY_DEMO_TEMPLATE_PARTS: Record<string, string> = {
  "site-header":
    '<div data-pb-block="group" data-pb-tag="tag" data-pb-children class="flex items-center justify-between border-b border-border px-8 py-5"><h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Publr</h2><p data-pb-block="paragraph" data-pb-rich="body">Shared template header</p></div>',
  "site-footer":
    '<div data-pb-block="group" data-pb-tag="tag" data-pb-children class="border-t border-border px-8 py-5"><p data-pb-block="paragraph" data-pb-rich="body">Built with PublrEditor</p></div>',
};
const templatePartPattern = (name: "home-header" | "home-footer"): string => {
  const pattern = HOMEPAGE_PATTERNS.find(([candidate]) => candidate === name)?.[1];
  if (!pattern) throw new Error(`PublrEditor demo: default pattern "${name}" is not registered`);
  return `<div data-pb-block="${PATTERN_ROOT_TYPE}" data-pb-pattern="${name}" data-pb-children>${pattern.content}</div>`;
};
const DEFAULT_DEMO_TEMPLATE_PARTS: Record<string, string> = {
  "site-header": templatePartPattern("home-header"),
  "site-footer": templatePartPattern("home-footer"),
};
type DemoTemplateState = {
  template: string;
  parts: Record<string, string>;
};
function loadDemoTemplateState(): DemoTemplateState {
  try {
    const saved = JSON.parse(
      localStorage.getItem(DEMO_TEMPLATE_STORAGE_KEY) ?? "null",
    ) as Partial<DemoTemplateState> | null;
    const savedParts = saved?.parts && typeof saved.parts === "object" ? { ...saved.parts } : {};
    if (
      savedParts["site-header"] === LEGACY_DEMO_TEMPLATE_PARTS["site-header"] ||
      savedParts["site-header"]?.includes("Shared template header")
    )
      savedParts["site-header"] = DEFAULT_DEMO_TEMPLATE_PARTS["site-header"];
    if (
      savedParts["site-footer"] === LEGACY_DEMO_TEMPLATE_PARTS["site-footer"] ||
      savedParts["site-footer"]?.includes("Built with PublrEditor")
    )
      savedParts["site-footer"] = DEFAULT_DEMO_TEMPLATE_PARTS["site-footer"];
    return {
      template: typeof saved?.template === "string" ? saved.template : DEFAULT_DEMO_TEMPLATE,
      parts: {
        ...DEFAULT_DEMO_TEMPLATE_PARTS,
        ...savedParts,
      },
    };
  } catch {
    return { template: DEFAULT_DEMO_TEMPLATE, parts: { ...DEFAULT_DEMO_TEMPLATE_PARTS } };
  }
}
const demoTemplateState = loadDemoTemplateState();
function persistDemoTemplateState(): void {
  try {
    localStorage.setItem(DEMO_TEMPLATE_STORAGE_KEY, JSON.stringify(demoTemplateState));
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory registry
    // still keeps templates working for the current session.
  }
}
const demoTemplateTheme = () => ({
  templates: [
    {
      name: "default",
      label: "Default page",
      description: "Shared header and footer around the document content.",
      content: demoTemplateState.template,
    },
  ],
  templateParts: Object.entries(demoTemplateState.parts).map(([name, content]) => ({
    name,
    label: name === "site-header" ? "Site header" : "Site footer",
    area: name === "site-header" ? ("header" as const) : ("footer" as const),
    content,
  })),
});
const DEMO_THEME: PublrEditor.Theme = {
  tokens: HEARTH_THEME.tokens
    .filter(
      (token) =>
        DEMO_PICK.has(token.name) ||
        token.name.startsWith("color-brand-") ||
        token.name.startsWith("color-inverse-"),
    )
    .map((token) =>
      token.name === "font-serif"
        ? { ...token, value: "Iowan Old Style, Palatino Linotype, Georgia, serif" }
        : token,
    ),
  semanticColorRoles: HEARTH_THEME.semanticColorRoles?.map((role) => ({ ...role })),
  colorContexts: HEARTH_THEME.colorContexts?.map((context) => ({ ...context })),
  ...demoTemplateTheme(),
};
const DEFAULT_DEMO_THEME: PublrEditor.Theme = {
  ...DEMO_THEME,
  colorContexts: [{ key: "default", label: "Default" }],
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
// The demo theme owns a deliberate pattern vocabulary. Generic starter
// recipes stay available through the library API but do not pollute this
// site's governed pattern collection.
registerHomepagePatterns();

// Fixture fences ride Markdown indentation — normalize it before loading.
const dedent = (html: string): string => {
  const lines = html.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length);
  const cut = Math.min(...indents);
  return lines
    .map((l) => l.slice(cut))
    .join("\n")
    .trim();
};

function patternCompositionHtml(names: readonly string[]): string {
  const documentRoot = document.createElement("div");
  for (const name of names) {
    const pattern = getPattern(name);
    if (!pattern) throw new Error(`PublrEditor demo: fixture pattern "${name}" is not registered`);
    const instance = document.createElement("div");
    instance.setAttribute("data-pb-block", PATTERN_ROOT_TYPE);
    instance.setAttribute("data-pb-pattern", name);
    instance.setAttribute("data-pb-children", "");
    instance.innerHTML = pattern.content;
    documentRoot.appendChild(instance);
  }
  return documentRoot.innerHTML;
}

// --- stand-in host media library ---------------------------------------------
// Exercises the MediaAdapter seam end-to-end in the plain editor, without a
// CMS: upload() keeps
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
    // Simulated latency so the busy states are visible (a real backend
    // upload takes a moment; instant resolution would hide the spinner).
    upload: async (file) => {
      await new Promise((r) => setTimeout(r, 800));
      return { src: URL.createObjectURL(file) };
    },
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
  const fixtureId = params.get("fixture");
  const fixtureMd =
    fixtureId && /^[\w-]+(\/[\w-]+)+$/.test(fixtureId)
      ? fixtureFiles[`../tests/manual/${fixtureId}.md`]
      : undefined;
  const templateWidth =
    typeof fixtureMd === "string" && /^wide:\s*true\s*$/m.test(fixtureMd.split("```")[0])
      ? "full"
      : "content";

  let shell!: PublrEditor.EditorShell;
  shell = await createEditorShell({
    container: document.getElementById("shell-mount")!,
    // Ordinary documents start with one semantic context. The commerce POC
    // is itself a theme fixture and predefines the two additional contexts
    // consumed by its patterns.
    theme: fixtureId === "features/poc-homepage" ? DEMO_THEME : DEFAULT_DEMO_THEME,
    templateWidth,
    styleBackend: INLINE_MODE ? inlineBackend : undefined, // ?inline (E2a)
    // Edit tracing in the console: ?debug in the URL, or `editor.debug = true`.
    debug: params.has("debug"),
    // The plain editor owns a working stand-in library. A real host replaces
    // this one adapter with its own upload()/browse() implementation; keeping
    // it enabled here makes every media surface honest and testable by default.
    media: demoMediaAdapter(),
    // Document metadata is host-owned. The demo keeps it local, while the
    // CMS maps the same callbacks to its title/featured-image fields and
    // page actions.
    document: {
      title: fixtureId ? fixtureId.split("/").at(-1)!.replaceAll("-", " ") : "Hello, PublrEditor",
      onFeaturedImageChange: (image) => console.info("[demo] featured image changed", image),
      template: {
        name: "default",
        onSave: (_name, content) => {
          demoTemplateState.template = content;
          persistDemoTemplateState();
        },
        onSavePart: (name, content) => {
          demoTemplateState.parts[name] = content;
          persistDemoTemplateState();
        },
      },
      actions: {
        view: () => document.querySelector<HTMLButtonElement>("#preview")?.click(),
        rename: (title) => console.info("[demo] document renamed", title),
      },
    },
    baseCss: preflightCss, // the Preview export's reset
    siteCss, // the exact authored-content sheet used inside isolated previews
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
  if (fixtureId && /^[\w-]+(\/[\w-]+)+$/.test(fixtureId)) {
    void (
      fixtureMd !== undefined ? Promise.resolve(fixtureMd) : Promise.reject(new Error("HTTP 404"))
    )
      .then((md) => {
        const fence = md.match(/^```html\r?\n([\s\S]*?)^```/m);
        if (!fence) throw new Error("no ```html fence");
        // Optional ```json fences configure the run: `tokens` replaces the
        // site theme, `patterns` composes registered pattern definitions, and
        // every other object is editor policy. JSON.parse tolerates the
        // formatter's reflow; everything applies before the first render.
        let fixturePatterns: string[] | undefined;
        for (const m of md.matchAll(/^```json\r?\n([\s\S]*?)^```/gm)) {
          try {
            const parsed: unknown = JSON.parse(m[1]);
            if (parsed && typeof parsed === "object" && "tokens" in parsed) {
              // {"tokens": "tailwind"} explicitly enables the compatibility
              // palette for fixtures carrying imported Tailwind templates.
              const t = (parsed as { tokens: Record<string, string> | "default" | "tailwind" })
                .tokens;
              const nextTheme =
                t === "tailwind"
                  ? TAILWIND_COMPAT_THEME
                  : t === "default"
                    ? DEFAULT_THEME
                    : themeFromTokens(t);
              shell.applyTheme({ ...nextTheme, ...demoTemplateTheme() });
            } else if (parsed && typeof parsed === "object" && "patterns" in parsed) {
              const names = (parsed as { patterns: unknown }).patterns;
              if (!Array.isArray(names) || names.some((name) => typeof name !== "string"))
                throw new Error('"patterns" must be an array of registered pattern names');
              fixturePatterns = names;
            } else {
              editor.setPolicy(parsed as PublrEditor.PolicyConfig);
            }
          } catch (e) {
            console.warn("[manual] ignoring invalid json fence:", e);
          }
        }
        editor.loadHtml(
          fixturePatterns ? patternCompositionHtml(fixturePatterns) : dedent(fence[1]),
        );
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
