// The wire contract: the round-trip law over every manual fixture, raw passthrough,
// the two pipelines, authored classes.
import { downcast, upcast } from "../../model/codec";
import { blockType } from "../../model/registry";
import { flatten } from "../../model/tree";
import type { Model } from "../../model/types";
import { equal, excludes, includes, ok, same, test } from "./harness";

type ManualTest = { key: string; fixture: string };

const manual = (globalThis as unknown as { manualTests: ManualTest[] }).manualTests;

for (const entry of manual) {
  if (!entry.fixture) continue;
  test(`round trip: ${entry.key}`, () => {
    const model = upcast(entry.fixture);
    const html = downcast(model, "editing");
    const again = upcast(html);
    same(again, model, "upcast(downcast(model)) must deep-equal the model");
    equal(downcast(again, "editing"), html, "a second downcast is identical");
  });

  test(`no spurious authored classes: ${entry.key}`, () => {
    const model = upcast(entry.fixture);
    const stray = flatten(model.blocks)
      .filter((block) => block.type !== "raw-html" && block.classes !== "")
      .map((block) => `${block.type}: ${block.classes}`);
    // Fixtures carry only render output, except where a test pastes classes on purpose.
    const pasted = ["features/inline-backend", "features/css-engine", "features/theme-driven-controls", "features/style-font-size", "features/patterns", "issues/sc-417"];
    if (!pasted.includes(entry.key)) same(stray, [], "every fixture class is the render's baseline");
  });

  test(`data pipeline is clean: ${entry.key}`, () => {
    const model = upcast(entry.fixture);
    const data = downcast(model, "data");
    const typed = flatten(model.blocks).some((block) => block.type !== "raw-html");
    if (!typed) return;
    const doc = document.implementation.createHTMLDocument("");
    const template = doc.createElement("template");
    template.innerHTML = data;
    for (const element of template.content.querySelectorAll("*")) {
      const insideRaw = model.blocks.some((block) => block.type === "raw-html" && String(block.fields.html).includes(element.outerHTML.slice(0, 40)));
      if (insideRaw) continue;
      for (const attribute of element.attributes) ok(!attribute.name.startsWith("data-pb-"), `${entry.key}: ${attribute.name} survived the data pipeline`);
    }
    excludes(data, "data-pb-settings");
  });
}

test("unknown markup is a raw block, byte for byte", () => {
  const html = `<p data-pb-block="paragraph" data-pb-rich="body">Above</p>\n<table class="plain-table" border="1">\n  <tr><td>Un-annotated</td></tr>\n</table>\n<MARQUEE behavior='alternate'>Even this</MARQUEE>`;
  const model = upcast(html);
  equal(model.blocks.length, 3);
  equal(model.blocks[1].type, "raw-html");
  equal(model.blocks[1].fields.html, `<table class="plain-table" border="1">\n  <tr><td>Un-annotated</td></tr>\n</table>`);
  equal(model.blocks[2].fields.html, `<MARQUEE behavior='alternate'>Even this</MARQUEE>`);
  includes(downcast(model, "data"), `<MARQUEE behavior='alternate'>Even this</MARQUEE>`);
  includes(downcast(model, "editing"), `<table data-pb-id="${model.blocks[1].id}" class="plain-table" border="1">`);
  same(upcast(downcast(model, "editing")), model);
});

test("an unregistered block type is raw", () => {
  const model = upcast(`<div data-pb-block="nope">x</div>`);
  equal(model.blocks[0].type, "raw-html");
});

test("ids are minted when missing and kept when present", () => {
  const model = upcast(`<p data-pb-block="paragraph" data-pb-rich="body">a</p><p data-pb-block="paragraph" data-pb-id="b_keep" data-pb-rich="body">b</p>`);
  ok(/^b_/.test(model.blocks[0].id));
  equal(model.blocks[1].id, "b_keep");
});

test("a malformed island reads as no settings", () => {
  const model = upcast(`<p data-pb-block="paragraph" data-pb-rich="body"><script type="application/json" data-pb-settings>{oops</script>Hi</p>`);
  same(model.blocks[0].settings, {});
  equal(model.blocks[0].fields.body, "Hi");
});

test("the island is excluded from a root carrier's value", () => {
  const model = upcast(`<p data-pb-block="paragraph" data-pb-rich="body"><script type="application/json" data-pb-settings>{"dropCap":true}</script> Drop</p>`);
  equal(model.blocks[0].fields.body, "Drop");
  same(model.blocks[0].settings, { dropCap: true });
});

test("authored classes are the class list minus the render's", () => {
  const model = upcast(`<p data-pb-block="paragraph" data-pb-rich="body" class="text-2xl mt-4">Big</p>`);
  equal(model.blocks[0].classes, "text-2xl mt-4");
  includes(downcast(model, "data"), `class="text-2xl mt-4"`);
});

test("interactions ride on the root in both pipelines", () => {
  const model = upcast(`<p data-pb-block="paragraph" data-pb-rich="body" data-p-store="local:toggle" data-p-on="click: flip">Hi</p>`);
  same(model.blocks[0].interactions, { "data-p-store": "local:toggle", "data-p-on": "click: flip" });
  includes(downcast(model, "data"), `data-p-on="click: flip"`);
});

test("policy-looking attributes in content are dropped", () => {
  const model = upcast(`<p data-pb-block="paragraph" data-pb-rich="body" contenteditable="true" data-pb-lock="none">Hi</p>`);
  const html = downcast(model, "editing");
  excludes(html, "contenteditable");
  excludes(html, "data-pb-lock");
});

test("loose top-level text becomes a paragraph", () => {
  const model = upcast(`Hello <b>x</b>`);
  equal(model.blocks[0].type, "paragraph");
});

test("slots keep their keys even when empty", () => {
  const model: Model = upcast(`<div data-pb-block="group" data-pb-children></div>`);
  same(model.blocks[0].slots, { children: [] });
  ok(blockType("group")!.slots.includes("children"));
});

test("the data pipeline unwraps nothing it should keep", () => {
  const model = upcast(`<div data-pb-block="group" data-pb-children><p data-pb-block="paragraph" data-pb-rich="body">In</p></div>`);
  const data = downcast(model, "data");
  equal(data, `<div><p>In</p></div>`);
});

test("plain HTML opens as paragraphs when asked", () => {
  const model = upcast("<p>One <em>a</em></p><h2>Two</h2><ul><li>Three</li></ul>Four", { plain: true });
  same(model.blocks.map((block) => [block.type, block.fields.body]), [["paragraph", "One <em>a</em>"], ["paragraph", "Two"], ["paragraph", "Three"], ["paragraph", "Four"]]);
  equal(upcast("<p>x</p>").blocks[0].type, "raw-html", "without the option it is raw");
});
