// The library area: Patterns (by category), Templates (content types and their shared
// parts) and Primitive blocks (every block, and the one whose default is open).
import { Publr } from "publr-jsx";
import { allPatterns } from "../../model/patterns";
import { libraryBlocks, registerLibraryPatterns, templatePreview } from "../model/library";
import type { DesignSystem } from "../model/system";
import type { BuilderProps, State } from "../state";
import { previewWith } from "./previews";

export type PatternCategoryRow = { name: string; count: number; selected: boolean };
export type PatternRow = { name: string; label: string; category: string; html: string };
export type TemplateRow = { name: string; label: string; description: string; html: string };
export type PartRow = { name: string; label: string; area: string; html: string };
export type BlockItem = { type: string; label: string; category: string; icon: string; letter: string; selected: boolean };

export const initial = () => ({
  patternCategory: "All",
  patternCategories: [] as PatternCategoryRow[],
  patternCount: 0,
  patternItems: [] as PatternRow[],
  templateItems: [] as TemplateRow[],
  templateCount: 0,
  partItems: [] as PartRow[],
  partCount: 0,
  blockItems: [] as BlockItem[],
  blockType: "paragraph",
  blockLabel: Publr.t("Paragraph"),
  blockDescription: "",
  blockStatus: Publr.t("Live draft"),
  blockToast: "",
  /** The block's default editor was drawn for this type and revision. */
  blockRevision: 0,
  /** "pattern", "template" or "part" while one is open in the editor, else "". */
  libraryEditing: "",
  libraryEditingName: "",
  libraryError: "",
});

export function view(system: DesignSystem, state: State, props: BuilderProps): Partial<State> {
  previewWith(system, props.siteStyles ?? []);
  const library = props.library;
  if (library) registerLibraryPatterns(library);
  const patterns = allPatterns()
    .filter((pattern) => !library || library.patterns.some((candidate) => candidate.name === pattern.name))
    .map((pattern) => ({ name: pattern.name, label: pattern.label, category: pattern.category || "Uncategorized", html: pattern.html }));
  const counts = new Map<string, number>();
  for (const pattern of patterns) counts.set(pattern.category, (counts.get(pattern.category) ?? 0) + 1);
  const category = state.patternCategory === "All" || counts.has(state.patternCategory) ? state.patternCategory : "All";
  const parts = library?.parts ?? [];
  const blocks = libraryBlocks();
  const current = blocks.find((block) => block.type === state.blockType) ?? blocks[0];
  return {
    patternCategory: category,
    patternCount: patterns.length,
    patternCategories: [{ name: "All", count: patterns.length, selected: category === "All" }, ...[...counts].map(([name, count]) => ({ name, count, selected: category === name }))],
    patternItems: patterns.filter((pattern) => category === "All" || pattern.category === category),
    templateItems: (library?.templates ?? []).map((template) => ({ name: template.name, label: template.label, description: template.description ?? "", html: templatePreview(template, parts) })),
    templateCount: library?.templates.length ?? 0,
    partItems: parts.map((part) => ({ name: part.name, label: part.label, area: part.area ?? "", html: part.html })),
    partCount: parts.length,
    blockItems: blocks.map((block) => ({ type: block.type, label: block.label, category: block.category, icon: block.icon, letter: block.letter, selected: block.type === current?.type })),
    blockType: current?.type ?? state.blockType,
    blockLabel: current?.label ?? "",
    blockDescription: current?.description ?? "",
  };
}
