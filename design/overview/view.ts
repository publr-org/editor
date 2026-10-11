// The overview: the hero's wash in the site's own colors, the ask, and what the theme
// holds, one row per page.
import { Publr } from "publr-jsx";
import { fontFamilyTokens, fontRoles, paletteTokens, semanticRoles } from "../model/system";
import type { DesignSystem } from "../model/system";
import { styleBreakpoints } from "../model/breakpoints";
import { containers } from "../model/containers";
import type { BuilderProps, Page, State } from "../state";

export type OverviewRow = { page: Page; label: string; detail: string };

export const initial = () => ({
  prompt: "",
  buildBusy: false,
  buildError: "",
  overviewGradient: "",
  overviewRows: [] as OverviewRow[],
  moodboardCount: 0,
  /** "Add references" or "Moodboard · 3 references". */
  moodboardLabel: Publr.t("Add references"),
  agentShown: false,
  aiReady: false,
  aiSettingsHref: "",
  agentLogin: "",
  agentAsk: "",
  agentDevicesHref: "",
  agentGuideHref: "",
});

/** How saturated and mid-light a hex color is: the wash takes the three most vivid. */
function vividness(color: string): number {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return 0;
  const [red, green, blue] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  return saturation * (1 - Math.abs(lightness - 0.5) * 1.6);
}

export function overviewGradient(colors: readonly string[]): string {
  const vivid = colors
    .map((value) => ({ value, score: vividness(value) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.value);
  const [first, second, third] = vivid.length >= 2 ? vivid : ["#3858e9", "#e94f8a", "#f7a04a"];
  const wash = (color: string, percent: number) => `color-mix(in oklab, ${color} ${percent}%, transparent)`;
  return [
    `radial-gradient(55% 60% at 18% 22%, ${wash(first, 55)} 0%, transparent 70%)`,
    `radial-gradient(50% 55% at 82% 18%, ${wash(second, 50)} 0%, transparent 70%)`,
    `radial-gradient(70% 60% at 50% 100%, ${wash(third ?? second, 60)} 0%, transparent 70%)`,
  ].join(", ");
}

const breakpointCount = (system: DesignSystem) => styleBreakpoints(system).length;

export function view(system: DesignSystem, state: State, props: BuilderProps): Partial<State> {
  const count = props.moodboardCount ?? 0;
  const families = fontFamilyTokens(system).length;
  const containerCount = containers(system).length;
  const rows: OverviewRow[] = [
    { page: "foundations", label: Publr.t("Colors"), detail: `${Publr.tn("{count} role", "{count} roles", semanticRoles(system).length)} · ${Publr.tn("{count} palette color", "{count} palette colors", paletteTokens(system).length)}` },
    { page: "fonts", label: Publr.t("Fonts"), detail: Publr.tn("{count} family", "{count} families", families) },
    { page: "typography", label: Publr.t("Typography"), detail: Publr.tn("{count} font role", "{count} font roles", fontRoles(system).length) },
    { page: "type-scale", label: Publr.t("Type scale"), detail: Publr.tn("{count} style", "{count} styles", system.typeScale.length) },
    { page: "icons", label: Publr.t("Icons"), detail: Publr.tn("{count} icon", "{count} icons", system.icons.length) },
    { page: "containers", label: Publr.t("Containers"), detail: Publr.tn("{count} container", "{count} containers", containerCount) },
    { page: "breakpoints", label: Publr.t("Breakpoints"), detail: Publr.tn("{count} breakpoint", "{count} breakpoints", breakpointCount(system)) },
    { page: "advanced", label: Publr.t("Token library"), detail: Publr.tn("{count} token", "{count} tokens", system.tokens.length) },
  ];
  void state;
  return {
    overviewGradient: overviewGradient(paletteTokens(system).map((token) => token.value)),
    overviewRows: rows,
    moodboardCount: count,
    moodboardLabel: count ? Publr.tn("Moodboard · {count} reference", "Moodboard · {count} references", count) : Publr.t("Add references"),
    agentShown: !!props.agent,
    aiReady: !!props.build && props.aiReady !== false,
    aiSettingsHref: props.aiSettingsHref ?? "",
    agentLogin: props.agent ? `publr login ${props.agent.site}` : "",
    agentAsk: props.agent ? `Make the style guide${props.app ? ` for the ${props.app} app` : ""}: read its design system and moodboard, then publish it with design.save_system.` : "",
    agentDevicesHref: props.agent?.devicesHref ?? "",
    agentGuideHref: props.agent?.guideHref ?? "",
  };
}
