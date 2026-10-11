// The design system the builder edits: an app's theme as one document. Tokens are the
// portable value layer in the jit's naming (`color-palette-brand`, `text-lg`,
// `container-wide`, `breakpoint-md`); the rest is structure the builder's pages edit on
// top of them: the web fonts behind `font-*` tokens, the semantic color roles and the
// contexts they repeat in, the type scale, the approved icons. What leaves the builder
// is this whole document; the canvas and the site compile its tokens.
import { Publr } from "publr-jsx";
import { ICONS, ICON_VIEWBOX } from "../../../icons/src/index";
import { JIT_DEFAULT_TOKENS } from "./jit-defaults";

export type Token = { name: string; value: string };

/** The generic family a web font degrades to while it loads or fails. */
export type FontFallback = "sans-serif" | "serif" | "monospace" | "cursive";

/** One uploaded face: a hosted font file at one weight (or a variable range) and style. */
export type FontFace = { weight: number | [number, number]; italic: boolean; src: string };

type FontBase = {
  /** The `font-*` token this family backs. */
  token: string;
  /** The display family name, exactly as `font-family` names it. */
  family: string;
  fallback: FontFallback;
};

/** A Google Fonts family: the site loads exactly `weights` (and italics when set); the
 * `available*` fields record what Google serves, so the library offers only real faces. */
export type GoogleFont = FontBase & {
  provider: "google";
  weights: number[];
  italic: boolean;
  availableWeights: number[];
  availableItalic: boolean;
};

/** A family the site hosts itself: its faces become `@font-face` rules. */
export type FilesFont = FontBase & { provider: "files"; faces: FontFace[] };

/** A family the visitor's device supplies; `weights` narrow what typography offers. */
export type SystemFont = FontBase & { provider: "system"; weights: number[]; italic: boolean };

export type FontDefinition = GoogleFont | FilesFont | SystemFont;

/** One semantic job a color does. The color itself is the `color-<role>` token (and
 * `color-<context>-<role>` in each other context); `value` is the starter's. */
export type ColorRole = { key: string; label: string; description: string; value: string };

/** A named semantic palette: `default` uses `color-<role>`, others `color-<key>-<role>`. */
export type ColorContext = { key: string; label: string };

/** One named text style riding a font role. Size, line height and letter spacing hold a
 * token key of their namespace (`text-*`, `leading-*`, `tracking-*`) or a literal length. */
export type TypeScaleEntry = {
  key: string;
  label: string;
  fontRole: string;
  weight: number;
  size: string;
  lineHeight: string;
  letterSpacing: string;
  textTransform: "" | "uppercase" | "lowercase" | "capitalize";
  description: string;
};

/** One approved icon: self-contained SVG markup the Icon block may use. */
export type IconDefinition = { name: string; label: string; category: string; svg: string };

export type DesignSystem = {
  tokens: Token[];
  fonts: FontDefinition[];
  roles: ColorRole[];
  contexts: ColorContext[];
  typeScale: TypeScaleEntry[];
  icons: IconDefinition[];
  /** Raw Tailwind color tokens imported into the author-managed palette. */
  managedColorTokens: string[];
  /** A starting document per block type, written by Primitive blocks. */
  blockDefaults: Record<string, string>;
};

export const SEMANTIC_COLOR_ROLES: readonly ColorRole[] = [
  { key: "surface", label: "Surface", description: "Page and card backgrounds", value: "#ffffff" },
  { key: "foreground", label: "Foreground", description: "Primary text and strong icons", value: "#18181b" },
  { key: "border", label: "Border", description: "Dividers and outlines on Surface", value: "#e4e4e7" },
  { key: "accent-surface", label: "Accent Surface", description: "Action and emphasis backgrounds", value: "#3858e9" },
  { key: "accent-foreground", label: "Accent Foreground", description: "Content placed on Accent Surface", value: "#ffffff" },
  { key: "accent-border", label: "Accent Border", description: "Borders placed on Accent Surface", value: "#2947ce" },
  { key: "muted-surface", label: "Muted Surface", description: "Quiet panel and control backgrounds", value: "#f4f4f5" },
  { key: "muted-foreground", label: "Muted Foreground", description: "Content placed on Muted Surface", value: "#3f3f46" },
  { key: "muted-border", label: "Muted Border", description: "Borders placed on Muted Surface", value: "#d4d4d8" },
];

export const DEFAULT_COLOR_CONTEXTS: readonly ColorContext[] = [{ key: "default", label: "Default" }];

const PALETTE_TOKENS: readonly Token[] = [
  { name: "color-palette-canvas", value: "#ffffff" },
  { name: "color-palette-ink", value: "#18181b" },
  { name: "color-palette-brand", value: "#3858e9" },
  { name: "color-palette-on-brand", value: "#ffffff" },
  { name: "color-palette-soft", value: "#f4f4f5" },
  { name: "color-palette-subtle", value: "#71717a" },
  { name: "color-palette-line", value: "#e4e4e7" },
  { name: "color-palette-slate", value: "#607f99" },
  { name: "color-palette-slate-soft", value: "#6f8da5" },
  { name: "color-palette-clay", value: "#a45332" },
  { name: "color-palette-clay-soft", value: "#bd6a45" },
  { name: "color-palette-clay-subtle", value: "#f7ddca" },
  { name: "color-palette-amber", value: "#f7dda4" },
  { name: "color-palette-umber", value: "#3b332b" },
  { name: "color-palette-warm-white", value: "#fff7e9" },
];

export const CONTAINER_PADDING_DEFAULT = "24px";
export const CONTAINER_LIST_TOKEN = "publr-containers";

export const DEFAULT_CONTAINER_TOKENS: readonly Token[] = [
  { name: CONTAINER_LIST_TOKEN, value: "content wide" },
  { name: "container-content", value: "645px" },
  { name: "container-content-padding", value: CONTAINER_PADDING_DEFAULT },
  { name: "publr-container-content-label", value: "Content" },
  { name: "container-wide", value: "1340px" },
  { name: "container-wide-padding", value: CONTAINER_PADDING_DEFAULT },
  { name: "publr-container-wide-label", value: "Wide" },
];

export const DEFAULT_SPACING_TOKENS: readonly Token[] = [
  { name: "spacing-2xs", value: "0.25rem" },
  { name: "spacing-xs", value: "0.5rem" },
  { name: "spacing-s", value: "0.75rem" },
  { name: "spacing-m", value: "1rem" },
  { name: "spacing-l", value: "1.5rem" },
  { name: "spacing-xl", value: "2rem" },
  { name: "spacing-2xl", value: "3rem" },
];

export const DEFAULT_FONT_ROLE_TOKENS: readonly Token[] = [
  { name: "font-heading", value: "var(--font-sans)" },
  { name: "font-body", value: "var(--font-sans)" },
  { name: "font-code", value: "var(--font-mono)" },
];

/** The jit's own scales an app starts from, colors left out: the palette is the app's. */
export const JIT_NON_COLOR_TOKENS: readonly Token[] = JIT_DEFAULT_TOKENS.filter((token) => !token.name.startsWith("color-"));

const TAILWIND_COLOR_NAMES = new Set(JIT_DEFAULT_TOKENS.filter((token) => token.name.startsWith("color-")).map((token) => token.name));

/** Whether a color token is one of Tailwind's compatibility ramps (`color-red-500`). */
export const isTailwindCompatibilityColor = (name: string) => TAILWIND_COLOR_NAMES.has(name);

/** The Material type scale as role-driven starter styles. */
export const DEFAULT_TYPE_SCALE: readonly TypeScaleEntry[] = [
  { key: "headline-1", label: "Headline 1", fontRole: "heading", weight: 300, size: "93px", lineHeight: "", letterSpacing: "-1.5px", textTransform: "", description: "The largest text on the screen — reserved for short, important statements or numerals." },
  { key: "headline-2", label: "Headline 2", fontRole: "heading", weight: 300, size: "58px", lineHeight: "", letterSpacing: "-0.5px", textTransform: "", description: "Display-size text for prominent page and section openings." },
  { key: "headline-3", label: "Headline 3", fontRole: "heading", weight: 400, size: "46px", lineHeight: "", letterSpacing: "0px", textTransform: "", description: "High-emphasis headlines for key sections." },
  { key: "headline-4", label: "Headline 4", fontRole: "heading", weight: 400, size: "33px", lineHeight: "", letterSpacing: "0.25px", textTransform: "", description: "Headlines for sub-sections and large cards." },
  { key: "headline-5", label: "Headline 5", fontRole: "heading", weight: 400, size: "23px", lineHeight: "", letterSpacing: "0px", textTransform: "", description: "Compact headlines in dense layouts." },
  { key: "headline-6", label: "Headline 6", fontRole: "heading", weight: 500, size: "19px", lineHeight: "", letterSpacing: "0.15px", textTransform: "", description: "The smallest headline — bars, list headers and dialogs." },
  { key: "subtitle-1", label: "Subtitle 1", fontRole: "heading", weight: 400, size: "15px", lineHeight: "", letterSpacing: "0.15px", textTransform: "", description: "Medium-emphasis text below headlines, best kept short." },
  { key: "subtitle-2", label: "Subtitle 2", fontRole: "heading", weight: 500, size: "14px", lineHeight: "", letterSpacing: "0.1px", textTransform: "", description: "A denser subtitle for compact components and lists." },
  { key: "body-1", label: "Body 1", fontRole: "body", weight: 400, size: "16px", lineHeight: "", letterSpacing: "0.5px", textTransform: "", description: "Long-form reading — articles and primary passages of text." },
  { key: "body-2", label: "Body 2", fontRole: "body", weight: 400, size: "14px", lineHeight: "", letterSpacing: "0.25px", textTransform: "", description: "Secondary body copy where space is tighter." },
  { key: "button", label: "Button", fontRole: "body", weight: 500, size: "14px", lineHeight: "", letterSpacing: "1.25px", textTransform: "uppercase", description: "Calls to action on buttons, tabs, dialogs and cards." },
  { key: "caption", label: "Caption", fontRole: "body", weight: 400, size: "12px", lineHeight: "", letterSpacing: "0.4px", textTransform: "", description: "Small annotations for imagery and supporting details." },
  { key: "overline", label: "Overline", fontRole: "body", weight: 400, size: "10px", lineHeight: "", letterSpacing: "1.5px", textTransform: "uppercase", description: "A small, tracked introducer above headlines and cards." },
];

/** The starter icon set: a website-oriented slice of Publr's outline icons. */
const DEFAULT_ICON_GROUPS: Record<string, string[]> = {
  General: ["check", "x-close", "plus", "search", "settings", "home", "external", "link", "bookmark", "tag", "share", "copy", "edit", "trash", "more", "globe", "lock", "sun", "moon", "package", "grid", "list", "quote", "table", "chart"],
  Arrows: ["arrow-left", "chevron-up", "chevron-down", "chevron-left", "chevron-right", "undo", "redo", "sync", "upload", "logout"],
  Alerts: ["alert-triangle", "alert-hexagon"],
  Media: ["image", "gallery", "video", "audio"],
  Files: ["file", "folder", "folder-plus"],
  Users: ["user", "users"],
  Time: ["clock-check", "clock-rewind", "calendar-check"],
};

export const iconLabelFrom = (name: string) => (name[0]?.toUpperCase() ?? "") + name.slice(1).replace(/-/g, " ");

export const DEFAULT_ICONS: readonly IconDefinition[] = Object.entries(DEFAULT_ICON_GROUPS).flatMap(([category, names]) =>
  names
    .filter((name) => name in ICONS)
    .map((name) => ({
      name,
      label: iconLabelFrom(name),
      category,
      svg: `<svg viewBox="${ICON_VIEWBOX}" fill="none" aria-hidden="true">${(ICONS as Record<string, string>)[name]}</svg>`,
    })),
);

/** What an app with no design system yet starts from. */
export function starterSystem(): DesignSystem {
  const semantic = SEMANTIC_COLOR_ROLES.map((role) => ({ name: `color-${role.key}`, value: role.value }));
  return linkSemanticColorsToPalette({
    tokens: [...JIT_NON_COLOR_TOKENS, ...DEFAULT_FONT_ROLE_TOKENS, ...DEFAULT_SPACING_TOKENS, ...PALETTE_TOKENS, ...semantic, ...DEFAULT_CONTAINER_TOKENS].map((token) => ({ ...token })),
    fonts: [],
    roles: SEMANTIC_COLOR_ROLES.map((role) => ({ ...role })),
    contexts: DEFAULT_COLOR_CONTEXTS.map((context) => ({ ...context })),
    typeScale: DEFAULT_TYPE_SCALE.map((entry) => ({ ...entry })),
    icons: DEFAULT_ICONS.map((icon) => ({ ...icon })),
    managedColorTokens: [],
    blockDefaults: {},
  });
}

/** A partial document (an older save, an import) completed with the starter's parts. */
export function completeSystem(partial: Partial<DesignSystem>): DesignSystem {
  const starter = starterSystem();
  return {
    tokens: (partial.tokens ?? starter.tokens).map((token) => ({ ...token })),
    fonts: structuredClone(partial.fonts ?? []),
    roles: (partial.roles?.length ? partial.roles : starter.roles).map((role) => ({ ...role })),
    contexts: (partial.contexts?.length ? partial.contexts : starter.contexts).map((context) => ({ ...context })),
    typeScale: (partial.typeScale ?? starter.typeScale).map((entry) => ({ ...entry })),
    icons: (partial.icons ?? starter.icons).map((icon) => ({ ...icon })),
    managedColorTokens: [...(partial.managedColorTokens ?? [])],
    blockDefaults: { ...(partial.blockDefaults ?? {}) },
  };
}

/** The starter with an app's own tokens laid over it: an app that never saved a
 * design system but declares tokens in its `app.zon` keeps every one of them. */
export function systemFromAppTokens(tokens: readonly Token[]): DesignSystem {
  let system = starterSystem();
  const roles = new Set(SEMANTIC_COLOR_ROLES.map((role) => `color-${role.key}`));
  for (const token of tokens) {
    // An app's own color (`color-brand: #2f5d54`, a utility its pages use) joins the
    // palette under its name, and the utility now names the palette entry: the builder
    // shows the site's colors, and `text-brand` keeps drawing the same.
    const adopted = /^color-([a-z][a-z0-9-]*)$/.exec(token.name);
    if (adopted && !roles.has(token.name) && !token.name.startsWith("color-palette-") && !token.value.startsWith("var(")) {
      system = setToken(system, `color-palette-${adopted[1]}`, token.value);
      system = setToken(system, token.name, `var(--color-palette-${adopted[1]})`);
    } else {
      system = setToken(system, token.name, token.value);
    }
  }
  return system;
}

// ── tokens ──────────────────────────────────────────────────────────────

export function tokenValue(system: DesignSystem, name: string): string | undefined {
  return system.tokens.find((token) => token.name === name)?.value;
}

export const hasToken = (system: DesignSystem, name: string) => system.tokens.some((token) => token.name === name);

/** The system with a token set in place (or appended), or removed when `value` is null. */
export function setToken(system: DesignSystem, name: string, value: string | null): DesignSystem {
  if (value === null) return { ...system, tokens: system.tokens.filter((token) => token.name !== name) };
  const at = system.tokens.findIndex((token) => token.name === name);
  const tokens = [...system.tokens];
  if (at >= 0) tokens[at] = { name, value };
  else tokens.push({ name, value });
  return { ...system, tokens };
}

/** Resolve an exact `var(--token)` chain to its concrete value, for chrome swatches and
 * previews; cycles and other CSS expressions come back unchanged. */
export function resolveValue(system: DesignSystem, value: string): string {
  let resolved = value.trim();
  const visited = new Set<string>();
  for (let depth = 0; depth < 16; depth += 1) {
    const reference = /^var\(\s*--([a-zA-Z0-9_-]+)(?:\s*,\s*(.+))?\s*\)$/.exec(resolved);
    if (!reference) return resolved;
    const [, name, fallback] = reference;
    if (visited.has(name)) return resolved;
    visited.add(name);
    const next = tokenValue(system, name);
    if (!next) return fallback?.trim() ?? resolved;
    resolved = next.trim();
  }
  return resolved;
}

/** Tokens `<prefix><key>` in order, `--` modifiers and longer namespaces left out. */
export function scale(system: DesignSystem, prefix: string, exclude: readonly string[] = []): { key: string; value: string }[] {
  return system.tokens
    .filter((token) => token.name.startsWith(prefix) && !token.name.includes("--") && !exclude.some((other) => token.name.startsWith(other)))
    .map((token) => ({ key: token.name.slice(prefix.length), value: token.value }));
}

export const titleCase = (key: string) =>
  key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** A CSS length in px, when it is one (px, rem, em at 16px). */
export function cssLengthPx(value: string): number | null {
  const match = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return match[2] === "rem" || match[2] === "em" ? number * 16 : number;
}

// ── colors: the vocabulary ──────────────────────────────────────────────

/** The semantic roles, the starter's while a document declares none. */
export const semanticRoles = (system: DesignSystem): ColorRole[] => (system.roles.length ? system.roles : SEMANTIC_COLOR_ROLES).map((role) => ({ ...role }));

export const colorContexts = (system: DesignSystem): ColorContext[] => (system.contexts.length ? system.contexts : DEFAULT_COLOR_CONTEXTS).map((context) => ({ ...context }));

/** The token a role takes in a context. */
export const roleToken = (context: string, role: string) => (context === "default" ? `color-${role}` : `color-${context}-${role}`);

/** The reusable author-facing colors: `color-palette-*`, and Tailwind colors imported
 * into the palette by name (`managedColorTokens`). Role assignments are not here. */
export function paletteTokens(system: DesignSystem): Token[] {
  const managed = new Set(system.managedColorTokens);
  const semantic = new Set<string>();
  for (const context of colorContexts(system)) {
    for (const role of semanticRoles(system)) semantic.add(roleToken(context.key, role.key));
  }
  return system.tokens.filter((token) => token.name.startsWith("color-palette-") || (managed.has(token.name) && token.name.startsWith("color-") && !semantic.has(token.name)));
}

/** Roles holding a literal that is one of the palette's colors point at it instead, so
 * palette edits and the removal guard see the dependency. */
export function linkSemanticColorsToPalette(system: DesignSystem): DesignSystem {
  const palette = new Map<string, string>();
  for (const token of system.tokens) {
    if (!token.name.startsWith("color-palette-")) continue;
    const key = token.value.trim().toLowerCase();
    if (!palette.has(key)) palette.set(key, token.name);
  }
  if (!palette.size) return system;
  const names = new Set(colorContexts(system).flatMap((context) => semanticRoles(system).map((role) => roleToken(context.key, role.key))));
  const tokens = system.tokens.map((token) => {
    if (!names.has(token.name) || token.value.trim().startsWith("var(")) return token;
    const target = palette.get(token.value.trim().toLowerCase());
    return target ? { ...token, value: `var(--${target})` } : token;
  });
  return { ...system, tokens };
}

// ── fonts: the vocabulary ───────────────────────────────────────────────

/** Whether a token names a font family (`font-sans`), not a weight or a modifier. */
export const isFontFamilyToken = (name: string) => name.startsWith("font-") && !name.startsWith("font-weight-") && !name.includes("--");

const FONT_ROLE_REFERENCE = /^var\(--(font-[a-zA-Z0-9_-]+)\)$/;

/** A family token whose value references another family token is a role. */
export const isFontRoleToken = (token: Token) => isFontFamilyToken(token.name) && FONT_ROLE_REFERENCE.test(token.value.trim());

export type FontRole = { token: string; key: string; label: string; target: string };

export function fontRoles(system: DesignSystem): FontRole[] {
  return system.tokens.filter(isFontRoleToken).map((token) => {
    const key = token.name.slice("font-".length);
    return { token: token.name, key, label: titleCase(key), target: FONT_ROLE_REFERENCE.exec(token.value.trim())![1] };
  });
}

/** The family tokens that are not roles: the font library. */
export const fontFamilyTokens = (system: DesignSystem) => {
  const roles = new Set(fontRoles(system).map((role) => role.token));
  return system.tokens.filter((token) => isFontFamilyToken(token.name) && !roles.has(token.name));
};

/** The leading family of a CSS font stack, unquoted. */
export const firstFamily = (stack: string) =>
  stack
    .split(",")[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, "") ?? "";

export const FONT_WEIGHT_NAMES: Record<number, string> = {
  100: Publr.t("Thin"),
  200: Publr.t("Extra Light"),
  300: Publr.t("Light"),
  400: Publr.t("Regular"),
  500: Publr.t("Medium"),
  600: Publr.t("Semibold"),
  700: Publr.t("Bold"),
  800: Publr.t("Extra Bold"),
  900: Publr.t("Black"),
};
export const FONT_WEIGHT_STOPS = Object.keys(FONT_WEIGHT_NAMES).map(Number);

/** The `font-family` stack a definition's token holds. */
export function fontStack(font: Pick<FontDefinition, "family" | "fallback">): string {
  const name = /[^a-z0-9-]/i.test(font.family) ? `"${font.family}"` : font.family;
  return `${name}, ${font.fallback}`;
}

/** The css2 URL that serves a Google family's chosen faces. */
export function googleFontStylesheetUrl(font: Pick<GoogleFont, "family" | "weights" | "italic">): string {
  const encoded = encodeURIComponent(font.family.trim()).replace(/%20/g, "+");
  const weights = [...new Set(font.weights)].sort((a, b) => a - b);
  const spec = font.italic ? `ital,wght@${[0, 1].flatMap((ital) => weights.map((weight) => `${ital},${weight}`)).join(";")}` : `wght@${weights.join(";")}`;
  return `https://fonts.googleapis.com/css2?family=${encoded}:${spec}&display=swap`;
}

const faceWeight = (weight: FontFace["weight"]) => (Array.isArray(weight) ? `${weight[0]} ${weight[1]}` : String(weight));

/** The CSS one definition contributes to a stylesheet. */
export function fontCss(font: FontDefinition): string {
  if (font.provider === "system") return "";
  if (font.provider === "google") return `@import url("${googleFontStylesheetUrl(font)}");`;
  return font.faces
    .map((face) => `@font-face {\n  font-family: "${font.family}";\n  font-weight: ${faceWeight(face.weight)};\n  font-style: ${face.italic ? "italic" : "normal"};\n  font-display: swap;\n  src: url("${face.src}");\n}`)
    .join("\n");
}

export const fontsCss = (system: DesignSystem) => system.fonts.map(fontCss).filter(Boolean).join("\n");

/** Stylesheets a document loads for the system's web fonts: a URL per Google family, a
 * `data:` stylesheet per hosted one. */
export function fontStylesheets(system: DesignSystem): string[] {
  return system.fonts.flatMap((font) => {
    if (font.provider === "google") return [googleFontStylesheetUrl(font)];
    if (font.provider === "files" && font.faces.length) return [`data:text/css;charset=utf-8,${encodeURIComponent(fontCss(font))}`];
    return [];
  });
}

/** Keep a document's `<head>` holding exactly the system's web fonts. */
export function syncFontStylesheets(doc: Document, system: DesignSystem): void {
  const wanted = new Set(fontStylesheets(system));
  for (const link of doc.head.querySelectorAll<HTMLLinkElement>("link[data-design-font]")) {
    if (wanted.has(link.href) || wanted.has(link.getAttribute("href") ?? "")) wanted.delete(link.getAttribute("href") ?? "");
    else link.remove();
  }
  for (const href of wanted) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-design-font", "");
    doc.head.append(link);
  }
}
