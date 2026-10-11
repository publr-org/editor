// Where a design-system primitive is used, and how to move those usages onto another
// one. A primitive (a color context, a semantic role, a breakpoint, a container, or a
// raw token) is never removed while something still references it: the reference would
// silently resolve to nothing. The builder scans what it can see (the system's own
// tokens and type scale, and the patterns the editor holds) and either re-targets every
// usage first or refuses, when a usage lives where the builder cannot write.
import { Publr } from "publr-jsx";
import { allPatterns } from "../../model/patterns";
import type { LibraryHost } from "../library/host";
import type { DesignSystem, Token, TypeScaleEntry } from "./system";

export type PrimitiveKind = "colorContext" | "semanticRole" | "breakpoint" | "container" | "token";

export type PrimitiveRef = {
  kind: PrimitiveKind;
  /** Context key, role key, breakpoint key, container key, or token name. */
  key: string;
  /** For semantic roles: the context keys (their classes are `bg-<context>-<role>`). */
  contexts?: readonly string[];
};

export type UsageSource = {
  id: string;
  label: string;
  /** Wire HTML: a pattern's content. */
  html?: string;
  tokens?: readonly Token[];
  typeScale?: readonly TypeScaleEntry[];
  /** Whether the builder may rewrite this source. */
  rewritable: boolean;
};

export type UsageHit = { id: string; label: string; count: number; rewritable: boolean };

const COLOR_UTILITIES = "(?:text|bg|border|ring|outline|decoration|fill|stroke|from|to|via|divide|accent|caret|shadow|placeholder)(?:-[xytblrse])?";
const VARIANTS = "(?:[a-z0-9-]+:)*";
const BEFORE = "(?<![\\w-])";
const AFTER = "(?![\\w-])";

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function utilitySuffix(name: string): { utilities: string; value: string } | null {
  const [namespace, ...rest] = name.split("-");
  const value = rest.join("-");
  if (!value) return null;
  switch (namespace) {
    case "color":
      return { utilities: COLOR_UTILITIES, value };
    case "font":
      return { utilities: "font", value };
    case "text":
      return { utilities: "text", value };
    case "radius":
      return { utilities: "rounded(?:-[a-z]{1,2})?", value };
    case "leading":
      return { utilities: "leading", value };
    case "tracking":
      return { utilities: "tracking", value };
    default:
      return null;
  }
}

/** Every usage of the primitive in wire HTML; group 1 the prefix, group 2 what follows. */
function classPattern(ref: PrimitiveRef): RegExp {
  const key = escape(ref.key);
  switch (ref.kind) {
    case "colorContext":
      return new RegExp(`${BEFORE}(${VARIANTS}${COLOR_UTILITIES}-)${key}-([a-z0-9]+(?:-[a-z0-9]+)*)${AFTER}`, "g");
    case "semanticRole": {
      const contexts = (ref.contexts ?? []).filter((context) => context !== "default").map(escape);
      const contextPart = contexts.length ? `(?:(?:${contexts.join("|")})-)?` : "";
      return new RegExp(`${BEFORE}(${VARIANTS}${COLOR_UTILITIES}-${contextPart})${key}()${AFTER}`, "g");
    }
    case "breakpoint":
      return new RegExp(`${BEFORE}(${VARIANTS})${key}:([a-z0-9-]+(?:\\[[^\\]]*\\])?)`, "g");
    case "container":
      return new RegExp(`${BEFORE}(${VARIANTS}pbe-container--|data-pbe-template-width=")${key}()(?![\\w-])`, "g");
    case "token": {
      const suffix = utilitySuffix(ref.key);
      const alternatives = [`var\\(--${key}\\)`];
      if (suffix) alternatives.push(`${VARIANTS}${suffix.utilities}-${escape(suffix.value)}`);
      return new RegExp(`${BEFORE}()(${alternatives.join("|")})${AFTER}`, "g");
    }
  }
}

const settingsPattern = (ref: PrimitiveRef) => (ref.kind === "colorContext" ? new RegExp(`"colorContext":"${escape(ref.key)}"`, "g") : null);

function tokenMatches(ref: PrimitiveRef, token: Token): boolean {
  switch (ref.kind) {
    case "token":
      return token.name !== ref.key && token.value.includes(`var(--${ref.key})`);
    case "semanticRole": {
      const contexts = (ref.contexts ?? []).filter((context) => context !== "default");
      const names = [`color-${ref.key}`, ...contexts.map((context) => `color-${context}-${ref.key}`)];
      return names.some((name) => token.name !== name && token.value.includes(`var(--${name})`));
    }
    case "colorContext":
      return !token.name.startsWith(`color-${ref.key}-`) && token.value.includes(`var(--color-${ref.key}-`);
    case "breakpoint":
      return token.name.startsWith("container-") && token.name.endsWith(`-${ref.key}`);
    case "container":
      return false;
  }
}

/** The type scale field a token's namespace feeds, and the key it is known by there. */
function scaleField(name: string): { field: "size" | "lineHeight" | "letterSpacing" | "fontRole"; key: string } | null {
  if (name.startsWith("text-") && !name.includes("--")) return { field: "size", key: name.slice(5) };
  if (name.startsWith("leading-")) return { field: "lineHeight", key: name.slice(8) };
  if (name.startsWith("tracking-")) return { field: "letterSpacing", key: name.slice(9) };
  if (name.startsWith("font-") && !name.startsWith("font-weight-")) return { field: "fontRole", key: name.slice(5) };
  return null;
}

function entryMatches(ref: PrimitiveRef, entry: TypeScaleEntry): boolean {
  if (ref.kind !== "token") return false;
  const target = scaleField(ref.key);
  return !!target && entry[target.field] === target.key;
}

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The library's documents as sources: rewritable where the host keeps an edit. Without a
 * library, the patterns the editor holds, which the builder cannot write. */
function librarySources(library: LibraryHost | undefined): UsageSource[] {
  if (!library) return allPatterns().map((pattern) => ({ id: `pattern:${pattern.name}`, label: Publr.t("Pattern · {name}", { name: pattern.label }), html: pattern.html, rewritable: false }));
  return [
    ...library.patterns.map((pattern) => ({ id: `pattern:${pattern.name}`, label: Publr.t("Pattern · {name}", { name: pattern.label }), html: pattern.html, rewritable: !!library.savePattern })),
    ...library.templates.map((template) => ({ id: `template:${template.name}`, label: Publr.t("Template · {name}", { name: template.label }), html: template.html, rewritable: !!library.saveTemplate })),
    ...library.parts.map((part) => ({ id: `template-part:${part.name}`, label: Publr.t("Template part · {name}", { name: part.label }), html: part.html, rewritable: !!library.savePart })),
  ];
}

/** What the builder can see: the library's documents, the system's tokens and type scale. */
export function usageSources(system: DesignSystem, library?: LibraryHost): UsageSource[] {
  return [
    ...librarySources(library),
    { id: "type-scale", label: Publr.t("Type scale"), typeScale: system.typeScale, rewritable: true },
    { id: "theme", label: Publr.t("Other theme settings"), tokens: system.tokens, rewritable: true },
  ];
}

export function findUsages(ref: PrimitiveRef, sources: readonly UsageSource[]): UsageHit[] {
  const classes = classPattern(ref);
  const settings = settingsPattern(ref);
  const hits: UsageHit[] = [];
  for (const source of sources) {
    let found = 0;
    if (source.html) found += count(source.html, classes) + (settings ? count(source.html, settings) : 0);
    if (source.tokens) found += source.tokens.filter((token) => tokenMatches(ref, token)).length;
    if (source.typeScale) found += source.typeScale.filter((entry) => entryMatches(ref, entry)).length;
    if (found) hits.push({ id: source.id, label: source.label, count: found, rewritable: source.rewritable });
  }
  return hits;
}

/** Every source's hits for several primitives at once, merged per source. */
export function findAllUsages(refs: readonly PrimitiveRef[], sources: readonly UsageSource[]): UsageHit[] {
  const merged = new Map<string, UsageHit>();
  for (const ref of refs) {
    for (const hit of findUsages(ref, sources)) {
      const existing = merged.get(hit.id);
      if (existing) existing.count += hit.count;
      else merged.set(hit.id, { ...hit });
    }
  }
  return [...merged.values()];
}

/** Re-target every usage in wire HTML onto `replacement`. */
export function rewriteHtml(ref: PrimitiveRef, replacement: string, html: string): string {
  const pattern = classPattern(ref);
  switch (ref.kind) {
    case "colorContext":
      return html
        .replace(pattern, (_match, prefix: string, role: string) => (replacement === "default" ? `${prefix}${role}` : `${prefix}${replacement}-${role}`))
        .replace(settingsPattern(ref)!, replacement === "default" ? '"colorContext":""' : `"colorContext":"${replacement}"`);
    case "semanticRole":
      return html.replace(pattern, (_match, prefix: string) => `${prefix}${replacement}`);
    case "breakpoint":
      return html.replace(pattern, (_match, variants: string, rest: string) => (replacement === "base" ? `${variants}${rest}` : `${variants}${replacement}:${rest}`));
    case "container":
      return html.replace(pattern, (_match, prefix: string) => `${prefix}${replacement}`);
    case "token": {
      const suffix = utilitySuffix(ref.key);
      const next = utilitySuffix(replacement);
      return html.replace(pattern, (match: string) => {
        if (match.startsWith("var(")) return `var(--${replacement})`;
        if (!suffix || !next) return match;
        return match.slice(0, match.length - suffix.value.length) + next.value;
      });
    }
  }
}

/** Re-target token references (values, and breakpoint-suffixed names). */
export function rewriteTokens(ref: PrimitiveRef, replacement: string, tokens: readonly Token[]): Token[] {
  return tokens.map((token) => {
    if (!tokenMatches(ref, token)) return token;
    switch (ref.kind) {
      case "token":
        return { ...token, value: token.value.split(`var(--${ref.key})`).join(`var(--${replacement})`) };
      case "semanticRole": {
        let value = token.value.split(`var(--color-${ref.key})`).join(`var(--color-${replacement})`);
        for (const context of (ref.contexts ?? []).filter((candidate) => candidate !== "default")) {
          value = value.split(`var(--color-${context}-${ref.key})`).join(`var(--color-${context}-${replacement})`);
        }
        return { ...token, value };
      }
      case "colorContext": {
        const target = replacement === "default" ? "var(--color-" : `var(--color-${replacement}-`;
        return { ...token, value: token.value.split(`var(--color-${ref.key}-`).join(target) };
      }
      case "breakpoint": {
        const base = token.name.slice(0, -(ref.key.length + 1));
        return { ...token, name: replacement === "base" ? base : `${base}-${replacement}` };
      }
      case "container":
        return token;
    }
  });
}

/** Re-target the type scale's references to a token onto its replacement's key. */
export function rewriteTypeScale(ref: PrimitiveRef, replacement: string, entries: readonly TypeScaleEntry[]): TypeScaleEntry[] {
  const target = ref.kind === "token" ? scaleField(ref.key) : null;
  const next = scaleField(replacement);
  if (!target || !next || target.field !== next.field) return entries.map((entry) => ({ ...entry }));
  return entries.map((entry) => (entry[target.field] === target.key ? { ...entry, [target.field]: next.key } : { ...entry }));
}

/** Every usage of each primitive moved onto `replacement`, in the system's own sources. */
export function retarget(system: DesignSystem, refs: readonly PrimitiveRef[], replacement: string): DesignSystem {
  let tokens = system.tokens;
  let typeScale = system.typeScale;
  for (const ref of refs) {
    tokens = rewriteTokens(ref, replacement, tokens);
    typeScale = rewriteTypeScale(ref, replacement, typeScale);
  }
  const seen = new Set<string>();
  tokens = tokens.filter((token) => !seen.has(token.name) && !!seen.add(token.name));
  return { ...system, tokens, typeScale };
}

/** Every library document that uses one of the primitives, rewritten onto `replacement`
 * and handed to the host to keep. The host's data is updated in place. */
export async function retargetLibrary(library: LibraryHost | undefined, refs: readonly PrimitiveRef[], replacement: string): Promise<string | null> {
  if (!library) return null;
  const rewrite = (html: string) => refs.reduce((out, ref) => rewriteHtml(ref, replacement, out), html);
  const problems: string[] = [];
  const keep = async (result: Promise<string | null> | string | null | undefined) => {
    const problem = await result;
    if (problem) problems.push(problem);
  };
  for (const pattern of library.patterns) {
    const html = rewrite(pattern.html);
    if (html === pattern.html) continue;
    pattern.html = html;
    await keep(library.savePattern?.(pattern));
  }
  for (const template of library.templates) {
    const html = rewrite(template.html);
    if (html === template.html) continue;
    template.html = html;
    await keep(library.saveTemplate?.(template.name, html));
  }
  for (const part of library.parts) {
    const html = rewrite(part.html);
    if (html === part.html) continue;
    part.html = html;
    await keep(library.savePart?.(part.name, html));
  }
  return problems[0] ?? null;
}
