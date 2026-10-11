// What the host gives the library pages (Patterns, Templates): the app's patterns, the
// templates of its content types and the parts they share, and how an edit is kept. The
// shapes are the ones the record page already hands the editor (`data-editor-patterns`,
// and each template or part as a TemplateSource), so a host passes the same JSON.
import type { TemplateSource } from "../../model/templates";

/** One pattern of the app's library. */
export type LibraryPattern = { name: string; label: string; category: string; description?: string; html: string };

/** A content type's template (`home`, `page`, `post`), as the editor edits it. */
export type LibraryTemplate = TemplateSource & { name: string };

/** A part templates place by name; `area` says where it sits ("header", "footer"). */
export type LibraryPart = TemplateSource & { name: string; area?: string };

export type LibraryData = {
  patterns: LibraryPattern[];
  templates: LibraryTemplate[];
  parts: LibraryPart[];
};

type Kept = Promise<string | null> | string | null;

export type LibraryHost = LibraryData & {
  /** Keeps a pattern's published library design; an error to show, or null. */
  savePattern?: (pattern: LibraryPattern) => Kept;
  /** Keeps a template's editing HTML. */
  saveTemplate?: (name: string, html: string) => Kept;
  savePart?: (name: string, html: string) => Kept;
};
