// style-backend.ts — the STYLE BACKEND seam (E2a, css-engine thoughts). A lens
// deals in semantic facts ("this block's fontSize is lg"); the backend decides
// the CARRIER that materializes the fact in the wire format:
//
//   classes backend (default) — utility classes in the class attr. CSS comes
//     from a Tailwind-compatible engine (E3) or a build-time stand-in; pasted
//     Tailwind templates are fully understood and edited in place.
//   inline backend — CSS declarations in the root's style attribute, values
//     as var(--token) references + a :root block from the theme document
//     (css()). Zero tooling: the carrier IS the CSS, publish needs nothing,
//     theme edits stay live. Pasted Tailwind classes stay opaque authored —
//     understanding Tailwind is the engine's job, and this backend has none.
//
// Both carriers may coexist on one element (pasted classes + inline styles):
// the CSS cascade arbitrates (inline beats utilities) — no invented
// precedence. Within its own carrier a backend REPLACES, never accumulates.
//
// `scope` anticipates component-scope writes (a rule targeting
// [data-block="x"] styling every instance of a reusable block) — only
// "element" exists until Components land.

import { classList } from "./carriers";
import type { Block } from "./carriers";
import { patchStyleClasses, readStyleClass } from "./style";
import type { StyleBreakpoint } from "./style";
import { activeTheme, hasToken } from "./theme";
import type { Theme } from "./theme";

/** The write target. Only element scope exists pre-Components. */
export type StyleScope = "element";

export interface StyleBackend {
  /** Human name — chrome may surface which carrier is active. */
  readonly name: string;
  /** Read a prop's current value off the block's carrier. */
  read(block: Block, prop: string, theme?: Theme, breakpoint?: StyleBreakpoint): string | undefined;
  /** Write prop=value onto the block's carrier ("" clears). Mutates the block
   * (callers wrap in the editor's commit choke point). */
  write(
    block: Block,
    prop: string,
    value: string,
    scope?: StyleScope,
    theme?: Theme,
    breakpoint?: StyleBreakpoint,
  ): void;
  /** Support CSS the host must put on the page for carried values to resolve
   * (inline backend: the theme's :root variables). Absent = none needed. */
  css?(theme?: Theme): string;
}

// --- classes backend ---------------------------------------------------------

/** The default backend: lenses over the block's class list. */
export const classesBackend: StyleBackend = {
  name: "classes",
  read: (block, prop, theme = activeTheme(), breakpoint = "base") =>
    readStyleClass(prop, classList(block.classes), theme, breakpoint),
  write(block, prop, value, _scope, theme = activeTheme(), breakpoint = "base") {
    // Always assign (possibly "") — upcast materializes `classes` on every
    // typed block, and the round-trip law compares presence too.
    block.classes = patchStyleClasses(
      prop,
      value,
      classList(block.classes),
      theme,
      breakpoint,
    ).join(" ");
  },
};

// --- inline backend ------------------------------------------------------------

// prop ↔ CSS declaration. `to` renders a value (token → var(--token-name),
// step → calc, keyword → keyword, raw → raw); `from` inverts it.
interface DeclSpec {
  property: string;
  to: (value: string, theme: Theme) => string;
  from: (css: string, theme: Theme) => string | undefined;
}

const varRef = (ns: string) => ({
  to: (v: string, theme: Theme) => (hasToken(theme, `${ns}-${v}`) ? `var(--${ns}-${v})` : v),
  from: (css: string) => {
    const m = new RegExp(`^var\\(--${ns}-(.+)\\)$`).exec(css.trim());
    return m ? m[1] : css.trim() || undefined;
  },
});

const spacing = {
  to: (v: string, theme: Theme) =>
    hasToken(theme, `spacing-${v}`)
      ? `var(--spacing-${v})`
      : /^\d+(\.\d+)?$/.test(v) && hasToken(theme, "spacing")
        ? `calc(var(--spacing) * ${v})`
        : /^\d+(\.\d+)?$/.test(v)
          ? `calc(0.25rem * ${v})`
          : v,
  from: (css: string, theme: Theme) => {
    const token = /^var\(--spacing-(.+)\)$/.exec(css.trim());
    if (token && hasToken(theme, `spacing-${token[1]}`)) return token[1];
    const m = /^calc\((?:var\(--spacing\)|0\.25rem) \* (\d+(?:\.\d+)?)\)$/.exec(css.trim());
    return m ? m[1] : css.trim() || undefined;
  },
};

const keyword = (map: Record<string, string>) => {
  const inverse = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
  return {
    to: (v: string) => map[v] ?? v,
    from: (css: string) => inverse[css.trim()],
  };
};

const length = {
  to: (value: string) => (/^\d+(\.\d+)?$/.test(value) ? `${value}px` : value),
  from: (css: string) => {
    const match = /^(\d+(?:\.\d+)?)px$/.exec(css.trim());
    return match ? match[1] : css.trim() || undefined;
  },
};

const DECLS: Record<string, DeclSpec> = {
  fontSize: { property: "font-size", ...varRef("text") },
  textAlign: {
    property: "text-align",
    ...keyword({ left: "left", center: "center", right: "right", justify: "justify" }),
  },
  fontWeight: {
    property: "font-weight",
    ...keyword({ normal: "400", medium: "500", semibold: "600", bold: "700" }),
  },
  fontStyle: { property: "font-style", ...keyword({ normal: "normal", italic: "italic" }) },
  textColor: { property: "color", ...varRef("color") },
  backgroundColor: { property: "background-color", ...varRef("color") },
  padding: { property: "padding", ...spacing },
  paddingInline: { property: "padding-inline", ...spacing },
  paddingBlock: { property: "padding-block", ...spacing },
  paddingTop: { property: "padding-top", ...spacing },
  paddingRight: { property: "padding-right", ...spacing },
  paddingBottom: { property: "padding-bottom", ...spacing },
  paddingLeft: { property: "padding-left", ...spacing },
  margin: { property: "margin", ...spacing },
  marginTop: { property: "margin-top", ...spacing },
  marginRight: { property: "margin-right", ...spacing },
  marginBottom: { property: "margin-bottom", ...spacing },
  marginLeft: { property: "margin-left", ...spacing },
  width: { property: "width", ...spacing },
  height: { property: "height", ...spacing },
  minHeight: { property: "min-height", ...spacing },
  minWidth: { property: "min-width", ...spacing },
  flexBasis: { property: "flex-basis", ...spacing },
  aspectRatio: {
    property: "aspect-ratio",
    ...keyword({ auto: "auto", square: "1 / 1", video: "16 / 9" }),
  },
  gap: { property: "gap", ...spacing },
  rowGap: { property: "row-gap", ...spacing },
  columnGap: { property: "column-gap", ...spacing },
  justifyContent: {
    property: "justify-content",
    ...keyword({
      start: "flex-start",
      center: "center",
      end: "flex-end",
      between: "space-between",
      around: "space-around",
      evenly: "space-evenly",
    }),
  },
  alignItems: {
    property: "align-items",
    ...keyword({
      start: "flex-start",
      center: "center",
      end: "flex-end",
      stretch: "stretch",
      baseline: "baseline",
    }),
  },
  flexWrap: {
    property: "flex-wrap",
    ...keyword({ nowrap: "nowrap", wrap: "wrap", reverse: "wrap-reverse" }),
  },
  gridColumns: {
    property: "grid-template-columns",
    to: (value) => (/^(?:[1-9]|1[0-2])$/.test(value) ? `repeat(${value}, minmax(0, 1fr))` : value),
    from: (css) => {
      const match = /^repeat\((\d+), minmax\(0, 1fr\)\)$/.exec(css.trim());
      return match ? match[1] : css.trim() || undefined;
    },
  },
  borderWidth: {
    property: "border-width",
    to: (v) => (/^\d+(\.\d+)?$/.test(v) ? `${v}px` : v),
    from: (css) => {
      const m = /^(\d+(?:\.\d+)?)px$/.exec(css.trim());
      return m ? m[1] : css.trim() || undefined;
    },
  },
  borderTopWidth: { property: "border-top-width", ...length },
  borderRightWidth: { property: "border-right-width", ...length },
  borderBottomWidth: { property: "border-bottom-width", ...length },
  borderLeftWidth: { property: "border-left-width", ...length },
  borderColor: { property: "border-color", ...varRef("color") },
  borderTopColor: { property: "border-top-color", ...varRef("color") },
  borderRightColor: { property: "border-right-color", ...varRef("color") },
  borderBottomColor: { property: "border-bottom-color", ...varRef("color") },
  borderLeftColor: { property: "border-left-color", ...varRef("color") },
  borderRadius: { property: "border-radius", ...varRef("radius") },
  borderTopLeftRadius: { property: "border-top-left-radius", ...varRef("radius") },
  borderTopRightRadius: { property: "border-top-right-radius", ...varRef("radius") },
  borderBottomRightRadius: { property: "border-bottom-right-radius", ...varRef("radius") },
  borderBottomLeftRadius: { property: "border-bottom-left-radius", ...varRef("radius") },
  borderStyle: {
    property: "border-style",
    ...keyword({
      solid: "solid",
      dashed: "dashed",
      dotted: "dotted",
      double: "double",
      none: "none",
    }),
  },
  lineHeight: { property: "line-height", ...varRef("leading") },
  letterSpacing: { property: "letter-spacing", ...varRef("tracking") },
  decoration: {
    property: "text-decoration-line",
    ...keyword({ underline: "underline", strike: "line-through" }),
  },
  letterCase: {
    property: "text-transform",
    ...keyword({ upper: "uppercase", lower: "lowercase", caps: "capitalize" }),
  },
};

// The block's style attr as an ordered declaration list (permissive parse).
function parseDecls(css: string | undefined): [string, string][] {
  if (!css) return [];
  return css
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d): [string, string] => {
      const i = d.indexOf(":");
      return i === -1 ? [d, ""] : [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    });
}

function serializeDecls(block: Block, decls: [string, string][]): void {
  const css = decls.map(([p, v]) => `${p}: ${v}`).join("; ");
  if (css) block.css = css;
  else delete block.css;
}

/** The zero-dep backend: declarations in the root's style attribute. */
export const inlineBackend: StyleBackend = {
  name: "inline",
  read(block, prop, theme = activeTheme(), breakpoint = "base") {
    if (breakpoint !== "base") return undefined;
    if (prop === "containerEnabled" || prop === "containerWidth" || prop === "containerBleed")
      return readStyleClass(prop, classList(block.classes), theme, breakpoint);
    if (prop === "layoutMode") {
      const decls = new Map(parseDecls(block.css));
      const display = decls.get("display");
      if (display === "grid") return "grid";
      if (display === "flex") return decls.get("flex-direction") === "column" ? "stack" : "row";
      if (display === "block") return "group";
      return undefined;
    }
    const spec = DECLS[prop];
    if (!spec) return undefined;
    const decl = parseDecls(block.css).find(([p]) => p === spec.property);
    return decl ? spec.from(decl[1], theme) : undefined;
  },
  write(block, prop, value, _scope, theme = activeTheme(), breakpoint = "base") {
    if (breakpoint !== "base") return;
    if (prop === "containerEnabled" || prop === "containerWidth" || prop === "containerBleed") {
      block.classes = patchStyleClasses(
        prop,
        value,
        classList(block.classes),
        theme,
        breakpoint,
      ).join(" ");
      return;
    }
    if (prop === "layoutMode") {
      const decls = parseDecls(block.css).filter(
        ([property]) => property !== "display" && property !== "flex-direction",
      );
      if (value === "group") decls.push(["display", "block"]);
      if (value === "row") decls.push(["display", "flex"], ["flex-direction", "row"]);
      if (value === "stack") decls.push(["display", "flex"], ["flex-direction", "column"]);
      if (value === "grid") decls.push(["display", "grid"]);
      serializeDecls(block, decls);
      return;
    }
    const spec = DECLS[prop];
    if (!spec) return;
    let decls = parseDecls(block.css).filter(([p]) => p !== spec.property);
    if (value) decls.push([spec.property, spec.to(value, theme)]);
    // A border width without a style is invisible outside Tailwind preflight —
    // the inline carrier must be self-sufficient, so the style rides along.
    const hasWidth = decls.some(
      ([p]) => p === "border-width" || /^border-(?:top|right|bottom|left)-width$/.test(p),
    );
    const hasStyle = decls.some(([p]) => p === "border-style");
    if (!hasWidth && prop.endsWith("Width") && prop.startsWith("border"))
      decls = decls.filter(([p, v]) => p !== "border-style" || v !== "solid");
    if (hasWidth && !hasStyle) decls.push(["border-style", "solid"]);
    serializeDecls(block, decls);
  },
  // The var() references resolve against the theme's custom properties — one
  // :root block, injected by the host (and shipped with published content).
  css(theme = activeTheme()) {
    const vars = theme.tokens.map((t) => `  --${t.name}: ${t.value};`).join("\n");
    return `:root {\n${vars}\n}`;
  },
};
