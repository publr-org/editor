// The color palette as families: `color-palette-sage`, `color-palette-sage-100`,
// `color-palette-sage-soft` are one family (a base and its shades); an imported Tailwind
// ramp (`color-red-500`) another. The color family editor works on one family at a time
// and can generate a 50–950 scale from its base in OKLCH.
import { Publr } from "publr-jsx";
import { paletteTokens, titleCase } from "./system";
import type { DesignSystem, Token } from "./system";

export type ColorNamespace = "color" | "color-palette";

export type ColorShade = { index: number; name: string; key: string; label: string; value: string };

export type ColorFamily = {
  /** `color-palette:sage` */
  id: string;
  key: string;
  label: string;
  namespace: ColorNamespace;
  /** "Theme" for the palette's own, "Tailwind" for an imported ramp. */
  sourceLabel: string;
  isRamp: boolean;
  shades: ColorShade[];
  mainLabel: string;
  mainValue: string;
};

/** Base first, then numeric shades in order, then named variants. */
export function sortShades<T extends { key: string }>(shades: readonly T[]): T[] {
  return [...shades].sort((a, b) => {
    if (!a.key) return -1;
    if (!b.key) return 1;
    const left = Number(a.key);
    const right = Number(b.key);
    if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
    if (Number.isFinite(left)) return -1;
    if (Number.isFinite(right)) return 1;
    return a.key.localeCompare(b.key);
  });
}

/** The shade a family is shown by: the base, else 500, else the middle one. */
export function mainShade<T extends { key: string }>(shades: readonly T[]): T | undefined {
  return shades.find((shade) => !shade.key) ?? shades.find((shade) => shade.key === "500") ?? shades[Math.floor(shades.length / 2)];
}

export function colorFamilies(system: DesignSystem): ColorFamily[] {
  const parsed = paletteTokens(system).map((token) => {
    const namespace: ColorNamespace = token.name.startsWith("color-palette-") ? "color-palette" : "color";
    return { token, namespace, key: token.name.slice(`${namespace}-`.length) };
  });
  const keysByNamespace = new Map<ColorNamespace, Set<string>>();
  for (const color of parsed) {
    const keys = keysByNamespace.get(color.namespace) ?? new Set<string>();
    keys.add(color.key);
    keysByNamespace.set(color.namespace, keys);
  }
  const colors = parsed.map((color) => {
    const numeric = /^(.*)-(\d+)$/.exec(color.key);
    if (numeric) return { ...color, base: numeric[1], shade: numeric[2] };
    const keys = keysByNamespace.get(color.namespace) ?? new Set<string>();
    const parent = [...keys].filter((candidate) => candidate !== color.key && color.key.startsWith(`${candidate}-`)).sort((a, b) => b.length - a.length)[0];
    return parent ? { ...color, base: parent, shade: color.key.slice(parent.length + 1) } : { ...color, base: color.key, shade: "" };
  });
  const bases = new Set(colors.map((color) => `${color.namespace}:${color.base}`));
  const groups = new Map<string, typeof colors>();
  for (const color of colors) {
    const familyId = `${color.namespace}:${color.base}`;
    const id = color.shade || bases.has(`${color.namespace}:${color.key}`) ? familyId : `${color.namespace}:${color.key}`;
    groups.set(id, [...(groups.get(id) ?? []), color]);
  }
  return [...groups].map(([id, group]) => {
    const first = group[0];
    const shades = sortShades(group.map(({ token, shade }) => ({ index: 0, name: token.name, key: shade, label: shade || "Base", value: token.value }))).map((shade, index) => ({ ...shade, index }));
    const main = mainShade(shades);
    return {
      id,
      key: first.base,
      label: titleCase(first.base),
      namespace: first.namespace,
      sourceLabel: first.namespace === "color" ? "Tailwind" : Publr.t("Theme"),
      isRamp: shades.length > 1,
      shades,
      mainLabel: main?.label ?? Publr.t("Base"),
      mainValue: main?.value ?? "#000000",
    };
  });
}

// ── OKLCH ───────────────────────────────────────────────────────────────

type Oklch = { l: number; c: number; h: number };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function srgbToOklch(red: number, green: number, blue: number): Oklch {
  const linear = (channel: number) => {
    const value = clamp(channel);
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(red);
  const g = linear(green);
  const b = linear(blue);
  const lRoot = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mRoot = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sRoot = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const greenRed = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const yellowBlue = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const hue = (Math.atan2(yellowBlue, greenRed) * 180) / Math.PI;
  return { l: clamp(lightness), c: Math.max(0, Math.hypot(greenRed, yellowBlue)), h: (hue + 360) % 360 };
}

function hslToRgb(hue: number, saturation: number, lightness: number): readonly [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation);
  const l = clamp(lightness);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = h / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1 ? [chroma, x, 0] : segment < 2 ? [x, chroma, 0] : segment < 3 ? [0, chroma, x] : segment < 4 ? [0, x, chroma] : segment < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const match = l - chroma / 2;
  return [red + match, green + match, blue + match];
}

/** Reads hex, rgb(), hsl() and oklch(); other CSS colors through the browser. */
export function parseColorToOklch(value: string, browser = true): Oklch | null {
  const color = value.trim().toLowerCase();
  const oklch = /^oklch\(\s*([+-]?(?:\d*\.)?\d+)(%)?\s+([+-]?(?:\d*\.)?\d+)(%)?\s+([+-]?(?:\d*\.)?\d+)/.exec(color);
  if (oklch) return { l: clamp(Number(oklch[1]) / (oklch[2] ? 100 : 1)), c: Math.max(0, Number(oklch[3]) / (oklch[4] ? 100 : 1)), h: ((Number(oklch[5]) % 360) + 360) % 360 };
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(color);
  if (hex) {
    const raw = hex[1].length <= 4 ? hex[1].slice(0, 3).split("").map((part) => part + part).join("") : hex[1].slice(0, 6);
    return srgbToOklch(parseInt(raw.slice(0, 2), 16) / 255, parseInt(raw.slice(2, 4), 16) / 255, parseInt(raw.slice(4, 6), 16) / 255);
  }
  const rgb = /^rgba?\((.+)\)$/.exec(color);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const channel = (part: string) => clamp(parseFloat(part) / (part.endsWith("%") ? 100 : 255));
      return srgbToOklch(channel(parts[0]), channel(parts[1]), channel(parts[2]));
    }
  }
  const hsl = /^hsla?\((.+)\)$/.exec(color);
  if (hsl) {
    const parts = hsl[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) return srgbToOklch(...hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100));
  }
  if (browser && typeof document !== "undefined") {
    const probe = document.createElement("span");
    probe.style.color = color;
    if (!probe.style.color) return null;
    probe.style.position = "fixed";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    if (resolved && resolved.toLowerCase() !== color) return parseColorToOklch(resolved, false);
  }
  return null;
}

const SCALE_STEPS: { key: string; towardWhite?: number; towardBlack?: number; chroma: number }[] = [
  { key: "50", towardWhite: 0.9, chroma: 0.12 },
  { key: "100", towardWhite: 0.78, chroma: 0.25 },
  { key: "200", towardWhite: 0.62, chroma: 0.48 },
  { key: "300", towardWhite: 0.44, chroma: 0.7 },
  { key: "400", towardWhite: 0.22, chroma: 0.88 },
  { key: "500", towardWhite: 0, chroma: 1 },
  { key: "600", towardBlack: 0.12, chroma: 0.98 },
  { key: "700", towardBlack: 0.28, chroma: 0.9 },
  { key: "800", towardBlack: 0.44, chroma: 0.78 },
  { key: "900", towardBlack: 0.58, chroma: 0.65 },
  { key: "950", towardBlack: 0.76, chroma: 0.45 },
];

/** A 50–950 scale around a color (it becomes the 500); null when it cannot be read. */
export function generatedColorScale(value: string): { key: string; value: string }[] | null {
  const base = parseColorToOklch(value);
  if (!base) return null;
  return SCALE_STEPS.map((step) => {
    if (step.key === "500") return { key: step.key, value };
    const lightness = step.towardBlack !== undefined ? base.l * (1 - step.towardBlack) : base.l + (1 - base.l) * (step.towardWhite ?? 0);
    return { key: step.key, value: `oklch(${(clamp(lightness) * 100).toFixed(1)}% ${(base.c * step.chroma).toFixed(3)} ${base.h.toFixed(1)})` };
  });
}

/** The tokens a family's shades become: `color-palette-ocean`, `color-palette-ocean-100`. */
export function familyTokens(namespace: ColorNamespace, name: string, shades: readonly { key: string; value: string }[]): Token[] {
  return shades.map((shade) => ({ name: `${namespace}-${name}${shade.key ? `-${shade.key}` : ""}`, value: shade.value }));
}
