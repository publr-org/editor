// patterns.ts — the GLOBAL pattern registry, registerBlock's sibling surface.
// A pattern is a NAMED, PREDEFINED block composition: an annotated-HTML
// fragment (data-pb-* wire format) the editor stamps into the document as an
// INDEPENDENT COPY — pure composition, no reference, no sync. (Shared/synced
// reusable content is a separate future concept — Components, Phase E/F.)
//
// The content is the schema, same philosophy as the block probe: registration
// upcasts the fragment and validates the RESULT — every block in the
// expansion must be a REGISTERED type (register blocks first, patterns
// second; the fragment is authored against the same wire contract documents
// use), and the expansion must total at least two blocks (a one-block
// "pattern" is a block definition wearing a costume — patterns exist to
// compose). Definitions are validated hard and frozen; the registry stays
// live (register/unregister at any time).

import { RAW_TYPE, str } from "./carriers";
import type { Block } from "./carriers";
import { upcast } from "./cast";
import { getBlockType } from "./registry";
import { flattenBlocks } from "./tree";

/** What registerPattern accepts: label + content, plus inserter metadata. */
export interface PatternDefinition {
  label: string;
  /** Annotated-HTML fragment (one or more sibling block elements, data-pb-* wire format). */
  content: string;
  /**
   * Definition semver, "major.minor" (patch reserved) — defaults to "1.0".
   * Publishing (template-editor save) bumps it from the structural diff:
   * removals/type changes = major (updating a consumer can lose content),
   * everything else = minor. Instances pin the version they stamped from.
   */
  version?: string;
  /** Inserter shelf the pattern files under (e.g. "Heroes", "Call to action"). */
  category?: string;
  /** One-liner for chrome surfaces (what the composition is for). */
  description?: string;
  /** Icon name chrome resolves against its icon set — see SettingOption.icon. */
  icon?: string;
  /** Semantic color context applied to fresh instances. Defaults to `default`. */
  defaultColorContext?: string;
  /** Theme color contexts hidden from this pattern instance's context picker. */
  disabledColorContexts?: readonly string[];
}

/** A validated, frozen registry entry. */
export interface PatternType {
  readonly label: string;
  readonly content: string;
  readonly version: string;
  readonly category?: string;
  readonly description?: string;
  readonly icon?: string;
  readonly defaultColorContext?: string;
  readonly disabledColorContexts?: readonly string[];
}

/**
 * The block type a stamp wraps its blocks in — the pattern ROOT: a phantom
 * container carrying the instance's identity (and, later, template-only
 * options) with no published output. Registered like any block (the core set
 * ships one, src/blocks/pattern-root.ts); hosts that skip it get bare-root
 * stamps with provenance on the fragment roots instead.
 */
export const PATTERN_ROOT_TYPE = "pattern";

const NAME = /^[a-z][a-z0-9-]*$/;
const VERSION = /^\d+\.\d+$/;

const registry = new Map<string, PatternType>();

// Superseded content per published version — the BASE a three-way update
// merge needs to tell a user's local edit from a value they never touched.
// Session-scoped like the registry itself (the Phase E definition store
// keeps this server-side).
const archive = new Map<string, Map<string, string>>();

function fail(ctx: string, msg: string): never {
  throw new Error(`PublrEditor: ${ctx}: ${msg}`);
}

export function registerPattern(name: string, def: PatternDefinition): PatternType {
  const ctx = `registerPattern("${name}")`;
  if (!NAME.test(name ?? "")) fail(ctx, "name must be a lowercase name");
  if (registry.has(name)) fail(ctx, "already registered");
  if (def === null || typeof def !== "object") fail(ctx, "definition must be an object");
  for (const key of Object.keys(def)) {
    if (
      ![
        "label",
        "content",
        "version",
        "category",
        "description",
        "icon",
        "defaultColorContext",
        "disabledColorContexts",
      ].includes(key)
    )
      fail(ctx, `unknown key "${key}"`);
  }
  if (typeof def.label !== "string" || !def.label) fail(ctx, "label is required");
  if (typeof def.content !== "string" || !def.content.trim())
    fail(ctx, "content (annotated-HTML fragment) is required");
  if ("version" in def && (typeof def.version !== "string" || !VERSION.test(def.version)))
    fail(ctx, 'version must be "major.minor" (e.g. "1.0")');
  if ("category" in def && (typeof def.category !== "string" || !def.category))
    fail(ctx, "category must be a non-empty string");
  if ("description" in def && (typeof def.description !== "string" || !def.description))
    fail(ctx, "description must be a non-empty string");
  if ("icon" in def && (typeof def.icon !== "string" || !def.icon))
    fail(ctx, "icon must be a non-empty string");
  if (
    "defaultColorContext" in def &&
    (typeof def.defaultColorContext !== "string" || !NAME.test(def.defaultColorContext))
  )
    fail(ctx, "defaultColorContext must be a lowercase name");
  if (
    "disabledColorContexts" in def &&
    (!Array.isArray(def.disabledColorContexts) ||
      def.disabledColorContexts.some((key) => typeof key !== "string" || !NAME.test(key)))
  )
    fail(ctx, "disabledColorContexts must be an array of lowercase names");
  const disabledColorContexts = [...new Set(def.disabledColorContexts ?? [])];
  if (def.defaultColorContext && disabledColorContexts.includes(def.defaultColorContext))
    fail(ctx, "defaultColorContext cannot also be disabled");

  // Validate the EXPANSION, not the markup: upcast the fragment exactly the
  // way insertPattern will and inspect what comes out.
  const tmp = document.createElement("div");
  tmp.innerHTML = def.content;
  if (!tmp.children.length) fail(ctx, "content must contain at least one block element");
  const blocks = upcast(tmp).blocks;
  const all = flattenBlocks(blocks);
  for (const b of all) {
    if (b.type === RAW_TYPE) {
      // Raw-html has two sources: markup naming a block type that isn't
      // registered (a MISTAKE this check exists to catch — the fragment is
      // broken), vs genuinely untagged markup (decorative SVG, an embed —
      // LEGITIMATE, passes through verbatim, common in real sections). Tell
      // them apart by the root: a `data-pb-block` attribute means an
      // unregistered type was referenced.
      const probe = document.createElement("div");
      probe.innerHTML = str(b.fields.html);
      if (probe.firstElementChild?.hasAttribute("data-pb-block"))
        fail(
          ctx,
          "content references an unregistered block type — register the blocks before the pattern",
        );
      continue; // untagged raw markup is allowed
    }
    // A carrier naming a field the type's render doesn't declare would lose
    // its content on the first re-render (the render never reads it back) —
    // the silent-drift class the probe kills for renders, killed here for
    // fragments.
    const known = new Set(getBlockType(b.type)!.fields.map((f) => f.name));
    for (const field of Object.keys(b.fields)) {
      if (!known.has(field))
        fail(ctx, `"${b.type}" does not carry a field "${field}" — the fragment would drop it`);
    }
  }
  if (all.length < 2)
    fail(ctx, "content must expand to at least two blocks — one block is a block, not a pattern");

  const frozen: PatternType = Object.freeze({
    label: def.label,
    content: def.content,
    version: def.version ?? "1.0",
    ...(def.category != null ? { category: def.category } : {}),
    ...(def.description != null ? { description: def.description } : {}),
    ...(def.icon != null ? { icon: def.icon } : {}),
    ...(def.defaultColorContext != null ? { defaultColorContext: def.defaultColorContext } : {}),
    ...(disabledColorContexts.length
      ? { disabledColorContexts: Object.freeze(disabledColorContexts) }
      : {}),
  });
  registry.set(name, frozen);
  return frozen;
}

export function unregisterPattern(name: string): boolean {
  archive.delete(name);
  return registry.delete(name);
}

export const getPattern = (name: string): PatternType | undefined => registry.get(name);

/** All registered patterns in registration order: [{ name, label, content, … }, …]. Inserter fodder. */
export function patternTypes(): ({ name: string } & PatternType)[] {
  return Array.from(registry, ([name, def]) => ({ name, ...def }));
}

/**
 * Publish new content for a registered pattern — THE definition-update path
 * (template-editor save). Derives the bump from the structural diff (none →
 * version unchanged, nothing re-registers), re-registers through the same
 * hard validation (a failing publish restores the old definition and
 * rethrows), and ARCHIVES the superseded content under its version so
 * updates can three-way merge against the instance's pinned base.
 */
export function publishPattern(
  name: string,
  content: string,
  colorSettings?: Pick<PatternDefinition, "defaultColorContext" | "disabledColorContexts">,
): { version: string; kind: "none" | "minor" | "major" } {
  const def = registry.get(name);
  if (!def) fail(`publishPattern("${name}")`, "not registered");
  const defaultColorContext =
    colorSettings && "defaultColorContext" in colorSettings
      ? colorSettings.defaultColorContext
      : def.defaultColorContext;
  const disabledColorContexts =
    colorSettings && "disabledColorContexts" in colorSettings
      ? colorSettings.disabledColorContexts
      : def.disabledColorContexts;
  const colorSettingsChanged =
    defaultColorContext !== def.defaultColorContext ||
    JSON.stringify(disabledColorContexts ?? []) !== JSON.stringify(def.disabledColorContexts ?? []);
  const contentKind = diffPatternContent(def.content, content);
  const kind = contentKind === "none" && colorSettingsChanged ? "minor" : contentKind;
  if (kind === "none") return { version: def.version, kind };
  const version = bumpPatternVersion(def.version, kind);
  const meta = {
    label: def.label,
    ...(def.category != null ? { category: def.category } : {}),
    ...(def.description != null ? { description: def.description } : {}),
    ...(def.icon != null ? { icon: def.icon } : {}),
    ...(defaultColorContext != null ? { defaultColorContext } : {}),
    ...(disabledColorContexts?.length ? { disabledColorContexts } : {}),
  };
  const superseded = archive.get(name); // unregister clears it — hold on
  registry.delete(name);
  try {
    registerPattern(name, { ...meta, version, content });
  } catch (err) {
    registry.set(name, def);
    throw err;
  }
  const versions = superseded ?? new Map<string, string>();
  versions.set(def.version, def.content);
  archive.set(name, versions);
  return { version, kind };
}

/** A version's content: the latest from the registry, older ones from the archive. */
export function getPatternContent(name: string, version: string): string | undefined {
  const def = registry.get(name);
  if (def?.version === version) return def.content;
  return archive.get(name)?.get(version);
}

// --- versioning ---------------------------------------------------------------

/** "2.1" vs "2.0" → 1; equal → 0. Malformed input sorts as 1.0. */
export function comparePatternVersions(a: string, b: string): number {
  const parse = (v: string): [number, number] =>
    VERSION.test(v) ? (v.split(".").map(Number) as [number, number]) : [1, 0];
  const [aM, am] = parse(a);
  const [bM, bm] = parse(b);
  return aM - bM || am - bm;
}

/** The published version after a save: major → M+1.0, minor → M.m+1. */
export function bumpPatternVersion(version: string, kind: "major" | "minor"): string {
  const [major, minor] = VERSION.test(version)
    ? (version.split(".").map(Number) as [number, number])
    : [1, 0];
  return kind === "major" ? `${major + 1}.0` : `${major}.${minor + 1}`;
}

// Structural matching for the bump derivation: pair old and new siblings in
// order with skip-ahead — an inserted block shifts nothing, a removed one
// simply never matches. Same-type runs are ambiguous (three paragraphs in a
// row), so an IDENTICAL candidate (same fields/classes/settings) is
// preferred over the first type match. (Will also serve the Symbol
// "Update from Source" flow, Phase E/F — thoughts/012.)
export function matchBlocks(
  oldB: readonly Block[],
  newB: readonly Block[],
): { pairs: [number, number][]; removed: number[]; added: number[] } {
  const shape = (b: Block) =>
    JSON.stringify({ f: b.fields, c: b.classes ?? "", s: b.settings ?? {} });
  const pairs: [number, number][] = [];
  const removed: number[] = [];
  let from = 0;
  for (let i = 0; i < oldB.length; i++) {
    const typed = (k: number) => k >= from && newB[k].type === oldB[i].type;
    const exact = newB.findIndex((n, k) => typed(k) && shape(n) === shape(oldB[i]));
    const j = exact !== -1 ? exact : newB.findIndex((_, k) => typed(k));
    if (j === -1) removed.push(i);
    else {
      pairs.push([i, j]);
      from = j + 1;
    }
  }
  const matchedNew = new Set(pairs.map(([, j]) => j));
  const added = newB.map((_, k) => k).filter((k) => !matchedNew.has(k));
  return { pairs, removed, added };
}

/**
 * The bump a save deserves: walk old vs new content structurally. A removed
 * or type-changed block means updating a consumer can lose content → MAJOR.
 * Additions, class/settings changes, and copy edits → MINOR. Byte-identical
 * trees → NONE (no bump for a no-op save).
 */
export function diffPatternContent(
  oldContent: string,
  newContent: string,
): "none" | "minor" | "major" {
  const parse = (html: string): Block[] => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return upcast(tmp).blocks;
  };
  return diffBlocks(parse(oldContent), parse(newContent));
}

function diffBlocks(oldB: Block[], newB: Block[]): "none" | "minor" | "major" {
  const { pairs, removed, added } = matchBlocks(oldB, newB);
  if (removed.length) return "major";
  let kind: "none" | "minor" = added.length ? "minor" : "none";
  const shape = (b: Block) =>
    JSON.stringify({ f: b.fields, c: b.classes ?? "", s: b.settings ?? {} });
  for (const [i, j] of pairs) {
    if (shape(oldB[i]) !== shape(newB[j])) kind = "minor";
    const child = diffBlocks(oldB[i].children ?? [], newB[j].children ?? []);
    if (child === "major") return "major";
    if (child === "minor") kind = "minor";
  }
  return kind;
}

// --- content surface ----------------------------------------------------------
// Inside the MAIN editor a pattern instance is a CONTENT-EDITING surface
// (thoughts/012): only content-bearing blocks are reachable —
// layout containers (tag-only fields) and invisible utility blocks (spacer,
// separator) belong to the isolation editor. A content block is the editable
// UNIT (no descending into a cover's innards).

/** True when the block carries author-editable content (any non-tag field). */
export const isPatternContentBlock = (b: Block): boolean =>
  b.type !== RAW_TYPE && !!getBlockType(b.type)?.fields.some((f) => f.type !== "tag");

/** The pattern instance's editable units, document order (see above). */
export function patternContentBlocks(root: Block): Block[] {
  const out: Block[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (isPatternContentBlock(b))
        out.push(b); // the editable unit — don't descend
      else if (b.children) walk(b.children);
    }
  };
  walk(root.children ?? []);
  return out;
}
