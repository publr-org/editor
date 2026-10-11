// Style controls as lenses over a block's authored class list, never a parallel store
// (docs/WIRE-CONTRACT.md, "Authored classes"). A lens owns one property: a class prefix
// plus the values it accepts from the theme's scale, so `text-lg`, `text-brand` and
// `text-center` belong to three different lenses. A write replaces the lens's own
// classes in place and leaves every other class alone; every lens also takes an
// arbitrary value (`text-[13px]`, `bg-[#ff0000]`). Classes with a variant the lens is
// not reading (`hover:`), or a modifier (`bg-white/5`), are never matched.
import type { Theme } from "./theme";

/** A lens's value: a theme key, an arbitrary CSS value, or a fixed option's class. */
export type LensValue = { key: string } | { custom: string } | null;

export type Option = { key: string; label: string; value?: string; icon?: string };

/** The responsive prefix a write targets: "" (all sizes), "md:", "lg:". */
export type Variant = "" | "md:" | "lg:";

const split = (classes: string) => classes.split(/\s+/).filter(Boolean);

/** A class as variant + utility, or null for anything carrying a modifier or another variant shape. */
function parse(name: string): { variant: string; utility: string } | null {
  const at = name.lastIndexOf(":");
  const variant = at >= 0 && !name.slice(0, at).includes("[") ? name.slice(0, at + 1) : "";
  const utility = variant ? name.slice(variant.length) : name;
  if (!utility.includes("[") && utility.includes("/") && !/^(?:w|h|basis|inset|top|left|right|bottom|translate-[xy])-\d+\/\d+$/.test(utility)) return null;
  return { variant, utility };
}

const isLength = (value: string) => /^-?[\d.]+(px|rem|em|%|vw|vh|ch|ex|lh|rlh|svh|dvh|vmin|vmax)?$/.test(value) || /^(calc|clamp|min|max|var)\(/.test(value);
const isColor = (value: string) => /^(#|rgb|hsl|oklch|oklab|lab|lch|color\(|var\(--color)/.test(value) || /^(transparent|currentColor|white|black)$/.test(value);

const arbitrary = (utility: string, prefix: string) => {
  const head = `${prefix}-[`;
  return utility.startsWith(head) && utility.endsWith("]") ? utility.slice(head.length, -1).replace(/_/g, " ") : null;
};

const encode = (value: string) => value.trim().replace(/\s+/g, "_");

/** A lens: one style property over the class list. */
export type Lens = {
  id: string;
  label: string;
  /** The scale the control offers. */
  options(theme: Theme): Option[];
  /** Which value a utility (no variant) carries for this lens, or null when it is not this lens's. */
  match(utility: string, theme: Theme): LensValue;
  /** The utility for a value (no variant). */
  utility(value: Exclude<LensValue, null>): string;
};

/** A lens over `<prefix>-<key>` with keys from a theme scale and arbitrary values the predicate accepts. */
function tokenLens(id: string, label: string, prefix: string, scale: (theme: Theme) => Option[], accepts: (value: string) => boolean, fixed: readonly string[] = []): Lens {
  return {
    id,
    label,
    options: (theme) => scale(theme),
    match(utility, theme) {
      const custom = arbitrary(utility, prefix);
      if (custom !== null) return accepts(custom) ? { custom } : null;
      if (!utility.startsWith(`${prefix}-`)) return null;
      const key = utility.slice(prefix.length + 1);
      if (fixed.includes(key) || scale(theme).some((option) => option.key === key)) return { key };
      return null;
    },
    utility(value) {
      return "key" in value ? `${prefix}-${value.key}` : `${prefix}-[${encode(value.custom)}]`;
    },
  };
}

/** A lens over a fixed set of classes (underline / line-through, uppercase / capitalize). */
function choiceLens(id: string, label: string, options: Option[]): Lens {
  return {
    id,
    label,
    options: () => options,
    match(utility) {
      return options.some((option) => option.key === utility) ? { key: utility } : null;
    },
    utility(value) {
      return "key" in value ? value.key : value.custom;
    },
  };
}

const scaleOf = (entries: { key: string; label: string; value: string }[]): Option[] => entries.map(({ key, label, value }) => ({ key, label, value }));

/** Fixed steps for dimensions (v4 spacing multipliers, not theme tokens), as the old inspector offered. */
export const DIMENSION_STEPS: readonly string[] = ["0", "1", "2", "4", "6", "8", "12", "16"];

const fixedOptions = (keys: readonly string[]): Option[] => keys.map((key) => ({ key, label: key }));

/** A lens over a fixed key list (`w-4`, `basis-1/2`) plus arbitrary lengths. */
const dimensionLens = (id: string, label: string, prefix: string, extra: readonly string[] = []) =>
  tokenLens(id, label, prefix, () => fixedOptions(DIMENSION_STEPS), isLength, [...DIMENSION_STEPS, ...extra]);

const spacingScale = (theme: Theme) => scaleOf(theme.spacing);

export const FONT_WEIGHTS: readonly Option[] = [
  { key: "font-thin", label: "Thin" },
  { key: "font-extralight", label: "Extra Light" },
  { key: "font-light", label: "Light" },
  { key: "font-normal", label: "Regular" },
  { key: "font-medium", label: "Medium" },
  { key: "font-semibold", label: "Semibold" },
  { key: "font-bold", label: "Bold" },
  { key: "font-extrabold", label: "Extra Bold" },
  { key: "font-black", label: "Black" },
];

export const LENSES: Record<string, Lens> = {
  fontSize: tokenLens("fontSize", "Font size", "text", (theme) => scaleOf(theme.fontSizes), isLength),
  lineHeight: tokenLens("lineHeight", "Line height", "leading", (theme) => scaleOf(theme.lineHeights), isLength),
  letterSpacing: tokenLens("letterSpacing", "Letter spacing", "tracking", (theme) => scaleOf(theme.letterSpacings), isLength),
  fontFamily: tokenLens("fontFamily", "Font family", "font", (theme) => scaleOf(theme.fonts), (value) => !isLength(value)),
  decoration: choiceLens("decoration", "Decoration", [
    { key: "underline", label: "U" },
    { key: "line-through", label: "S" },
  ]),
  letterCase: choiceLens("letterCase", "Letter case", [
    { key: "uppercase", label: "AB" },
    { key: "lowercase", label: "ab" },
    { key: "capitalize", label: "Ab" },
  ]),
  textAlign: choiceLens("textAlign", "Text alignment", [
    { key: "text-left", label: "Left" },
    { key: "text-center", label: "Center" },
    { key: "text-right", label: "Right" },
    { key: "text-justify", label: "Justify" },
  ]),
  fontWeight: choiceLens("fontWeight", "Font weight", FONT_WEIGHTS as Option[]),
  fontStyle: choiceLens("fontStyle", "Font style", [
    { key: "not-italic", label: "Regular" },
    { key: "italic", label: "Italic" },
  ]),
  textColor: tokenLens("textColor", "Text", "text", (theme) => scaleOf(theme.colors), isColor),
  background: tokenLens("background", "Background", "bg", (theme) => scaleOf(theme.colors), isColor),
  borderColor: tokenLens("borderColor", "Color", "border", (theme) => scaleOf(theme.colors), isColor),
  borderStyle: choiceLens("borderStyle", "Border style", [
    { key: "border-solid", label: "Solid" },
    { key: "border-dashed", label: "Dashed" },
    { key: "border-dotted", label: "Dotted" },
    { key: "border-double", label: "Double" },
    { key: "border-none", label: "None" },
  ]),
  width: dimensionLens("width", "Width", "w", ["full", "auto", "fit"]),
  height: dimensionLens("height", "Height", "h", ["full", "auto", "screen"]),
  minHeight: dimensionLens("minHeight", "Minimum height", "min-h", ["screen", "full", "dvh", "svh"]),
  minWidth: dimensionLens("minWidth", "Minimum width", "min-w", ["full"]),
  maxWidth: dimensionLens("maxWidth", "Maximum width", "max-w", ["full", "none"]),
  flexBasis: dimensionLens("flexBasis", "Flex basis", "basis", ["auto", "full"]),
  aspectRatio: choiceLens("aspectRatio", "Aspect ratio", [
    { key: "aspect-auto", label: "auto" },
    { key: "aspect-square", label: "square" },
    { key: "aspect-video", label: "video" },
  ]),
  gap: tokenLens("gap", "Gap", "gap", spacingScale, isLength),
  rowGap: tokenLens("rowGap", "Row gap", "gap-y", spacingScale, isLength),
  columnGap: tokenLens("columnGap", "Column gap", "gap-x", spacingScale, isLength),
  justifyContent: choiceLens("justifyContent", "Justification", [
    { key: "justify-start", label: "Start", icon: "justify-start" },
    { key: "justify-center", label: "Center", icon: "justify-center" },
    { key: "justify-end", label: "End", icon: "justify-end" },
    { key: "justify-between", label: "Between", icon: "justify-between" },
    { key: "justify-around", label: "Around", icon: "justify-around" },
    { key: "justify-evenly", label: "Evenly", icon: "justify-evenly" },
  ]),
  alignItems: choiceLens("alignItems", "Items alignment", [
    { key: "items-start", label: "Start", icon: "align-start" },
    { key: "items-center", label: "Center", icon: "align-center" },
    { key: "items-end", label: "End", icon: "align-end" },
    { key: "items-stretch", label: "Stretch", icon: "align-stretch" },
    { key: "items-baseline", label: "Baseline", icon: "align-baseline" },
  ]),
  flexWrap: choiceLens("flexWrap", "Wrapping", [
    { key: "flex-nowrap", label: "No wrap", icon: "wrap-none" },
    { key: "flex-wrap", label: "Wrap", icon: "wrap" },
    { key: "flex-wrap-reverse", label: "Reverse", icon: "wrap-reverse" },
  ]),
};

/** The lens's value in a class list, for a variant (later classes win, as in CSS). */
export function readLens(classes: string, lens: Lens, theme: Theme, variant: Variant = ""): LensValue {
  let found: LensValue = null;
  for (const name of split(classes)) {
    const parsed = parse(name);
    if (!parsed || parsed.variant !== variant) continue;
    const value = lens.match(parsed.utility, theme);
    if (value) found = value;
  }
  return found;
}

/** The class list with the lens's value replaced in place (appended when new; removed for null). */
export function writeLens(classes: string, lens: Lens, theme: Theme, value: LensValue, variant: Variant = ""): string {
  const list = split(classes);
  const owned = list.map((name) => {
    const parsed = parse(name);
    return !!parsed && parsed.variant === variant && lens.match(parsed.utility, theme) !== null;
  });
  const first = owned.indexOf(true);
  const kept = list.filter((_, index) => !owned[index]);
  if (value === null) return kept.join(" ");
  const next = variant + lens.utility(value);
  const at = first < 0 ? kept.length : list.slice(0, first).filter((_, index) => !owned[index]).length;
  kept.splice(at, 0, next);
  return kept.join(" ");
}

// ── sides and corners ─────────────────────────────────────────────────────

export type Side = "top" | "right" | "bottom" | "left";
export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];
export type Corner = "tl" | "tr" | "br" | "bl";
export const CORNERS: readonly Corner[] = ["tl", "tr", "br", "bl"];

/** A per-side (or per-corner) value: a key of the scale or an arbitrary value. */
export type BoxValues<K extends string> = Record<K, LensValue>;

type Box<K extends string> = {
  prefix: string;
  parts: readonly K[];
  /** The utility prefixes that set one part: `pt` for top; `px` and `p` cover several. */
  forms: readonly { prefix: string; parts: readonly K[] }[];
  accepts: (value: string, theme: Theme) => LensValue;
  join: string;
};

const spacingAccepts = (value: string, theme: Theme): LensValue => {
  if (theme.has("spacing", value) || /^(\d+(\.\d+)?|px|auto)$/.test(value)) return { key: value };
  return null;
};

function boxOf(prefix: "p" | "m"): Box<Side> {
  return {
    prefix,
    parts: SIDES,
    forms: [
      { prefix, parts: SIDES },
      { prefix: `${prefix}x`, parts: ["left", "right"] },
      { prefix: `${prefix}y`, parts: ["top", "bottom"] },
      { prefix: `${prefix}t`, parts: ["top"] },
      { prefix: `${prefix}r`, parts: ["right"] },
      { prefix: `${prefix}b`, parts: ["bottom"] },
      { prefix: `${prefix}l`, parts: ["left"] },
    ],
    accepts: spacingAccepts,
    join: "-",
  };
}

export const PADDING = boxOf("p");
export const MARGIN = boxOf("m");

/** Border widths: `border` is 1px; `border-2` and up; per side `border-t`, `border-t-2`. */
export const BORDER_WIDTH: Box<Side> = {
  prefix: "border",
  parts: SIDES,
  forms: [
    { prefix: "border", parts: SIDES },
    { prefix: "border-x", parts: ["left", "right"] },
    { prefix: "border-y", parts: ["top", "bottom"] },
    { prefix: "border-t", parts: ["top"] },
    { prefix: "border-r", parts: ["right"] },
    { prefix: "border-b", parts: ["bottom"] },
    { prefix: "border-l", parts: ["left"] },
  ],
  accepts: (value) => (/^(0|2|4|8)$/.test(value) ? { key: value } : null),
  join: "-",
};

export const RADIUS: Box<Corner> = {
  prefix: "rounded",
  parts: CORNERS,
  forms: [
    { prefix: "rounded", parts: CORNERS },
    { prefix: "rounded-t", parts: ["tl", "tr"] },
    { prefix: "rounded-r", parts: ["tr", "br"] },
    { prefix: "rounded-b", parts: ["br", "bl"] },
    { prefix: "rounded-l", parts: ["tl", "bl"] },
    { prefix: "rounded-tl", parts: ["tl"] },
    { prefix: "rounded-tr", parts: ["tr"] },
    { prefix: "rounded-br", parts: ["br"] },
    { prefix: "rounded-bl", parts: ["bl"] },
  ],
  accepts: (value, theme) => (theme.has("radius", value) || /^(none|full|sm|md|lg|xl|2xl|3xl)$/.test(value) ? { key: value } : null),
  join: "-",
};

/** Which form and value a utility is for a box, or null. Bare `border` / `rounded` are 1px / default. */
function boxMatch<K extends string>(box: Box<K>, utility: string, theme: Theme): { parts: readonly K[]; value: LensValue } | null {
  // Longest form first, so `px-4` is not read as `p` with value `x-4`.
  const forms = [...box.forms].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const form of forms) {
    if (utility === form.prefix && (box === (BORDER_WIDTH as unknown) || box === (RADIUS as unknown))) {
      return { parts: form.parts, value: { key: box === (BORDER_WIDTH as unknown) ? "1" : "DEFAULT" } };
    }
    if (!utility.startsWith(`${form.prefix}-`)) continue;
    const rest = utility.slice(form.prefix.length + 1);
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const custom = rest.slice(1, -1).replace(/_/g, " ");
      if (box === (BORDER_WIDTH as unknown) && isColor(custom)) return null;
      return { parts: form.parts, value: { custom } };
    }
    const value = box.accepts(rest, theme);
    if (value) return { parts: form.parts, value };
  }
  return null;
}

/** Each part's value from the class list (later classes win; a part form beats a shorthand only by order). */
export function readBox<K extends string>(classes: string, box: Box<K>, theme: Theme, variant: Variant = ""): BoxValues<K> {
  const values = Object.fromEntries(box.parts.map((part) => [part, null])) as BoxValues<K>;
  // Shorthands first, then the more specific forms, as the generated CSS orders them.
  const matches: { parts: readonly K[]; value: LensValue; specificity: number }[] = [];
  for (const name of split(classes)) {
    const parsed = parse(name);
    if (!parsed || parsed.variant !== variant) continue;
    const match = boxMatch(box, parsed.utility, theme);
    if (match) matches.push({ ...match, specificity: box.parts.length - match.parts.length });
  }
  matches.sort((a, b) => a.specificity - b.specificity);
  for (const match of matches) for (const part of match.parts) values[part] = match.value;
  return values;
}

const sameValue = (a: LensValue, b: LensValue) => JSON.stringify(a) === JSON.stringify(b);

/** The class list with the given parts set to `value` (null clears them), re-encoded as compactly as it reads. */
export function writeBox<K extends string>(classes: string, box: Box<K>, theme: Theme, parts: readonly K[], value: LensValue, variant: Variant = ""): string {
  const values = readBox(classes, box, theme, variant);
  for (const part of parts) values[part] = value;
  const list = split(classes);
  const first = list.findIndex((name) => {
    const parsed = parse(name);
    return !!parsed && parsed.variant === variant && boxMatch(box, parsed.utility, theme) !== null;
  });
  const kept = list.filter((name) => {
    const parsed = parse(name);
    return !(parsed && parsed.variant === variant && boxMatch(box, parsed.utility, theme) !== null);
  });

  const out: string[] = [];
  const remaining = new Set(box.parts.filter((part) => values[part] !== null));
  // Greedy: the widest form whose parts all share one value, then narrower ones.
  for (const form of box.forms) {
    if (!form.parts.every((part) => remaining.has(part))) continue;
    const shared = values[form.parts[0]];
    if (!form.parts.every((part) => sameValue(values[part], shared))) continue;
    out.push(variant + boxUtility(box, form.prefix, shared!));
    for (const part of form.parts) remaining.delete(part);
  }
  const at = first < 0 ? kept.length : Math.min(first, kept.length);
  kept.splice(at, 0, ...out);
  return kept.join(" ");
}

function boxUtility<K extends string>(box: Box<K>, prefix: string, value: Exclude<LensValue, null>): string {
  if ("custom" in value) return `${prefix}-[${encode(value.custom)}]`;
  if ((box === (BORDER_WIDTH as unknown) && value.key === "1") || (box === (RADIUS as unknown) && value.key === "DEFAULT")) return prefix;
  return `${prefix}${box.join}${value.key}`;
}

// ── variations ────────────────────────────────────────────────────────────

export type VariationSet = readonly { name: string; label: string; classes: string }[];

/** The variation whose whole class set is present, if one is. */
export function readVariation(classes: string, variations: VariationSet): string | null {
  const present = new Set(split(classes));
  return variations.find((variation) => split(variation.classes).every((name) => present.has(name)))?.name ?? null;
}

/** Swaps the variation's class set in (or with null, every variation's out). */
export function writeVariation(classes: string, variations: VariationSet, name: string | null): string {
  const owned = new Set(variations.flatMap((variation) => split(variation.classes)));
  const kept = split(classes).filter((existing) => !owned.has(existing));
  const chosen = variations.find((variation) => variation.name === name);
  return [...kept, ...(chosen ? split(chosen.classes) : [])].join(" ");
}

/** Classes no lens owns and the theme cannot resolve: for "not in your theme" chips. */
export function unknownTokens(classes: string, resolves: (name: string) => boolean): string[] {
  return split(classes).filter((name) => !resolves(name));
}
