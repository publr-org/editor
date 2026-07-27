// style.ts — the UNIVERSAL style system (Phase C). Distinct from per-block
// config settings: styles (color/typography/dimensions/border) are universal —
// any block that SUPPORTS a panel gets it, and ONE serializer emits the Tailwind
// utility classes for every block type (never per-block render logic).
//
// The structured value is the source of truth (block.style, an island that
// round-trips); this maps it to classes on the block root. The value VOCABULARY
// is theme-native (E1, css-engine thoughts): a value is a THEME TOKEN key
// (`fontSize: "lg"`, `textColor: "foreground"`, `padding: "medium"`) or raw
// CSS, which becomes an
// arbitrary-value utility (`fontSize: "17px"` → text-[17px]) for the JIT.
// Scales are NOT hardcoded here — token membership is the theme's call
// (src/theme.ts); control options derive from the same tokens. Adding a prop =
// one STYLE_PROPS entry + one PROP_SUPPORT line. thoughts/011 + css-engine.

import { activeTheme, hasToken, tokenValue } from "./theme";
import type { Theme } from "./theme";

/** A block's structured style values: prop name → value (theme token key,
 * numeric step, or raw CSS). */
export type StyleValues = Record<string, string>;

/** Responsive authoring scope. `base` is the unprefixed utility; the other
 * values materialize as Tailwind-compatible variant prefixes (`md:…`). */
export type StyleBreakpoint = "base" | "sm" | "md" | "lg" | "xl" | "2xl" | (string & {});

export interface StyleBreakpointDefinition {
  key: StyleBreakpoint;
  label: string;
  shortLabel: string;
  viewport: string;
  token?: string;
}

/** Marks a theme whose breakpoint collection has been explicitly authored.
 * Legacy/curated themes without breakpoint tokens receive the standard
 * starter collection; once this marker exists, an empty collection is
 * intentional and remains empty. */
export const BREAKPOINT_CONFIGURATION_TOKEN = "publr-breakpoints-configured";

export const STYLE_BREAKPOINTS: readonly StyleBreakpointDefinition[] = [
  {
    key: "base",
    label: "Mobile",
    shortLabel: "M",
    viewport: "390px",
    token: "publr-preview-base",
  },
  {
    key: "sm",
    label: "Small",
    shortLabel: "S",
    viewport: "640px",
    token: "breakpoint-sm",
  },
  {
    key: "md",
    label: "Tablet",
    shortLabel: "T",
    viewport: "768px",
    token: "breakpoint-md",
  },
  {
    key: "lg",
    label: "Desktop",
    shortLabel: "D",
    viewport: "1024px",
    token: "breakpoint-lg",
  },
  {
    key: "xl",
    label: "Large desktop",
    shortLabel: "XL",
    viewport: "1280px",
    token: "breakpoint-xl",
  },
  {
    key: "2xl",
    label: "Wide desktop",
    shortLabel: "2XL",
    viewport: "1536px",
    token: "breakpoint-2xl",
  },
];

/** Resolve preview/media-query widths from the active portable theme. The
 * static list above supplies reset defaults; the live collection is every
 * `breakpoint-*` token currently present in the theme. */
export function styleBreakpoints(
  theme: Theme = activeTheme(),
): readonly StyleBreakpointDefinition[] {
  const known = new Map(STYLE_BREAKPOINTS.map((breakpoint) => [breakpoint.key, breakpoint]));
  const toViewport = (value: string): string => {
    const relative = value.match(/^(\d+(?:\.\d+)?)(rem|em)$/);
    return relative ? `${Number(relative[1]) * 16}px` : value;
  };
  const base = known.get("base")!;
  const rows: StyleBreakpointDefinition[] = [
    {
      ...base,
      viewport: toViewport(tokenValue(theme, base.token!) ?? base.viewport),
    },
  ];
  const authoredMediaTokens = theme.tokens.filter((token) => token.name.startsWith("breakpoint-"));
  const mediaTokens =
    authoredMediaTokens.length ||
    theme.tokens.some((token) => token.name === BREAKPOINT_CONFIGURATION_TOKEN)
      ? authoredMediaTokens
      : STYLE_BREAKPOINTS.slice(1).map((breakpoint) => ({
          name: breakpoint.token ?? `breakpoint-${breakpoint.key}`,
          value: breakpoint.viewport,
        }));
  for (const token of mediaTokens) {
    if (!token.name.startsWith("breakpoint-")) continue;
    const key = token.name.slice("breakpoint-".length);
    if (!key) continue;
    const preset = known.get(key);
    rows.push({
      key,
      label:
        preset?.label ??
        key
          .split("-")
          .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
          .join(" "),
      shortLabel: preset?.shortLabel ?? key.toUpperCase(),
      viewport: toViewport(token.value),
      token: token.name,
    });
  }
  const toPx = (value: string): number => {
    const match = value.match(/^(\d+(?:\.\d+)?)px$/);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  };
  rows.splice(
    1,
    rows.length - 1,
    ...rows.slice(1).sort((a, b) => toPx(a.viewport) - toPx(b.viewport)),
  );
  return rows;
}

/** Semantic Group container classes participate in the same mobile-first
 * breakpoint carrier as utility-backed styles. They are component recipes,
 * so generate their prefixed selectors from the live theme breakpoints rather
 * than hard-coding Tailwind's starter collection. */
export function responsiveContainerCss(theme: Theme = activeTheme()): string {
  const rules = styleBreakpoints(theme)
    .filter(({ key }) => key !== "base")
    .map(({ key, viewport }) => {
      const prefix = `${key.replace(/[^a-zA-Z0-9_-]/g, "\\$&")}\\:`;
      const scoped = (name: string) => `:is(#canvas, .pbe-preview) .${prefix}${name}`;
      const first = (name: string) =>
        `${scoped(name)} > :is(:first-child:not(script), script[data-pb-settings] + *)`;
      const last = (name: string) => `${scoped(name)} > :last-child`;
      const constrain = `
  box-sizing:border-box;
  width:100%!important;
  max-width:calc(var(--pbe-container-width) + 2 * var(--container-gutter,24px))!important;
  margin-inline:auto!important;
  padding-inline:var(--container-gutter,24px);`;
      const unbleed = constrain;
      const bleed = `
  --pbe-container-edge:max(var(--container-gutter,24px),calc((100vw - var(--pbe-container-width))/2));`;
      const reset = `
  width:auto!important;
  max-width:none!important;
  margin-inline:0!important;
  padding-inline:0;`;
      return `@media (min-width:${viewport}) {
${scoped("pbe-container--on")}{--pbe-container-width:var(--container-wide,1340px);${constrain}}
${scoped("pbe-container--content")}{--pbe-container-width:var(--container-content,645px)}
${scoped("pbe-container--wide")}{--pbe-container-width:var(--container-wide,1340px)}
${scoped("pbe-container--bleed-none")}{${unbleed}}
${first("pbe-container--bleed-none")}{margin-inline-start:0!important}
${last("pbe-container--bleed-none")}{margin-inline-end:0!important}
${scoped("pbe-container--bleed-left")},
${scoped("pbe-container--bleed-right")},
${scoped("pbe-container--bleed-both")}{${bleed}}
${first("pbe-container--bleed-left")},
${first("pbe-container--bleed-both")}{margin-inline-start:calc(-1 * var(--pbe-container-edge))!important}
${last("pbe-container--bleed-right")},
${last("pbe-container--bleed-both")}{margin-inline-end:calc(-1 * var(--pbe-container-edge))!important}
${scoped("pbe-container--off")}{${reset}}
${first("pbe-container--off")}{margin-inline-start:0!important}
${last("pbe-container--off")}{margin-inline-end:0!important}
}`;
    });
  return rules.length ? `@layer components {\n${rules.join("\n")}\n}` : "";
}

export interface StyleCapability {
  /** Shown without using the panel's optional-controls menu. Defaults to true. */
  default?: boolean;
  /** Optional curated value vocabulary; absent means the active theme/control default. */
  values?: readonly string[];
  /** Whether the UI accepts an arbitrary CSS value. Defaults to true. */
  allowCustom?: boolean;
}

export type StyleSupport = boolean | StyleCapability;

/** Which style panels a block opts into (registerBlock `supports`). */
export interface StyleSupports {
  typography?: {
    fontSize?: StyleSupport;
    lineHeight?: StyleSupport;
    letterSpacing?: StyleSupport;
    decoration?: StyleSupport;
    letterCase?: StyleSupport;
    textAlign?: StyleSupport;
    fontWeight?: StyleSupport;
    fontStyle?: StyleSupport;
  };
  color?: { text?: StyleSupport; background?: StyleSupport };
  spacing?: {
    padding?: StyleSupport;
    paddingInline?: StyleSupport;
    paddingBlock?: StyleSupport;
    paddingTop?: StyleSupport;
    paddingRight?: StyleSupport;
    paddingBottom?: StyleSupport;
    paddingLeft?: StyleSupport;
    margin?: StyleSupport;
    marginTop?: StyleSupport;
    marginRight?: StyleSupport;
    marginBottom?: StyleSupport;
    marginLeft?: StyleSupport;
  };
  dimensions?: {
    width?: StyleSupport;
    height?: StyleSupport;
    minHeight?: StyleSupport;
    minWidth?: StyleSupport;
    flexBasis?: StyleSupport;
    aspectRatio?: StyleSupport;
  };
  layout?: {
    layoutMode?: StyleSupport;
    containerEnabled?: StyleSupport;
    containerWidth?: StyleSupport;
    containerBleed?: StyleSupport;
    gap?: StyleSupport;
    rowGap?: StyleSupport;
    columnGap?: StyleSupport;
    justifyContent?: StyleSupport;
    alignItems?: StyleSupport;
    flexWrap?: StyleSupport;
    gridColumns?: StyleSupport;
  };
  border?: {
    width?: StyleSupport;
    color?: StyleSupport;
    radius?: StyleSupport;
    style?: StyleSupport;
  };
}

export const styleSupportEnabled = (support: StyleSupport | undefined): boolean =>
  support === true || (!!support && typeof support === "object");

// One style prop: which panel it belongs to + how a value becomes a class
// against a given theme (token → its utility, else arbitrary-value). null = none.
interface StyleProp {
  panel: keyof StyleSupports;
  toClass: (value: string, theme: Theme) => string | readonly string[] | null;
}

/** Keyword utilities (not theme scales — they ARE the spec): decoration + case. */
export const DECORATIONS = [
  { key: "underline", label: "U", class: "underline" },
  { key: "strike", label: "S", class: "line-through" },
] as const;
export const LETTER_CASES = [
  { key: "upper", label: "AB", class: "uppercase" },
  { key: "lower", label: "ab", class: "lowercase" },
  { key: "caps", label: "Ab", class: "capitalize" },
] as const;
export const TEXT_ALIGNMENTS = [
  { key: "left", label: "Left", class: "text-left" },
  { key: "center", label: "Center", class: "text-center" },
  { key: "right", label: "Right", class: "text-right" },
  { key: "justify", label: "Justify", class: "text-justify" },
] as const;
export const FONT_WEIGHTS = [
  { key: "normal", label: "Regular", class: "font-normal" },
  { key: "medium", label: "Medium", class: "font-medium" },
  { key: "semibold", label: "Semibold", class: "font-semibold" },
  { key: "bold", label: "Bold", class: "font-bold" },
] as const;
export const FONT_STYLES = [
  { key: "normal", label: "Regular", class: "not-italic" },
  { key: "italic", label: "Italic", class: "italic" },
] as const;
export const JUSTIFY_CONTENT = [
  { key: "start", label: "Start", class: "justify-start" },
  { key: "center", label: "Center", class: "justify-center" },
  { key: "end", label: "End", class: "justify-end" },
  { key: "between", label: "Between", class: "justify-between" },
  { key: "around", label: "Around", class: "justify-around" },
  { key: "evenly", label: "Evenly", class: "justify-evenly" },
] as const;
export const ALIGN_ITEMS = [
  { key: "start", label: "Start", class: "items-start" },
  { key: "center", label: "Center", class: "items-center" },
  { key: "end", label: "End", class: "items-end" },
  { key: "stretch", label: "Stretch", class: "items-stretch" },
  { key: "baseline", label: "Baseline", class: "items-baseline" },
] as const;
export const BORDER_STYLES = [
  { key: "solid", label: "Solid", class: "border-solid" },
  { key: "dashed", label: "Dashed", class: "border-dashed" },
  { key: "dotted", label: "Dotted", class: "border-dotted" },
  { key: "double", label: "Double", class: "border-double" },
  { key: "none", label: "None", class: "border-none" },
] as const;
export const FLEX_WRAPS = [
  { key: "nowrap", label: "No wrap", class: "flex-nowrap" },
  { key: "wrap", label: "Wrap", class: "flex-wrap" },
  { key: "reverse", label: "Reverse", class: "flex-wrap-reverse" },
] as const;

const KEYWORD_CLASS: Record<string, string> = Object.fromEntries(
  [...DECORATIONS, ...LETTER_CASES].map((k) => [k.key, k.class]),
);

// Numeric steps (v4 spacing multiplier / border widths) — "4", "1.5".
const NUM = /^\d+(\.\d+)?$/;
const arbitrary = (value: string): string => value.trim().replace(/\s+/g, "_");

// value → class for a color-consuming prefix: theme token (`red-500` →
// text-red-500) or raw CSS color (`#ff0000` → text-[#ff0000]).
const colorClass =
  (prefix: string) =>
  (v: string, theme: Theme): string | null =>
    v
      ? ["transparent", "current", "inherit"].includes(v)
        ? `${prefix}-${v}`
        : hasToken(theme, `color-${v}`)
          ? `${prefix}-${v}`
          : `${prefix}-[${arbitrary(v)}]`
      : null;

// value → class for a token namespace: `lg` → text-lg if the theme has
// text-lg, else arbitrary (`17px` → text-[17px]). utility and namespace
// differ where Tailwind's class prefix ≠ the token prefix (rounded/radius).
const tokenClass =
  (utility: string, ns: string) =>
  (v: string, theme: Theme): string | null =>
    v ? (hasToken(theme, `${ns}-${v}`) ? `${utility}-${v}` : `${utility}-[${arbitrary(v)}]`) : null;

// value → class for numeric spacing steps or a named theme spacing token.
// Unknown values remain available as raw CSS lengths (`p-[3px]`).
const stepClass =
  (prefix: string) =>
  (v: string, theme: Theme): string | null =>
    v
      ? v === "auto"
        ? `${prefix}-auto`
        : NUM.test(v)
          ? `${prefix}-${v}`
          : hasToken(theme, `spacing-${v}`)
            ? `${prefix}-[var(--spacing-${v})]`
            : `${prefix}-[${arbitrary(v)}]`
      : null;

const fixedClass = (scale: readonly { key: string; class: string }[]) => (v: string) =>
  v ? (scale.find((option) => option.key === v)?.class ?? null) : null;

// Keyword sizing values the dimension lens OWNS alongside steps and raw
// lengths — an authored `w-full` must be REPLACED by a width write (never
// shadowed by an appended `w-[240px]` it would then fight). Fractions
// (`w-1/2`) stay authored per the v0 "/" scope rule.
const DIMENSION_KEYWORDS = ["auto", "full", "px", "screen", "min", "max", "fit"];

const dimensionClass = (prefix: string) => (v: string) =>
  v
    ? DIMENSION_KEYWORDS.includes(v) || NUM.test(v)
      ? `${prefix}-${v}`
      : `${prefix}-[${arbitrary(v)}]`
    : null;
const gridColumnsClass = (v: string) =>
  v ? (/^(?:[1-9]|1[0-2])$/.test(v) ? `grid-cols-${v}` : `grid-cols-[${arbitrary(v)}]`) : null;

/** One container block, four responsive layout presentations. Row writes an
 * explicit direction so it can override an inherited Stack at a wider
 * breakpoint; Group writes `block` for the same reason. */
const layoutModeClass = (v: string): readonly string[] | null => {
  if (v === "group") return ["block"];
  if (v === "row") return ["flex", "flex-row"];
  if (v === "stack") return ["flex", "flex-col"];
  if (v === "grid") return ["grid"];
  return null;
};

/** Group container facts use semantic classes rather than expanding their
 * layout recipe into utilities. The site sheet owns that recipe, while the
 * ordinary responsive class lens supplies prefixes such as `lg:`. */
const containerEnabledClass = (v: string) => {
  if (v === "true") return "pbe-container--on";
  if (v === "false") return "pbe-container--off";
  return null;
};
const containerWidthClass = (v: string) =>
  v === "content" || v === "wide" ? `pbe-container--${v}` : null;
const containerBleedClass = (v: string) =>
  v === "none" || v === "left" || v === "right" || v === "both"
    ? `pbe-container--bleed-${v}`
    : null;

const ASPECTS = [
  { key: "auto", class: "aspect-auto" },
  { key: "square", class: "aspect-square" },
  { key: "video", class: "aspect-video" },
] as const;

// The style vocabulary. Each prop maps a value → class against the theme.
export const STYLE_PROPS: Record<string, StyleProp> = {
  layoutMode: { panel: "layout", toClass: layoutModeClass },
  containerEnabled: { panel: "layout", toClass: containerEnabledClass },
  containerWidth: { panel: "layout", toClass: containerWidthClass },
  containerBleed: { panel: "layout", toClass: containerBleedClass },
  fontSize: { panel: "typography", toClass: tokenClass("text", "text") },
  textAlign: { panel: "typography", toClass: fixedClass(TEXT_ALIGNMENTS) },
  fontWeight: { panel: "typography", toClass: fixedClass(FONT_WEIGHTS) },
  fontStyle: { panel: "typography", toClass: fixedClass(FONT_STYLES) },
  textColor: { panel: "color", toClass: colorClass("text") },
  backgroundColor: { panel: "color", toClass: colorClass("bg") },
  padding: { panel: "spacing", toClass: stepClass("p") },
  paddingInline: { panel: "spacing", toClass: stepClass("px") },
  paddingBlock: { panel: "spacing", toClass: stepClass("py") },
  paddingTop: { panel: "spacing", toClass: stepClass("pt") },
  paddingRight: { panel: "spacing", toClass: stepClass("pr") },
  paddingBottom: { panel: "spacing", toClass: stepClass("pb") },
  paddingLeft: { panel: "spacing", toClass: stepClass("pl") },
  margin: { panel: "spacing", toClass: stepClass("m") },
  marginTop: { panel: "spacing", toClass: stepClass("mt") },
  marginRight: { panel: "spacing", toClass: stepClass("mr") },
  marginBottom: { panel: "spacing", toClass: stepClass("mb") },
  marginLeft: { panel: "spacing", toClass: stepClass("ml") },
  width: { panel: "dimensions", toClass: dimensionClass("w") },
  height: { panel: "dimensions", toClass: dimensionClass("h") },
  minHeight: { panel: "dimensions", toClass: dimensionClass("min-h") },
  minWidth: { panel: "dimensions", toClass: dimensionClass("min-w") },
  flexBasis: { panel: "dimensions", toClass: dimensionClass("basis") },
  aspectRatio: {
    panel: "dimensions",
    toClass: (v) => fixedClass(ASPECTS)(v) ?? (v ? `aspect-[${arbitrary(v)}]` : null),
  },
  gap: { panel: "layout", toClass: stepClass("gap") },
  rowGap: { panel: "layout", toClass: stepClass("gap-y") },
  columnGap: { panel: "layout", toClass: stepClass("gap-x") },
  justifyContent: { panel: "layout", toClass: fixedClass(JUSTIFY_CONTENT) },
  alignItems: { panel: "layout", toClass: fixedClass(ALIGN_ITEMS) },
  flexWrap: { panel: "layout", toClass: fixedClass(FLEX_WRAPS) },
  gridColumns: { panel: "layout", toClass: gridColumnsClass },
  borderWidth: {
    panel: "border",
    // v4 border widths are fixed utilities: "1" ⇒ `border`, other numbers ⇒
    // `border-N`, raw lengths ⇒ arbitrary.
    toClass: (v) =>
      v ? (v === "1" ? "border" : NUM.test(v) ? `border-${v}` : `border-[${arbitrary(v)}]`) : null,
  },
  borderTopWidth: {
    panel: "border",
    toClass: (v) => (v ? (v === "1" ? "border-t" : NUM.test(v) ? `border-t-${v}` : null) : null),
  },
  borderLeftWidth: {
    panel: "border",
    toClass: (v) => (v ? (v === "1" ? "border-l" : NUM.test(v) ? `border-l-${v}` : null) : null),
  },
  borderColor: { panel: "border", toClass: colorClass("border") },
  borderRadius: { panel: "border", toClass: tokenClass("rounded", "radius") },
  borderStyle: { panel: "border", toClass: fixedClass(BORDER_STYLES) },
  lineHeight: { panel: "typography", toClass: tokenClass("leading", "leading") },
  letterSpacing: { panel: "typography", toClass: tokenClass("tracking", "tracking") },
  // decoration + letterCase are exclusive keyword choices; the class is looked
  // up (no theme, no arbitrary form).
  decoration: { panel: "typography", toClass: (v) => (v ? (KEYWORD_CLASS[v] ?? null) : null) },
  letterCase: { panel: "typography", toClass: (v) => (v ? (KEYWORD_CLASS[v] ?? null) : null) },
};

// prop → the `supports` predicate that opts a block into it. One line per prop.
const PROP_SUPPORT: Record<string, (s: StyleSupports) => StyleSupport | undefined> = {
  layoutMode: (s) => s.layout?.layoutMode,
  containerEnabled: (s) => s.layout?.containerEnabled,
  containerWidth: (s) => s.layout?.containerWidth,
  containerBleed: (s) => s.layout?.containerBleed,
  fontSize: (s) => s.typography?.fontSize,
  textAlign: (s) => s.typography?.textAlign,
  fontWeight: (s) => s.typography?.fontWeight,
  fontStyle: (s) => s.typography?.fontStyle,
  lineHeight: (s) => s.typography?.lineHeight,
  letterSpacing: (s) => s.typography?.letterSpacing,
  decoration: (s) => s.typography?.decoration,
  letterCase: (s) => s.typography?.letterCase,
  textColor: (s) => s.color?.text,
  backgroundColor: (s) => s.color?.background,
  padding: (s) => s.spacing?.padding,
  paddingInline: (s) => s.spacing?.paddingInline,
  paddingBlock: (s) => s.spacing?.paddingBlock,
  paddingTop: (s) => s.spacing?.paddingTop,
  paddingRight: (s) => s.spacing?.paddingRight,
  paddingBottom: (s) => s.spacing?.paddingBottom,
  paddingLeft: (s) => s.spacing?.paddingLeft,
  margin: (s) => s.spacing?.margin,
  marginTop: (s) => s.spacing?.marginTop,
  marginRight: (s) => s.spacing?.marginRight,
  marginBottom: (s) => s.spacing?.marginBottom,
  marginLeft: (s) => s.spacing?.marginLeft,
  width: (s) => s.dimensions?.width,
  height: (s) => s.dimensions?.height,
  minHeight: (s) => s.dimensions?.minHeight,
  minWidth: (s) => s.dimensions?.minWidth,
  flexBasis: (s) => s.dimensions?.flexBasis,
  aspectRatio: (s) => s.dimensions?.aspectRatio,
  gap: (s) => s.layout?.gap,
  rowGap: (s) => s.layout?.rowGap,
  columnGap: (s) => s.layout?.columnGap,
  justifyContent: (s) => s.layout?.justifyContent,
  alignItems: (s) => s.layout?.alignItems,
  flexWrap: (s) => s.layout?.flexWrap,
  gridColumns: (s) => s.layout?.gridColumns,
  borderWidth: (s) => s.border?.width,
  borderColor: (s) => s.border?.color,
  borderRadius: (s) => s.border?.radius,
  borderStyle: (s) => s.border?.style,
};

/** A named visual variant. Registration uses the same structured values as
 * the universal inspector, so semantic token keys—not utility classes—form
 * the public API. The class carrier remains an internal serialization detail. */
export interface StyleVariant {
  readonly name: string;
  readonly label: string;
  readonly styles: Readonly<StyleValues>;
}

/** @deprecated Use StyleVariant. */
export type StyleVariation = StyleVariant;

/** Resolve a variant recipe through the active theme into carrier classes. */
export function variantClasses(
  variants: readonly StyleVariant[] | undefined,
  key: string | undefined,
  theme: Theme = activeTheme(),
): string[] {
  if (!variants || !key) return [];
  const variant = variants.find((candidate) => candidate.name === key);
  return variant ? styleClasses(variant.styles, theme) : [];
}

/** @deprecated Use variantClasses. */
export const variationClasses = variantClasses;

/** The universal serializer: a block's style values → Tailwind classes on its
 * root, resolved against the theme (defaults to the page-active theme). */
export function styleClasses(
  style: StyleValues | undefined,
  theme: Theme = activeTheme(),
): string[] {
  if (!style) return [];
  const out: string[] = [];
  for (const [prop, value] of Object.entries(style)) {
    const cls = STYLE_PROPS[prop]?.toClass(value, theme);
    if (typeof cls === "string") out.push(cls);
    else if (cls) out.push(...cls);
  }
  return out;
}

/** Whether a block that declares `supports` opts into a given style prop (editor renders the control). */
export function blockSupportsStyle(supports: StyleSupports | undefined, prop: string): boolean {
  return !!supports && styleSupportEnabled(PROP_SUPPORT[prop]?.(supports));
}

// ---------------------------------------------------------------------------
// LENSES over a class list (E2, css-engine thoughts). The class attribute is
// the style CARRIER: a lens READS its prop's value out of the classes and
// WRITES by replacing its own classes — no parallel store, no island. The
// reverse mapping lives here so it derives from the same STYLE_PROPS +
// theme-token knowledge as the forward one (they cannot drift).
//
// v0 scope rule (from the POC): classes carrying a variant (`sm:`, `hover:` —
// anything with ":") or a modifier ("/", e.g. `bg-white/5`) are never touched
// — they stay authored until the variant axis lands.

// The arbitrary-value form: `text-[17px]` → "17px" (underscores decode to spaces).
const arb = (prefix: string, cls: string): string | null =>
  cls.startsWith(`${prefix}-[`) && cls.endsWith("]")
    ? cls.slice(prefix.length + 2, -1).replaceAll("_", " ")
    : null;

// A value that reads as a CSS color — disambiguates shared prefixes
// (`text-[#f00]` is a color, `text-[17px]` a size; `border-[…]` likewise).
const COLORISH = /^(#|rgb|hsl|oklch|oklab|color\(|var\()/;

// token-scale reverse: `text-lg` → "lg" iff the theme has text-lg.
const fromToken =
  (utility: string, ns: string, colorish?: boolean) =>
  (cls: string, theme: Theme): string | null => {
    if (cls.startsWith(`${utility}-`)) {
      const suffix = cls.slice(utility.length + 1);
      if (!suffix.startsWith("[") && hasToken(theme, `${ns}-${suffix}`)) return suffix;
    }
    const raw = arb(utility, cls);
    if (raw !== null && (colorish === undefined || COLORISH.test(raw) === colorish)) return raw;
    return null;
  };

// color reverse for a prefix: token (`text-red-500` → "red-500") or colorish arbitrary.
const fromColor =
  (prefix: string) =>
  (cls: string, theme: Theme): string | null => {
    if (cls.startsWith(`${prefix}-`)) {
      const suffix = cls.slice(prefix.length + 1);
      if (!suffix.startsWith("[") && hasToken(theme, `color-${suffix}`)) return suffix;
    }
    const raw = arb(prefix, cls);
    if (raw === null || !COLORISH.test(raw)) return null;
    const tokenVar = /^var\(--color-([a-zA-Z0-9_-]+)\)$/.exec(raw);
    return tokenVar && hasToken(theme, `color-${tokenVar[1]}`) ? tokenVar[1] : raw;
  };

// numeric-step reverse: `p-4` → "4"; `p-[3px]` → "3px".
const fromStep =
  (prefix: string) =>
  (cls: string, theme: Theme): string | null => {
    const m = new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)?)$`).exec(cls);
    if (m) return m[1];
    const raw = arb(prefix, cls);
    if (raw === null) return null;
    const tokenVar = /^var\(--spacing-([a-zA-Z0-9_-]+)\)$/.exec(raw);
    return tokenVar && hasToken(theme, `spacing-${tokenVar[1]}`) ? tokenVar[1] : raw;
  };

// dimension reverse: steps/arbitrary plus the owned keywords (`w-full` → "full").
const fromDimension = (prefix: string) => {
  const step = fromStep(prefix);
  return (cls: string, theme: Theme): string | null => {
    const suffix = cls.startsWith(`${prefix}-`) ? cls.slice(prefix.length + 1) : null;
    if (suffix !== null && DIMENSION_KEYWORDS.includes(suffix)) return suffix;
    return step(cls, theme);
  };
};

const fromKeyword =
  (scale: readonly { key: string; class: string }[]) =>
  (cls: string): string | null =>
    scale.find((k) => k.class === cls)?.key ?? null;

// prop → reverse mapping (class → value, resolved forms only; an unknown
// token suffix is NOT claimed — it surfaces via unresolvedUtilities instead).
const FROM_CLASS: Record<string, (cls: string, theme: Theme) => string | null> = {
  layoutMode: (cls) => {
    if (cls === "block") return "group";
    if (cls === "grid") return "grid";
    if (cls === "flex" || cls === "flex-row") return "row";
    if (cls === "flex-col") return "stack";
    return null;
  },
  containerEnabled: (cls) => {
    if (cls === "pbe-container" || cls === "pbe-container--on") return "true";
    if (cls === "pbe-container--off") return "false";
    return null;
  },
  containerWidth: (cls) => {
    if (cls === "pbe-container--content") return "content";
    if (cls === "pbe-container--wide") return "wide";
    return null;
  },
  containerBleed: (cls) => {
    if (cls === "pbe-container--bleed-none") return "none";
    if (cls === "pbe-container--bleed-left") return "left";
    if (cls === "pbe-container--bleed-right") return "right";
    if (cls === "pbe-container--bleed-both") return "both";
    return null;
  },
  fontSize: fromToken("text", "text", false),
  textAlign: fromKeyword(TEXT_ALIGNMENTS),
  fontWeight: fromKeyword(FONT_WEIGHTS),
  fontStyle: fromKeyword(FONT_STYLES),
  textColor: fromColor("text"),
  backgroundColor: fromColor("bg"),
  padding: fromStep("p"),
  paddingInline: fromStep("px"),
  paddingBlock: fromStep("py"),
  paddingTop: fromStep("pt"),
  paddingRight: fromStep("pr"),
  paddingBottom: fromStep("pb"),
  paddingLeft: fromStep("pl"),
  margin: fromStep("m"),
  marginTop: fromStep("mt"),
  marginRight: fromStep("mr"),
  marginBottom: fromStep("mb"),
  marginLeft: fromStep("ml"),
  width: fromDimension("w"),
  height: fromDimension("h"),
  minHeight: fromDimension("min-h"),
  minWidth: fromDimension("min-w"),
  flexBasis: fromDimension("basis"),
  aspectRatio: (cls) => {
    const fixed = fromKeyword(ASPECTS)(cls);
    return fixed ?? arb("aspect", cls);
  },
  gap: fromStep("gap"),
  rowGap: fromStep("gap-y"),
  columnGap: fromStep("gap-x"),
  justifyContent: fromKeyword(JUSTIFY_CONTENT),
  alignItems: fromKeyword(ALIGN_ITEMS),
  flexWrap: fromKeyword(FLEX_WRAPS),
  gridColumns: (cls) => {
    const match = /^grid-cols-(\d+)$/.exec(cls);
    return match ? match[1] : arb("grid-cols", cls);
  },
  borderWidth: (cls) => {
    if (cls === "border") return "1";
    const m = /^border-(\d+(?:\.\d+)?)$/.exec(cls);
    if (m) return m[1];
    const raw = arb("border", cls);
    return raw !== null && !COLORISH.test(raw) ? raw : null;
  },
  borderColor: fromColor("border"),
  borderRadius: fromToken("rounded", "radius"),
  borderStyle: fromKeyword(BORDER_STYLES),
  lineHeight: fromToken("leading", "leading"),
  letterSpacing: fromToken("tracking", "tracking"),
  decoration: fromKeyword(DECORATIONS),
  letterCase: fromKeyword(LETTER_CASES),
};

// Resolve one responsive authoring scope to the utility body the existing
// prop lenses understand. State/interaction variants remain authored escape
// hatches: selecting `md` claims `md:grid-cols-3`, never `md:hover:…`.
const classAtBreakpoint = (cls: string, breakpoint: StyleBreakpoint): string | null => {
  const prefix = breakpoint === "base" ? "" : `${breakpoint}:`;
  if (prefix && !cls.startsWith(prefix)) return null;
  const body = prefix ? cls.slice(prefix.length) : cls;
  const structure = body.replace(/\[[^\]]*\]/g, "[]");
  if ((!prefix && cls !== body) || structure.includes(":") || structure.includes("/")) return null;
  return body.startsWith("[") ? null : body;
};

/** Read a prop's value out of a class list (last owner wins, like CSS). */
export function readStyleClass(
  prop: string,
  classes: readonly string[],
  theme: Theme = activeTheme(),
  breakpoint: StyleBreakpoint = "base",
): string | undefined {
  const from = FROM_CLASS[prop];
  if (!from) return undefined;
  let value: string | undefined;
  for (const cls of classes) {
    const body = classAtBreakpoint(cls, breakpoint);
    if (!body) continue;
    const v = from(body, theme);
    if (v !== null) value = v;
  }
  return value;
}

/** Write a prop's value into a class list: remove every class the prop owns,
 * append the new value's class ("" just clears). Returns a new list. */
export function patchStyleClasses(
  prop: string,
  value: string,
  classes: readonly string[],
  theme: Theme = activeTheme(),
  breakpoint: StyleBreakpoint = "base",
): string[] {
  const from = FROM_CLASS[prop];
  const kept = classes.filter((cls) => {
    const body = classAtBreakpoint(cls, breakpoint);
    return !from || !body || from(body, theme) === null;
  });
  const next = value ? STYLE_PROPS[prop]?.toClass(value, theme) : null;
  const nextClasses = Array.isArray(next) ? next : next ? [next] : [];
  kept.push(...nextClasses.map((cls) => (breakpoint === "base" ? cls : `${breakpoint}:${cls}`)));
  return kept;
}

/** A utility-shaped class whose token is missing from the theme (`text-xxxxl`):
 * claimed at the PANEL level, not by a lens — `namespaces` are the candidate
 * token namespaces the Define… flow offers (shared prefixes are ambiguous). */
export interface UnresolvedUtility {
  cls: string;
  suffix: string;
  namespaces: string[];
}

// Prefixes worth flagging + their candidate namespaces. Static utilities that
// share a prefix but are not token-driven (text-center, bg-cover…) are
// skipped conservatively — the ENGINE's diagnostics (E3) are authoritative;
// this local detector only feeds the pre-engine Define… loop.
const UTILITY_SHAPES: { prefix: string; namespaces: string[]; skip?: RegExp }[] = [
  {
    prefix: "text",
    namespaces: ["text", "color"],
    skip: /^(left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|current|transparent|inherit)$/,
  },
  {
    prefix: "bg",
    namespaces: ["color"],
    skip: /^(cover|contain|center|fixed|local|scroll|repeat|no-repeat|none|top|bottom|left|right|auto|transparent|current|inherit|clip-.*|origin-.*|gradient-.*|linear-.*|radial-.*|conic-.*)$/,
  },
  {
    prefix: "border",
    namespaces: ["color"],
    skip: /^(\d+(\.\d+)?)$|^(solid|dashed|dotted|double|hidden|none|collapse|separate|spacing.*)$|^[trblxyse](-|$)/,
  },
  { prefix: "rounded", namespaces: ["radius"], skip: /^(none|full|[trblxyse]{1,2}(-|$).*)$/ },
  { prefix: "leading", namespaces: ["leading"], skip: /^(none|\d+(\.\d+)?)$/ },
  { prefix: "tracking", namespaces: ["tracking"] },
];

/** Scan a class list for utility-shaped classes whose token the theme lacks. */
export function unresolvedUtilities(
  classes: readonly string[],
  theme: Theme = activeTheme(),
): UnresolvedUtility[] {
  const out: UnresolvedUtility[] = [];
  for (const cls of classes) {
    // Diagnostics only operate on the unprefixed authoring scope. Responsive
    // utilities are inspected through their breakpoint lens in the sidebar,
    // while state variants remain an explicit advanced escape hatch.
    if (!classAtBreakpoint(cls, "base")) continue;
    for (const { prefix, namespaces, skip } of UTILITY_SHAPES) {
      if (!cls.startsWith(`${prefix}-`)) continue;
      const suffix = cls.slice(prefix.length + 1);
      if (!suffix || suffix.startsWith("[")) break; // arbitrary form — always resolvable
      if (skip?.test(suffix)) break;
      const resolved = namespaces.some((ns) => hasToken(theme, `${ns}-${suffix}`));
      if (!resolved) out.push({ cls, suffix, namespaces });
      break;
    }
  }
  return out;
}
