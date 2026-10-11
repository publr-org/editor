// Templates and template parts, as the editor sees them through its host. A route's
// template is a region of its page with slots (`content`, `title`, `featured-image`)
// the document fills, and template parts (a header, a footer) placed by name and shared
// by every template that places them. The host owns where they live: the file is the
// default, an edit saves an override, Reset returns to the file.

export type TemplateSource = { label: string; html: string; overridden: boolean; description?: string };

export type TemplateHost = {
  /** The template the document is shown in, or null when it has none. */
  template(): TemplateSource | null;
  /** A part's content by name, or null when there is no such part. */
  part(name: string): TemplateSource | null;
  /** Saves the template; returns an error to show, or null. */
  saveTemplate(html: string): string | null;
  savePart(name: string, html: string): string | null;
  resetTemplate?(): void;
  resetPart?(name: string): void;
  /** What a `title` slot shows: the document's title. */
  title?(): string;
  /** The page around the template (its layout), plain HTML with the template's place
   * marked `data-publr-template-frame`; drawn around it, never edited. */
  frame?(): string | null;
};

/** The slots a template can place, as the Document tab lists them. */
export const SLOT_LABELS: Record<string, string> = { content: "Content", title: "Title", "featured-image": "Featured image" };

/** The slot names a template places, in order. */
export function slotsOf(html: string): string[] {
  return [...html.matchAll(/data-publr-slot="([^"]+)"/g)].map((match) => match[1]);
}

/** The part names a template places, in order. */
export function partsOf(html: string): string[] {
  return [...html.matchAll(/data-publr-template-part="([^"]+)"/g)].map((match) => match[1]);
}
