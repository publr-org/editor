// The semantic layer's operations: color contexts and the roles every context repeats.
// A role's color in a context is the token `color-<role>` (default) or
// `color-<context>-<role>`; it holds a palette reference (`var(--color-palette-ink)`) or,
// as the exception, a literal.
import { Publr } from "publr-jsx";
import { colorContexts, paletteTokens, roleToken, semanticRoles, tokenValue } from "./system";
import type { DesignSystem } from "./system";

/** A context or role key from a typed name: lowercase words joined by single dashes. */
export const keyFrom = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export type Outcome = { system: DesignSystem; error: "" } | { system: null; error: string };

/** A new context, its roles starting as a copy of `from`'s colors. */
export function addContext(system: DesignSystem, label: string, typedKey: string, from: string): Outcome {
  const name = label.trim();
  const key = keyFrom(typedKey || name);
  const contexts = colorContexts(system);
  if (!name || !key) return { system: null, error: Publr.t("Give the context a name.") };
  if (key === "default" || contexts.some((context) => context.key === key)) return { system: null, error: Publr.t("A “{key}” context already exists.", { key }) };
  const additions = semanticRoles(system).map((role) => ({
    name: roleToken(key, role.key),
    value: tokenValue(system, roleToken(from, role.key)) ?? tokenValue(system, roleToken("default", role.key)) ?? role.value,
  }));
  return { system: { ...system, tokens: [...system.tokens, ...additions], contexts: [...contexts, { key, label: name }] }, error: "" };
}

export function renameContext(system: DesignSystem, key: string, label: string): DesignSystem {
  const name = label.trim();
  if (!name) return system;
  return { ...system, contexts: colorContexts(system).map((context) => (context.key === key ? { ...context, label: name } : context)) };
}

/** The tokens a context owns: its color for every role. */
export const contextTokens = (system: DesignSystem, key: string) => semanticRoles(system).map((role) => roleToken(key, role.key));

export function removeContext(system: DesignSystem, key: string): DesignSystem {
  if (key === "default") return system;
  const owned = new Set(contextTokens(system, key));
  return { ...system, tokens: system.tokens.filter((token) => !owned.has(token.name)), contexts: colorContexts(system).filter((context) => context.key !== key) };
}

/** A new role in every context, pointing at the first palette color. */
export function addRole(system: DesignSystem, label: string, typedKey: string): Outcome {
  const name = label.trim();
  const key = keyFrom(typedKey || name);
  const roles = semanticRoles(system);
  if (!name || !key) return { system: null, error: Publr.t("Give the semantic role a name.") };
  if (roles.some((role) => role.key === key)) return { system: null, error: Publr.t("A “{key}” role already exists.", { key }) };
  const first = paletteTokens(system)[0]?.name ?? "";
  const value = first ? `var(--${first})` : "#000000";
  const additions = colorContexts(system).map((context) => ({ name: roleToken(context.key, key), value }));
  return {
    system: { ...system, tokens: [...system.tokens, ...additions], roles: [...roles, { key, label: name, description: "Custom semantic color", value }] },
    error: "",
  };
}

export function updateRole(system: DesignSystem, key: string, field: "label" | "description", text: string): DesignSystem {
  const value = text.trim();
  if (!value) return system;
  return { ...system, roles: semanticRoles(system).map((role) => (role.key === key ? { ...role, [field]: value } : role)) };
}

/** The tokens a role owns: its color in every context. */
export const roleTokens = (system: DesignSystem, key: string) => colorContexts(system).map((context) => roleToken(context.key, key));

export function removeRole(system: DesignSystem, key: string): DesignSystem {
  const owned = new Set(roleTokens(system, key));
  return { ...system, tokens: system.tokens.filter((token) => !owned.has(token.name)), roles: semanticRoles(system).filter((role) => role.key !== key) };
}
