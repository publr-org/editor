// templates.ts — shared page templates and template parts.
//
// Patterns are copy-time compositions. Templates are different: a document
// selects one shared page structure, and template-part blocks inside that
// structure remain references to shared definitions. Editing a part therefore
// changes every template/page that resolves that part.

import { RAW_TYPE, str } from "./carriers";
import type { Block, Model } from "./carriers";
import { downcast, upcast } from "./cast";
import { getBlockType } from "./registry";
import { flattenBlocks } from "./tree";

export const TEMPLATE_PART_TYPE = "template-part";
export const TEMPLATE_SLOT_TYPE = "template-slot";

export type TemplateSlotName = "content" | "title" | "featured-image";

export const TEMPLATE_SLOTS: readonly {
  name: TemplateSlotName;
  label: string;
}[] = [
  { name: "content", label: "Content" },
  { name: "title", label: "Title" },
  { name: "featured-image", label: "Featured image" },
];

export interface TemplateDefinition {
  label: string;
  /** Annotated editor HTML. Slots and template-part references are optional. */
  content: string;
  description?: string;
}

export interface TemplatePartDefinition extends TemplateDefinition {
  /** Conventional placement used by library UIs; it has no render semantics. */
  area?: "header" | "footer" | "general";
}

export interface TemplateType {
  readonly label: string;
  readonly content: string;
  readonly description?: string;
}

export interface TemplatePartType extends TemplateType {
  readonly area: "header" | "footer" | "general";
}

export interface TemplateSlotValues {
  /** Published document HTML. */
  content: string;
  /** Plain text; escaped by the renderer. */
  title?: string;
  /** Trusted published image HTML supplied by the host. */
  featuredImage?: string;
}

// CMS template ids may be namespaced (`single:article`); ordinary theme
// definitions remain the familiar lowercase dashed names.
const NAME = /^[a-z][a-z0-9-]*(?::[A-Za-z0-9_-]+)?$/;
const templates = new Map<string, TemplateType>();
const parts = new Map<string, TemplatePartType>();
const stringSetting = (block: Block, name: string, fallback = ""): string => {
  const value = block.settings?.[name];
  return typeof value === "string" ? value : fallback;
};

function fail(ctx: string, message: string): never {
  throw new Error(`PublrEditor: ${ctx}: ${message}`);
}

function validateName(name: string, ctx: string): void {
  if (!NAME.test(name ?? "")) fail(ctx, "name must be a lowercase name");
}

function parseAndValidate(content: string, ctx: string): Model {
  if (typeof content !== "string" || !content.trim())
    fail(ctx, "content (annotated-HTML fragment) is required");
  const root = document.createElement("div");
  root.innerHTML = content;
  if (!root.children.length) fail(ctx, "content must contain at least one block element");
  const model = upcast(root);
  for (const block of flattenBlocks(model.blocks)) {
    if (block.type === RAW_TYPE) {
      const probe = document.createElement("div");
      probe.innerHTML = str(block.fields.html);
      if (probe.firstElementChild?.hasAttribute("data-pb-block"))
        fail(ctx, "content references an unregistered block type");
      continue;
    }
    const def = getBlockType(block.type)!;
    const fields = new Set(def.fields.map((field) => field.name));
    for (const field of Object.keys(block.fields)) {
      if (!fields.has(field)) fail(ctx, `"${block.type}" does not carry a field "${field}"`);
    }
  }
  return model;
}

function validateTemplateModel(model: Model, ctx: string): void {
  const seenSlots = new Set<string>();
  for (const block of flattenBlocks(model.blocks)) {
    if (block.type === TEMPLATE_SLOT_TYPE) {
      const slot = stringSetting(block, "name", "content");
      if (!TEMPLATE_SLOTS.some((candidate) => candidate.name === slot))
        fail(ctx, `unknown template slot "${slot}"`);
      if (seenSlots.has(slot)) fail(ctx, `template slot "${slot}" is used more than once`);
      seenSlots.add(slot);
    }
    if (block.type === TEMPLATE_PART_TYPE) {
      const name = stringSetting(block, "name");
      if (!name || !parts.has(name))
        fail(ctx, `template part "${name || "(empty)"}" is not registered`);
    }
  }
}

function frozenTemplate(definition: TemplateDefinition): TemplateType {
  return Object.freeze({
    label: definition.label,
    content: definition.content,
    ...(definition.description ? { description: definition.description } : {}),
  });
}

function validateDefinition(
  definition: TemplateDefinition,
  ctx: string,
  extraKeys: readonly string[] = [],
): void {
  if (definition === null || typeof definition !== "object")
    fail(ctx, "definition must be an object");
  for (const key of Object.keys(definition)) {
    if (!["label", "content", "description", ...extraKeys].includes(key))
      fail(ctx, `unknown key "${key}"`);
  }
  if (typeof definition.label !== "string" || !definition.label) fail(ctx, "label is required");
  if (
    definition.description != null &&
    (typeof definition.description !== "string" || !definition.description)
  )
    fail(ctx, "description must be a non-empty string");
}

export function registerTemplatePart(
  name: string,
  definition: TemplatePartDefinition,
): TemplatePartType {
  const ctx = `registerTemplatePart("${name}")`;
  validateName(name, ctx);
  if (parts.has(name)) fail(ctx, "already registered");
  validateDefinition(definition, ctx, ["area"]);
  if (definition.area != null && !["header", "footer", "general"].includes(definition.area))
    fail(ctx, 'area must be "header", "footer", or "general"');
  parseAndValidate(definition.content, ctx);
  const frozen: TemplatePartType = Object.freeze({
    ...frozenTemplate(definition),
    area: definition.area ?? "general",
  });
  parts.set(name, frozen);
  return frozen;
}

export function unregisterTemplatePart(name: string): boolean {
  return parts.delete(name);
}

export const getTemplatePart = (name: string): TemplatePartType | undefined => parts.get(name);

export function templatePartTypes(): ({ name: string } & TemplatePartType)[] {
  return Array.from(parts, ([name, definition]) => ({ name, ...definition }));
}

export function publishTemplatePart(name: string, content: string): TemplatePartType {
  const current = parts.get(name);
  if (!current) fail(`publishTemplatePart("${name}")`, "not registered");
  parseAndValidate(content, `publishTemplatePart("${name}")`);
  const next: TemplatePartType = Object.freeze({ ...current, content });
  parts.set(name, next);
  return next;
}

export function registerTemplate(name: string, definition: TemplateDefinition): TemplateType {
  const ctx = `registerTemplate("${name}")`;
  validateName(name, ctx);
  if (templates.has(name)) fail(ctx, "already registered");
  validateDefinition(definition, ctx);
  const model = parseAndValidate(definition.content, ctx);
  validateTemplateModel(model, ctx);
  const frozen = frozenTemplate(definition);
  templates.set(name, frozen);
  return frozen;
}

export function unregisterTemplate(name: string): boolean {
  return templates.delete(name);
}

export const getTemplate = (name: string): TemplateType | undefined => templates.get(name);

export function templateTypes(): ({ name: string } & TemplateType)[] {
  return Array.from(templates, ([name, definition]) => ({ name, ...definition }));
}

export function publishTemplate(name: string, content: string): TemplateType {
  const current = templates.get(name);
  if (!current) fail(`publishTemplate("${name}")`, "not registered");
  const model = parseAndValidate(content, `publishTemplate("${name}")`);
  validateTemplateModel(model, `publishTemplate("${name}")`);
  const next: TemplateType = Object.freeze({ ...current, content });
  templates.set(name, next);
  return next;
}

/** Resolve a content-type choice, falling back to the theme's general template. */
export function resolveTemplate(
  name: string | null | undefined,
  fallback = "default",
): ({ name: string } & TemplateType) | undefined {
  const selected = (name && templates.get(name)) || templates.get(fallback);
  if (!selected) return undefined;
  return { name: name && templates.has(name) ? name : fallback, ...selected };
}

function cloneBlocks(content: string): Block[] {
  const root = document.createElement("div");
  root.innerHTML = content;
  return structuredClone(upcast(root).blocks);
}

/**
 * Hydrate every template-part reference with its latest shared definition.
 * The wrapper identity/settings stay in the template; only its children are
 * definition-owned. This is used whenever a template enters its isolated
 * editor, so a part edit is visible from every consuming template.
 */
export function hydrateTemplateParts(content: string, ancestors: readonly string[] = []): string {
  const root = document.createElement("div");
  root.innerHTML = content;
  const model = upcast(root);
  const hydrate = (blocks: Block[], chain: readonly string[]) => {
    for (const block of blocks) {
      if (block.type === TEMPLATE_PART_TYPE) {
        const name = stringSetting(block, "name");
        const part = parts.get(name);
        // Recursive references remain visible as their authored fallback,
        // but do not recurse forever. Explicitly opening that reference still
        // works, so authors can navigate every registered configuration.
        if (part && !chain.includes(name)) {
          block.children = cloneBlocks(part.content);
          hydrate(block.children, [...chain, name]);
          continue;
        }
      }
      if (block.children) hydrate(block.children, chain);
    }
  };
  hydrate(model.blocks, ancestors);
  return downcast(model);
}

function replaceWithHtml(element: Element, html: string): void {
  const fragment = document.createElement("template");
  fragment.innerHTML = html;
  element.replaceWith(fragment.content);
}

/**
 * Publish a template definition into a document-shaped HTML fragment.
 * Shared parts are resolved first, editing vocabulary is stripped, and every
 * declared slot is replaced. A missing Content slot appends document content,
 * matching the CMS fallback contract.
 */
export function renderTemplateContent(content: string, values: TemplateSlotValues): string {
  const hydrated = document.createElement("div");
  hydrated.innerHTML = hydrateTemplateParts(content);
  const published = downcast(upcast(hydrated), "data");
  const root = document.createElement("div");
  root.innerHTML = published;

  let contentFilled = false;
  for (const slot of root.querySelectorAll<HTMLElement>("[data-publr-slot]")) {
    const rawName = slot.dataset.publrSlot;
    const name = rawName === "entry-content" ? "content" : rawName;
    if (name === "content") {
      replaceWithHtml(slot, values.content);
      contentFilled = true;
    } else if (name === "title") {
      slot.replaceWith(document.createTextNode(values.title ?? ""));
    } else if (name === "featured-image") {
      replaceWithHtml(slot, values.featuredImage ?? "");
    }
  }
  if (!contentFilled && values.content) {
    const fragment = document.createElement("template");
    fragment.innerHTML = values.content;
    root.append(fragment.content);
  }
  return root.innerHTML;
}

/** Resolve and render a named template; an absent registry definition is a
 * transparent content-only fallback. */
export function renderTemplate(
  name: string | null | undefined,
  values: TemplateSlotValues,
  fallback = "default",
): string {
  const definition = resolveTemplate(name, fallback);
  return definition ? renderTemplateContent(definition.content, values) : values.content;
}
