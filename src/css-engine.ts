// css-engine.ts — the CSS ENGINE seam (E3, css-engine thoughts). The engine is
// a PURE FUNCTION over the two data artifacts: compile(classes, theme) → CSS +
// diagnostics. The editor never generates CSS itself — it names classes; the
// engine (a Tailwind-compatible compiler: the Publr JIT natively in the CMS,
// jit_wasm.wasm in the browser, an HTTP bridge in dev, or anyone's own
// implementation) turns them into a stylesheet the host injects.
//
// No engine is a legitimate mode: the classes backend then relies on
// build-time CSS (the demo safelist) and the inline backend needs no CSS
// generation at all. Chrome should capability-gate on the engine's presence,
// never half-work.

import { unresolvedUtilities } from "./style";
import { activeTheme } from "./theme";
import type { Theme } from "./theme";

export interface CssEngineResult {
  css: string;
  /** Classes the compile dropped (unknown token/utility) — feeds the
   * unresolved chips + Define… loop. */
  unresolved: string[];
}

export interface CssEngine {
  /** classes + theme → stylesheet. The ONLY required capability. */
  compile(classes: readonly string[], theme?: Theme): Promise<CssEngineResult>;
  /**
   * FUTURE (E5): arbitrary CSS in → equivalent utility classes out. CSS→class
   * translation is Tailwind domain knowledge, so it lives here; once classes
   * exist the lenses already read them — the editor needs no new code.
   */
  classesFromCss?(css: string): Promise<string[]>;
}

/** Every class attribute in a serialized fragment — the compile input. */
export function collectClasses(html: string): string[] {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const out = new Set<string>();
  for (const el of tmp.querySelectorAll("[class]")) {
    for (const cls of el.getAttribute("class")?.split(/\s+/) ?? []) {
      if (cls) out.add(cls);
    }
  }
  return [...out];
}

/**
 * An engine speaking the POC transport: POST classes plus the portable theme,
 * get text/css back (dev: the Vite JIT bridge at /__jit). Breakpoint tokens
 * must reach the compiler because CSS forbids var() inside media conditions.
 *
 * Diagnostics remain editor-derived until the engine reports its own drop list.
 */
export function httpCssEngine(endpoint: string): CssEngine {
  return {
    async compile(classes, theme = activeTheme()) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classes, tokens: theme.tokens }),
      });
      if (!res.ok) throw new Error(`css engine: HTTP ${res.status} ${await res.text()}`);
      const css = await res.text();
      return { css, unresolved: unresolvedUtilities(classes, theme).map((u) => u.cls) };
    },
  };
}

/** Probe an endpoint once; null when no engine answers (capability gating). */
export async function probeCssEngine(endpoint: string): Promise<CssEngine | null> {
  try {
    const engine = httpCssEngine(endpoint);
    await engine.compile(["p-1"]);
    return engine;
  } catch {
    return null;
  }
}
