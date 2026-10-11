// The token library: the palette as color families, then every reusable scale (sizes,
// weights, spacing, radii, line heights, letter spacings) as a grid of value cells with
// an add row. The color family editor and Import / export live here too.
import { Publr } from "publr-jsx";
import { colorFamilies } from "../model/colors";
import { cssLengthPx, scale, tokenValue } from "../model/system";
import type { DesignSystem } from "../model/system";
import { themeToCssText } from "../model/transfer";
import type { BuilderProps, State } from "../state";

export type SampleKind = "size" | "weight" | "spacing" | "radius" | "leading" | "tracking";

export type TokenRow = { name: string; key: string; value: string; sample: string };

export type TokenSection = { ns: string; label: string; kind: SampleKind; rows: TokenRow[] };

export type FamilyRow = { id: string; label: string; detail: string; swatches: { label: string; value: string }[]; note: string };

export type ShadeDraft = { index: number; originalName: string; key: string; value: string };

export const initial = () => ({
  tokenSections: [] as TokenSection[],
  familyRows: [] as FamilyRow[],
  /** The add row of each section, by namespace: what is typed so far. */
  tokenDrafts: {} as Record<string, { name: string; value: string }>,
  familyOpen: false,
  /** The family being edited; "" for a new one. */
  familyId: "",
  familyNamespace: "color-palette" as "color" | "color-palette",
  familyName: "",
  familyOriginalNames: [] as string[],
  familyShades: [] as ShadeDraft[],
  familyMainValue: "#000000",
  familyError: "",
  exportCss: "",
  importText: "",
  importError: "",
  importStatus: "",
});

const sizeSample = (value: string) => `${Math.max(11, Math.min(32, (cssLengthPx(value) ?? 16) * 0.55))}px`;

export function tokenSections(system: DesignSystem): TokenSection[] {
  const rows = (prefix: string, exclude: string[] = [], sample = (value: string) => value) =>
    scale(system, prefix, exclude).map((option) => ({ name: `${prefix}${option.key}`, key: option.key, value: option.value, sample: sample(option.value) }));
  return [
    { ns: "text", label: Publr.t("Font sizes"), kind: "size", rows: rows("text-", ["text-shadow-"], sizeSample) },
    { ns: "font-weight", label: Publr.t("Font weights"), kind: "weight", rows: rows("font-weight-") },
    { ns: "spacing", label: Publr.t("Spacing"), kind: "spacing", rows: [{ name: "spacing", key: "base", value: tokenValue(system, "spacing") ?? "0.25rem", sample: tokenValue(system, "spacing") ?? "0.25rem" }, ...rows("spacing-")] },
    { ns: "radius", label: Publr.t("Radii"), kind: "radius", rows: rows("radius-") },
    { ns: "leading", label: Publr.t("Line heights"), kind: "leading", rows: rows("leading-") },
    { ns: "tracking", label: Publr.t("Letter spacings"), kind: "tracking", rows: rows("tracking-") },
  ];
}

export function view(system: DesignSystem, state: State, _props: BuilderProps): Partial<State> {
  void state;
  return {
    tokenSections: tokenSections(system),
    familyRows: colorFamilies(system).map((family) => ({
      id: family.id,
      label: family.label,
      detail: family.sourceLabel,
      swatches: family.shades.map((shade) => ({ label: shade.label, value: shade.value })),
      note: family.isRamp ? "" : family.mainValue,
    })),
    exportCss: themeToCssText(system),
  };
}
