// Color contexts: the theme's named semantic palettes. `default` is `color-<role>`; every
// other context is `color-<context>-<role>`. A pattern copy wears one context: its blocks'
// semantic color classes are rewritten to that context's roles, so `bg-surface` becomes
// `bg-terracotta-surface` and back. Nothing else moves.
import { flatten } from "./tree";
import type { Block } from "./types";
import { Theme } from "./theme";

export type ColorContext = { key: string; label: string };

const words = (key: string) =>
  key
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");

/** Default first, then every context the theme's semantic tokens name, in theme order. */
export function colorContexts(theme: Theme): ColorContext[] {
  const keys = [...new Set(theme.semanticColors.map((color) => color.context))].filter((key) => key !== "default");
  return [{ key: "default", label: "Default" }, ...keys.map((key) => ({ key, label: words(key) }))];
}

/** A context's swatch for a selector card: its surface, foreground and accent. */
export function contextSwatch(theme: Theme, context: string): { surface: string; foreground: string; accent: string } {
  const prefix = context === "default" ? "" : `${context}-`;
  const value = (role: string) => theme.value(`color-${prefix}${role}`) ?? "";
  return { surface: value("surface") || "#ffffff", foreground: value("foreground") || "#18181b", accent: value("accent-surface") || value("foreground") || "#18181b" };
}

const UTILITY = /^(bg|text|border)-(.+)$/;

/** One class moved to a context, or the class as it is when it is not a semantic color. */
function moved(name: string, theme: Theme, roles: Map<string, string>, context: string): string {
  const at = name.lastIndexOf(":");
  const variants = name.slice(0, at + 1);
  const match = UTILITY.exec(name.slice(at + 1));
  if (!match) return name;
  const role = roles.get(match[2]);
  if (!role) return name;
  const key = context === "default" ? role : `${context}-${role}`;
  return theme.has("color", key) ? `${variants}${match[1]}-${key}` : name;
}

/**
 * Rewrites the semantic color classes of blocks (and their descendants) to a context, in
 * place. Returns whether anything changed. A context the theme lacks a surface and a
 * foreground for is refused.
 */
export function applyColorContext(blocks: Block[], context: string, theme: Theme): boolean {
  const prefix = context === "default" ? "" : `${context}-`;
  if (context !== "default" && (!theme.has("color", `${prefix}surface`) || !theme.has("color", `${prefix}foreground`))) return false;
  const roles = new Map(theme.semanticColors.map((color) => [color.key, color.role]));
  let changed = false;
  for (const block of flatten(blocks)) {
    const next = block.classes
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => moved(name, theme, roles, context))
      .join(" ");
    if (next !== block.classes.trim()) {
      block.classes = next;
      changed = true;
    }
  }
  return changed;
}
