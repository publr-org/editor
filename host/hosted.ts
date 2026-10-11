// Templates, parts and patterns as the admin hands them to the editor, on the record's
// page: `data-editor-templates` ({ template, frame, parts, saveUrl, title }) and
// `data-editor-patterns` ([{ name, label, category, description, html }]), JSON in an
// attribute (or a JSON script of the same name). Saves go back as override records:
// the editing HTML to reopen, and the data pipeline's output for pages to print.
import { downcast, upcastBlocks } from "../model/codec";
import { getPattern, registerPattern, unregisterPattern } from "../model/patterns";
import type { TemplateHost, TemplateSource } from "../model/templates";

type Hosted = {
  template: TemplateSource | null;
  /** The page around the template: its layout, the template's place marked. */
  frame?: string;
  parts: Record<string, TemplateSource>;
  saveUrl: string;
  title: string;
};

type HostedPattern = {
  name: string;
  label: string;
  category: string;
  description?: string;
  html: string;
  variants?: { name: string; label: string; description?: string; html: string }[];
  default_variant?: string;
  default_color_context?: string;
  disabled_color_contexts?: string[];
};

function readJson<T>(root: ParentNode, name: string): T | null {
  const scopes: ParentNode[] = [root, document];
  for (const scope of scopes) {
    const carrier = scope.querySelector<HTMLElement>(`[data-${name}]:not(script)`);
    const script = scope.querySelector(`script[type="application/json"][data-${name}]`);
    const text = carrier?.getAttribute(`data-${name}`) || script?.textContent || "";
    if (!text) continue;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/** A template or part as its file draws it, with the file's markers as the editor's
 * blocks: every `data-publr-slot` element a template slot (keeping its element and
 * classes), every `data-publr-template-part` element a template part (drawn from its own
 * source). An override is already the editor's own markup and is left as it is. */
export function fromFile(html: string): string {
  if (!html.includes("data-publr-slot") && !html.includes("data-publr-template-part")) return html;
  const holder = document.createElement("template");
  holder.innerHTML = html;
  const island = (settings: Record<string, string>) => {
    const script = document.createElement("script");
    script.type = "application/json";
    script.setAttribute("data-pb-settings", "");
    script.textContent = JSON.stringify(settings);
    return script;
  };
  for (const slot of holder.content.querySelectorAll<HTMLElement>("[data-publr-slot]")) {
    slot.setAttribute("data-pb-block", "template-slot");
    slot.setAttribute("data-pb-tag", "tag");
    slot.replaceChildren(island({ slot: slot.getAttribute("data-publr-slot") ?? "content" }));
  }
  for (const part of holder.content.querySelectorAll<HTMLElement>("[data-publr-template-part]")) {
    const name = part.getAttribute("data-publr-template-part") ?? "header";
    const block = document.createElement("div");
    block.setAttribute("data-pb-block", "template-part");
    block.setAttribute("data-publr-template-part", name);
    block.append(island({ part: name }));
    part.replaceWith(block);
  }
  return holder.innerHTML;
}

const opened = (source: TemplateSource | null): TemplateSource | null =>
  source && !source.overridden ? { ...source, html: fromFile(source.html) } : source;

/** The data pipeline's output for wire HTML: what a page prints. */
export const output = (html: string) => downcast(upcastBlocks(html), "data");

export function post(url: string, fields: Record<string, string>): Promise<string | null> {
  const csrf = document.querySelector<HTMLMetaElement>('meta[name="publr-csrf"]')?.content ?? "";
  const body = new URLSearchParams({ ...fields, csrf });
  return fetch(url, { method: "POST", body, headers: { "Publr-Fragment": "json" } })
    .then((response) => response.json())
    .then((answer: { saved?: boolean; reason?: string }) => (answer.saved ? null : answer.reason ?? "Not saved."))
    .catch(() => "Not saved: the server did not answer.");
}

export function hostedTemplates(root: ParentNode): TemplateHost | undefined {
  const hosted = readJson<Hosted>(root, "editor-templates");
  if (!hosted?.template) return undefined;
  const save = (fields: Record<string, string>) => void post(hosted.saveUrl, fields);
  return {
    template: () => opened(hosted.template),
    part: (name) => opened(hosted.parts[name] ?? null),
    saveTemplate(html) {
      if (!html.includes('data-publr-slot="content"')) return "A template needs a content slot.";
      hosted.template = { ...hosted.template!, html, overridden: true };
      save({ kind: "template", name: hosted.template.label, html, output: output(html) });
      return null;
    },
    savePart(name, html) {
      const part = hosted.parts[name];
      if (!part) return `No part "${name}".`;
      hosted.parts[name] = { ...part, html, overridden: true };
      save({ kind: "part", name, html, output: output(html) });
      return null;
    },
    resetTemplate() {
      save({ kind: "reset-template", name: hosted.template!.label, html: "", output: "" });
    },
    resetPart(name) {
      save({ kind: "reset-part", name, html: "", output: "" });
    },
    title: () => hosted.title,
    frame: () => hosted.frame || null,
  };
}

/** Registers the app's patterns (file defaults and records) in the editor's library. */
export function registerHostedPatterns(root: ParentNode): string | null {
  const patterns = readJson<HostedPattern[]>(root, "editor-patterns");
  const saveUrl = readJson<Hosted>(root, "editor-templates")?.saveUrl ?? "/admin/design/override";
  if (!patterns) return null;
  for (const pattern of patterns) {
    if (getPattern(pattern.name)) unregisterPattern(pattern.name);
    try {
      registerPattern(pattern.name, {
        label: pattern.label,
        category: pattern.category,
        description: pattern.description,
        html: pattern.html,
        variants: pattern.variants?.length ? pattern.variants : undefined,
        defaultVariant: pattern.default_variant || undefined,
        defaultColorContext: pattern.default_color_context || undefined,
        disabledColorContexts: pattern.disabled_color_contexts?.length ? pattern.disabled_color_contexts : undefined,
      });
    } catch (error) {
      console.warn(`[publr-editor] pattern ${pattern.name}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return saveUrl;
}

/** Saves a published library design as the app's pattern record. */
export function savePattern(saveUrl: string, name: string): Promise<string | null> {
  const pattern = getPattern(name);
  if (!pattern) return Promise.resolve(`No pattern "${name}".`);
  const fields: Record<string, string> = { kind: "pattern", name, html: pattern.html, output: "", label: pattern.label, category: pattern.category, description: pattern.description ?? "" };
  // Variants and color settings travel as their own fields, by index.
  (pattern.variants ?? []).forEach((variant, index) => {
    fields[`variant_${index}_name`] = variant.name;
    fields[`variant_${index}_label`] = variant.label;
    fields[`variant_${index}_description`] = variant.description ?? "";
    fields[`variant_${index}_html`] = variant.html;
  });
  if (pattern.variants?.length) fields.default_variant = pattern.defaultVariant ?? pattern.variants[0].name;
  if (pattern.defaultColorContext) fields.default_color_context = pattern.defaultColorContext;
  (pattern.disabledColorContexts ?? []).forEach((context, index) => (fields[`disabled_color_context_${index}`] = context));
  return post(saveUrl, fields);
}
