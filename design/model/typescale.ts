// The type scale as edits to the document: named styles riding the font roles. Keys are
// slugs of a style's first name and stay put across renames.
import { Publr } from "publr-jsx";
import { resolveValue } from "./system";
import type { DesignSystem, TypeScaleEntry } from "./system";

export const TEXT_TRANSFORMS: readonly { key: TypeScaleEntry["textTransform"]; label: string }[] = [
  { key: "", label: Publr.t("None") },
  { key: "uppercase", label: Publr.t("Uppercase") },
  { key: "lowercase", label: Publr.t("Lowercase") },
  { key: "capitalize", label: Publr.t("Capitalize") },
];

export const styleKey = (label: string) =>
  label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function updateStyle(system: DesignSystem, key: string, patch: Partial<TypeScaleEntry>): DesignSystem {
  return { ...system, typeScale: system.typeScale.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)) };
}

/** A new style named `label`, or why not. */
export function addStyle(system: DesignSystem, label: string): DesignSystem | string {
  const key = styleKey(label.trim());
  if (!key) return Publr.t("Give the style a name.");
  if (system.typeScale.some((entry) => entry.key === key)) return Publr.t("A style named “{name}” already exists.", { name: label.trim() });
  const entry: TypeScaleEntry = { key, label: label.trim(), fontRole: "body", weight: 400, size: "16px", lineHeight: "", letterSpacing: "", textTransform: "", description: "" };
  return { ...system, typeScale: [...system.typeScale, entry] };
}

export const removeStyle = (system: DesignSystem, key: string): DesignSystem => ({ ...system, typeScale: system.typeScale.filter((entry) => entry.key !== key) });

/** A literal length (`93px`, `-0.02em`) as a number and unit, or null for a token key. */
export function literalLength(value: string): { value: number; unit: string } | null {
  const match = /^(-?\d*\.?\d+)(px|%|em|rem|vw|vh)$/.exec(value.trim());
  return match ? { value: Number(match[1]), unit: match[2] } : null;
}

/** A scale prop's CSS value: a literal as written, a token key through its token. */
export function scaleValue(system: DesignSystem, value: string, prefix: string): string {
  if (!value) return "";
  // A bare number is a literal too: a unitless line height (`1.16`).
  if (literalLength(value) || /^-?\d*\.?\d+$/.test(value.trim())) return value;
  const resolved = resolveValue(system, `var(--${prefix}${value})`);
  return resolved.startsWith("var(") ? "" : resolved;
}

/** The inline style a style's sample is drawn in. */
export function styleCss(system: DesignSystem, entry: TypeScaleEntry, family: string): string {
  const size = scaleValue(system, entry.size, "text-");
  const lineHeight = scaleValue(system, entry.lineHeight, "leading-");
  const letterSpacing = scaleValue(system, entry.letterSpacing, "tracking-");
  return [
    `font-family: ${family}`,
    `font-weight: ${entry.weight}`,
    size ? `font-size: ${size}` : "",
    lineHeight ? `line-height: ${lineHeight}` : "line-height: 1.15",
    letterSpacing ? `letter-spacing: ${letterSpacing}` : "",
    entry.textTransform ? `text-transform: ${entry.textTransform}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}
