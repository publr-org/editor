// The demo site's theme tokens: what an app's design system would give the canvas.
import type { ThemeToken } from "../canvas/engine";
import type { TextStyle } from "../model/theme";

export const DEMO_THEME: ThemeToken[] = [
  { name: "color-white", value: "#ffffff" },
  { name: "color-neutral-100", value: "#f5f5f5" },
  { name: "color-neutral-500", value: "#737373" },
  { name: "color-neutral-900", value: "#171717" },
  { name: "color-amber-300", value: "#fcd34d" },
  { name: "color-brand", value: "#3858e9" },
  { name: "color-accent", value: "#3858e9" },
  { name: "text-sm", value: "0.875rem" },
  { name: "text-base", value: "1rem" },
  { name: "text-lg", value: "1.125rem" },
  { name: "text-xl", value: "1.25rem" },
  { name: "text-2xl", value: "1.5rem" },
  { name: "leading-tight", value: "1.25" },
  { name: "leading-normal", value: "1.5" },
  { name: "leading-relaxed", value: "1.625" },
  { name: "tracking-tight", value: "-0.025em" },
  { name: "tracking-normal", value: "0em" },
  { name: "tracking-wide", value: "0.025em" },
  { name: "radius-sm", value: "0.25rem" },
  { name: "radius-md", value: "0.375rem" },
  { name: "radius-lg", value: "0.5rem" },
  { name: "radius-full", value: "9999px" },
  { name: "spacing-2xs", value: "0.25rem" },
  { name: "spacing-xs", value: "0.5rem" },
  { name: "spacing-s", value: "0.75rem" },
  { name: "spacing-m", value: "1rem" },
  { name: "spacing-l", value: "1.5rem" },
  { name: "spacing-xl", value: "2rem" },
  { name: "spacing-2xl", value: "3rem" },
  { name: "container-content", value: "42rem" },
  { name: "container-wide", value: "72rem" },
  { name: "font-heading", value: "var(--font-serif)" },
  { name: "font-body", value: "var(--font-sans)" },
  { name: "font-code", value: "var(--font-mono)" },
];

/** The demo's named text styles: presets over the typography controls. */
export const DEMO_TEXT_STYLES: TextStyle[] = [
  { key: "display", label: "Display", styles: { fontFamily: "heading", fontSize: "2xl", fontWeight: "semibold", lineHeight: "tight", letterSpacing: "tight" } },
  { key: "title", label: "Title", styles: { fontFamily: "heading", fontSize: "xl", fontWeight: "semibold", lineHeight: "tight" } },
  { key: "lead", label: "Lead", styles: { fontFamily: "body", fontSize: "lg", lineHeight: "relaxed" } },
  { key: "caption", label: "Caption", styles: { fontFamily: "body", fontSize: "sm", fontWeight: "medium", letterSpacing: "wide" } },
];

/** A fixture's ```json theme fence: `{ "tokens": { "text-xxxxl": "6rem", ... } }` or a token list. */
export function themeFrom(json: string): ThemeToken[] | null {
  if (!json.trim()) return null;
  try {
    const parsed = JSON.parse(json) as { tokens?: unknown };
    const tokens = parsed.tokens;
    if (Array.isArray(tokens)) return tokens as ThemeToken[];
    if (tokens && typeof tokens === "object") return Object.entries(tokens).map(([name, value]) => ({ name, value: String(value) }));
  } catch {
    return null;
  }
  return null;
}
