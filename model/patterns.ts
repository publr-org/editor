// Patterns: named compositions stamped into a document as fully decoupled copies. A
// pattern is not a block and not wire vocabulary: stamping is `upcast(fragment)` with
// fresh ids, wrapped in the phantom pattern root that names its provenance. Editing the
// library design publishes a new version and never touches a placed copy; versions bump
// by what changed (removals major, anything else minor) and every superseded one is kept.
//
// A pattern may carry variants (complete alternative compositions, at least two, one the
// default) and color settings (the context a fresh copy wears, and contexts its copies
// may not pick). `html` is always the default variant's composition.
import { fresh, upcastBlocks } from "./codec";
import { reidentified } from "./editor";
import { blockType } from "./registry";
import { flatten } from "./tree";
import type { Block } from "./types";
import { RAW_TYPE } from "./types";

export type PatternVariant = {
  /** Stable, wire-safe identity; labels may change without moving placed copies. */
  name: string;
  label: string;
  description?: string;
  html: string;
};

export type PatternSettings = {
  variants?: readonly PatternVariant[];
  /** The variant stamped when none is chosen; the first one when left out. */
  defaultVariant?: string;
  /** The color context a fresh copy wears (`default` when left out). */
  defaultColorContext?: string;
  /** Contexts a copy of this pattern may not wear. */
  disabledColorContexts?: readonly string[];
};

export type PatternDefinition = PatternSettings & {
  label: string;
  category: string;
  description?: string;
  keywords?: readonly string[];
  /** An annotated-HTML fragment composing registered blocks (the default variant's). */
  html: string;
};

export type Pattern = PatternDefinition & { name: string; version: string; history: { version: string; html: string }[] };

const patterns = new Map<string, Pattern>();
let revision = 0;

const NAME = /^[a-z][a-z0-9-]*$/;

/** Throws unless the fragment expands to registered blocks only, at least two of them. */
function validate(name: string, html: string): Block[] {
  const blocks = upcastBlocks(html);
  const all = flatten(blocks);
  const raw = all.find((block) => block.type === RAW_TYPE);
  if (raw) throw new Error(`editor: pattern "${name}" has markup that is not a registered block: ${String(raw.fields.html).slice(0, 60)}`);
  if (all.length < 2) throw new Error(`editor: pattern "${name}" must compose at least two blocks`);
  return blocks;
}

/** The settings as they are kept: variants checked, the default named, contexts deduplicated. */
function settled(name: string, settings: PatternSettings): PatternSettings {
  const out: PatternSettings = {};
  if (settings.variants && settings.variants.length > 0) {
    if (settings.variants.length < 2) throw new Error(`editor: pattern "${name}" needs at least two variants, or none`);
    const names = new Set<string>();
    out.variants = settings.variants.map((variant) => {
      if (!NAME.test(variant.name)) throw new Error(`editor: pattern "${name}" variant name "${variant.name}" must match ${NAME}`);
      if (names.has(variant.name)) throw new Error(`editor: pattern "${name}" has two variants named "${variant.name}"`);
      names.add(variant.name);
      if (!variant.label.trim()) throw new Error(`editor: pattern "${name}" variant "${variant.name}" needs a label`);
      validate(name, variant.html);
      return { name: variant.name, label: variant.label.trim(), ...(variant.description?.trim() ? { description: variant.description.trim() } : {}), html: variant.html };
    });
    out.defaultVariant = settings.defaultVariant ?? out.variants[0].name;
    if (!names.has(out.defaultVariant)) throw new Error(`editor: pattern "${name}" default variant "${out.defaultVariant}" is not one of its variants`);
  } else if (settings.defaultVariant) {
    throw new Error(`editor: pattern "${name}" names a default variant but has no variants`);
  }
  const disabled = [...new Set(settings.disabledColorContexts ?? [])];
  if (settings.defaultColorContext && settings.defaultColorContext !== "default") out.defaultColorContext = settings.defaultColorContext;
  if (disabled.includes(settings.defaultColorContext ?? "default")) throw new Error(`editor: pattern "${name}" cannot disable its default color context`);
  if (disabled.length) out.disabledColorContexts = disabled;
  return out;
}

export function registerPattern(name: string, definition: PatternDefinition): void {
  if (!NAME.test(name)) throw new Error(`editor: pattern name "${name}" must match ${NAME}`);
  if (patterns.has(name)) throw new Error(`editor: pattern "${name}" is already registered`);
  const settings = settled(name, definition);
  const html = settings.variants?.find((variant) => variant.name === settings.defaultVariant)?.html ?? definition.html;
  validate(name, html);
  const { variants: _variants, defaultVariant: _default, defaultColorContext: _context, disabledColorContexts: _disabled, ...meta } = definition;
  patterns.set(name, { ...meta, ...settings, html, name, version: "1.0", history: [] });
  revision++;
}

export function unregisterPattern(name: string): void {
  patterns.delete(name);
  revision++;
}

export const patternRevision = () => revision;

export const getPattern = (name: string) => patterns.get(name) ?? null;

export const allPatterns = () => [...patterns.values()];

/** Categories in first-registered order. */
export function patternCategories(): string[] {
  return [...new Set(allPatterns().map((pattern) => pattern.category))];
}

export function searchPatterns(query: string, category?: string): Pattern[] {
  const needle = query.trim().toLowerCase();
  return allPatterns().filter(
    (pattern) =>
      (!category || pattern.category === category) &&
      (!needle || pattern.label.toLowerCase().includes(needle) || pattern.name.includes(needle) || (pattern.keywords ?? []).some((word) => word.includes(needle)) || (pattern.description ?? "").toLowerCase().includes(needle)),
  );
}

/** A variant's composition: the named one, else the default. */
export function variantHtml(name: string, variant?: string): string {
  const pattern = patterns.get(name);
  if (!pattern) return "";
  return (variant && pattern.variants?.find((candidate) => candidate.name === variant)?.html) || pattern.html;
}

/** A fresh copy of a pattern: a pattern root with new ids, its blocks as they are today. */
export function stampPattern(name: string, variant?: string): Block {
  const pattern = patterns.get(name);
  const root = blockType("pattern");
  if (!pattern || !root) throw new Error(`editor: no pattern "${name}"`);
  const block = fresh(root);
  block.pattern = name;
  block.slots = { children: upcastBlocks(variantHtml(name, variant)).map(reidentified) };
  const chosen = variant && pattern.variants?.some((candidate) => candidate.name === variant) ? variant : pattern.defaultVariant;
  if (chosen) block.settings = { ...block.settings, variant: chosen };
  return block;
}

/** The blocks of a pattern's library design, for editing it in isolation. */
export const patternBlocks = (name: string, variant?: string): Block[] => upcastBlocks(variantHtml(name, variant));

/** Types in document order, a structural fingerprint for the version bump. */
const shape = (html: string) => flatten(upcastBlocks(html)).map((block) => block.type);

/**
 * Publishes a new library design, and with `settings` its variants and color settings.
 * Refused (with the reason) when it would not be a pattern any more; placed copies are
 * never touched. A removed block or variant is a major bump, anything else minor.
 */
export function publishPattern(name: string, html: string, settings?: PatternSettings): { ok: true; version: string } | { ok: false; error: string } {
  const pattern = patterns.get(name);
  if (!pattern) return { ok: false, error: `No pattern "${name}".` };
  let next: PatternSettings;
  try {
    next = settled(name, settings ?? pattern);
    validate(name, html);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.replace(/^editor: /, "") : String(error) };
  }
  const designed = next.variants?.find((variant) => variant.name === next.defaultVariant)?.html ?? html;
  const before = shape(pattern.html);
  const after = shape(designed);
  const count = (list: string[], type: string) => list.filter((candidate) => candidate === type).length;
  const variantRemoved = (pattern.variants ?? []).some((variant) => !next.variants?.some((candidate) => candidate.name === variant.name));
  const removed = variantRemoved || before.some((type) => count(before, type) > count(after, type));
  const [major, minor] = pattern.version.split(".").map(Number);
  const version = removed ? `${major + 1}.0` : `${major}.${minor + 1}`;
  pattern.history.push({ version: pattern.version, html: pattern.html });
  pattern.html = designed;
  pattern.version = version;
  pattern.variants = next.variants;
  pattern.defaultVariant = next.defaultVariant;
  pattern.defaultColorContext = next.defaultColorContext;
  pattern.disabledColorContexts = next.disabledColorContexts;
  revision++;
  return { ok: true, version };
}

/** A superseded design, by version. */
export function patternVersion(name: string, version: string): string | null {
  const pattern = patterns.get(name);
  if (!pattern) return null;
  if (pattern.version === version) return pattern.html;
  return pattern.history.find((entry) => entry.version === version)?.html ?? null;
}

/** Whether a block is content (text, rich text or media), as a pattern's outline lists it. */
export function isContent(block: Block): boolean {
  const type = blockType(block.type);
  return !!type && type.fields.some((field) => field.kind === "text" || field.kind === "rich" || field.kind === "image");
}

/** The content blocks inside a block, recursively, layout and invisible blocks left out. */
export function contentOf(block: Block): Block[] {
  return flatten(Object.values(block.slots ?? {}).flat()).filter(isContent);
}
