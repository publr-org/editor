// The session's template seams: a template and its parts edited in nested isolation, the
// slots the Document tab lists, and the page as it publishes inside its template.
import { Session } from "../../shell/session";
import type { TemplateHost, TemplateSource } from "../../model/templates";
import { equal, same, test } from "./harness";

const PART = (name: string) => `<div data-pb-block="template-part" data-publr-template-part="${name}"><script type="application/json" data-pb-settings>{"part":"${name}"}</script></div>`;
const TEMPLATE = `${PART("site-header")}<div data-pb-block="template-slot" data-pb-tag="tag" data-publr-slot="content"></div><div data-pb-block="template-slot" data-pb-tag="tag" data-publr-slot="featured-image"><script type="application/json" data-pb-settings>{"slot":"featured-image"}</script></div>`;

function host(): TemplateHost & { saved: Record<string, string> } {
  const saved: Record<string, string> = {};
  const parts: Record<string, TemplateSource> = { "site-header": { label: "Site header", overridden: false, html: `<p data-pb-block="paragraph" data-pb-rich="body">Header</p>` } };
  return {
    saved,
    template: () => ({ label: "Home", description: "The front page.", html: saved.template ?? TEMPLATE, overridden: "template" in saved }),
    part: (name) => (parts[name] ? { ...parts[name], html: saved[name] ?? parts[name].html } : null),
    saveTemplate(html) {
      saved.template = html;
      return null;
    },
    savePart(name, html) {
      saved[name] = html;
      return null;
    },
  };
}

const session = (templates = host()) => {
  let featured: { src: string; alt: string; width: string; height: string } | null = null;
  return new Session({
    content: `<p data-pb-block="paragraph" data-pb-rich="body">Body</p>`,
    canvasStylesheet: "",
    templates,
    document: { title: () => "Homepage", featuredImage: () => featured, setFeaturedImage: (value) => (featured = value) },
  });
};

test("a part opened from its template nests; saving it returns to the template, the hierarchy leads out", () => {
  const templates = host();
  const current = session(templates);
  current.editTemplate();
  equal(current.isolation?.kind, "template");
  same(current.hierarchy(), []);
  current.editPart("site-header");
  same(current.hierarchy().map((crumb) => crumb.label), ["Home", "Site header"]);
  current.editor.setField(current.editor.model.blocks[0].id, "body", "Header edited");
  equal(current.applyIsolation(), true);
  equal(current.isolation?.kind, "template", "back in the template");
  equal(templates.saved["site-header"].includes("Header edited"), true);
  current.editPart("site-header");
  current.returnTo(0);
  equal(current.isolation?.kind, "template", "the first crumb is the template");
  same(current.hierarchy(), []);
  current.cancelIsolation();
  equal(current.isolation, null, "and Cancel leaves it");
  equal(current.editor, current.main);
});

test("the template's slots, the picked one, and the page drawn in its template", () => {
  const current = session();
  current.toggleTemplate(true);
  same(current.templateSlots().map((slot) => slot.label), ["Content", "Featured image"]);
  current.selectSlot("content");
  equal(current.selectedSlot, "content");
  current.setFeaturedImage({ src: "/kitchen.jpg", alt: "A kitchen", width: "", height: "" });
  const html = current.previewHtml();
  equal(html.includes("Header") && html.includes("Body"), true, html);
  equal(html.includes('<img src="/kitchen.jpg" alt="A kitchen">'), true, html);
  equal(html.indexOf("Header") < html.indexOf("Body"), true, "the content sits in its slot after the header");
  current.toggleTemplate(false);
  same(current.templateSlots(), []);
  equal(current.previewHtml().includes("Header"), false, "off: the page alone");
});
