// Semantic colors: the preview in the chosen context, the summary strip, and the right
// panel's two levels (color contexts, then the chosen context's roles).
import { Publr } from "publr-jsx";
import { colorContexts, fontRoles, paletteTokens, resolveValue, roleToken, scale, semanticRoles, titleCase, tokenValue } from "../model/system";
import type { DesignSystem } from "../model/system";
import type { BuilderProps, State } from "../state";
import { previewHtml } from "./preview";
import type { PreviewRoles } from "./preview";

export type ColorContextRow = {
  key: string;
  label: string;
  surfaceCss: string;
  foregroundCss: string;
  accentCss: string;
  mutedCss: string;
  selected: boolean;
  removable: boolean;
  removeLabel: string;
};

export type PaletteChoice = { name: string; label: string; value: string; reference: string; selected: boolean };

export type SemanticRow = {
  key: string;
  /** The role's token in the chosen context. */
  name: string;
  label: string;
  description: string;
  value: string;
  resolved: string;
  open: boolean;
  choices: PaletteChoice[];
};

const EMPTY_CONTEXT: ColorContextRow = { key: "default", label: Publr.t("Default"), surfaceCss: "#ffffff", foregroundCss: "#18181b", accentCss: "#3858e9", mutedCss: "#f4f4f5", selected: true, removable: false, removeLabel: "" };

export const initial = () => ({
  /** The context the preview shows and the roles level edits. */
  colorContext: "default",
  colorLevel: "contexts" as "contexts" | "roles",
  contextFormOpen: false,
  contextName: "",
  contextKey: "",
  roleFormOpen: false,
  roleName: "",
  roleKey: "",
  colorError: "",
  /** The role row open in the roles level: its token name. */
  semanticOpen: "",
  colorContextRows: [] as ColorContextRow[],
  currentContext: { ...EMPTY_CONTEXT } as ColorContextRow,
  semanticRows: [] as SemanticRow[],
  roleSummary: "",
  typeSummary: "",
  contextSummary: "",
  contextListSummary: "",
  colorPreview: "",
  colorPreviewStamp: "",
});

const STARTER: Record<keyof PreviewRoles, [string, string]> = {
  surface: ["surface", "#ffffff"],
  foreground: ["foreground", "#18181b"],
  border: ["border", "#e4e4e7"],
  accent: ["accent-surface", "#3858e9"],
  accentForeground: ["accent-foreground", "#ffffff"],
  accentBorder: ["accent-border", "#2947ce"],
  muted: ["muted-surface", "#f4f4f5"],
  mutedForeground: ["muted-foreground", "#3f3f46"],
  mutedBorder: ["muted-border", "#d4d4d8"],
};

/** Each role the composition needs as a class suffix: the context's token, else the
 * default context's, else the starter color as an arbitrary value. */
function previewRoles(system: DesignSystem, context: string): PreviewRoles {
  const roles = {} as PreviewRoles;
  for (const [part, [role, fallback]] of Object.entries(STARTER) as [keyof PreviewRoles, [string, string]][]) {
    const own = roleToken(context, role);
    const base = roleToken("default", role);
    roles[part] = tokenValue(system, own) !== undefined ? own.slice("color-".length) : tokenValue(system, base) !== undefined ? base.slice("color-".length) : `[${fallback}]`;
  }
  return roles;
}

const contextColor = (system: DesignSystem, context: string, role: string, fallback: string) =>
  resolveValue(system, tokenValue(system, roleToken(context, role)) ?? tokenValue(system, roleToken("default", role)) ?? fallback);

/** A short fingerprint: the preview redraws when its markup, tokens or fonts change. */
function stamp(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

export function view(system: DesignSystem, state: State, _props: BuilderProps): Partial<State> {
  const contexts = colorContexts(system);
  const context = contexts.some((candidate) => candidate.key === state.colorContext) ? state.colorContext : (contexts[0]?.key ?? "default");
  const contextLabel = contexts.find((candidate) => candidate.key === context)?.label ?? titleCase(context);
  const rows: ColorContextRow[] = contexts.map((candidate) => ({
    key: candidate.key,
    label: candidate.label,
    surfaceCss: contextColor(system, candidate.key, "surface", "#ffffff"),
    foregroundCss: contextColor(system, candidate.key, "foreground", "#18181b"),
    accentCss: contextColor(system, candidate.key, "accent-surface", "#3858e9"),
    mutedCss: contextColor(system, candidate.key, "muted-surface", "#f4f4f5"),
    selected: candidate.key === context,
    removable: candidate.key !== "default",
    removeLabel: candidate.key === "default" ? Publr.t("The default context cannot be removed") : Publr.t("Remove {name}", { name: candidate.label }),
  }));
  const palette = paletteTokens(system);
  const roles = semanticRoles(system);
  const semanticRows: SemanticRow[] = roles.map((role) => {
    const name = roleToken(context, role.key);
    const value = tokenValue(system, name) ?? tokenValue(system, roleToken("default", role.key)) ?? role.value;
    return {
      key: role.key,
      name,
      label: role.label,
      description: role.description,
      value,
      resolved: resolveValue(system, value),
      open: state.semanticOpen === name,
      choices: palette.map((token) => ({
        name: token.name,
        label: titleCase(token.name.slice(token.name.startsWith("color-palette-") ? "color-palette-".length : "color-".length)),
        value: resolveValue(system, token.value),
        reference: `var(--${token.name})`,
        selected: value === `var(--${token.name})` || value === token.value,
      })),
    };
  });
  const families = new Set(fontRoles(system).map((role) => role.target)).size;
  const sizes = scale(system, "text-", ["text-shadow-"]).length;
  const fontRole = tokenValue(system, "font-body") !== undefined ? "font-body" : "font-sans";
  const html = previewHtml(previewRoles(system, context), fontRole, contextLabel);
  return {
    colorContext: context,
    colorContextRows: rows,
    currentContext: rows.find((row) => row.selected) ?? { ...EMPTY_CONTEXT },
    semanticRows,
    roleSummary: Publr.tn("{count} semantic role", "{count} semantic roles", roles.length),
    typeSummary: `${Publr.tn("{count} family", "{count} families", families)} · ${Publr.tn("{count} size", "{count} sizes", sizes)}`,
    contextSummary: Publr.tn("{count} color context", "{count} color contexts", contexts.length),
    contextListSummary: contexts.map((candidate) => candidate.label).join(", "),
    colorPreview: html,
    colorPreviewStamp: stamp(JSON.stringify([html, system.tokens, system.fonts])),
  };
}
