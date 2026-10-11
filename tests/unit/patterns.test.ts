// The pattern library: variants and color settings in the model, the session's library
// design drafts, the list view's drop rules and the in-canvas pickers' resting shelf.
import { colorContexts, applyColorContext } from "../../model/contexts";
import { getPattern, publishPattern, registerPattern, stampPattern, unregisterPattern } from "../../model/patterns";
import { Theme } from "../../model/theme";
import { Session } from "../../shell/session";
import { equal, ok, same, test } from "./harness";

const p = (text: string, classes = "") => `<p data-pb-block="paragraph" data-pb-rich="body"${classes ? ` class="${classes}"` : ""}>${text}</p>`;
const h = (text: string) => `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">${text}</h2>`;
const group = (inner: string) => `<div data-pb-block="group" data-pb-children>${inner}</div>`;

const fresh = (name: string, definition: Parameters<typeof registerPattern>[1]) => {
  if (getPattern(name)) unregisterPattern(name);
  registerPattern(name, definition);
};

const theme = new Theme([
  { name: "color-surface", value: "#fff" },
  { name: "color-foreground", value: "#111" },
  { name: "color-terracotta-surface", value: "#a45332" },
  { name: "color-terracotta-foreground", value: "#fff" },
  { name: "color-terracotta-accent-surface", value: "#f7ddca" },
]);

test("variants: the default variant is the design, a stamp carries its variant", () => {
  fresh("t-variants", {
    label: "Variants",
    category: "Test",
    html: h("A") + p("one"),
    variants: [
      { name: "one", label: "One", html: h("A") + p("one") },
      { name: "two", label: "Two", html: h("B") + p("two") + p("more") },
    ],
    defaultVariant: "two",
  });
  equal(getPattern("t-variants")!.html, h("B") + p("two") + p("more"));
  const stamp = stampPattern("t-variants");
  equal(stamp.settings.variant, "two");
  equal(stamp.slots!.children.length, 3);
  equal(stampPattern("t-variants", "one").slots!.children.length, 2);
});

test("variants: one variant is refused, an unknown default is refused", () => {
  let error = "";
  try {
    fresh("t-bad", { label: "Bad", category: "Test", html: h("A") + p("x"), variants: [{ name: "one", label: "One", html: h("A") + p("x") }] });
  } catch (caught) {
    error = String(caught);
  }
  ok(error.includes("at least two variants"));
});

test("publishing a removed variant is a major bump; color settings ride along", () => {
  fresh("t-publish", {
    label: "Publish",
    category: "Test",
    html: h("A") + p("x"),
    variants: [
      { name: "one", label: "One", html: h("A") + p("x") },
      { name: "two", label: "Two", html: h("B") + p("y") },
      { name: "three", label: "Three", html: h("C") + p("z") },
    ],
  });
  const result = publishPattern("t-publish", h("A") + p("x"), {
    variants: [
      { name: "one", label: "One", html: h("A") + p("x") },
      { name: "two", label: "Two", html: h("B") + p("y") },
    ],
    defaultVariant: "one",
    defaultColorContext: "terracotta",
    disabledColorContexts: ["slate"],
  });
  ok(result.ok);
  equal(result.ok && result.version, "2.0");
  equal(getPattern("t-publish")!.defaultColorContext, "terracotta");
  same(getPattern("t-publish")!.disabledColorContexts, ["slate"]);
});

test("color contexts: the theme's contexts, and classes moved to one and back", () => {
  same(colorContexts(theme).map((context) => context.key), ["default", "terracotta"]);
  const blocks = [{ id: "a", type: "paragraph", fields: { body: "x" }, settings: {}, classes: "bg-surface md:text-foreground p-4", interactions: {} }] as never[];
  ok(applyColorContext(blocks, "terracotta", theme));
  equal((blocks[0] as { classes: string }).classes, "bg-terracotta-surface md:text-terracotta-foreground p-4");
  ok(applyColorContext(blocks, "default", theme));
  equal((blocks[0] as { classes: string }).classes, "bg-surface md:text-foreground p-4");
  ok(!applyColorContext(blocks, "slate", theme));
});

const session = (content: string) => new Session({ content, canvasStylesheet: "", theme: theme.tokens });

test("the library draft: Add makes Default and Variant 2, Save variant returns, Publish keeps them", () => {
  fresh("t-draft", { label: "Draft", category: "Test", html: h("A") + p("x") });
  const s = session(p("page"));
  s.editPatternDefinition("t-draft");
  s.addVariant();
  same(s.draft!.variants.map((variant) => variant.label), ["Default", "Variant 2"]);
  equal(s.draft!.active, "variant-2");
  equal(s.isolation!.save, "Save variant");
  s.editor.setField(s.editor.model.blocks[0].id, "text", "Changed");
  ok(!s.applyIsolation(), "saving a variant returns to the default");
  equal(s.draft!.active, "default");
  equal(s.isolation!.save, "Publish pattern");
  ok(s.applyIsolation());
  equal(getPattern("t-draft")!.variants!.length, 2);
  ok(getPattern("t-draft")!.variants![1].html.includes("Changed"));
});

test("the library draft: deleting down to one variant drops variants", () => {
  fresh("t-delete", { label: "Delete", category: "Test", html: h("A") + p("x") });
  const s = session(p("page"));
  s.editPatternDefinition("t-delete");
  s.addVariant();
  s.deleteVariant("variant-2");
  same(s.draft!.variants, []);
  equal(s.isolation!.save, "Publish pattern");
});

test("a stamp wears the pattern's default color context", () => {
  fresh("t-context", { label: "Context", category: "Test", html: h("A") + p("x", "bg-surface"), defaultColorContext: "terracotta" });
  const s = session(p("page"));
  const id = s.insertPattern("t-context", { parent: null, slot: null, index: 1 })!;
  const root = s.editor.getBlock(id)!;
  equal(root.settings.colorContext, "terracotta");
  equal(root.slots!.children[1].classes, "bg-terracotta-surface");
});

test("list view: rows start closed, selecting reveals; drops go inside, beside or out", () => {
  const s = session(group(p("a") + p("b")) + p("c"));
  const [box, c] = s.editor.model.blocks;
  equal(s.treeRows().length, 2);
  s.reveal(box.slots!.children[0].id);
  equal(s.treeRows().length, 4);
  const inside = s.treeDrop(c.id, box.id, 0.5, 0, 0)!;
  same([inside.parent, inside.index], [box.id, 2]);
  const after = s.treeDrop(c.id, box.slots!.children[0].id, 0.9, 1, 1)!;
  same([after.parent, after.index, after.depth], [box.id, 1, 1]);
  const out = s.treeDrop(box.slots!.children[1].id, box.slots!.children[0].id, 0.9, 0, 1)!;
  same([out.parent, out.index], [null, 1]);
  ok(s.dropAt(c.id, inside));
  equal(s.editor.model.blocks.length, 1);
  ok(s.editor.undo());
  equal(s.editor.model.blocks.length, 2);
});

test("slash and inline shelves: the most used five at rest, matches when typed", () => {
  const s = session(p(""));
  const id = s.editor.model.blocks[0].id;
  same(s.slashItems(id, "").map((item) => item.type), ["paragraph", "heading", "image", "quote", "list"]);
  same(s.slashItems(id, "he").map((item) => item.type), ["heading"]);
  ok(s.boundaryItems({ parent: null, slot: null, index: 1 }, "e").length > 5, "a search reaches every block");
});

test("list view in the template: parts and slots around the document, content open", () => {
  const part = (name: string) => `<div data-pb-block="template-part" data-publr-template-part="${name}"><script type="application/json" data-pb-settings>{"part":"${name}"}</script></div>`;
  const html = `${part("site-header")}<div data-pb-block="template-slot" data-pb-tag="tag" data-publr-slot="content"></div>${part("site-footer")}`;
  const s = new Session({
    content: p("a") + p("b"),
    canvasStylesheet: "",
    templates: {
      template: () => ({ label: "Home", description: "", html, overridden: false }),
      part: (name) => ({ label: name === "site-header" ? "Site header" : "Site footer", overridden: false, html: p(name) }),
      saveTemplate: () => null,
      savePart: () => null,
    },
  });
  s.toggleTemplate(true);
  same(s.treeRows().map((row) => `${row.depth}:${row.label}`), ["0:Site header", "0:Content", "1:Paragraph", "1:Paragraph", "0:Site footer"]);
  same(s.treeRows().map((row) => row.identity), ["part", "plain", "plain", "plain", "part"]);
  s.toggleCollapsed(s.treeRows()[1].id);
  equal(s.treeRows().length, 3, "the content row folds");
  s.reveal(s.editor.model.blocks[0].id);
  equal(s.treeRows().length, 5, "selecting a block opens its way");
});
