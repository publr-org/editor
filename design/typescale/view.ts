// The type scale: the named styles a site is set in, each row drawn in its own style;
// an open row edits its font role, weight, transform, size, line height and spacing.
import { fontRows } from "../fonts/view";
import { FONT_WEIGHT_NAMES, FONT_WEIGHT_STOPS, fontRoles, resolveValue, scale } from "../model/system";
import type { DesignSystem } from "../model/system";
import { TEXT_TRANSFORMS, literalLength, styleCss } from "../model/typescale";
import type { BuilderProps, State } from "../state";

/** One scale prop as the named-or-arbitrary editor takes it. */
export type ScaleField = {
  /** A token key, "" for the default, or "custom" for a literal. */
  selected: string;
  custom: { value: number; unit: string } | null;
  choices: { key: string; label: string }[];
};
export type ScaleRow = {
  key: string;
  label: string;
  description: string;
  open: boolean;
  css: string;
  fontRole: string;
  weight: number;
  textTransform: string;
  fonts: { key: string; label: string; selected: boolean }[];
  weights: { key: string; label: string; selected: boolean }[];
  transforms: { key: string; label: string; selected: boolean }[];
  size: ScaleField;
  lineHeight: ScaleField;
  letterSpacing: ScaleField;
};

export const initial = () => ({
  scaleRows: [] as ScaleRow[],
  scaleOpen: "",
  scaleError: "",
  scaleNewLabel: "",
});

function field(value: string, choices: { key: string; value: string }[]): ScaleField {
  const custom = value ? literalLength(value) : null;
  return {
    selected: !value ? "" : custom ? "custom" : value,
    custom,
    choices: choices.map((choice) => ({ key: choice.key, label: `${choice.key} · ${choice.value}` })),
  };
}

export function view(system: DesignSystem, state: State, _props: BuilderProps): Partial<State> {
  const rows = fontRows(system, state);
  const roles = fontRoles(system).map((role) => ({
    key: role.key,
    css: resolveValue(system, `var(--${role.token})`),
    label: `${role.label} · ${rows.find((row) => row.name === role.target)?.label ?? role.label}`,
  }));
  const sizes = scale(system, "text-", ["text-shadow-"]);
  const leadings = scale(system, "leading-");
  const trackings = scale(system, "tracking-");
  return {
    scaleRows: system.typeScale.map((entry) => ({
      key: entry.key,
      label: entry.label,
      description: entry.description,
      open: state.scaleOpen === entry.key,
      css: styleCss(system, entry, roles.find((role) => role.key === entry.fontRole)?.css ?? roles[0]?.css ?? "inherit"),
      fontRole: entry.fontRole,
      weight: entry.weight,
      textTransform: entry.textTransform,
      fonts: roles.map((role) => ({ key: role.key, label: role.label, selected: role.key === entry.fontRole })),
      weights: FONT_WEIGHT_STOPS.map((stop) => ({ key: String(stop), label: `${FONT_WEIGHT_NAMES[stop]} ${stop}`, selected: stop === entry.weight })),
      transforms: TEXT_TRANSFORMS.map((transform) => ({ key: transform.key, label: transform.label, selected: transform.key === entry.textTransform })),
      size: field(entry.size, sizes),
      lineHeight: field(entry.lineHeight, leadings),
      letterSpacing: field(entry.letterSpacing, trackings),
    })),
  };
}
