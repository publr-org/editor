// Core block library — the text wave (story #336): preformatted, pullquote,
// verse, table, details, math, list + list-item, plus the paragraph
// (dropCap/direction) and quote (citation) upgrades. Registration happens
// once per file (vitest isolates test files, so the global registry is ours).

import { beforeAll, describe, expect, test } from "vitest";
import {
  createEditor,
  downcast,
  getBlockType,
  registerBlock,
  unregisterBlock,
  upcast,
} from "../src/index";
import type { Editor } from "../src/index";
import { coreBlocks, registerCoreBlocks } from "../src/blocks";

beforeAll(() => registerCoreBlocks());

const parse = (html: string) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
};

const ISLAND = (json: string) =>
  `<script type="application/json" data-pb-settings>${json}</` + `script>`;

describe("the text-wave library: registration metadata", () => {
  test("every core block registers; the library is the inserter's vocabulary", () => {
    for (const [type] of coreBlocks) expect(getBlockType(type)).toBeDefined();
    expect(coreBlocks).toHaveLength(34); // includes template part + slot authoring blocks
  });

  test("every insertable core block declares its toolbar behavior explicitly", () => {
    for (const [type] of coreBlocks) {
      const block = getBlockType(type)!;
      if (!block.internal) expect(block.toolbar, type).toBeDefined();
    }
  });

  test("list-item is internal — parent-scoped, never inserter fodder", () => {
    expect(getBlockType("list-item")!.internal).toBe(true);
    expect(getBlockType("list")!.internal).toBeUndefined();
  });

  test("list declares slot policy + template; its root is tag carrier AND slot", () => {
    const list = getBlockType("list")!;
    expect(list.allowedChildren).toEqual(["list-item"]);
    expect(list.childTemplate).toEqual(["list-item"]);
    expect(list.acceptsChildren).toBe(true);
    expect(list.fields).toEqual([{ name: "tag", type: "tag", default: "ul" }]);
  });

  test("preformatted derives from <pre> carriers — code, preformatted, verse", () => {
    expect(getBlockType("code")!.fields[0].preformatted).toBe(true);
    expect(getBlockType("preformatted")!.fields[0].preformatted).toBe(true);
    expect(getBlockType("verse")!.fields[0].preformatted).toBe(true);
    expect(getBlockType("paragraph")!.fields[0].preformatted).toBeUndefined();
  });

  test("table sections and math opt out of splitting by declaration", () => {
    expect(getBlockType("table")!.noSplit).toEqual(["head", "body", "foot"]);
    expect(getBlockType("math")!.noSplit).toEqual(["math"]);
  });
});

describe("the text-wave library: cast round trips", () => {
  test("preformatted content keeps its whitespace through load and serialize", () => {
    const html = `<pre data-pb-block="preformatted" data-pb-id="b_1" data-pb-rich="content">line one\n  indented <em>two</em></pre>`;
    const m = upcast(parse(html));
    expect(m.blocks[0].fields.content).toBe("line one\n  indented <em>two</em>");
    expect(upcast(parse(downcast(m)))).toEqual(m);
  });

  test("the round-trip law holds for the whole wave, settings included", () => {
    const authored =
      `<p data-pb-block="paragraph" data-pb-id="b_p" data-pb-rich="body">${ISLAND('{"dropCap":true,"direction":"rtl"}')}Drop cap</p>` +
      `<blockquote data-pb-block="quote" data-pb-id="b_q"><div data-pb-rich="body">Said <em>well</em></div><cite data-pb-text="citation">Someone</cite></blockquote>` +
      `<figure data-pb-block="pullquote" data-pb-id="b_pq"><blockquote><div data-pb-rich="value">Big statement</div></blockquote><cite data-pb-text="citation">A. Author</cite></figure>` +
      `<pre data-pb-block="verse" data-pb-id="b_v" data-pb-rich="content">Roses are red\n  and indented</pre>` +
      `<table data-pb-block="table" data-pb-id="b_t">${ISLAND('{"fixedLayout":false}')}<caption data-pb-rich="caption">Caption</caption><thead data-pb-rich="head"><tr><th>H</th></tr></thead><tbody data-pb-rich="body"><tr><td>1</td></tr></tbody><tfoot data-pb-rich="foot"></tfoot></table>` +
      `<details data-pb-block="details" data-pb-id="b_d">${ISLAND('{"open":true,"name":"faq"}')}<summary data-pb-rich="summary">Q?</summary><div data-pb-children><p data-pb-block="paragraph" data-pb-id="b_da" data-pb-rich="body">A.</p></div></details>` +
      `<math data-pb-block="math" data-pb-id="b_m" data-pb-rich="math"><mrow><mi>y</mi></mrow></math>` +
      `<ol data-pb-block="list" data-pb-id="b_l" data-pb-tag="tag" data-pb-children>${ISLAND('{"reversed":true,"start":5,"type":"A"}')}<li data-pb-block="list-item" data-pb-id="b_l1" data-pb-rich="content">One</li><li data-pb-block="list-item" data-pb-id="b_l2" data-pb-rich="content">Two <em>rich</em></li></ol>`;

    const m = upcast(parse(authored));
    expect(m.blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "quote",
      "pullquote",
      "verse",
      "table",
      "details",
      "math",
      "list",
    ]);
    // islands parsed sparsely, slot children clean of the island
    expect(m.blocks[0].settings).toEqual({ dropCap: true, direction: "rtl" });
    expect(m.blocks[4].settings).toEqual({ fixedLayout: false });
    expect(m.blocks[5].settings).toEqual({ open: true, name: "faq" });
    expect(m.blocks[5].children!.map((b) => b.type)).toEqual(["paragraph"]);
    expect(m.blocks[7].settings).toEqual({
      reversed: true,
      start: 5,
      type: "A",
    });
    expect(m.blocks[7].children!.map((b) => b.type)).toEqual(["list-item", "list-item"]);
    expect(m.blocks[7].fields.tag).toBe("ol");

    const gen1 = downcast(m);
    // derived presentation regenerates: ol attributes + details state
    expect(gen1).toContain("reversed");
    expect(gen1).toContain('start="5"');
    expect(gen1).toContain('type="A"');
    expect(gen1).toContain("<details");
    expect(gen1).toContain(" open");
    expect(gen1).toContain('name="faq"');
    expect(gen1).toContain('dir="rtl"');
    expect(gen1).not.toContain("table-fixed"); // fixedLayout:false drops the derived class
    // the law: models converge and serialization reaches its fixed point
    expect(upcast(parse(gen1))).toEqual(m);
    expect(downcast(upcast(parse(gen1)))).toBe(gen1);
  });

  test("all-default settings emit no islands and no derived attributes", () => {
    const html =
      `<ul data-pb-block="list" data-pb-id="b_l" data-pb-tag="tag" data-pb-children><li data-pb-block="list-item" data-pb-id="b_i" data-pb-rich="content">Plain</li></ul>` +
      `<p data-pb-block="paragraph" data-pb-id="b_p" data-pb-rich="body">Plain</p>`;
    const m = upcast(parse(html));
    expect(m.blocks[0].settings).toEqual({});
    const gen1 = downcast(m);
    expect(gen1).not.toContain("data-pb-settings");
    expect(gen1).not.toContain("reversed");
    expect(gen1).not.toContain("dir=");
  });
});

describe("the text-wave library: editor semantics", () => {
  let canvas!: HTMLElement;
  let editor!: Editor;

  function setup(html = "") {
    canvas = document.createElement("main");
    document.body.appendChild(canvas);
    editor = createEditor({
      canvas,
      defaultBlock: "paragraph",
      groupBlock: "group",
    });
    editor.loadHtml(html);
    return editor;
  }

  const teardown = () => {
    editor?.destroy();
    canvas?.remove();
    window.getSelection()?.removeAllRanges();
  };

  const focusCarrier = (sel: string) => {
    const el = canvas.querySelector<HTMLElement>(sel)!;
    el.focus();
    return el;
  };

  const pressEnter = (el: HTMLElement) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

  test("a fresh list seeds one list-item (childTemplate), not a paragraph", () => {
    setup();
    const list = editor.insertBlock("list")!;
    expect(list.children!.map((b) => b.type)).toEqual(["list-item"]);
    expect(list.settings).toEqual({});
    teardown();
  });

  test("Enter inside a list-item splits into a SAME-TYPE sibling", () => {
    setup(
      `<ul data-pb-block="list" data-pb-id="b_l" data-pb-tag="tag" data-pb-children><li data-pb-block="list-item" data-pb-id="b_i" data-pb-rich="content">split me</li></ul>`,
    );
    pressEnter(focusCarrier('[data-pb-id="b_i"]'));
    const items = editor.getModel().blocks[0].children!;
    expect(items.map((b) => b.type)).toEqual(["list-item", "list-item"]);
    expect(items[0].id).toBe("b_i");
    expect(items[1].id).not.toBe("b_i"); // fresh id for the new sibling
    teardown();
  });

  test("the items slot refuses foreign types: transform and replace no-op", () => {
    setup(
      `<ul data-pb-block="list" data-pb-id="b_l" data-pb-tag="tag" data-pb-children><li data-pb-block="list-item" data-pb-id="b_i" data-pb-rich="content">stay</li></ul>`,
    );
    expect(editor.transformBlock("b_i", "paragraph")).toBeNull();
    expect(editor.replaceBlock("b_i", "paragraph")).toBeNull();
    expect(editor.getModel().blocks[0].children![0].type).toBe("list-item");
    teardown();
  });

  test("Enter stays native in preformatted fields and noSplit fields", () => {
    setup(
      `<pre data-pb-block="preformatted" data-pb-id="b_pre" data-pb-rich="content">keep me whole</pre>` +
        `<math data-pb-block="math" data-pb-id="b_m" data-pb-rich="math"><mrow><mi>y</mi></mrow></math>`,
    );
    pressEnter(focusCarrier('[data-pb-id="b_pre"]'));
    expect(editor.getModel().blocks).toHaveLength(2); // no split happened
    pressEnter(focusCarrier('[data-pb-id="b_m"]'));
    expect(editor.getModel().blocks).toHaveLength(2);
    teardown();
  });

  test("Backspace in an empty list-item removes it (the generic removal path)", () => {
    setup(
      `<ul data-pb-block="list" data-pb-id="b_l" data-pb-tag="tag" data-pb-children><li data-pb-block="list-item" data-pb-id="b_1" data-pb-rich="content">one</li><li data-pb-block="list-item" data-pb-id="b_2" data-pb-rich="content"></li></ul>`,
    );
    const el = focusCarrier('[data-pb-id="b_2"]');
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(editor.getModel().blocks[0].children!.map((b) => b.id)).toEqual(["b_1"]);
    teardown();
  });

  test("paragraph dropCap/direction and details open/name write through setSetting", () => {
    setup(`<p data-pb-block="paragraph" data-pb-id="b_p" data-pb-rich="body">Hi</p>`);
    editor.setSetting("b_p", "dropCap", true);
    editor.setSetting("b_p", "direction", "rtl");
    const root = () => canvas.querySelector<HTMLElement>('[data-pb-id="b_p"]')!;
    expect(root().getAttribute("dir")).toBe("rtl");
    expect(root().className).toContain("first-letter:float-left");
    editor.setSetting("b_p", "direction", "auto"); // back to the default — key deleted
    expect(editor.getBlock("b_p")!.settings).toEqual({ dropCap: true });
    expect(root().hasAttribute("dir")).toBe(false);
    teardown();
  });
});

// ---------------------------------------------------------------------------

describe("the media-wave library (story #337)", () => {
  const MEDIA_TYPES = ["image", "video", "audio", "cover", "gallery", "file", "media-text", "icon"];

  test("every media block registers under the Media shelf", () => {
    for (const t of MEDIA_TYPES) {
      expect(getBlockType(t), t).toBeDefined();
      expect(getBlockType(t)!.category).toBe("Media");
    }
    expect(getBlockType("gallery")!.allowedChildren).toEqual(["image"]);
    expect(getBlockType("icon")!.noSplit).toEqual(["svg"]);
  });

  test("the round-trip law holds for the media wave, settings included", () => {
    const authored =
      `<figure data-pb-block="image" data-pb-id="b_i">${ISLAND('{"href":"https://x.test","linkTarget":"_blank","aspectRatio":"16-9"}')}<img data-pb-image="image" src="/a.png" alt="A" width="640" height="480"><figcaption data-pb-rich="caption">Cap</figcaption></figure>` +
      `<video data-pb-block="video" data-pb-id="b_v" data-pb-image="video" src="/v.mp4" alt="">${ISLAND('{"loop":true,"muted":true,"poster":"/p.jpg"}')}</video>` +
      `<figure data-pb-block="audio" data-pb-id="b_a">${ISLAND('{"autoplay":true}')}<audio data-pb-image="audio" src="/a.mp3" alt=""></audio><figcaption data-pb-rich="caption"></figcaption></figure>` +
      `<div data-pb-block="cover" data-pb-id="b_c">${ISLAND('{"dimRatio":80,"contentPosition":"bottom-left","minHeight":600}')}<img data-pb-image="image" src="/bg.jpg" alt=""><div data-pb-children><p data-pb-block="paragraph" data-pb-id="b_cp" data-pb-rich="body">Hero</p></div></div>` +
      `<figure data-pb-block="gallery" data-pb-id="b_g">${ISLAND('{"columns":2,"imageCrop":false}')}<div data-pb-children><figure data-pb-block="image" data-pb-id="b_g1"><img data-pb-image="image" src="/1.png" alt=""><figcaption data-pb-rich="caption"></figcaption></figure></div><figcaption data-pb-rich="caption">Shots</figcaption></figure>` +
      `<div data-pb-block="file" data-pb-id="b_f"><a data-pb-rich="name" data-pb-link="href" href="/doc.pdf">The doc</a><a href="/doc.pdf" download data-pb-text="downloadLabel">Get it</a></div>` +
      `<div data-pb-block="media-text" data-pb-id="b_m">${ISLAND('{"mediaPosition":"right","mediaWidth":30,"verticalAlignment":"top"}')}<div><img data-pb-image="media" src="/m.png" alt="M"></div><div data-pb-children><p data-pb-block="paragraph" data-pb-id="b_mp" data-pb-rich="body">Side</p></div></div>` +
      `<span data-pb-block="icon" data-pb-id="b_ic">${ISLAND('{"rotation":"90","flipHorizontal":true}')}<svg viewBox="0 0 20 20"><path d="M0 0h20v20z"></path></svg></span>`;

    const m = upcast(parse(authored));
    expect(m.blocks.map((b) => b.type)).toEqual([
      "image",
      "video",
      "audio",
      "cover",
      "gallery",
      "file",
      "media-text",
      "icon",
    ]);
    expect(m.blocks[0].fields.image).toEqual({
      src: "/a.png",
      alt: "A",
      width: "640",
      height: "480",
    });
    expect(m.blocks[0].settings).toEqual({
      href: "https://x.test",
      linkTarget: "_blank",
      aspectRatio: "16-9",
    });
    expect(m.blocks[3].children!.map((b) => b.type)).toEqual(["paragraph"]);
    expect(m.blocks[4].children!.map((b) => b.type)).toEqual(["image"]);
    expect(m.blocks[5].fields.href).toBe("/doc.pdf");
    expect(m.blocks[5].fields.name).toBe("The doc");
    expect(m.blocks[5].fields.downloadLabel).toBe("Get it");

    const gen1 = downcast(m);
    // derived presentation regenerates from the islands
    expect(gen1).toContain('target="_blank"'); // image link wrapper
    expect(gen1).toContain("aspect-video"); // 16-9 ratio class
    expect(gen1).toContain(" loop"); // video playback attrs
    expect(gen1).toContain('poster="/p.jpg"');
    expect(gen1).toContain("opacity-80"); // cover dim token
    expect(gen1).toContain("justify-end"); // bottom-left content position
    expect(gen1).toContain("grid-cols-2"); // gallery columns
    expect(gen1).toContain("grid-cols-[1fr_30%]"); // media right at 30%
    expect(gen1).toContain("rotate-90"); // icon rotation
    expect(gen1).toContain("-scale-x-100"); // icon flip
    // the law
    expect(upcast(parse(gen1))).toEqual(m);
    expect(downcast(upcast(parse(gen1)))).toBe(gen1);
  });

  test("bare-img image markup still ingests; downcast normalizes to the figure form", () => {
    const m = upcast(
      parse(
        `<img data-pb-block="image" data-pb-id="b_1" data-pb-image="image" src="/x.png" alt="X">`,
      ),
    );
    expect(m.blocks[0].type).toBe("image");
    expect(m.blocks[0].fields.image).toEqual({
      src: "/x.png",
      alt: "X",
      width: "",
      height: "",
    });
    const gen1 = downcast(m);
    expect(gen1).toContain("<figure");
    expect(upcast(parse(gen1))).toEqual(m);
  });

  test("the file block's download anchor mirrors the link field as derived output", () => {
    const m = upcast(
      parse(
        `<div data-pb-block="file" data-pb-id="b_1"><a data-pb-rich="name" data-pb-link="href" href="/a.zip">Zip</a><a href="/STALE" download data-pb-text="downloadLabel">Download</a></div>`,
      ),
    );
    expect(m.blocks[0].fields.href).toBe("/a.zip");
    const gen1 = downcast(m);
    expect(gen1).not.toContain("/STALE"); // derived href regenerated from the field
    expect(gen1.match(/href="\/a\.zip"/g)!.length).toBe(2);
  });

  test("a fresh gallery seeds one image block (childTemplate)", () => {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph" });
    const g = editor.insertBlock("gallery")!;
    expect(g.children!.map((b) => b.type)).toEqual(["image"]);
    expect(editor.transformBlock(g.children![0].id, "paragraph")).toBeNull(); // slot gate
    editor.destroy();
    canvas.remove();
  });
});

// ---------------------------------------------------------------------------

describe("the design-wave library (story #338)", () => {
  test("the design blocks register; internals stay parent-scoped", () => {
    for (const t of [
      "button",
      "buttons",
      "separator",
      "spacer",
      "columns",
      "column",
      "accordion",
      "accordion-item",
    ])
      expect(getBlockType(t), t).toBeDefined();
    expect(getBlockType("column")!.internal).toBe(true);
    expect(getBlockType("accordion-item")!.internal).toBe(true);
    expect(getBlockType("buttons")!.allowedChildren).toEqual(["button"]);
    expect(getBlockType("columns")!.childTemplate).toEqual(["column", "column"]);
    expect(getBlockType("accordion")!.allowedChildren).toEqual(["accordion-item"]);
  });

  test("Group owns responsive Group / Row / Stack / Grid layouts and the tag carrier", () => {
    const def = getBlockType("group")!;
    expect(getBlockType("row")).toBeUndefined();
    expect(getBlockType("stack")).toBeUndefined();
    expect(getBlockType("grid")).toBeUndefined();
    expect(def.fields).toEqual([{ name: "tag", type: "tag", default: "div" }]);
    const layout = def.settings!.find((s) => s.style === "layoutMode")!;
    expect(layout.options!.map((option) => option.value)).toEqual([
      "group",
      "row",
      "stack",
      "grid",
    ]);
    expect(def.settings!.find((s) => s.style === "containerEnabled")).toMatchObject({
      control: "toggle",
      default: "false",
    });
    const width = def.settings!.find((s) => s.style === "containerWidth")!;
    expect(width.default).toBe("wide");
    expect(width.when).toEqual({ style: "containerEnabled", equals: "true" });
    expect(width.options!.map((option) => option.value)).toEqual(["content", "wide"]);
    expect(width.options!.map((option) => option.icon)).toEqual([
      "container-width",
      "container-width",
    ]);
    const bleed = def.settings!.find((s) => s.style === "containerBleed")!;
    expect(bleed.default).toBe("none");
    expect(bleed.when).toEqual({ style: "containerEnabled", equals: "true" });
    expect(bleed.options!.map((option) => option.value)).toEqual(["none", "left", "right", "both"]);
    expect(bleed.options!.map((option) => option.icon)).toEqual([
      "bleed-none",
      "bleed-left",
      "bleed-right",
      "bleed-both",
    ]);
    const layoutToolbar = def.toolbar?.filter((control) =>
      ["justifyContent", "alignItems", "flexWrap"].includes(control.style ?? ""),
    );
    expect(layoutToolbar?.map((control) => control.icon)).toEqual([
      "justify-start",
      "align-stretch",
      "wrap-none",
    ]);
    expect(layoutToolbar?.[2]).toMatchObject({
      control: "toggle-style",
      activeIcon: "wrap",
      style: "flexWrap",
      value: "wrap",
    });
    const el = def.settings!.find((s) => s.field === "tag")!;
    expect(el.control).toBe("select");
    expect(el.options!.map((o) => o.value)).toEqual([
      "div",
      "header",
      "main",
      "section",
      "article",
      "aside",
      "footer",
      "nav",
      "dl",
    ]);
  });

  test("the round-trip law holds for the design wave, settings included", () => {
    const authored =
      `<div data-pb-block="buttons" data-pb-id="b_bs" data-pb-children>${ISLAND('{"justify":"center","gap":"lg"}')}` +
      `<a data-pb-block="button" data-pb-id="b_b1" data-pb-rich="label" data-pb-link="url" href="/x">${ISLAND('{"style":"outline","linkTarget":"_blank","rel":"nofollow"}')}Go <em>now</em></a>` +
      `<a data-pb-block="button" data-pb-id="b_b2" data-pb-rich="label" data-pb-link="url" href="#">Plain</a></div>` +
      `<hr data-pb-block="separator" data-pb-id="b_sep">` +
      `<div data-pb-block="spacer" data-pb-id="b_sp" aria-hidden="true">${ISLAND('{"height":"xl"}')}</div>` +
      `<section data-pb-block="group" data-pb-id="b_sec" data-pb-tag="tag" data-pb-children><p data-pb-block="paragraph" data-pb-id="b_sp1" data-pb-rich="body">In section</p></section>` +
      `<div data-pb-block="columns" data-pb-id="b_cs" data-pb-children>${ISLAND('{"valign":"center","gap":"lg","stackOnMobile":false}')}` +
      `<div data-pb-block="column" data-pb-id="b_c1" data-pb-children>${ISLAND('{"width":"33"}')}<p data-pb-block="paragraph" data-pb-id="b_cp1" data-pb-rich="body">Left</p></div>` +
      `<div data-pb-block="column" data-pb-id="b_c2" data-pb-children><p data-pb-block="paragraph" data-pb-id="b_cp2" data-pb-rich="body">Right</p></div></div>` +
      `<div data-pb-block="accordion" data-pb-id="b_ac" data-pb-children>` +
      `<details data-pb-block="accordion-item" data-pb-id="b_a1">${ISLAND('{"openByDefault":true}')}<summary data-pb-rich="title">Q1</summary><div data-pb-children><p data-pb-block="paragraph" data-pb-id="b_ap1" data-pb-rich="body">A1</p></div></details></div>`;

    const m = upcast(parse(authored));
    expect(m.blocks.map((b) => b.type)).toEqual([
      "buttons",
      "separator",
      "spacer",
      "group",
      "columns",
      "accordion",
    ]);
    expect(m.blocks[0].children!.map((b) => b.type)).toEqual(["button", "button"]);
    expect(m.blocks[0].children![0].settings).toEqual({
      style: "outline",
      linkTarget: "_blank",
      rel: "nofollow",
    });
    expect(m.blocks[0].children![0].fields.url).toBe("/x");
    expect(m.blocks[3].fields.tag).toBe("section");
    expect(m.blocks[4].children![0].settings).toEqual({ width: "33" });
    expect(m.blocks[5].children![0].settings).toEqual({ openByDefault: true });

    const gen1 = downcast(m);
    expect(gen1).toContain("justify-center");
    expect(gen1).toContain('target="_blank"');
    expect(gen1).toContain('rel="noopener nofollow"'); // _blank merges noopener into authored rel
    expect(gen1).toContain("pbe-spacer--xl"); // height preset, utility-overridable
    expect(gen1).toContain("pbe-column--33"); // width preset, utility-overridable
    expect(gen1).not.toContain("max-md:flex-col"); // stackOnMobile:false drops the derived class
    expect(gen1).toContain(" open"); // accordion item openByDefault
    expect(upcast(parse(gen1))).toEqual(m);
    expect(downcast(upcast(parse(gen1)))).toBe(gen1);
  });

  test("fresh containers seed their templates; slots gate foreign types", () => {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph" });
    const cols = editor.insertBlock("columns")!;
    expect(cols.children!.map((b) => b.type)).toEqual(["column", "column"]);
    expect(cols.children![0].children).toEqual([expect.objectContaining({ type: "paragraph" })]);
    const btns = editor.insertBlock("buttons")!;
    expect(btns.children!.map((b) => b.type)).toEqual(["button"]);
    expect(editor.transformBlock(btns.children![0].id, "paragraph")).toBeNull();
    const acc = editor.insertBlock("accordion")!;
    expect(acc.children!.map((b) => b.type)).toEqual(["accordion-item"]);
    editor.destroy();
    canvas.remove();
  });
});

// ---------------------------------------------------------------------------

describe("the widgets-wave library (story #339)", () => {
  test("the widget blocks register; internals stay parent-scoped", () => {
    for (const t of ["embed", "html"]) expect(getBlockType(t), t).toBeDefined();
    // The experimental form family is deliberately
    // NOT shipped — story #370. Social links moved out of core entirely —
    // they belong to a plugin block.
    for (const t of ["form", "form-input", "form-submit-button", "form-submission-notification"])
      expect(getBlockType(t), t).toBeUndefined();
    for (const t of ["social-links", "social-link"]) expect(getBlockType(t), t).toBeUndefined();
  });

  test("the round-trip law holds for the widgets wave, settings included", () => {
    const authored =
      `<figure data-pb-block="embed" data-pb-id="b_e">${ISLAND('{"responsive":false}')}<iframe data-pb-image="media" src="https://player.test/v/1" alt="" width="560" height="315"></iframe><figcaption data-pb-rich="caption">Talk</figcaption></figure>` +
      `<div data-pb-block="html" data-pb-id="b_h" data-pb-rich="content"><marquee>retro</marquee></div>`;

    const m = upcast(parse(authored));
    expect(m.blocks.map((b) => b.type)).toEqual(["embed", "html"]);
    expect(m.blocks[0].fields.media).toEqual({
      src: "https://player.test/v/1",
      alt: "",
      width: "560",
      height: "315",
    });
    expect(m.blocks[1].fields.content).toBe("<marquee>retro</marquee>");

    const gen1 = downcast(m);
    expect(gen1).not.toContain("aspect-video"); // responsive:false drops the ratio classes
    expect(upcast(parse(gen1))).toEqual(m);
    expect(downcast(upcast(parse(gen1)))).toBe(gen1);
  });

  test("the deliberate html block differs from raw-html", () => {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph" });
    // raw-html stays the reserved passthrough for UNKNOWN markup — the html
    // block is a registered, insertable type
    editor.loadHtml(
      `<div data-pb-block="html" data-pb-rich="content">x</div><aside>foreign</aside>`,
    );
    expect(editor.getModel().blocks.map((b) => b.type)).toEqual(["html", "raw-html"]);
    editor.destroy();
    canvas.remove();
  });
});

// ---------------------------------------------------------------------------

describe("the media control kind (story #366)", () => {
  test("media controls bind image-kinded fields only", () => {
    const IMG = `<img data-pb-block="probe" data-pb-image="pic" src="" alt="">`;
    const reg = (settings: unknown, render: () => string) =>
      registerBlock("probe", { label: "P", settings, render } as any);
    // valid: image field
    const def = reg([{ control: "media", label: "Pic", field: "pic" }], () => IMG);
    expect(def.settings![0]).toEqual({
      control: "media",
      label: "Pic",
      field: "pic",
    });
    unregisterBlock("probe");
    // rejected: string-kinded field
    expect(() =>
      reg(
        [{ control: "media", label: "T", field: "t" }],
        () => `<p data-pb-block="probe" data-pb-text="t"></p>`,
      ),
    ).toThrow(/requires an image-kinded field/);
    unregisterBlock("probe");
    // rejected: island binding — media has no island vocabulary
    expect(() =>
      reg([{ control: "media", label: "P", setting: "x", default: "" }], () => IMG),
    ).toThrow(/unknown key "setting" on a "media" control/);
    unregisterBlock("probe");
    // rejected: unbound
    expect(() => reg([{ control: "media", label: "P" }], () => IMG)).toThrow(
      /exactly one of "field", "transform", "setting" or "style"/,
    );
  });

  test("every media block leads its sidebar with a media control on its image field", () => {
    for (const [type, field] of [
      ["image", "image"],
      ["video", "video"],
      ["audio", "audio"],
      ["cover", "image"],
      ["media-text", "media"],
      ["embed", "media"],
    ] as const) {
      const first = getBlockType(type)!.settings![0];
      expect(first.control, type).toBe("media");
      expect(first.field, type).toBe(field);
    }
  });
});
