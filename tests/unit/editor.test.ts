// Editing operations: split, merge, history, structure, policy.
import { Editor } from "../../model/editor";
import { equal, ok, same, test } from "./harness";

const p = (text: string) => `<p data-pb-block="paragraph" data-pb-rich="body">${text}</p>`;
const h = (text: string, level = "h2") => `<${level} data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">${text}</${level}>`;

const bodies = (editor: Editor) => editor.model.blocks.map((block) => block.fields.body ?? block.fields.text);

test("Enter mid-text splits a paragraph; undo merges it back", () => {
  const editor = new Editor({ content: p("Hello <em>big</em> world") });
  const id = editor.model.blocks[0].id;
  ok(editor.split(id, "body", 8));
  same(bodies(editor), ["Hello <em>bi</em>", "<em>g</em> world"]);
  equal(editor.selection.caret?.block, editor.model.blocks[1].id);
  ok(editor.undo());
  same(bodies(editor), ["Hello <em>big</em> world"]);
  ok(editor.redo());
  equal(editor.model.blocks.length, 2);
});

test("Enter at the end of a heading starts a paragraph", () => {
  const editor = new Editor({ content: h("Title") });
  ok(editor.split(editor.model.blocks[0].id, "text", 5));
  same(editor.model.blocks.map((block) => block.type), ["heading", "paragraph"]);
});

test("Enter mid-heading makes two headings", () => {
  const editor = new Editor({ content: h("Two parts", "h3") });
  ok(editor.split(editor.model.blocks[0].id, "text", 3));
  same(editor.model.blocks.map((block) => [block.type, block.fields.level]), [["heading", "h3"], ["heading", "h3"]]);
});

test("Backspace at a block's start merges it, markup kept, caret at the join", () => {
  const editor = new Editor({ content: p("One <em>a</em>") + p("<strong>Two</strong>") });
  const second = editor.model.blocks[1].id;
  ok(editor.mergeBackward(second));
  same(bodies(editor), ["One <em>a</em><strong>Two</strong>"]);
  same(editor.selection.caret, { block: editor.model.blocks[0].id, field: "body", start: 5, end: 5 });
});

test("rich merging into a heading keeps markup; text escapes into rich", () => {
  const editor = new Editor({ content: h("A") + p("b &amp; <em>c</em>") });
  ok(editor.mergeBackward(editor.model.blocks[1].id));
  equal(editor.model.blocks[0].fields.text, "Ab &amp; <em>c</em>");
});

test("Backspace in an empty block removes it", () => {
  const editor = new Editor({ content: p("Keep") + p("") });
  ok(editor.mergeBackward(editor.model.blocks[1].id));
  equal(editor.model.blocks.length, 1);
  same(editor.selection.caret, { block: editor.model.blocks[0].id, field: "body", start: 4, end: 4 });
});

test("Backspace after a raw block selects it", () => {
  const editor = new Editor({ content: `<marquee>x</marquee>` + p("After") });
  ok(editor.mergeBackward(editor.model.blocks[1].id));
  same(editor.selection.blocks, [editor.model.blocks[0].id]);
  equal(editor.model.blocks.length, 2);
});

test("typing coalesces; a structural edit is its own entry", () => {
  const editor = new Editor({ content: p("a") });
  const id = editor.model.blocks[0].id;
  editor.setField(id, "body", "ab", { source: "input" });
  editor.setField(id, "body", "abc", { source: "input" });
  equal(editor.history.undoDepth, 1);
  editor.split(id, "body", 3);
  equal(editor.history.undoDepth, 2);
  editor.undo();
  editor.undo();
  same(bodies(editor), ["a"]);
  ok(!editor.history.canUndo);
});

test("an edit after undo discards the redo", () => {
  const editor = new Editor({ content: p("a") });
  const id = editor.model.blocks[0].id;
  editor.setField(id, "body", "b");
  editor.undo();
  ok(editor.history.canRedo);
  editor.setField(id, "body", "c");
  ok(!editor.history.canRedo);
});

test("a setting equal to its default drops the island key", () => {
  const editor = new Editor({ content: p("x") });
  const id = editor.model.blocks[0].id;
  editor.setSetting(id, "dropCap", true);
  same(editor.model.blocks[0].settings, { dropCap: true });
  editor.setSetting(id, "dropCap", false);
  same(editor.model.blocks[0].settings, {});
});

test("group wraps siblings; ungroup splices them back in order", () => {
  const editor = new Editor({ content: p("1") + p("2") + p("3") });
  const [a, b] = editor.model.blocks.map((block) => block.id);
  const group = editor.group([b, a])!;
  ok(group);
  equal(editor.model.blocks.length, 2);
  same(editor.model.blocks[0].slots!.children.map((block) => block.fields.body), ["1", "2"]);
  same(editor.ungroup(group), [a, b]);
  same(bodies(editor), ["1", "2", "3"]);
});

test("remove keeps one block in an empty document", () => {
  const editor = new Editor({ content: p("only") });
  editor.removeBlocks([editor.model.blocks[0].id]);
  equal(editor.model.blocks.length, 1);
  equal(editor.model.blocks[0].type, "paragraph");
});

test("move up and down; the edges refuse", () => {
  const editor = new Editor({ content: p("1") + p("2") });
  const [a] = editor.model.blocks.map((block) => block.id);
  ok(!editor.moveBlock(a, -1));
  ok(editor.moveBlock(a, 1));
  same(bodies(editor), ["2", "1"]);
});

test("policy: a removable:false block survives every delete path", () => {
  const editor = new Editor({ content: h("H") + p("A") + p("B"), policy: { blocks: { paragraph: { removable: false } } } });
  const ids = editor.model.blocks.map((block) => block.id);
  same(editor.removeBlocks(ids), [ids[0]]);
  ok(!editor.mergeBackward(editor.model.blocks[1].id));
  equal(editor.model.blocks.length, 2);
});

test("policy: movable:false pins a block; orderable:false pins a level", () => {
  const pinned = new Editor({ content: p("1") + h("H") + p("2"), policy: { blocks: { heading: { movable: false } } } });
  ok(!pinned.canMove(pinned.model.blocks[1].id, 1));
  ok(pinned.canMove(pinned.model.blocks[0].id, 1));
  const root = new Editor({ content: p("1") + `<div data-pb-block="group" data-pb-children>${p("a")}${p("b")}</div>`, policy: { orderable: false } });
  ok(!root.canMove(root.model.blocks[0].id, 1));
  const inner = root.model.blocks[1].slots!.children[0].id;
  ok(root.canMove(inner, 1), "the root lock does not cascade into the group");
});

test("policy: allowedBlocks gates insertion; a slot rule stays in its slot", () => {
  const editor = new Editor({ content: `<div data-pb-block="group" data-pb-children>${p("a")}</div>`, policy: { slots: { group: { allowedBlocks: ["paragraph", "heading"] } } } });
  const group = editor.model.blocks[0].id;
  ok(!editor.canPlace({ parent: group, slot: "children", index: 0 }, ["quote"]));
  ok(editor.canPlace({ parent: group, slot: "children", index: 0 }, ["heading"]));
  ok(editor.canPlace({ parent: null, slot: null, index: 0 }, ["quote"]));
});

test("policy: content-only locks structure, keeps typing and marks", () => {
  const editor = new Editor({ content: p("A") + p("B"), policy: { preset: "content-only" } });
  const [a, b] = editor.model.blocks.map((block) => block.id);
  ok(editor.setField(a, "body", "AA", { source: "input" }));
  same(editor.removeBlocks([a, b]), []);
  ok(!editor.mergeBackward(b));
  ok(!editor.canMove(a, 1));
  ok(!editor.policy.canInsertAny(editor.model, null));
  ok(editor.format(a, "body", 0, 1, "bold"));
});

test("policy: allowedFormats limits marks; editable:false refuses typing", () => {
  const editor = new Editor({ content: h("Locked") + p("x"), policy: { blocks: { heading: { editable: false }, paragraph: { allowedFormats: ["bold"] } } } });
  const [heading, paragraph] = editor.model.blocks.map((block) => block.id);
  ok(!editor.setField(heading, "text", "changed", { source: "input" }));
  ok(!editor.format(paragraph, "body", 0, 1, "italic"));
  ok(editor.format(paragraph, "body", 0, 1, "bold"));
});

test("list items split into siblings; an empty item leaves the list", () => {
  const editor = new Editor({ content: `<ul data-pb-block="list" data-pb-tag="tag" data-pb-children class="list-disc pl-6"><li data-pb-block="list-item" data-pb-rich="content">one</li></ul>` });
  const item = editor.model.blocks[0].slots!.children[0].id;
  ok(editor.split(item, "content", 3));
  const items = editor.model.blocks[0].slots!.children;
  equal(items.length, 2);
  equal(items[1].type, "list-item");
  ok(editor.split(items[1].id, "content", 0));
  same(editor.model.blocks.map((block) => block.type), ["list", "paragraph"]);
  equal(editor.model.blocks[0].slots!.children.length, 1);
});

test("transform keeps id, classes and content", () => {
  const editor = new Editor({ content: `<p data-pb-block="paragraph" data-pb-rich="body" class="text-lg">Hi <em>you</em></p>` });
  const id = editor.model.blocks[0].id;
  ok(editor.transformBlock(id, "heading"));
  const block = editor.model.blocks[0];
  same([block.id, block.type, block.fields.text, block.classes], [id, "heading", "Hi <em>you</em>", "text-lg"]);
});

test("duplicate copies with fresh ids, nested too", () => {
  const editor = new Editor({ content: `<div data-pb-block="group" data-pb-children>${p("a")}</div>` });
  const [copy] = editor.duplicate([editor.model.blocks[0].id]);
  equal(editor.model.blocks.length, 2);
  ok(copy !== editor.model.blocks[0].id);
  ok(editor.model.blocks[1].slots!.children[0].id !== editor.model.blocks[0].slots!.children[0].id);
});
