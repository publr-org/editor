// Breakpoints: the theme's `breakpoint-*` tokens (min widths, mobile first), the base
// preview width (`publr-preview-base`) and the device each breakpoint belongs to
// (`publr-breakpoint-<key>-device`). A theme that names none gets the starter five; once
// `publr-breakpoints-configured` is set, the collection is exactly what it names.
import { Publr } from "publr-jsx";
import { cssLengthPx, setToken, tokenValue } from "./system";
import type { DesignSystem, Token } from "./system";

export type Device = "mobile" | "tablet" | "desktop";
export type Breakpoint = { key: string; label: string; viewport: string; token: string };

export const BREAKPOINT_CONFIGURATION_TOKEN = "publr-breakpoints-configured";
export const BASE_PREVIEW_TOKEN = "publr-preview-base";

export const STYLE_BREAKPOINTS: readonly Breakpoint[] = [
  { key: "base", label: Publr.t("Base"), viewport: "390px", token: BASE_PREVIEW_TOKEN },
  { key: "sm", label: Publr.t("Small"), viewport: "640px", token: "breakpoint-sm" },
  { key: "md", label: Publr.t("Tablet"), viewport: "768px", token: "breakpoint-md" },
  { key: "lg", label: Publr.t("Desktop"), viewport: "1024px", token: "breakpoint-lg" },
  { key: "xl", label: Publr.t("Large desktop"), viewport: "1280px", token: "breakpoint-xl" },
  { key: "2xl", label: Publr.t("Wide desktop"), viewport: "1536px", token: "breakpoint-2xl" },
];

export const DEVICES: readonly { key: Device; label: string; icon: string }[] = [
  { key: "mobile", label: Publr.t("Mobile"), icon: "device-mobile" },
  { key: "tablet", label: Publr.t("Tablet"), icon: "device-tablet" },
  { key: "desktop", label: Publr.t("Desktop"), icon: "device-desktop" },
];

const DEFAULT_DEVICES: Record<string, Device> = { base: "mobile", sm: "tablet", md: "tablet", lg: "desktop", xl: "desktop", "2xl": "desktop" };

export const deviceToken = (key: string) => `publr-breakpoint-${key}-device`;

const toViewport = (value: string) => {
  const relative = /^(\d+(?:\.\d+)?)(rem|em)$/.exec(value);
  return relative ? `${Number(relative[1]) * 16}px` : value;
};

const titled = (key: string) =>
  key
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

/** Base first, then every breakpoint smallest to largest. */
export function styleBreakpoints(system: DesignSystem): Breakpoint[] {
  const known = new Map(STYLE_BREAKPOINTS.map((breakpoint) => [breakpoint.key, breakpoint]));
  const base = STYLE_BREAKPOINTS[0];
  const rows: Breakpoint[] = [{ ...base, viewport: toViewport(tokenValue(system, base.token) ?? base.viewport) }];
  const authored = system.tokens.filter((token) => token.name.startsWith("breakpoint-"));
  const media: Token[] = authored.length || system.tokens.some((token) => token.name === BREAKPOINT_CONFIGURATION_TOKEN) ? authored : STYLE_BREAKPOINTS.slice(1).map((breakpoint) => ({ name: breakpoint.token, value: breakpoint.viewport }));
  const others: Breakpoint[] = [];
  for (const token of media) {
    const key = token.name.slice("breakpoint-".length);
    if (!key) continue;
    others.push({ key, label: known.get(key)?.label ?? titled(key), viewport: toViewport(token.value), token: token.name });
  }
  const px = (value: string) => /^(\d+(?:\.\d+)?)px$/.exec(value)?.[1];
  others.sort((a, b) => Number(px(a.viewport) ?? Infinity) - Number(px(b.viewport) ?? Infinity));
  return [...rows, ...others];
}

export function breakpointDevice(system: DesignSystem, key: string): Device {
  if (key === "base") return "mobile";
  const configured = tokenValue(system, deviceToken(key));
  return configured === "mobile" || configured === "tablet" || configured === "desktop" ? configured : (DEFAULT_DEVICES[key] ?? "desktop");
}

/** The tokens to edit from: the starter collection written out (and marked configured)
 * the first time a theme without its own breakpoints is edited. */
function editable(system: DesignSystem): DesignSystem {
  if (system.tokens.some((token) => token.name === BREAKPOINT_CONFIGURATION_TOKEN)) return system;
  let next = system;
  if (!system.tokens.some((token) => token.name.startsWith("breakpoint-"))) {
    for (const breakpoint of STYLE_BREAKPOINTS) if (!tokenValue(next, breakpoint.token)) next = setToken(next, breakpoint.token, breakpoint.viewport);
  }
  return setToken(next, BREAKPOINT_CONFIGURATION_TOKEN, "1");
}

/** A positive CSS length; a bare number is px. */
export function breakpointWidth(raw: string): string | null {
  const trimmed = raw.trim();
  const value = /^\d+(?:\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed;
  const px = cssLengthPx(value);
  return px != null && px > 0 ? value : null;
}

export function setBreakpointWidth(system: DesignSystem, key: string, amount: number): DesignSystem {
  const breakpoint = styleBreakpoints(system).find((candidate) => candidate.key === key);
  if (!breakpoint || !Number.isFinite(amount) || amount <= 0) return system;
  return setToken(editable(system), breakpoint.token, `${Math.round(amount)}px`);
}

export function moveBreakpoint(system: DesignSystem, key: string, device: Device): DesignSystem {
  return setToken(editable(system), deviceToken(key), device);
}

/** Add a breakpoint to a device group, or why not. */
export function addBreakpoint(system: DesignSystem, name: string, rawWidth: string, device: Device): { system: DesignSystem; error: string } {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/^breakpoint-/, "")
    .replace(/[\s_]+/g, "-");
  if (!key || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || key === "base") return { system, error: Publr.t("Use a unique breakpoint name containing letters, numbers, or hyphens.") };
  if (styleBreakpoints(system).some((breakpoint) => breakpoint.key === key)) return { system, error: Publr.t("The “{name}” breakpoint already exists.", { name: key }) };
  const width = breakpointWidth(rawWidth);
  if (!width) return { system, error: Publr.t("Use a positive CSS length in px, rem, or em.") };
  return { system: setToken(setToken(editable(system), `breakpoint-${key}`, width), deviceToken(key), device), error: "" };
}

export function removeBreakpoint(system: DesignSystem, key: string): DesignSystem {
  const next = editable(system);
  return { ...next, tokens: next.tokens.filter((token) => token.name !== `breakpoint-${key}` && token.name !== deviceToken(key)) };
}

/** Back to the starter five, every device assignment dropped. */
export function resetBreakpoints(system: DesignSystem): DesignSystem {
  const kept = system.tokens.filter((token) => token.name !== BASE_PREVIEW_TOKEN && token.name !== BREAKPOINT_CONFIGURATION_TOKEN && !token.name.startsWith("breakpoint-") && !/^publr-breakpoint-.+-device$/.test(token.name));
  return { ...system, tokens: [...kept, ...STYLE_BREAKPOINTS.map((breakpoint) => ({ name: breakpoint.token, value: breakpoint.viewport })), { name: BREAKPOINT_CONFIGURATION_TOKEN, value: "1" }] };
}

/** Widths of the media breakpoints increase from the first to the last. */
export function breakpointOrderValid(system: DesignSystem): boolean {
  const widths = styleBreakpoints(system)
    .slice(1)
    .map((breakpoint) => cssLengthPx(breakpoint.viewport));
  return widths.every((width) => width != null) && widths.every((width, index) => index === 0 || width! > widths[index - 1]!);
}

/** What a breakpoint's column covers: base is everything below the next one. */
export function breakpointRange(breakpoints: readonly Breakpoint[], index: number): string {
  const breakpoint = breakpoints[index];
  if (!breakpoint) return "";
  if (breakpoint.key === "base") return breakpoints[index + 1] ? `< ${breakpoints[index + 1].viewport}` : "any width";
  return `≥ ${breakpoint.viewport}`;
}
