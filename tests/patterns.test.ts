// Patterns (story #388, Phase B / B3): the pattern registry's hard
// validation, the data-pb-pattern provenance round-trip, and the copy-stamp
// semantics of insertPattern / replaceWithPattern — every stamp is an
// INDEPENDENT copy (fresh ids, one undo entry, no reference back).

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  attachInlineChrome,
  bumpPatternVersion,
  createEditor,
  diffPatternContent,
  downcast,
  flattenBlocks,
  getPattern,
  getPatternContent,
  patternTypes,
  publishPattern,
  registerBlock,
  registerPattern,
  unregisterBlock,
  unregisterPattern,
  upcast,
} from "../src/index";
import type { Editor } from "../src/index";
import { CORE_PATTERNS, registerCoreBlocks, registerCorePatterns } from "../src/blocks";

beforeAll(() => {
  registerCoreBlocks();
  registerCorePatterns();
});

const parse = (html: string): HTMLDivElement => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
};

const TWO_PARAGRAPHS = `
  <p data-pb-block="paragraph" data-pb-rich="body">One</p>
  <p data-pb-block="paragraph" data-pb-rich="body">Two</p>`;

// ---------------------------------------------------------------------------

describe("registration: the expansion is validated, not the markup", () => {
  afterEach(() => unregisterPattern("probe"));

  test("a valid fragment registers frozen; the registry lists it", () => {
    const def = registerPattern("probe", { label: "Probe", content: TWO_PARAGRAPHS });
    expect(Object.isFrozen(def)).toBe(true);
    expect(getPattern("probe")?.label).toBe("Probe");
    expect(patternTypes().some((p) => p.name === "probe")).toBe(true);
    expect(unregisterPattern("probe")).toBe(true);
    expect(getPattern("probe")).toBeUndefined();
  });

  test("definition shape is validated hard", () => {
    expect(() => registerPattern("Probe!", { label: "P", content: TWO_PARAGRAPHS })).toThrow(
      /lowercase name/,
    );
    expect(() => registerPattern("probe", { content: TWO_PARAGRAPHS } as any)).toThrow(/label/);
    expect(() => registerPattern("probe", { label: "P" } as any)).toThrow(/content/);
    expect(() =>
      registerPattern("probe", { label: "P", content: TWO_PARAGRAPHS, blocks: [] } as any),
    ).toThrow(/unknown key "blocks"/);
    registerPattern("probe", { label: "P", content: TWO_PARAGRAPHS });
    expect(() => registerPattern("probe", { label: "P", content: TWO_PARAGRAPHS })).toThrow(
      /already registered/,
    );
  });

  test("fragments referencing an UNREGISTERED block type are refused", () => {
    // A `data-pb-block` naming a type that isn't registered = a mistake (the
    // fragment is broken) — caught at the root…
    expect(() =>
      registerPattern("probe", {
        label: "P",
        content: `<p data-pb-block="paragraph" data-pb-rich="body">ok</p><div data-pb-block="nope">x</div>`,
      }),
    ).toThrow(/unregistered block type/);
    // …and nested (the walk is the whole tree).
    expect(() =>
      registerPattern("probe", {
        label: "P",
        content: `<div data-pb-block="group" data-pb-tag="tag" data-pb-children><div data-pb-block="nope">x</div><p data-pb-block="paragraph" data-pb-rich="body">ok</p></div>`,
      }),
    ).toThrow(/unregistered block type/);
  });

  test("untagged raw markup (decorative SVG, an embed) is ALLOWED, not a type mistake", () => {
    // Real-world sections carry decorative markup with no data-pb-block — it
    // passes through as raw-html, legitimately (the homepage patterns rely on
    // this). Only a referenced-but-unregistered TYPE is the error above.
    expect(() =>
      registerPattern("probe", {
        label: "P",
        content: `<div data-pb-block="group" data-pb-tag="tag" data-pb-children><div aria-hidden="true" class="absolute -z-10 blur-3xl"></div><p data-pb-block="paragraph" data-pb-rich="body">ok</p></div>`,
      }),
    ).not.toThrow(); // afterEach unregisters "probe"
  });

  test("one block is a block, not a pattern — but nested blocks count", () => {
    expect(() =>
      registerPattern("probe", {
        label: "P",
        content: `<p data-pb-block="paragraph" data-pb-rich="body">alone</p>`,
      }),
    ).toThrow(/at least two blocks/);
    // a container with one child totals two — composition, allowed
    const def = registerPattern("probe", {
      label: "P",
      content: `<div data-pb-block="group" data-pb-tag="tag" data-pb-children><p data-pb-block="paragraph" data-pb-rich="body">inside</p></div>`,
    });
    expect(def.label).toBe("P");
  });

  test("a carrier naming an undeclared field is refused — it would silently drop", () => {
    expect(() =>
      registerPattern("probe", {
        label: "P",
        content: `<p data-pb-block="paragraph" data-pb-rich="text">wrong field</p><p data-pb-block="paragraph" data-pb-rich="body">ok</p>`,
      }),
    ).toThrow(/does not carry a field "text"/);
  });

  test("the core pattern set registers clean (fragments stay in sync with the blocks)", () => {
    // registered in beforeAll — every core pattern is present and listable
    for (const [name] of CORE_PATTERNS) expect(getPattern(name)).toBeDefined();
  });

  test("a phantom block requires a children slot — it exists FOR its children", () => {
    expect(() =>
      registerBlock("ghost-probe", {
        label: "Ghost",
        phantom: true,
        render: () => `<div data-pb-block="ghost-probe" data-pb-text="t"></div>`,
      }),
    ).toThrow(/phantom requires a children slot/);
    registerBlock("ghost-probe", {
      label: "Ghost",
      phantom: true,
      render: () => `<div data-pb-block="ghost-probe" data-pb-children></div>`,
    });
    expect(unregisterBlock("ghost-probe")).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("provenance: data-pb-pattern rides the wire, informational only", () => {
  test("upcast captures it, downcast re-emits it — the round-trip law holds", () => {
    const model = upcast(
      parse(
        `<div data-pb-block="group" data-pb-tag="tag" data-pb-children data-pb-pattern="hero"><p data-pb-block="paragraph" data-pb-rich="body">x</p></div>`,
      ),
    );
    expect(model.blocks[0].pattern).toBe("hero");
    expect(model.blocks[0].children![0].pattern).toBeUndefined(); // absent stays absent
    const html = downcast(model);
    expect(html).toContain('data-pb-pattern="hero"');
    expect(upcast(parse(html))).toEqual(model);
  });

  test("the data pipeline strips it with the rest of the editing vocabulary", () => {
    const model = upcast(
      parse(
        `<div data-pb-block="group" data-pb-tag="tag" data-pb-children data-pb-pattern="hero"><p data-pb-block="paragraph" data-pb-rich="body">x</p></div>`,
      ),
    );
    expect(downcast(model, "data")).not.toContain("data-pb-pattern");
  });
});

// ---------------------------------------------------------------------------

describe("stamping: independent copies through one commit", () => {
  let canvas!: HTMLElement;
  let editor!: Editor;

  function setup(html: string) {
    canvas = document.createElement("main");
    document.body.appendChild(canvas);
    editor = createEditor({ canvas, defaultBlock: "paragraph", groupBlock: "group" });
    editor.loadHtml(html);
    return editor;
  }

  afterEach(() => {
    editor?.destroy();
    canvas?.remove();
    window.getSelection()?.removeAllRanges();
  });

  const P = (body: string) => `<p data-pb-block="paragraph" data-pb-rich="body">${body}</p>`;

  test("insertPattern appends the whole composition as ONE history entry", () => {
    setup(P("before"));
    const depth = editor.history.undoDepth;
    const stamped = editor.insertPattern("call-to-action")!;
    expect(stamped).toHaveLength(1); // ONE root: the phantom pattern block
    expect(stamped[0].type).toBe("pattern");
    expect(editor.getModel().blocks).toHaveLength(2);
    expect(editor.getModel().blocks[1].pattern).toBe("call-to-action"); // the root owns the identity
    expect(flattenBlocks(stamped).length).toBeGreaterThan(3); // …carrying the composition
    expect(editor.history.undoDepth).toBe(depth + 1);
    // a stamp is a placed structure: it lands BLOCK-SELECTED, no caret into
    // its first text field
    expect(editor.selection.blocks).toEqual([stamped[0].id]);
    expect(
      canvas.querySelector(`[data-pb-id="${stamped[0].id}"]`)!.classList.contains("pbe-selected"),
    ).toBe(true);
    editor.undo();
    expect(editor.getModel().blocks).toHaveLength(1); // the whole stamp leaves in one step
  });

  test("insertPattern at an index; unknown patterns are refused without a commit", () => {
    setup(P("first") + P("last"));
    const depth = editor.history.undoDepth;
    editor.insertPattern("call-to-action", 1);
    expect(editor.getModel().blocks[1].pattern).toBe("call-to-action");
    expect(editor.insertPattern("no-such-pattern")).toBeNull();
    expect(editor.history.undoDepth).toBe(depth + 1);
  });

  test("insertPatternAdjacent stamps at an internal sibling boundary in one commit", () => {
    setup(P("first") + P("last"));
    const anchor = editor.getModel().blocks[1];
    const depth = editor.history.undoDepth;

    const stamped = editor.insertPatternAdjacent(anchor.id, "before", "call-to-action")!;
    expect(editor.getModel().blocks.map((block) => block.id)).toEqual([
      expect.any(String),
      stamped[0].id,
      anchor.id,
    ]);
    expect(editor.getModel().blocks[0].fields.body).toBe("first");
    expect(editor.history.undoDepth).toBe(depth + 1);

    editor.undo();
    expect(editor.getModel().blocks.map((block) => block.fields.body)).toEqual(["first", "last"]);
  });

  test("every stamp is an independent copy — fresh ids, edits never cross", () => {
    setup("");
    const a = editor.insertPattern("call-to-action")![0];
    const b = editor.insertPattern("call-to-action")![0];
    const ids = (root: typeof a) => flattenBlocks([root]).map((x) => x.id);
    expect(new Set([...ids(a), ...ids(b)]).size).toBe(ids(a).length + ids(b).length);
    const headingA = a.children![0].children![0]; // phantom > group > heading
    const headingB = b.children![0].children![0];
    editor.setField(headingA.id, "text", "edited copy A");
    expect(editor.getBlock(headingB.id)!.fields.text).not.toBe("edited copy A");
  });

  test("replaceWithPattern swaps the target in place (slash/inserter semantics)", () => {
    setup(P("keep") + P("") + P("also keep"));
    const empty = editor.getModel().blocks[1];
    const stamped = editor.replaceWithPattern(empty.id, "features")!;
    const blocks = editor.getModel().blocks;
    expect(blocks).toHaveLength(3);
    expect(blocks[1].id).toBe(stamped[0].id);
    expect(blocks[1].type).toBe("pattern"); // the phantom root
    expect(blocks[1].children![0].type).toBe("columns");
    expect(blocks[1].children![0].children).toHaveLength(3);
    expect(editor.getBlock(empty.id)).toBeUndefined();
  });

  test("replaceWithPattern respects the containing slot's allowedChildren", () => {
    // columns only takes column — the phantom root is refused like any type
    registerPattern("two-paragraphs", { label: "Two", content: TWO_PARAGRAPHS });
    setup(
      `<div data-pb-block="columns" data-pb-children><div data-pb-block="column" data-pb-children>${P("x")}</div></div>`,
    );
    const column = editor.getModel().blocks[0].children![0];
    expect(editor.replaceWithPattern(column.id, "two-paragraphs")).toBeNull();
    // …but the paragraph INSIDE the column takes it (column allows everything)
    const inner = column.children![0];
    const stamped = editor.replaceWithPattern(inner.id, "two-paragraphs")!;
    expect(stamped).toHaveLength(1); // the phantom root hosts both paragraphs
    expect(stamped[0].children).toHaveLength(2);
    expect(editor.getModel().blocks[0].children![0].children![0].id).toBe(stamped[0].id);
    unregisterPattern("two-paragraphs");
  });

  test("a stamp round-trips on the editor wire — the phantom root is real there", () => {
    setup("");
    editor.insertPattern("hero");
    const html = editor.serialize();
    expect(html).toContain('data-pb-block="pattern"');
    expect(html).toContain('data-pb-pattern="hero"');
    const reloaded = upcast(parse(html));
    expect(reloaded.blocks[0].type).toBe("pattern");
    expect(reloaded.blocks[0].pattern).toBe("hero");
    expect(upcast(parse(downcast(reloaded)))).toEqual(reloaded); // round-trip law over a stamped doc
  });

  test("the data pipeline unwraps the phantom root — no published output for it", () => {
    setup("");
    editor.insertPattern("testimonials"); // two fragment roots: heading + columns
    const data = editor.serialize({ pipeline: "data" });
    const out = parse(data);
    // the wrapper is GONE: the fragment's roots publish at the top level
    expect([...out.children].map((c) => c.tagName.toLowerCase())).toEqual(["h2", "div"]);
    expect(data).not.toMatch(/<[^>]*\bdata-pb-/);
    expect(data).toContain("What people say");
  });

  test("nested phantoms unwrap too (a stamp inside a group)", () => {
    setup("");
    const stamped = editor.insertPattern("testimonials")!;
    editor.groupBlocks([stamped[0].id]);
    const data = editor.serialize({ pipeline: "data" });
    const out = parse(data);
    expect(out.children).toHaveLength(1); // the group publishes…
    expect([...out.children[0].children].map((c) => c.tagName.toLowerCase())).toEqual([
      "h2",
      "div",
    ]); // …with the phantom's children directly inside
  });

  test("instances are DECOUPLED: no version pin on the wire, publishes never touch copies", () => {
    setup("");
    const root = editor.insertPattern("call-to-action")![0];
    expect(editor.serialize()).not.toContain("data-pb-pattern-version");
    const heading = root.children![0].children![0]; // phantom > group > heading
    const before = heading.fields.text as string;
    // the definition moves on — the placed copy must not move a millimeter
    publishPattern(
      "call-to-action",
      `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-text="text">A whole new design</h2><p data-pb-block="paragraph" data-pb-rich="body">New copy.</p>`,
    );
    try {
      expect(getPattern("call-to-action")!.version).toBe("2.0"); // structure changed → major
      expect(editor.getBlock(heading.id)!.fields.text).toBe(before); // untouched
      expect(editor.serialize()).toContain(before);
      // …but a FRESH insert uses the new design
      const fresh = editor.insertPattern("call-to-action")![0];
      expect(fresh.children![0].fields.text).toBe("A whole new design");
    } finally {
      // restore the original definition for the rest of the suite
      const cta = CORE_PATTERNS.find(([n]) => n === "call-to-action")![1];
      unregisterPattern("call-to-action");
      registerPattern("call-to-action", cta);
    }
  });

  test("setBlockChildren applies an isolation-edited copy back to THAT block only", () => {
    setup(P("neighbor"));
    const root = editor.insertPattern("call-to-action")![0];
    const depth = editor.history.undoDepth;
    // the isolation mode round-trip: children out, edited fragment back in
    const edited =
      downcast({ blocks: root.children! }).replace("Ready when you are", "EDITED IN ISOLATION") +
      `\n<p data-pb-block="paragraph" data-pb-rich="body">Added in isolation.</p>`;
    const applied = editor.setBlockChildren(root.id, edited)!;
    expect(applied.id).toBe(root.id); // same block, new children
    expect(applied.children!.map((b) => b.type)).toEqual(["group", "paragraph"]);
    expect(applied.children![0].children![0].fields.text).toBe("EDITED IN ISOLATION");
    expect(editor.history.undoDepth).toBe(depth + 1); // one entry
    expect(editor.selection.blocks).toEqual([root.id]); // lands selected
    expect(editor.getModel().blocks[0].fields.body).toBe("neighbor"); // nothing else moved
    // refusals: unknown block, non-container
    expect(editor.setBlockChildren("nope", "<p></p>")).toBeNull();
    expect(editor.setBlockChildren(editor.getModel().blocks[0].id, "<p></p>")).toBeNull();
  });

  test("only a content block's exact border box passes through an opaque pattern", async () => {
    // the reported repro: raw-html block directly before a pattern instance
    setup(`<blockquote><p>foreign markup, no annotations</p></blockquote>`);
    const root = editor.insertPattern("testimonials")![0];
    editor.selectBlock(editor.getModel().blocks[0].id); // park selection elsewhere
    const rootEl = canvas.querySelector<HTMLElement>(`[data-pb-id="${root.id}"]`)!;
    // a click on the container's own surface (the phantom root, between children)
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    rootEl.dispatchEvent(down);
    // WE own it: prevented, so the browser never places its nearest-text
    // caret (which would land in the raw block and drag chrome with it)
    expect(down.defaultPrevented).toBe(true);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await vi.waitFor(() => expect(editor.selection.blocks).toEqual([root.id]));
    expect(editor.selection.active).toBeNull();

    // …while an exact click inside an editable carrier stays native (the
    // caret's business).
    const carrier = rootEl.querySelector<HTMLElement>("[data-pb-text], [data-pb-rich]")!;
    vi.spyOn(carrier, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 240, 60));
    const downCarrier = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 160,
      clientY: 120,
    });
    carrier.dispatchEvent(downCarrier);
    expect(downCarrier.defaultPrevented).toBe(false);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.selection.blocks).toEqual([]);

    // Chromium may still report that carrier as the event target for a click
    // in its margin / nearby layout space. Coordinates outside the rendered
    // border box must resolve to the WHOLE pattern, never the closest block.
    const downMargin = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 160,
      clientY: 80,
    });
    carrier.dispatchEvent(downMargin);
    expect(downMargin.defaultPrevented).toBe(true);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await vi.waitFor(() => expect(editor.selection.blocks).toEqual([root.id]));
    expect(editor.selection.active).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("versioning: compare, bump, and the structural diff", () => {
  const P = (body: string) => `<p data-pb-block="paragraph" data-pb-rich="body">${body}</p>`;
  const H = (text: string) =>
    `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-text="text">${text}</h2>`;

  test("registration validates and defaults the version", () => {
    expect(() =>
      registerPattern("probe", { label: "P", content: TWO_PARAGRAPHS, version: "v1" }),
    ).toThrow(/major\.minor/);
    const def = registerPattern("probe", { label: "P", content: TWO_PARAGRAPHS });
    expect(def.version).toBe("1.0");
    unregisterPattern("probe");
    const versioned = registerPattern("probe", {
      label: "P",
      content: TWO_PARAGRAPHS,
      version: "3.2",
    });
    expect(versioned.version).toBe("3.2");
    unregisterPattern("probe");
  });

  test("bump: minor increments, major resets minor", () => {
    expect(bumpPatternVersion("1.0", "minor")).toBe("1.1");
    expect(bumpPatternVersion("1.9", "minor")).toBe("1.10");
    expect(bumpPatternVersion("1.4", "major")).toBe("2.0");
  });

  test("diff: copy/styling/additions are MINOR, removals and type changes are MAJOR", () => {
    const base = H("Title") + P("Body");
    expect(diffPatternContent(base, base)).toBe("none");
    expect(diffPatternContent(base, H("Title") + P("New body"))).toBe("minor"); // copy edit
    expect(
      diffPatternContent(
        base,
        `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-text="text" class="text-center">Title</h2>` +
          P("Body"),
      ),
    ).toBe("minor"); // styling
    expect(diffPatternContent(base, base + P("Another"))).toBe("minor"); // addition
    expect(diffPatternContent(base + P("Another"), base)).toBe("major"); // removal
    expect(diffPatternContent(base, H("Title") + H("Body"))).toBe("major"); // type change
    // nested removal: dropping a column is MAJOR (the user's canonical case)
    const cols = (n: number) =>
      `<div data-pb-block="columns" data-pb-children>${Array.from(
        { length: n },
        () => `<div data-pb-block="column" data-pb-children>${P("x")}</div>`,
      ).join("")}</div>`;
    expect(diffPatternContent(cols(3), cols(2))).toBe("major");
    expect(diffPatternContent(cols(2), cols(3))).toBe("minor");
  });

  test("publishPattern bumps, archives the superseded base, refuses bad content losslessly", () => {
    registerPattern("probe", { label: "P", content: H("Old title") + P("Old body") });
    try {
      // no-op publish: version stays, nothing archived
      expect(publishPattern("probe", H("Old title") + P("Old body")).kind).toBe("none");
      expect(getPattern("probe")!.version).toBe("1.0");
      // minor publish: 1.1, the 1.0 content is retrievable as a merge base
      const r = publishPattern("probe", H("New title") + P("Old body"));
      expect(r).toEqual({ version: "1.1", kind: "minor" });
      expect(getPatternContent("probe", "1.0")).toBe(H("Old title") + P("Old body"));
      expect(getPatternContent("probe", "1.1")).toContain("New title");
      // failing publish: definition AND archive survive
      expect(() => publishPattern("probe", P("just one block"))).toThrow(/two blocks/);
      expect(getPattern("probe")!.version).toBe("1.1");
      expect(getPatternContent("probe", "1.0")).toContain("Old title");
    } finally {
      unregisterPattern("probe");
    }
  });
});

// ---------------------------------------------------------------------------

describe("inserter chrome stays blocks-only", () => {
  let host!: HTMLElement;
  let canvas!: HTMLElement;
  let editor!: Editor;
  let detach!: () => void;

  function setup(html: string) {
    host = document.createElement("div");
    canvas = document.createElement("main");
    host.appendChild(canvas);
    document.body.appendChild(host);
    editor = createEditor({ canvas, defaultBlock: "paragraph", groupBlock: "group" });
    editor.loadHtml(html);
    detach = attachInlineChrome(editor, { container: host });
    return editor;
  }

  afterEach(() => {
    detach?.();
    editor?.destroy();
    host?.remove();
    window.getSelection()?.removeAllRanges();
  });

  const EMPTY_P = `<p data-pb-block="paragraph" data-pb-rich="body"></p>`;
  const chrome = () => host.querySelector<HTMLElement>("[data-pbe-inline-chrome]")!.shadowRoot!;

  // Patterns are compositions, not blocks — they belong to the host's
  // Patterns surface (the demo rail's Patterns tab + explorer), never to the
  // block pickers. registerPattern must not leak into either surface.

  test('the "/" quick picker offers no patterns', async () => {
    setup(EMPTY_P);
    const carrier = canvas.querySelector<HTMLElement>("[data-pb-rich]")!;
    carrier.focus();
    carrier.textContent = "/";
    carrier.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const quick = chrome().querySelector<HTMLElement>(".pbe-quick")!;
    await vi.waitFor(() => expect(quick.hidden).toBe(false));
    expect(patternTypes().length).toBeGreaterThan(0); // the registry is populated…
    expect(quick.textContent).not.toContain("Patterns"); // …and the picker ignores it
    expect(quick.querySelector("button[data-pattern]")).toBeNull();
  });

  test("the + inserter grid offers no patterns", () => {
    setup(EMPTY_P);
    const id = editor.getModel().blocks[0].id;
    const appender = chrome().querySelector<HTMLButtonElement>(".pbe-appender")!;
    appender.dataset.target = id;
    appender.dataset.edge = "after";
    appender.click();
    const grid = chrome().querySelector<HTMLElement>(".pbe-inserter .pbe-grid")!;
    expect(grid.querySelectorAll("button[data-type]").length).toBeGreaterThan(0);
    expect(grid.querySelector("button[data-pattern]")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("pattern descendants use content-only editing mode", () => {
  let canvas!: HTMLElement;
  let editor!: Editor;

  afterEach(() => {
    editor?.destroy();
    canvas?.remove();
  });

  function setup(html: string) {
    canvas = document.createElement("main");
    document.body.appendChild(canvas);
    editor = createEditor({ canvas, defaultBlock: "paragraph", groupBlock: "group" });
    editor.loadHtml(html);
  }

  test("pattern ancestry locks structure but keeps carrier content editable", () => {
    setup(`
      <div data-pb-block="pattern" data-pb-pattern="call-to-action" data-pb-children>
        <h2 data-pb-block="heading" data-pb-tag="level" data-pb-text="text">Title</h2>
        <p data-pb-block="paragraph" data-pb-rich="body">Body</p>
      </div>`);
    const root = editor.getModel().blocks[0];
    const heading = root.children![0];

    expect(editor.editingMode(root.id)).toBe("default");
    expect(editor.editingMode(heading.id)).toBe("content-only");
    expect(editor.blockPolicy(heading.id)).toMatchObject({
      movable: false,
      removable: false,
      duplicable: false,
      stylable: false,
    });

    editor.setField(heading.id, "level", "h1");
    expect(editor.getBlock(heading.id)!.fields.level).toBe("h2");
    editor.setField(heading.id, "text", "Changed");
    expect(editor.getBlock(heading.id)!.fields.text).toBe("Changed");
    expect(editor.transformBlock(heading.id, "paragraph")).toBeNull();
  });

  test("content-role settings survive while design settings are refused", () => {
    setup(`
      <div data-pb-block="pattern" data-pb-pattern="call-to-action" data-pb-children>
        <figure data-pb-block="image">
          <img data-pb-image="image" src="/a.jpg" alt="">
        </figure>
        <p data-pb-block="paragraph" data-pb-rich="body">Body</p>
      </div>`);
    const image = editor.getModel().blocks[0].children![0];

    editor.setSetting(image.id, "href", "/target");
    editor.setSetting(image.id, "aspectRatio", "square");
    expect(editor.getBlock(image.id)!.settings).toEqual({ href: "/target" });

    editor.setPatternsOpaque(false);
    expect(editor.editingMode(image.id)).toBe("default");
    editor.setSetting(image.id, "aspectRatio", "square");
    expect(editor.getBlock(image.id)!.settings).toEqual({
      href: "/target",
      aspectRatio: "square",
    });
  });
});

// ---------------------------------------------------------------------------

describe("toolbar pattern strip: Edit-this-copy only (decoupled instances)", () => {
  let host!: HTMLElement;
  let canvas!: HTMLElement;
  let editor!: Editor;
  let detach!: () => void;

  function setup(html: string, options: Parameters<typeof attachInlineChrome>[1] = {}) {
    host = document.createElement("div");
    canvas = document.createElement("main");
    host.appendChild(canvas);
    document.body.appendChild(host);
    editor = createEditor({ canvas, defaultBlock: "paragraph", groupBlock: "group" });
    editor.loadHtml(html);
    detach = attachInlineChrome(editor, { container: host, ...options });
    return editor;
  }

  afterEach(() => {
    detach?.();
    editor?.destroy();
    host?.remove();
    window.getSelection()?.removeAllRanges();
  });

  const EMPTY_P = `<p data-pb-block="paragraph" data-pb-rich="body"></p>`;
  const chrome = () => host.querySelector<HTMLElement>("[data-pbe-inline-chrome]")!.shadowRoot!;
  const toolbarBtn = (label: string) =>
    [...chrome().querySelectorAll<HTMLButtonElement>(".pbe-toolbar button")].find(
      (b) => b.textContent === label,
    );

  test("without the host hook there is NO strip — a decoupled copy needs no actions", async () => {
    setup(EMPTY_P);
    editor.insertPattern("call-to-action");
    const toolbar = chrome().querySelector<HTMLElement>(".pbe-toolbar")!;
    await vi.waitFor(() => expect(toolbar.hidden).toBe(false));
    expect(toolbarBtn("Reset")).toBeUndefined(); // gone with the linkage
    expect(toolbarBtn("Update")).toBeUndefined();
    expect(toolbarBtn("Edit pattern")).toBeUndefined(); // hook absent → no strip
  });

  test("Edit pattern renders with the onEditPattern hook and reports name + block id", async () => {
    const seen: [string, string][] = [];
    setup(EMPTY_P, { onEditPattern: (name, id) => seen.push([name, id]) });
    const stamped = editor.insertPattern("hero")!;
    const toolbar = chrome().querySelector<HTMLElement>(".pbe-toolbar")!;
    await vi.waitFor(() => expect(toolbar.hidden).toBe(false));
    const btn = toolbarBtn("Edit pattern")!;
    expect(btn.closest("div")!.hidden).toBe(false);
    btn.click();
    expect(seen).toEqual([["hero", stamped[0].id]]);
  });

  test("plain blocks keep the strip hidden", async () => {
    setup(EMPTY_P, { onEditPattern: () => {} });
    editor.insertBlock("group");
    const toolbar = chrome().querySelector<HTMLElement>(".pbe-toolbar")!;
    await vi.waitFor(() => expect(toolbar.hidden).toBe(false));
    expect(toolbarBtn("Edit pattern")!.closest("div")!.hidden).toBe(true);
  });
});
