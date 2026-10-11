// The font library as edits to the document: a family is a `font-*` token plus, for a
// web font, its definition (Google weights, uploaded faces, or a device family's
// offered weights). Token and definition always change together.
import { Publr } from "publr-jsx";
import { FONT_WEIGHT_NAMES, FONT_WEIGHT_STOPS, firstFamily, fontFamilyTokens, isFontRoleToken, setToken } from "./system";
import type { DesignSystem, FontDefinition, FontFace, Token } from "./system";

/** The Modern Font Stacks (modernfontstacks.com), copied verbatim. Labels double as
 * the token names (`font-old-style`). */
export const SYSTEM_FONT_PRESETS: readonly { key: string; label: string; stack: string }[] = [
  { key: "system-ui", label: "System UI", stack: "system-ui, sans-serif" },
  { key: "transitional", label: "Transitional", stack: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif" },
  { key: "old-style", label: "Old Style", stack: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif" },
  { key: "humanist", label: "Humanist", stack: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif" },
  { key: "geometric-humanist", label: "Geometric Humanist", stack: "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif" },
  { key: "classical-humanist", label: "Classical Humanist", stack: "Optima, Candara, 'Noto Sans', source-sans-pro, sans-serif" },
  { key: "neo-grotesque", label: "Neo-Grotesque", stack: "Inter, Roboto, 'Helvetica Neue', 'Arial Nova', 'Nimbus Sans', Arial, sans-serif" },
  { key: "monospace-slab-serif", label: "Monospace Slab Serif", stack: "'Nimbus Mono PS', 'Courier New', monospace" },
  { key: "monospace-code", label: "Monospace Code", stack: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace" },
  { key: "industrial", label: "Industrial", stack: "Bahnschrift, 'DIN Alternate', 'Franklin Gothic Medium', 'Nimbus Sans Narrow', sans-serif-condensed, sans-serif" },
  { key: "rounded-sans", label: "Rounded Sans", stack: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', 'Arial Rounded MT Bold', Calibri, source-sans-pro, sans-serif" },
  { key: "slab-serif", label: "Slab Serif", stack: "Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', 'Sitka Small', serif" },
  { key: "antique", label: "Antique", stack: "Superclarendon, 'Bookman Old Style', 'URW Bookman', 'URW Bookman L', 'Georgia Pro', Georgia, serif" },
  { key: "didone", label: "Didone", stack: "Didot, 'Bodoni MT', 'Noto Serif Display', 'URW Palladio L', P052, Sylfaen, serif" },
  { key: "handwritten", label: "Handwritten", stack: "'Segoe Print', 'Bradley Hand', Chilanka, TSCu_Comic, casual, cursive" },
];

/** The upload form's weight menu: variable, or one of the nine stops. */
export const FONT_WEIGHT_CHOICES: readonly { key: string; label: string }[] = [
  { key: "variable", label: Publr.t("Variable (all weights)") },
  ...Object.entries(FONT_WEIGHT_NAMES).map(([weight, label]) => ({ key: weight, label: `${label} ${weight}` })),
];

export const parseFaceWeight = (value: string): FontFace["weight"] => (value === "variable" ? [100, 900] : Number(value) || 400);

export const faceLabel = (weight: FontFace["weight"]) => (Array.isArray(weight) ? Publr.t("Variable {from}–{to}", { from: weight[0], to: weight[1] }) : `${FONT_WEIGHT_NAMES[weight] ?? Publr.t("Weight")} ${weight}`);

/** `font-<slug>` from a display name ("Söhne Breit" → `font-sohne-breit`). */
export function fontTokenName(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `font-${slug}` : "";
}

/** The library family a token's label reads as: its definition's family, a preset's
 * name, its stack's first family, or the token key. */
export function familyLabel(system: DesignSystem, token: Token): string {
  const definition = system.fonts.find((font) => font.token === token.name);
  if (definition) return definition.family;
  const preset = SYSTEM_FONT_PRESETS.find((candidate) => fontTokenName(candidate.label) === token.name);
  if (preset) return preset.label;
  const family = firstFamily(token.value);
  if (family && !/^(?:ui-|system-ui$)/.test(family)) return family;
  return token.name
    .slice("font-".length)
    .split("-")
    .map((part) => (part[0]?.toUpperCase() ?? "") + part.slice(1))
    .join(" ");
}

/** Token and definitions committed together: no definition outlives its token. */
function withFonts(system: DesignSystem, tokens: Token[], fonts: FontDefinition[]): DesignSystem {
  const names = new Set(tokens.map((token) => token.name));
  return { ...system, tokens, fonts: fonts.filter((font) => names.has(font.token)) };
}

/** Add or replace one family. An error when the name belongs to a font role. */
export function putFont(system: DesignSystem, name: string, value: string, definition: FontDefinition | null): DesignSystem | string {
  const existing = system.tokens.find((token) => token.name === name);
  if (existing && isFontRoleToken(existing)) return `“${name.slice("font-".length)}” is a font role name.`;
  const next = setToken(system, name, value);
  return withFonts(next, next.tokens, [...system.fonts.filter((font) => font.token !== name), ...(definition ? [definition] : [])]);
}

/** One definition updated in place. A token without one is a device family offering
 * every weight; its first narrowing writes that policy down. */
export function updateFont(system: DesignSystem, name: string, update: (font: FontDefinition) => FontDefinition): DesignSystem {
  const token = system.tokens.find((item) => item.name === name);
  if (!token) return system;
  const current: FontDefinition = system.fonts.find((font) => font.token === name) ?? {
    token: name,
    family: firstFamily(token.value),
    fallback: "sans-serif",
    provider: "system",
    weights: [...FONT_WEIGHT_STOPS],
    italic: true,
  };
  const next = update(current);
  const fonts = system.fonts.some((font) => font.token === name) ? system.fonts.map((font) => (font.token === name ? next : font)) : [...system.fonts, next];
  return withFonts(system, system.tokens, fonts);
}

/** `var(--from)` references rewritten to `var(--to)` in every token value. */
export const retargetReferences = (tokens: Token[], from: string, to: string): Token[] =>
  tokens.map((token) => ({ ...token, value: token.value.replace(new RegExp(`var\\(--${from}(?=[,)\\s])`, "g"), `var(--${to}`) }));

/** Rename a family: its token, every reference to it and its definition move. */
export function renameFont(system: DesignSystem, previous: string, label: string): DesignSystem | string {
  const name = fontTokenName(label);
  if (!system.tokens.some((token) => token.name === previous)) return system;
  if (!name) return Publr.t("Give the family a name.");
  if (name !== previous) {
    const clash = system.tokens.find((token) => token.name === name);
    if (clash) return isFontRoleToken(clash) ? Publr.t("“{name}” is a font role name.", { name: label }) : Publr.t("A family named “{name}” already exists.", { name: label });
  }
  const tokens = retargetReferences(system.tokens, previous, name).map((token) => (token.name === previous ? { name, value: token.value } : token));
  // A web font keeps its real family name; a device family's name is only its label.
  const fonts = system.fonts.map((font) => (font.token === previous ? { ...font, token: name, family: font.provider === "system" ? label : font.family } : font));
  return withFonts(system, tokens, fonts);
}

/** The family that takes over a removed one's references: the first other family. */
export function fontFallbackFor(system: DesignSystem, name: string): string | null {
  const families = fontFamilyTokens(system);
  if (!families.some((token) => token.name === name) || families.length < 2) return null;
  return families.find((token) => token.name !== name)!.name;
}

/** Remove a family, pointing whatever used it at `replacement`. */
export function removeFont(system: DesignSystem, name: string, replacement: string): DesignSystem {
  const tokens = retargetReferences(system.tokens, name, replacement).filter((token) => token.name !== name);
  return withFonts(system, tokens, system.fonts.filter((font) => font.token !== name));
}

/** Retarget a font role at another family. */
export function setFontRole(system: DesignSystem, role: string, target: string): DesignSystem {
  if (!system.tokens.some((token) => token.name === role) || !system.tokens.some((token) => token.name === target)) return system;
  return { ...system, tokens: system.tokens.map((token) => (token.name === role ? { ...token, value: `var(--${target})` } : token)) };
}

export function toggleWeight(font: FontDefinition, weight: number): FontDefinition {
  if (font.provider === "files") return font;
  if (font.provider === "google" && !font.availableWeights.includes(weight)) return font;
  const weights = font.weights.includes(weight) ? font.weights.filter((item) => item !== weight) : [...font.weights, weight].sort((a, b) => a - b);
  return weights.length ? { ...font, weights } : font;
}
