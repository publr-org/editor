// Typography (Semantic layer › Typography): how the site uses the font library. The
// default font per kind of element (the font roles, retargeted at library families), a
// full specimen per family in use, and the pairing set in a real layout.
import { Publr } from "publr-jsx";
import { fontRows } from "../fonts/view";
import { fontFamilyTokens, fontRoles, resolveValue } from "../model/system";
import type { DesignSystem } from "../model/system";
import type { BuilderProps, State } from "../state";

/** What each built-in role covers, and how it reads in the pairing sentence. */
const ROLE_META: Record<string, { purpose: string; phrase: string }> = {
  heading: { purpose: Publr.t("Titles and section headings"), phrase: Publr.t("headings") },
  body: { purpose: Publr.t("Paragraphs, lists and long-form reading"), phrase: Publr.t("body copy") },
  code: { purpose: Publr.t("Code blocks and inline snippets"), phrase: Publr.t("code") },
};

export type TypeRole = {
  name: string;
  key: string;
  label: string;
  family: string;
  css: string;
  style: string;
  purpose: string;
  source: string;
  weights: string;
  selectLabel: string;
  choices: { name: string; label: string; selected: boolean }[];
};
export type Specimen = { key: string; eyebrow: string; family: string; style: string; source: string; weights: { key: string; label: string; style: string }[] };

export const initial = () => ({
  typeRoles: [] as TypeRole[],
  /** The pairing line: each role's family in its own face, "+" between. */
  pairing: [] as { key: string; text: string; style: string; plus: boolean }[],
  pairingSentence: "",
  specimens: [] as Specimen[],
  /** Changes whenever the In use layout must redraw (its tokens, its fonts). */
  inUseStamp: "",
});

function stamp(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

export function view(system: DesignSystem, state: State, props: BuilderProps): Partial<State> {
  const rows = fontRows(system, state);
  const families = fontFamilyTokens(system);
  const roles = fontRoles(system);
  const typeRoles: TypeRole[] = roles.map((role) => {
    const row = rows.find((candidate) => candidate.name === role.target);
    const faces = row?.provider === "files" ? row.faces.map((face) => face.label) : (row?.weights.filter((weight) => weight.enabled).map((weight) => weight.label) ?? []);
    const css = resolveValue(system, `var(--${role.token})`);
    return {
      name: role.token,
      key: role.key,
      label: role.label,
      family: row?.label ?? role.label,
      css,
      style: `font-family: ${css}`,
      purpose: ROLE_META[role.key]?.purpose ?? "",
      source: row?.sourceLabel ?? "",
      weights: faces.length === 0 ? "" : faces.length <= 4 ? faces.join(", ") : Publr.tn("{count} weight", "{count} weights", faces.length),
      selectLabel: Publr.t("{role} font", { role: role.label }),
      choices: families.map((token) => ({ name: token.name, label: rows.find((candidate) => candidate.name === token.name)?.label ?? token.name.slice("font-".length), selected: token.name === role.target })),
    };
  });
  const sentence = typeRoles.map((role) => Publr.t("{role} in {family}", { role: ROLE_META[role.key]?.phrase ?? role.label.toLowerCase(), family: role.family })).join(", ");
  const groups = new Map<string, string[]>();
  for (const role of roles) groups.set(role.target, [...(groups.get(role.target) ?? []), role.label]);
  const specimens: Specimen[] = [...groups].map(([target, labels]) => {
    const row = rows.find((candidate) => candidate.name === target);
    const css = resolveValue(system, `var(--${target})`);
    const weights =
      row?.provider === "files"
        ? row.faces.map((face) => ({ key: `face-${face.index}`, label: face.label, style: face.style }))
        : (row?.weights ?? []).filter((weight) => weight.enabled).map((weight) => ({ key: weight.value, label: `${weight.weight} ${weight.label}`, style: `font-family: ${css}; font-weight: ${weight.weight}` }));
    return {
      key: target,
      eyebrow: Publr.t("{roles} specimen", { roles: labels.join(" & ") }),
      family: row?.label ?? target.slice("font-".length),
      style: `font-family: ${css}`,
      source: row?.sourceLabel ?? "",
      weights: weights.length ? weights : [{ key: "400", label: Publr.t("400 Regular"), style: `font-family: ${css}; font-weight: 400` }],
    };
  });
  return {
    typeRoles,
    pairing: typeRoles.flatMap((role, index) => [...(index > 0 ? [{ key: `${role.name}+`, text: "+", style: "font-size: 24px; line-height: 1; opacity: 0.6", plus: true }] : []), { key: role.name, text: role.family, style: `${role.style}; line-height: 1.15`, plus: false }]),
    pairingSentence: sentence ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.` : "",
    specimens,
    inUseStamp: stamp(JSON.stringify([system.tokens.filter((token) => token.name.startsWith("font-")), system.fonts, props.siteStyles ?? []])),
  };
}
