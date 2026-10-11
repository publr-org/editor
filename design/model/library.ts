// The library pages' model: the app's patterns in the editor's registry, a template
// drawn with its parts in place for a preview, and the blocks Primitive blocks lists
// with the starting document each one opens on.
import { Publr } from "publr-jsx";
import { Editor } from "../../model/editor";
import { getPattern, registerPattern, unregisterPattern } from "../../model/patterns";
import { blockType, blockTypes } from "../../model/registry";
import { RAW_TYPE } from "../../model/types";
import type { LibraryData, LibraryPart, LibraryTemplate } from "../library/host";

const CATEGORY_LABELS: Record<string, string> = { text: Publr.t("Text"), media: Publr.t("Media"), design: Publr.t("Design"), layout: Publr.t("Layout"), widgets: Publr.t("Widgets") };
const CATEGORY_ORDER = ["text", "media", "design", "layout", "widgets"];

export const categoryLabel = (category: string | undefined) => CATEGORY_LABELS[category ?? ""] ?? (category ? category[0].toUpperCase() + category.slice(1) : Publr.t("Other"));

const registered = new WeakSet<object>();

/** Puts the app's patterns in the editor's registry, replacing any of the same name;
 * once per host's library. */
export function registerLibraryPatterns(library: LibraryData): void {
  if (registered.has(library)) return;
  registered.add(library);
  for (const pattern of library.patterns) {
    if (getPattern(pattern.name)) unregisterPattern(pattern.name);
    try {
      registerPattern(pattern.name, { label: pattern.label, category: pattern.category, description: pattern.description, html: pattern.html });
    } catch (error) {
      console.warn(`[publr-editor] pattern ${pattern.name}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

/** A template with each part drawn in place and its slots holding stand-in content, as
 * the preview cards and the old builder show them. */
export function templatePreview(template: LibraryTemplate, parts: readonly LibraryPart[]): string {
  const holder = document.createElement("template");
  holder.innerHTML = template.html;
  for (const element of holder.content.querySelectorAll<HTMLElement>("[data-publr-template-part]")) {
    const part = parts.find((candidate) => candidate.name === element.getAttribute("data-publr-template-part"));
    const box = document.createElement("template");
    box.innerHTML = part?.html ?? "";
    element.replaceWith(box.content);
  }
  for (const element of holder.content.querySelectorAll<HTMLElement>("[data-publr-slot]")) {
    const slot = element.getAttribute("data-publr-slot");
    const box = document.createElement("template");
    box.innerHTML =
      slot === "title"
        ? `<h1 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="px-5 pt-6 font-serif text-4xl">Page title</h1>`
        : slot === "content"
          ? `<div data-pb-block="group" data-pb-tag="tag" data-pb-children class="px-5 py-6"><p data-pb-block="paragraph" data-pb-rich="body" class="text-sm">A section of content</p><p data-pb-block="paragraph" data-pb-rich="body" class="text-sm opacity-70">Body copy the document supplies. The template decides what surrounds it — header, footer and every shared part. Each content type owns one structure like this.</p></div>`
          : "";
    element.replaceWith(box.content);
  }
  return holder.innerHTML;
}

export type BlockRow = { type: string; label: string; category: string; icon: string; letter: string; description: string };

/** Every block an author can insert, grouped by category in the inserter's order. */
export function libraryBlocks(): BlockRow[] {
  const rows = blockTypes()
    .filter((type) => !type.internal && !type.phantom && type.type !== RAW_TYPE)
    .map((type) => ({ type: type.type, label: type.label, category: categoryLabel(type.category), icon: type.icon ?? "", letter: type.label.charAt(0), description: type.description ?? "", order: CATEGORY_ORDER.indexOf(type.category ?? "") }));
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (a.row.order < 0 ? 99 : a.row.order) - (b.row.order < 0 ? 99 : b.row.order) || a.index - b.index)
    .map(({ row: { order: _order, ...row } }) => row);
}

const SAMPLES: Record<string, string> = {
  paragraph: Publr.t("Edit this block directly. Its content, toolbar, styles, and behavior are live."),
  heading: Publr.t("Design with confidence"),
};

/** The document a block's default opens on: its saved default, or one fresh instance
 * of it with sample words in its main field. */
export function starterDocument(type: string, saved: string | undefined): string {
  if (saved) return saved;
  const definition = blockType(type);
  if (!definition) return "";
  const editor = new Editor({ content: "" });
  const stale = editor.model.blocks.map((block) => block.id);
  const id = editor.insertType(type, { parent: null, slot: null, index: 0 });
  if (!id) return "";
  if (stale.length) editor.removeBlocks(stale);
  const sample = SAMPLES[type] ?? (definition.primary && definition.fields.find((field) => field.name === definition.primary)?.kind === "text" ? definition.label : "");
  if (definition.primary && sample) editor.setField(id, definition.primary, sample);
  return editor.serialize("editing");
}
