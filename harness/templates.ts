// The demo's template and parts: the Home template (the site header, the content, the
// site footer) and its two parts, as files would ship them; edits are overrides kept in this browser,
// Reset deletes them.
import type { TemplateHost, TemplateSource } from "../model/templates";
import { HEARTH_PARTS } from "./hearth";

const part = (name: string) =>
  `<div data-pb-block="template-part" data-publr-template-part="${name}"><script type="application/json" data-pb-settings>{"part":"${name}"}</script></div>`;

// Home: the shared header and footer around the composition, as the demo's front page.
const DEFAULT_TEMPLATE = `${part("site-header")}<div data-pb-block="template-slot" data-pb-tag="tag" data-publr-slot="content"></div>${part("site-footer")}`;

// Pages: the title above the document, both at the content width, header and footer around.
const PAGE_TEMPLATE = `${part("site-header")}<h1 data-pb-block="template-slot" data-pb-tag="tag" data-publr-slot="title" class="mx-auto w-full max-w-[var(--container-content,42rem)] px-6 pt-12 text-4xl font-semibold tracking-tight"><script type="application/json" data-pb-settings>{"slot":"title"}</script></h1><div data-pb-block="template-slot" data-pb-tag="tag" data-publr-slot="content" class="mx-auto w-full max-w-[var(--container-content,42rem)] px-6 pt-6 pb-16"></div>${part("site-footer")}`;

const TEMPLATES = {
  home: { label: "Home", description: "The front page: the shared header and footer around the composition.", html: DEFAULT_TEMPLATE },
  page: { label: "Pages", description: "Every static page: title above the document, header and footer around it.", html: PAGE_TEMPLATE },
};

// The parts are the Hearth site's own: its header and footer patterns.
const DEFAULT_PARTS: Record<string, TemplateSource> = HEARTH_PARTS;

const STORAGE = "publr-editor.templates.v2";

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
  } catch {
    return {};
  }
}

function write(overrides: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(overrides));
  } catch {
    // Overrides live only as long as the page without storage.
  }
}

/** The demo's templates: Home for the demo page, Pages for the manual fixtures. */
export function demoTemplates(title: () => string, kind: keyof typeof TEMPLATES = "home"): TemplateHost {
  const key = `template:${kind}`;
  const base = TEMPLATES[kind];
  return {
    template() {
      const override = read()[key];
      return {
        label: base.label,
        description: base.description,
        html: override ?? base.html,
        overridden: override !== undefined,
      };
    },
    part(name) {
      const base = DEFAULT_PARTS[name];
      if (!base) return null;
      const override = read()[`part:${name}`];
      return { label: base.label, html: override ?? base.html, overridden: override !== undefined };
    },
    saveTemplate(html) {
      if (!html.includes('data-publr-slot="content"')) return "A template needs a content slot.";
      write({ ...read(), [key]: html });
      return null;
    },
    savePart(name, html) {
      write({ ...read(), [`part:${name}`]: html });
      return null;
    },
    resetTemplate() {
      const overrides = read();
      delete overrides[key];
      write(overrides);
    },
    resetPart(name) {
      const overrides = read();
      delete overrides[`part:${name}`];
      write(overrides);
    },
    title,
  };
}
