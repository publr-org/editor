// PublrEditor test suite — runs in real Chromium (vp test, Vitest browser
// mode): upcast/downcast/selection are DOM operations and using the real DOM
// is the point. Covers the registration probe, the round-trip law, and the
// undo/redo history semantics on the commit() choke point.

import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_BLOCK_POLICY,
  DEFAULT_THEME,
  SITE_TYPOGRAPHY_DEFAULTS,
  TAILWIND_COMPAT_THEME,
  RAW_TYPE,
  blockTypes,
  colorContexts,
  colors,
  containerWidths,
  createEditor,
  downcast,
  escHtml,
  fontSizes,
  getBlockType,
  patchStyleClasses,
  radii,
  readStyleClass,
  responsiveContainerCss,
  registerBlock,
  registerPattern,
  semanticColorRoles,
  semanticColors,
  collectClasses,
  inlineBackend,
  paletteTokens,
  setActiveTheme,
  spacingBase,
  spacings,
  str,
  styleBreakpoints,
  styleClasses,
  themeFromCssText,
  themeFromTokens,
  themeBaseCss,
  themeToCssText,
  unresolvedUtilities,
  withThemeDefaults,
  withTailwindCompatibility,
  unregisterBlock,
  unregisterPattern,
  upcast,
} from "../src/index";
import { HEARTH_THEME } from "../src/demo-theme";
import type { Editor, EditorOptions } from "../src/index";

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

// The registry is global (page-level vocabulary, by design) — register the
// two core blocks once for the whole suite.
beforeAll(() => {
  if (!getBlockType("heading")) {
    registerBlock("heading", {
      label: "Heading",
      render(fields) {
        const level = typeof fields.level === "string" ? fields.level : "";
        const tag = HEADING_TAGS.includes(level) ? level : "h2";
        return `<${tag} data-pb-block="heading" data-pb-tag="level" data-pb-text="text">${escHtml(fields.text ?? "")}</${tag}>`;
      },
    });
  }
  if (!getBlockType("paragraph")) {
    registerBlock("paragraph", {
      label: "Paragraph",
      render(fields) {
        return `<p data-pb-block="paragraph" data-pb-rich="body">${str(fields.body)}</p>`;
      },
    });
  }
});

const parse = (html: string): HTMLDivElement => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
};

// ---------------------------------------------------------------------------

describe("registration: the render is the schema", () => {
  afterEach(() => unregisterBlock("probe"));

  test("fields are derived from the probe render — names, kinds, defaults", () => {
    const def = registerBlock("probe", {
      label: "Probe",
      render: (f) =>
        `<figure data-pb-block="probe" data-pb-tag="shape" data-pb-text="caption">${escHtml(f.caption ?? "untitled")}</figure>`,
    });
    expect(def.fields).toEqual([
      { name: "caption", type: "text", default: "untitled" },
      { name: "shape", type: "tag", default: "figure" },
    ]);
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.fields)).toBe(true);
  });

  test("nonconformant renders are rejected", () => {
    expect(() =>
      registerBlock("probe", { label: "P", render: () => `<div>no block attr</div>` }),
    ).toThrow(/data-pb-block/);
    expect(() =>
      registerBlock("probe", {
        label: "P",
        render: () => `<div data-pb-block="probe"></div><div></div>`,
      }),
    ).toThrow(/exactly one root/);
    expect(() =>
      registerBlock("probe", {
        label: "P",
        render: (f) => `<div data-pb-block="probe">${(f.title as string).toUpperCase()}</div>`, // throws on {}
      }),
    ).toThrow(/tolerate absent fields/);
    expect(() =>
      registerBlock("probe", {
        label: "P",
        render: () =>
          `<div data-pb-block="probe"><span data-pb-text="x"></span><b data-pb-text="x"></b></div>`,
      }),
    ).toThrow(/carried twice/);
  });

  test("placeholder is accepted editor-UI metadata; still strict otherwise", () => {
    const def = registerBlock("probe", {
      label: "Probe",
      placeholder: "Probe me",
      render: () => `<div data-pb-block="probe" data-pb-text="t"></div>`,
    });
    expect(def.placeholder).toBe("Probe me");
    expect(Object.isFrozen(def)).toBe(true);
    unregisterBlock("probe");
    expect(() =>
      registerBlock("probe", {
        label: "P",
        placeholder: 5,
        render: () => `<div data-pb-block="probe"></div>`,
      } as any),
    ).toThrow(/placeholder must be a string/);
  });

  test("definition shape is validated hard", () => {
    expect(() =>
      registerBlock("probe", { label: "P", render: () => "", fields: [] } as any),
    ).toThrow(/unknown key "fields"/);
    expect(() => registerBlock("probe", { render: () => "" } as any)).toThrow(/label/);
    expect(() => registerBlock("probe", { label: "P" } as any)).toThrow(/render/);
    expect(() => registerBlock("Bad Type", { label: "P", render: () => "" })).toThrow(/lowercase/);
    expect(() => registerBlock(RAW_TYPE, { label: "P", render: () => "" })).toThrow(/reserved/);
  });

  test("duplicate registration throws; unregister frees the type", () => {
    const def = { label: "P", render: () => `<div data-pb-block="probe"></div>` };
    registerBlock("probe", def);
    expect(() => registerBlock("probe", def)).toThrow(/already registered/);
    expect(unregisterBlock("probe")).toBe(true);
    expect(() => registerBlock("probe", def)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe("contract: the round-trip law", () => {
  test("upcast(downcast(model)) deep-equals the model", () => {
    const html = `
      <h1 data-pb-block="heading" data-pb-tag="level" data-pb-text="text" class="text-5xl font-bold">Title</h1>
      <p data-pb-block="paragraph" data-pb-rich="body">Rich <em>inline</em> content</p>
      <blockquote class="q"><p>Raw &amp; proud</p></blockquote>`;
    const m1 = upcast(parse(html));
    const gen1 = downcast(m1);
    const m2 = upcast(parse(gen1));
    // ids are minted fresh on first upcast but carried in the HTML after —
    // normalize by comparing the second generation to the first.
    expect(m2).toEqual(m1);
    expect(downcast(m2)).toBe(gen1); // serialization is a fixed point
  });

  test("authored classes survive; unknown markup passes through as raw-html", () => {
    const m = upcast(
      parse(
        `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-text="text" class="mt-10 text-white">Hi</h2><section><b>opaque</b></section>`,
      ),
    );
    expect(m.blocks[0].classes).toBe("mt-10 text-white");
    expect(m.blocks[1].type).toBe(RAW_TYPE);
    expect(m.blocks[1].fields.html).toBe("<section><b>opaque</b></section>");
  });

  test("missing carriers get probe-derived defaults", () => {
    const m = upcast(parse(`<h3 data-pb-block="heading" data-pb-tag="level"></h3>`));
    expect(m.blocks[0].fields).toEqual({ level: "h3", text: "" });
  });

  test("loading normalizes whitespace in carried values — indentation is not content", () => {
    const m = upcast(
      parse(`
        <h1 data-pb-block="heading" data-pb-tag="level" data-pb-text="text">
          Spread over
          two lines
        </h1>
        <p data-pb-block="paragraph" data-pb-rich="body">
          Rich <em title="keep  this">inline</em> content
          across lines
        </p>`),
    );
    expect(m.blocks[0].fields.text).toBe("Spread over two lines");
    // per-text-node collapse: markup and attribute values are untouched
    expect(m.blocks[1].fields.body).toBe(
      'Rich <em title="keep  this">inline</em> content across lines',
    );
    const gen1 = downcast(m);
    expect(gen1).not.toContain("\n  "); // typed blocks serialize without source indentation
    expect(upcast(parse(gen1))).toEqual(m); // normalized output re-upcasts identically
  });
});

// ---------------------------------------------------------------------------

describe("downcast pipelines: editor vs data", () => {
  // data-p-* rides inside a rich field: the rebuild's model doesn't carry
  // root-level interactions yet (contract feature not reached), but runtime
  // attributes in carried content already flow through — and the strip pass
  // must leave them alone.
  const SEED = `
    <h1 data-pb-block="heading" data-pb-tag="level" data-pb-text="text" class="text-5xl">Title</h1>
    <p data-pb-block="paragraph" data-pb-rich="body">Rich <em data-p-text="$count">inline</em></p>`;

  test("data pipeline strips data-pb-*; content, classes, and data-p-* survive", () => {
    const published = downcast(upcast(parse(SEED)), "data");
    expect(published).not.toContain("data-pb-");
    expect(published).toContain("<h1");
    expect(published).toContain('class="text-5xl"');
    expect(published).toContain('<em data-p-text="$count">inline</em>'); // runtime vocabulary is not ours to strip
  });

  test("editor pipeline is the default and keeps the full wire contract", () => {
    const m = upcast(parse(SEED));
    expect(downcast(m)).toBe(downcast(m, "editor"));
    expect(downcast(m)).toContain('data-pb-block="heading"');
    expect(upcast(parse(downcast(m)))).toEqual(m); // round-trip law untouched
  });

  test("strip pass reaches inside raw-html passthroughs, islands included", () => {
    // Unknown type → raw-html keeps its foreign annotations (and a settings
    // island) verbatim in fields.html; published output must still be clean.
    const m = upcast(
      parse(
        `<div data-pb-block="hero" data-pb-text="title">Hi<script type="application/json" data-pb-settings>{"x":1}</` +
          `script><span data-p-show="$open">peek</span></div>`,
      ),
    );
    expect(m.blocks[0].type).toBe(RAW_TYPE);
    const published = downcast(m, "data");
    expect(published).not.toContain("data-pb-");
    expect(published).not.toContain("application/json");
    expect(published).toContain('<span data-p-show="$open">peek</span>');
  });

  test("data pipeline output re-upcasts as raw-html — degraded, never lost", () => {
    const reloaded = upcast(parse(downcast(upcast(parse(SEED)), "data")));
    expect(reloaded.blocks.map((b) => b.type)).toEqual([RAW_TYPE, RAW_TYPE]);
    expect(reloaded.blocks[0].fields.html).toContain("Title");
  });

  test("editor.serialize({ pipeline }) exposes both targets", () => {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph" });
    editor.loadHtml(SEED);
    expect(editor.serialize()).toContain("data-pb-block");
    expect(editor.serialize({ pipeline: "editor" })).toBe(editor.serialize());
    const published = editor.serialize({ pipeline: "data" });
    expect(published).not.toContain("data-pb-");
    expect(published).toContain('<em data-p-text="$count">inline</em>');
    editor.destroy();
    canvas.remove();
  });
});

// ---------------------------------------------------------------------------

describe("history: undo/redo on the commit() choke point", () => {
  let canvas!: HTMLElement;
  let editor!: Editor;
  let t = 0;

  function setup(html: string, opts: Partial<EditorOptions> = {}) {
    t = 0;
    canvas = document.createElement("main");
    document.body.appendChild(canvas);
    editor = createEditor({ canvas, defaultBlock: "paragraph", now: () => t, ...opts });
    editor.loadHtml(html);
    return editor;
  }

  afterEach(() => {
    editor?.destroy();
    canvas?.remove();
    window.getSelection()?.removeAllRanges();
  });

  const carrierOf = (i: number) =>
    canvas.querySelectorAll<HTMLElement>("[data-pb-rich],[data-pb-text]")[i];

  // Span the native selection from inside carrier `i` to inside carrier `j`,
  // then wait for the (async) selectionchange mirror to catch up.
  async function selectAcross(i: number, j: number, expected: number) {
    const range = document.createRange();
    range.setStart(carrierOf(i).firstChild ?? carrierOf(i), 1);
    range.setEnd(carrierOf(j).firstChild ?? carrierOf(j), 1);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    await vi.waitFor(() => expect(editor.selection.blocks).toHaveLength(expected));
  }

  // Simulated typing: mutate the carrier DOM the way contenteditable would,
  // then fire the input event the editor's DOM→model sync listens to.
  function type(i: number, value: string, kind: "rich" | "text" = "rich") {
    const el = carrierOf(i);
    el.focus();
    if (kind === "rich") el.innerHTML = value;
    else el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  const P = (body: string) => `<p data-pb-block="paragraph" data-pb-rich="body">${body}</p>`;

  test("typing whitespace is kept verbatim — normalization is load-path only", () => {
    setup(P("hi"));
    type(0, "hi &nbsp; there "); // mid-edit spacing must never be fought
    expect(editor.getModel().blocks[0].fields.body).toBe("hi &nbsp; there ");
  });

  test("typing coalesces per (block, field) within the window — one undo per run", () => {
    setup(P("start"));
    type(0, "s1");
    t += 100;
    type(0, "s12");
    t += 100;
    type(0, "s123");
    expect(editor.getModel().blocks[0].fields.body).toBe("s123");
    expect(editor.history.canUndo).toBe(true);
    editor.undo();
    expect(editor.getModel().blocks[0].fields.body).toBe("start");
    expect(editor.history.canUndo).toBe(false);
  });

  test("a gap past the window breaks coalescing into separate entries", () => {
    setup(P("start"));
    type(0, "one");
    t += 1000;
    type(0, "two");
    editor.undo();
    expect(editor.getModel().blocks[0].fields.body).toBe("one");
    editor.undo();
    expect(editor.getModel().blocks[0].fields.body).toBe("start");
  });

  test("edits to different blocks never coalesce", () => {
    setup(P("a") + P("b"));
    type(0, "a!");
    t += 50;
    type(1, "b!");
    editor.undo();
    expect(editor.getModel().blocks[1].fields.body).toBe("b");
    expect(editor.getModel().blocks[0].fields.body).toBe("a!");
    editor.undo();
    expect(editor.getModel().blocks[0].fields.body).toBe("a");
  });

  test("structural ops get their own entry; redo restores them", () => {
    setup(P("split me"));
    const el = carrierOf(0);
    el.focus();
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks).toHaveLength(2);
    editor.undo();
    expect(editor.getModel().blocks).toHaveLength(1);
    expect(editor.getModel().blocks[0].fields.body).toBe("split me");
    editor.redo();
    expect(editor.getModel().blocks).toHaveLength(2);
  });

  test("a new edit after undo clears the redo stack", () => {
    setup(P("start"));
    type(0, "first");
    editor.undo();
    expect(editor.history.canRedo).toBe(true);
    t += 1000;
    type(0, "second");
    expect(editor.history.canRedo).toBe(false);
    expect(editor.getModel().blocks[0].fields.body).toBe("second");
  });

  test("Cmd+Z / Cmd+Shift+Z are intercepted and routed to our history", () => {
    setup(P("start"));
    type(0, "typed");
    const el = carrierOf(0);
    const zDown = new KeyboardEvent("keydown", {
      key: "z",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(zDown);
    expect(zDown.defaultPrevented).toBe(true);
    expect(editor.getModel().blocks[0].fields.body).toBe("start");
    const shiftZ = new KeyboardEvent("keydown", {
      key: "z",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    carrierOf(0).dispatchEvent(shiftZ); // undo re-rendered the canvas — re-query
    expect(shiftZ.defaultPrevented).toBe(true);
    expect(editor.getModel().blocks[0].fields.body).toBe("typed");
  });

  test("beforeinput historyUndo/historyRedo (menu-driven native undo) is disowned", () => {
    setup(P("start"));
    type(0, "typed");
    const el = carrierOf(0);
    const nativeUndo = new InputEvent("beforeinput", {
      inputType: "historyUndo",
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(nativeUndo);
    expect(nativeUndo.defaultPrevented).toBe(true);
    expect(editor.getModel().blocks[0].fields.body).toBe("start");
    const nativeRedo = new InputEvent("beforeinput", {
      inputType: "historyRedo",
      bubbles: true,
      cancelable: true,
    });
    carrierOf(0).dispatchEvent(nativeRedo); // undo re-rendered the canvas — re-query
    expect(nativeRedo.defaultPrevented).toBe(true);
    expect(editor.getModel().blocks[0].fields.body).toBe("typed");
  });

  test("undo of a split restores the caret to the split point, not the end", () => {
    setup(P("split me here"));
    const el = carrierOf(0);
    el.focus();
    // Real caret after "split " (offset 6), then Enter.
    const textNode = el.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks.map((b) => b.fields.body)).toEqual(["split ", "me here"]);

    editor.undo();
    expect(editor.getModel().blocks[0].fields.body).toBe("split me here");
    // Caret must be back at offset 6 inside the re-merged carrier.
    const merged = carrierOf(0);
    const s = window.getSelection()!;
    expect(merged.contains(s.anchorNode)).toBe(true);
    const measure = document.createRange();
    measure.selectNodeContents(merged);
    measure.setEnd(s.anchorNode!, s.anchorOffset);
    expect(measure.toString().length).toBe(6);
  });

  test("undo restores block-level selection", () => {
    setup(P("a") + P("b"));
    type(1, "b edited");
    const secondId = editor.getModel().blocks[1].id;
    editor.undo();
    const root = canvas.querySelector(`[data-pb-id="${secondId}"]`)!;
    expect(root.contains(document.activeElement)).toBe(true);
  });

  test("undo on empty history is a no-op", () => {
    setup(P("start"));
    expect(() => editor.undo()).not.toThrow();
    expect(editor.getModel().blocks[0].fields.body).toBe("start");
  });

  test("loadHtml resets history", () => {
    setup(P("start"));
    type(0, "typed");
    editor.undo();
    expect(editor.history.canRedo).toBe(true);
    editor.loadHtml(P("fresh"));
    expect(editor.history.canUndo).toBe(false);
    expect(editor.history.canRedo).toBe(false);
  });

  test("history store exposes depths alongside the flags", () => {
    setup(P("start"));
    type(0, "a");
    t += 50;
    type(0, "ab"); // coalesces — still one entry
    t += 1000;
    type(0, "abc"); // window passed — second entry
    expect(editor.history.undoDepth).toBe(2);
    expect(editor.history.redoDepth).toBe(0);
    editor.undo();
    expect(editor.history.undoDepth).toBe(1);
    expect(editor.history.redoDepth).toBe(1);
  });

  test("debug mode traces edits and time travel; silent and toggleable otherwise", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const traced = () =>
      spy.mock.calls.filter((c) => c[0] === "[publr-editor]").map((c) => c.join(" "));
    setup(P("start"));
    type(0, "typed");
    expect(traced()).toHaveLength(0); // off by default

    editor.debug = true;
    t += 1000;
    type(0, "more");
    editor.undo();
    editor.redo();
    const lines = traced();
    expect(lines.some((l) => l.includes("commit: type") && l.includes("new entry"))).toBe(true);
    expect(lines.some((l) => l.includes("undo → 1 block"))).toBe(true);
    expect(lines.some((l) => l.includes("redo → 1 block"))).toBe(true);

    spy.mockClear();
    editor.debug = false;
    t += 1000;
    type(0, "silent again");
    expect(traced()).toHaveLength(0);
    spy.mockRestore();
  });

  test("selection across blocks promotes to whole-block multiselection (raw blocks included)", async () => {
    setup(P("one") + `<blockquote>opaque raw</blockquote>` + P("three"));
    await selectAcross(0, 1, 3); // carriers 0 and 1 are blocks 0 and 2 — raw sits between
    expect(editor.selection.blocks).toEqual(editor.getModel().blocks.map((b) => b.id));
    expect(canvas.querySelectorAll(".pbe-selected")).toHaveLength(3);
  });

  test("selection inside one block stays text-level; collapsing clears block selection", async () => {
    setup(P("alpha") + P("beta"));
    const el = carrierOf(0);
    const range = document.createRange();
    range.setStart(el.firstChild!, 0);
    range.setEnd(el.firstChild!, 3);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    await new Promise((r) => setTimeout(r, 30));
    expect(editor.selection.blocks).toHaveLength(0);

    await selectAcross(0, 1, 2);
    sel.removeAllRanges(); // click-away
    await vi.waitFor(() => expect(editor.selection.blocks).toHaveLength(0));
    expect(canvas.querySelectorAll(".pbe-selected")).toHaveLength(0);
  });

  test("drag gesture: crossing a block boundary merges the canvas into one editing host", async () => {
    setup(P("one") + P("two") + P("three"));
    const at = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { clientX: r.left + 4, clientY: r.top + Math.max(2, r.height / 2) };
    };
    const move = (el: Element) =>
      document.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, cancelable: true, buttons: 1, ...at(el) }),
      );

    carrierOf(0).dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
    );
    move(carrierOf(0)); // still inside the anchor block — nothing merges
    expect(canvas.isContentEditable).toBe(false);

    move(carrierOf(1)); // crossing merges the host so the native drag can span
    expect(canvas.isContentEditable).toBe(true);

    // what the native drag now produces: a text selection spanning both carriers
    window
      .getSelection()!
      .setBaseAndExtent(carrierOf(0).firstChild!, 1, carrierOf(1).firstChild!, 1);
    await vi.waitFor(() => expect(editor.selection.blocks).toHaveLength(2));

    // release: host reverts, block selection persists (re-asserted root-level)
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(canvas.isContentEditable).toBe(false);
    expect(editor.selection.blocks).toHaveLength(2);
    expect(canvas.querySelectorAll(".pbe-selected")).toHaveLength(2);
  });

  test("shift+click on another block extends the selection from the caret's block", () => {
    setup(P("one") + P("two") + P("three"));
    const el = carrierOf(0);
    el.focus();
    const range = document.createRange();
    range.setStart(el.firstChild!, 1);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const click = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true,
    });
    carrierOf(2).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true); // we own the gesture
    expect(editor.selection.blocks).toHaveLength(3);
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    // and the promoted run deletes as one entry
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks).toHaveLength(0);
    editor.undo();
    expect(editor.getModel().blocks).toHaveLength(3);
  });

  test("Backspace deletes the multiselected run in ONE history entry; undo restores all", async () => {
    setup(P("one") + P("two") + P("three"));
    await selectAcross(1, 2, 2);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks.map((b) => b.fields.body)).toEqual(["one"]);
    expect(editor.selection.blocks).toHaveLength(0);
    editor.undo();
    expect(editor.getModel().blocks.map((b) => b.fields.body)).toEqual(["one", "two", "three"]);
  });

  test("Delete works the same; deleting ALL blocks leaves an empty, undoable document", async () => {
    setup(P("a") + P("b"));
    await selectAcross(0, 1, 2);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks).toHaveLength(0);
    expect(editor.serialize()).toBe("");
    editor.undo();
    expect(editor.getModel().blocks).toHaveLength(2);
  });

  test("keyboard undo still works after a group delete drops the focused blocks", async () => {
    setup(P("one") + P("two") + P("three"));
    await selectAcross(0, 2, 3); // the run includes the FIRST block — no previous block to focus
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks).toHaveLength(0);
    // focus must have fallen back INTO the editor (here: the canvas itself)
    expect(canvas.contains(document.activeElement)).toBe(true);
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks).toHaveLength(3);
  });

  test("clicking a raw block selects it as a block; Backspace removes it; undo restores", () => {
    setup(P("text") + `<blockquote>opaque</blockquote>` + P("more"));
    const raw = canvas.querySelector("blockquote")!;
    const rawId = editor.getModel().blocks[1].id;
    expect(raw.classList.contains("pbe-raw")).toBe(true);

    raw.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    expect(editor.selection.blocks).toEqual([rawId]);
    expect(raw.classList.contains("pbe-selected")).toBe(true);

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks.map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
    editor.undo();
    expect(editor.getModel().blocks[1].type).toBe(RAW_TYPE);
  });

  test("raw-block selection releases on editable click, clears on Escape, yields to multiselect", async () => {
    setup(P("text") + `<blockquote>opaque</blockquote>`);
    const raw = () => canvas.querySelector("blockquote")!;
    const mousedown = (el: Element) =>
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));

    // click editable → explicit selection releases
    mousedown(raw());
    expect(editor.selection.blocks).toHaveLength(1);
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    mousedown(carrierOf(0));
    expect(editor.selection.blocks).toHaveLength(0);
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    // Escape clears
    mousedown(raw());
    expect(editor.selection.blocks).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(editor.selection.blocks).toHaveLength(0);
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    // a real block-spanning selection overrides the explicit one
    mousedown(raw());
    expect(editor.selection.blocks).toHaveLength(1);
    const range = document.createRange();
    range.setStart(carrierOf(0).firstChild!, 0);
    range.setEnd(raw().firstChild!, 2); // raw blocks have no carrier — end in its text directly
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    await vi.waitFor(() => expect(editor.selection.blocks).toHaveLength(2));
  });

  test("cmd/ctrl+click toggles individual blocks — non-contiguous, document-ordered", () => {
    setup(P("one") + P("two") + P("three"));
    const blocks = editor.getModel().blocks;
    const cmdClick = (el: Element) => {
      const e = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        metaKey: true,
      });
      el.dispatchEvent(e);
      document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return e;
    };

    // click order 2 then 0 — store must come out in document order, middle unselected
    cmdClick(carrierOf(2));
    const first = cmdClick(carrierOf(0));
    expect(first.defaultPrevented).toBe(true); // whole block is the unit: no caret placed
    expect(editor.selection.blocks).toEqual([blocks[0].id, blocks[2].id]);
    expect(canvas.querySelectorAll(".pbe-selected")).toHaveLength(2);

    // toggle one back off
    cmdClick(carrierOf(2));
    expect(editor.selection.blocks).toEqual([blocks[0].id]);

    // delete the non-contiguous set: only the selected blocks go, one entry
    cmdClick(carrierOf(2));
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks.map((b) => b.fields.body)).toEqual(["two"]);
    editor.undo();
    expect(editor.getModel().blocks.map((b) => b.fields.body)).toEqual(["one", "two", "three"]);
  });

  test("shift+click extends from the last cmd-selected block when there is no caret", () => {
    setup(P("one") + P("two") + P("three"));
    const e1 = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    });
    carrierOf(0).dispatchEvent(e1);
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    const e2 = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true,
    });
    carrierOf(2).dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(true);
    expect(editor.selection.blocks).toHaveLength(3); // contiguous run 0..2
  });

  test("shift+click with no cross-block anchor selects the single block whole", () => {
    setup(P("one") + P("two"));
    const blocks = editor.getModel().blocks;

    // no caret anywhere: shift+click = select that block, like cmd+click
    const e1 = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true,
    });
    carrierOf(1).dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(true);
    expect(editor.selection.blocks).toEqual([blocks[1].id]);
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    // caret inside a block, shift+click the SAME block: whole block, not a text span
    const el = carrierOf(0);
    el.focus();
    const range = document.createRange();
    range.setStart(el.firstChild!, 1);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    const e2 = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true,
    });
    el.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(true);
    expect(editor.selection.blocks).toEqual([blocks[0].id]);
    expect(window.getSelection()!.rangeCount === 0 || window.getSelection()!.isCollapsed).toBe(
      true,
    ); // no weird text span
  });

  test("clicking outside any block clears an explicit selection; prevented chrome clicks don't", () => {
    setup(P("text") + `<blockquote>opaque</blockquote>`);
    const raw = canvas.querySelector("blockquote")!;
    const click = (el: Element, prevented = false) => {
      const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
      if (prevented) el.addEventListener("mousedown", (ev) => ev.preventDefault(), { once: true });
      el.dispatchEvent(e);
      document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    };

    // outside the canvas entirely
    click(raw);
    expect(editor.selection.blocks).toHaveLength(1);
    click(document.body);
    expect(editor.selection.blocks).toHaveLength(0);

    // inside the canvas but not on any block (gap)
    click(raw);
    expect(editor.selection.blocks).toHaveLength(1);
    click(canvas);
    expect(editor.selection.blocks).toHaveLength(0);

    // chrome that preventDefaults its mousedown keeps the selection (toolbar semantics)
    click(raw);
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    click(btn, true);
    expect(editor.selection.blocks).toHaveLength(1);
    btn.remove();
  });

  test("selection.active tracks the caret's block", async () => {
    setup(P("one") + P("two"));
    const blocks = editor.getModel().blocks;
    const el = carrierOf(1);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    await vi.waitFor(() => expect(editor.selection.active).toBe(blocks[1].id));
    sel.removeAllRanges();
    await vi.waitFor(() => expect(editor.selection.active).toBe(null));
  });

  // Select character range [from, to) inside carrier i, spanning inline markup.
  function selectChars(i: number, from: number, to: number) {
    const el = carrierOf(i);
    el.focus();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let pos = 0;
    for (let node: Text | null; (node = walker.nextNode() as Text | null); ) {
      if (from >= pos && from <= pos + node.data.length) range.setStart(node, from - pos);
      if (to >= pos && to <= pos + node.data.length) {
        range.setEnd(node, to - pos);
        break;
      }
      pos += node.data.length;
    }
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    return el;
  }

  test("active stays set for a text selection within one block (toolbar can target it)", async () => {
    setup(P("make me bold"));
    const blockId = editor.getModel().blocks[0].id;
    selectChars(0, 0, 4);
    await vi.waitFor(() => expect(editor.selection.active).toBe(blockId));
    expect(editor.selection.blocks).toHaveLength(0); // not a block selection
  });

  test("active clears when focus leaves the canvas, even though the selection object lingers", async () => {
    setup(P("hello"));
    const blockId = editor.getModel().blocks[0].id;
    selectChars(0, 0, 3);
    await vi.waitFor(() => expect(editor.selection.active).toBe(blockId));

    // blur to chrome outside the canvas — the browser does NOT move the caret,
    // so no selectionchange fires; only the focus transition signals it
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    expect(window.getSelection()!.rangeCount).toBeGreaterThan(0); // range still lingers…
    await vi.waitFor(() => expect(editor.selection.active).toBe(null)); // …but active follows focus
    outside.remove();
  });

  test("format: bold toggles on and off; selection survives; round-trips; undoes", () => {
    setup(P("make me bold"));
    const body = () => editor.getModel().blocks[0].fields.body;
    selectChars(0, 0, 4);
    editor.format("bold");
    expect(body()).toBe("<b>make</b> me bold");
    expect(window.getSelection()!.toString()).toBe("make"); // selection restored over the span
    expect(editor.formatState().bold).toBe(true);

    editor.format("bold"); // the restored selection makes re-toggle immediate
    expect(body()).toBe("make me bold");

    editor.format("bold");
    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m); // law holds over formatted content
    editor.undo();
    expect(body()).toBe("make me bold");
  });

  test("format: overlap cases — all-or-any toggle, splitting, canonical nesting", () => {
    setup(P("ab<b>cd</b>ef") + P("<b>abcdef</b>") + P("a<b>bc</b>d"));
    const body = (i: number) => editor.getModel().blocks[i].fields.body;

    // mixed run → not all bold → bold everything, merged into ONE tag
    selectChars(0, 0, 6);
    editor.format("bold");
    expect(body(0)).toBe("<b>abcdef</b>");

    // un-bold the middle of a bold run → clean split
    selectChars(1, 2, 4);
    editor.format("bold");
    expect(body(1)).toBe("<b>ab</b>cd<b>ef</b>");

    // italic across partially-bold content → canonical nesting, stable
    selectChars(2, 0, 4);
    editor.format("italic");
    expect(body(2)).toBe("<i>a</i><b><i>bc</i></b><i>d</i>");
    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m);
  });

  test("format: atoms survive verbatim; em/strong normalize to i/b on first edit", () => {
    setup(P('x <span class="k" data-p-text="s.y">y</span> <em>z</em>'));
    selectChars(0, 0, 5); // all three characters, spanning the span atom + em
    editor.format("bold");
    expect(editor.getModel().blocks[0].fields.body).toBe(
      '<b>x <span class="k" data-p-text="s.y">y</span> <i>z</i></b>',
    );
    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m);
  });

  test("applyLink wraps the selection; round-trips; linkState reads it back; unlink removes it", () => {
    setup(P("visit our site here"));
    const body = () => editor.getModel().blocks[0].fields.body;

    selectChars(0, 6, 9); // "our"
    editor.applyLink("https://x.io", "_blank");
    expect(body()).toBe(
      'visit <a href="https://x.io" target="_blank" rel="noopener">our</a> site here',
    );
    expect(window.getSelection()!.toString()).toBe("our"); // selection restored over the span
    expect(editor.linkState()).toEqual({ href: "https://x.io", target: "_blank" });

    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m); // the law holds over linked content

    editor.applyLink("", ""); // empty href unlinks the (restored) selection
    expect(body()).toBe("visit our site here");
    expect(editor.linkState()).toBe(null);

    editor.undo();
    expect(body()).toBe(
      'visit <a href="https://x.io" target="_blank" rel="noopener">our</a> site here',
    );
  });

  test("link nests INSIDE marks (bold spanning a link never splits); pasted anchors keep their attributes", () => {
    setup(P('go <b><a class="cta" href="/x">there</a></b> now'));
    // The pasted anchor round-trips verbatim (all attributes preserved as an
    // inner link mark, bold stays the outer wrapper).
    const m0 = editor.getModel();
    expect(upcast(parse(downcast(m0)))).toEqual(m0);

    // Bold the whole line: the link stays innermost, bold does not fragment.
    selectChars(0, 0, 12);
    editor.format("bold");
    expect(editor.getModel().blocks[0].fields.body).toBe(
      '<b>go <a class="cta" href="/x">there</a> now</b>',
    );
  });

  test("linkState returns null over a mixed selection (two different links)", () => {
    setup(P('<a href="/a">aa</a><a href="/b">bb</a>'));
    selectChars(0, 1, 3); // spans the a/b boundary
    expect(editor.linkState()).toBe(null);
  });

  test("moveBlock reorders (one entry, undoable); caret follows the block; edges are no-ops", () => {
    setup(P("one") + P("two"));
    const [b0, b1] = editor.getModel().blocks;
    const el = carrierOf(0);
    el.focus();
    const range = document.createRange();
    range.setStart(el.firstChild!, 2);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    editor.moveBlock(b0.id, 1);
    expect(editor.getModel().blocks.map((b) => b.id)).toEqual([b1.id, b0.id]);
    const root = canvas.querySelector(`[data-pb-id="${b0.id}"]`)!;
    expect(root.contains(document.activeElement)).toBe(true); // caret followed the block

    editor.moveBlock(b0.id, 1); // already last — no-op, no history entry
    expect(editor.getModel().blocks.map((b) => b.id)).toEqual([b1.id, b0.id]);
    editor.undo();
    expect(editor.getModel().blocks.map((b) => b.id)).toEqual([b0.id, b1.id]);
    expect(editor.history.canUndo).toBe(false); // the no-op added nothing
  });

  test("setClasses lands in model + DOM in place, round-trips, undoes", () => {
    setup(P("body text"));
    const b = editor.getModel().blocks[0];
    editor.setClasses(b.id, "text-center");
    expect(editor.getBlock(b.id)!.classes).toBe("text-center");
    expect(canvas.querySelector(`[data-pb-id="${b.id}"]`)!.classList.contains("text-center")).toBe(
      true,
    );
    expect(editor.serialize()).toContain("text-center");
    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m); // authored classes ride the contract
    editor.undo();
    expect(editor.getBlock(b.id)!.classes).toBe("");
  });

  // Collapse the caret at character offset 0 of carrier i and press Backspace.
  function backspaceAtStart(i: number) {
    const el = carrierOf(i);
    el.focus();
    const range = document.createRange();
    range.setStart(el.firstChild ?? el, 0);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
    );
  }

  const caretOffsetIn = (el: Element) => {
    const s = window.getSelection()!;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.setEnd(s.anchorNode!, s.anchorOffset);
    return r.toString().length;
  };

  test("backspace at start merges into the previous paragraph — markup kept, caret at the join", () => {
    setup(P("<b>one</b>") + P("t<i>wo</i>"));
    backspaceAtStart(1);
    expect(editor.getModel().blocks).toHaveLength(1);
    expect(editor.getModel().blocks[0].fields.body).toBe("<b>one</b>t<i>wo</i>");
    const merged = carrierOf(0);
    expect(merged.contains(window.getSelection()!.anchorNode)).toBe(true);
    expect(caretOffsetIn(merged)).toBe(3); // right after "one"
    editor.undo();
    expect(editor.getModel().blocks).toHaveLength(2);
  });

  test("merge converts kinds at the seam: rich→text strips, text→rich escapes", () => {
    setup(
      `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-text="text">Head</h2>` +
        P("<b>tail</b>!"),
    );
    backspaceAtStart(1); // paragraph into heading: markup stripped
    expect(editor.getModel().blocks).toHaveLength(1);
    expect(editor.getModel().blocks[0].fields.text).toBe("Headtail!");
    expect(caretOffsetIn(carrierOf(0))).toBe(4); // after "Head"

    editor.loadHtml(
      P("body") +
        `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-text="text">a&amp;b</h2>`,
    );
    backspaceAtStart(1); // heading into paragraph: text escaped into rich
    expect(editor.getModel().blocks[0].fields.body).toBe("bodya&amp;b");
    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m);
  });

  test("backspace at start of an empty block just removes it; mid-text backspace stays native", () => {
    setup(P("keep") + P(""));
    backspaceAtStart(1);
    expect(editor.getModel().blocks).toHaveLength(1);
    expect(editor.getModel().blocks[0].fields.body).toBe("keep");

    // caret NOT at start: handler must not hijack (no merge, native editing)
    const el = carrierOf(0);
    el.focus();
    const range = document.createRange();
    range.setStart(el.firstChild!, 2);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    const e = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(editor.getModel().blocks).toHaveLength(1);
  });

  test("backspace at start before a raw block selects it; the second one deletes it", () => {
    setup(`<blockquote>opaque</blockquote>` + P("text"));
    const rawId = editor.getModel().blocks[0].id;
    backspaceAtStart(0); // carrier 0 is the paragraph (raw has no carrier)
    expect(editor.getModel().blocks).toHaveLength(2); // nothing merged or removed
    expect(editor.selection.blocks).toEqual([rawId]); // raw selected instead
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks.map((b) => b.type)).toEqual(["paragraph"]);
    editor.undo();
    expect(editor.getModel().blocks[0].type).toBe(RAW_TYPE);
  });

  test("onChange observes a settled editor — model and canvas always agree", async () => {
    t = 0;
    canvas = document.createElement("main");
    document.body.appendChild(canvas);
    let torn = 0;
    editor = createEditor({
      canvas,
      defaultBlock: "paragraph",
      now: () => t,
      onChange: () => {
        const domIds = [...canvas.querySelectorAll("[data-pb-id]")].map((el) =>
          el.getAttribute("data-pb-id"),
        );
        const modelIds = editor.getModel().blocks.map((b) => b.id);
        if (domIds.join() !== modelIds.join()) torn++;
      },
    });
    editor.loadHtml(P("one") + P("two"));
    backspaceAtStart(1); // merge: the exact torn-read crash repro (model spliced, DOM not yet re-rendered)
    type(0, "onetwo!"); // typing path too
    editor.undo(); // reverts the typing…
    editor.undo(); // …then the merge
    await new Promise((r) => setTimeout(r));
    expect(torn).toBe(0);
    expect(editor.getModel().blocks).toHaveLength(2);
  });

  test("blockTypes() lists registered types for inserter chrome", () => {
    const types = blockTypes();
    expect(types.find((b) => b.type === "heading")?.label).toBe("Heading");
    expect(types.find((b) => b.type === "paragraph")?.label).toBe("Paragraph");
  });

  test("replaceBlock transforms in place with defaults; undo restores the original", () => {
    setup(P("/head") + P("keep"));
    const original = editor.getModel().blocks[0];
    const next = editor.replaceBlock(original.id, "heading")!;
    expect(editor.getModel().blocks.map((b) => b.type)).toEqual(["heading", "paragraph"]);
    expect(editor.getModel().blocks[0].fields).toEqual({ text: "", level: "h2" }); // probe-derived defaults, "/head" gone
    const root = canvas.querySelector(`[data-pb-id="${next.id}"]`)!;
    expect(root.contains(document.activeElement)).toBe(true); // caret ready in the new block
    editor.undo();
    expect(editor.getModel().blocks[0]).toEqual(original); // same id, same content
  });

  test("Enter-split respects defaultPrevented (a menu can own the key)", () => {
    setup(P("text"));
    const el = carrierOf(0);
    el.focus();
    el.addEventListener("keydown", (e) => e.preventDefault(), { once: true, capture: true });
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(editor.getModel().blocks).toHaveLength(1); // no split happened
  });

  test("empty default blocks carry the ghost prompt; typing clears it live", () => {
    setup(P("") + `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-text="text"></h2>`);
    const para = carrierOf(0);
    expect(para.getAttribute("data-pbe-ph")).toBe("Type / to choose a block");
    expect(para.classList.contains("pbe-empty")).toBe(true);
    expect(carrierOf(1).hasAttribute("data-pbe-ph")).toBe(false); // only the default block

    type(0, "words");
    expect(para.classList.contains("pbe-empty")).toBe(false);
    expect(editor.serialize()).not.toContain("pbe"); // chrome never serializes

    // Enter at the END mints a fresh empty paragraph — ghost present
    // (caret placement matters: at the start, the split would push the text
    // into the new block instead)
    const range = document.createRange();
    range.selectNodeContents(para);
    range.collapse(false);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    para.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    const fresh = carrierOf(1);
    expect(fresh.getAttribute("data-pbe-ph")).toBe("Type / to choose a block");
    expect(fresh.classList.contains("pbe-empty")).toBe(true);

    // a block declaring its own placeholder gets ghosted too (heading-style)
    registerBlock("ghosty", {
      label: "Ghosty",
      placeholder: "Ghosty here",
      render: (f) => `<div data-pb-block="ghosty" data-pb-text="t">${escHtml(f.t ?? "")}</div>`,
    });
    editor.loadHtml(`<div data-pb-block="ghosty"></div>`);
    const g = canvas.querySelector('[data-pb-block="ghosty"]')!;
    expect(g.getAttribute("data-pbe-ph")).toBe("Ghosty here");
    expect(g.classList.contains("pbe-empty")).toBe(true);
    unregisterBlock("ghosty");
  });

  test("appender: clicking below the last block appends an empty default block; empties are reused", () => {
    setup(P("content"));
    const below = () => {
      const lastRoot = canvas.querySelector("[data-pb-id]:last-of-type");
      const y = (lastRoot ?? canvas).getBoundingClientRect().bottom + 20;
      canvas.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientY: y }),
      );
    };

    below();
    expect(editor.getModel().blocks).toHaveLength(2);
    const appended = editor.getModel().blocks[1];
    expect(appended.type).toBe("paragraph");
    const fresh = canvas.querySelector(`[data-pb-id="${appended.id}"]`)!;
    expect(fresh.classList.contains("pbe-empty")).toBe(true); // ghost prompt live
    expect(fresh.contains(document.activeElement)).toBe(true);

    below(); // last block is an empty default — reuse, don't stack
    expect(editor.getModel().blocks).toHaveLength(2);

    // a click in the gap ABOVE the last block's bottom is not the appender's
    const firstRect = canvas.querySelector("[data-pb-id]")!.getBoundingClientRect();
    canvas.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientY: firstRect.bottom + 1,
      }),
    );
    expect(editor.getModel().blocks).toHaveLength(2);

    editor.undo();
    expect(editor.getModel().blocks).toHaveLength(1);
  });

  test("insertBlock inserts at the end or a given index, focused and undoable", () => {
    setup(P("a") + P("b"));
    const end = editor.insertBlock("heading")!;
    expect(editor.getModel().blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "paragraph",
      "heading",
    ]);
    expect(canvas.querySelector(`[data-pb-id="${end.id}"]`)!.contains(document.activeElement)).toBe(
      true,
    );

    editor.insertBlock("paragraph", 1);
    expect(editor.getModel().blocks).toHaveLength(4);
    expect(editor.getModel().blocks[1].type).toBe("paragraph");

    expect(editor.insertBlock("ghost")).toBe(null); // unregistered type
    editor.undo();
    editor.undo();
    expect(editor.getModel().blocks.map((b) => b.fields.body)).toEqual(["a", "b"]);
  });

  test("insertBlockAdjacent inserts at the requested edge without a placeholder block", () => {
    setup(P("a") + P("b"));
    const anchor = editor.getModel().blocks[1];

    const before = editor.insertBlockAdjacent(anchor.id, "before", "heading")!;
    expect(editor.getModel().blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "heading",
      "paragraph",
    ]);
    expect(editor.getModel().blocks[1].id).toBe(before.id);
    expect(
      canvas.querySelector(`[data-pb-id="${before.id}"]`)!.contains(document.activeElement),
    ).toBe(true);

    const after = editor.insertBlockAdjacent(anchor.id, "after", "heading")!;
    expect(editor.getModel().blocks.map((b) => b.id)).toEqual([
      editor.getModel().blocks[0].id,
      before.id,
      anchor.id,
      after.id,
    ]);
    expect(editor.insertBlockAdjacent("missing", "after", "heading")).toBeNull();

    editor.undo();
    editor.undo();
    expect(editor.getModel().blocks.map((b) => b.fields.body)).toEqual(["a", "b"]);
  });

  test("appender bootstraps an empty document", () => {
    setup("");
    expect(editor.getModel().blocks).toHaveLength(0);
    canvas.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientY: canvas.getBoundingClientRect().top + 10,
      }),
    );
    expect(editor.getModel().blocks).toHaveLength(1);
    expect(editor.getModel().blocks[0].type).toBe("paragraph");
    expect(canvas.contains(document.activeElement)).toBe(true);
  });

  test("the round-trip law holds across time travel", () => {
    setup(P("start"));
    type(0, "typed");
    const el = carrierOf(0);
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    editor.undo();
    editor.undo();
    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m);
  });
});

// ---------------------------------------------------------------------------

describe("innerBlocks: children slots, group / ungroup", () => {
  beforeAll(() => {
    if (!getBlockType("group")) {
      registerBlock("group", {
        label: "Group",
        render: () => `<div data-pb-block="group" data-pb-children></div>`,
      });
    }
  });

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

  const carrierOf = (i: number) =>
    canvas.querySelectorAll<HTMLElement>("[data-pb-rich],[data-pb-text]")[i];
  const P = (body: string) => `<p data-pb-block="paragraph" data-pb-rich="body">${body}</p>`;
  const G = (inner: string) => `<div data-pb-block="group" data-pb-children>${inner}</div>`;

  function type(i: number, value: string) {
    const el = carrierOf(i);
    el.focus();
    el.innerHTML = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  function caretIn(i: number, offset: number) {
    const el = carrierOf(i);
    el.focus();
    const range = document.createRange();
    if (offset === Infinity) {
      range.selectNodeContents(el);
      range.collapse(false);
    } else {
      range.setStart(el.firstChild ?? el, offset);
      range.collapse(true);
    }
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    return el;
  }

  async function selectAcross(i: number, j: number, expected: number) {
    const range = document.createRange();
    range.setStart(carrierOf(i).firstChild ?? carrierOf(i), 1);
    range.setEnd(carrierOf(j).firstChild ?? carrierOf(j), 1);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    await vi.waitFor(() => expect(editor.selection.blocks).toHaveLength(expected));
  }

  const key = (k: string, extra: KeyboardEventInit = {}) =>
    new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra });

  test("acceptsChildren derives from the probe; slot misuse is rejected", () => {
    expect(getBlockType("group")!.acceptsChildren).toBe(true);
    expect(getBlockType("paragraph")!.acceptsChildren).toBe(false);
    expect(() =>
      registerBlock("probe", {
        label: "P",
        render: () =>
          `<div data-pb-block="probe"><div data-pb-children></div><div data-pb-children></div></div>`,
      }),
    ).toThrow(/at most one/);
    expect(() =>
      registerBlock("probe", {
        label: "P",
        render: () => `<div data-pb-block="probe" data-pb-children><p>static</p></div>`,
      }),
    ).toThrow(/must be empty/);
    expect(() =>
      registerBlock("probe", {
        label: "P",
        render: () => `<div data-pb-block="probe" data-pb-children data-pb-rich="body"></div>`,
      }),
    ).toThrow(/cannot also be a field carrier/);
  });

  test("the round-trip law holds for nested content, raw children and empty groups included", () => {
    const html =
      G(
        `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-text="text">Inside</h2>` +
          P("child <em>rich</em>") +
          `<blockquote>raw child</blockquote>`,
      ) +
      P("after") +
      G("");
    const m1 = upcast(parse(html));
    expect(m1.blocks[0].children!.map((b) => b.type)).toEqual(["heading", "paragraph", RAW_TYPE]);
    expect(m1.blocks[1].children).toBeUndefined(); // only container types carry children
    expect(m1.blocks[2].children).toEqual([]);
    const gen1 = downcast(m1);
    const m2 = upcast(parse(gen1));
    expect(m2).toEqual(m1);
    expect(downcast(m2)).toBe(gen1); // serialization is a fixed point
  });

  test("data pipeline strips the children vocabulary all the way down", () => {
    const published = downcast(upcast(parse(G(P('deep <em data-p-text="s.x">live</em>')))), "data");
    expect(published).not.toContain("data-pb-");
    expect(published).toContain('<em data-p-text="s.x">live</em>');
  });

  test("groupBlocks wraps the selected siblings in document order; undo restores the flat run", () => {
    setup(P("one") + P("two") + P("three"));
    const [a, b, c] = editor.getModel().blocks;
    const g = editor.groupBlocks([c.id, b.id])!; // any id order in, document order out
    expect(editor.getModel().blocks.map((x) => x.id)).toEqual([a.id, g.id]);
    expect(g.children!.map((x) => x.id)).toEqual([b.id, c.id]);
    expect(editor.selection.blocks).toEqual([g.id]); // the fresh group reads as selected
    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m); // law holds over the new nesting
    editor.undo();
    expect(editor.getModel().blocks.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  test("Cmd+G groups the block selection; Shift+Cmd+G dissolves it again", async () => {
    setup(P("one") + P("two") + P("three"));
    await selectAcross(1, 2, 2);
    const g = key("g", { metaKey: true });
    document.body.dispatchEvent(g);
    expect(g.defaultPrevented).toBe(true);
    expect(editor.getModel().blocks.map((b) => b.type)).toEqual(["paragraph", "group"]);
    const group = editor.getModel().blocks[1];
    expect(editor.selection.blocks).toEqual([group.id]);

    const ug = key("G", { metaKey: true, shiftKey: true });
    document.body.dispatchEvent(ug);
    expect(ug.defaultPrevented).toBe(true);
    expect(editor.getModel().blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
    expect(editor.selection.blocks).toHaveLength(2); // the released run reads as selected
  });

  test("groupBlocks refuses ids that straddle sibling lists — and records nothing", () => {
    setup(G(P("inner")) + P("outer"));
    const inner = editor.getModel().blocks[0].children![0];
    const outer = editor.getModel().blocks[1];
    expect(editor.groupBlocks([inner.id, outer.id])).toBe(null);
    expect(editor.history.canUndo).toBe(false);
  });

  test("ungroup resolves the nearest container from a caret inside a child; the caret survives", async () => {
    setup(P("before") + G(P("in-one") + P("in-two")));
    const beforeId = editor.getModel().blocks[0].id;
    const group = editor.getModel().blocks[1];
    const [k1, k2] = group.children!;
    expect(editor.ungroupTarget(k1.id)).toBe(group.id);

    const el = caretIn(1, 2); // inside "in-one"
    await vi.waitFor(() => expect(editor.selection.active).toBe(k1.id));
    const ug = key("G", { metaKey: true, shiftKey: true });
    el.dispatchEvent(ug);
    expect(ug.defaultPrevented).toBe(true);
    expect(editor.getModel().blocks.map((b) => b.id)).toEqual([beforeId, k1.id, k2.id]);
    const released = canvas.querySelector(`[data-pb-id="${k1.id}"]`)!;
    expect(released.contains(window.getSelection()!.anchorNode)).toBe(true);
    editor.undo();
    expect(editor.getModel().blocks[1].children!.map((b) => b.id)).toEqual([k1.id, k2.id]);
  });

  test("ungrouping a nested group splices its children into the outer group; empty groups just vanish", () => {
    setup(G(P("a") + G(P("b"))) + G(""));
    const outer = editor.getModel().blocks[0];
    const inner = outer.children![1];
    expect(editor.ungroupBlock(inner.id)).toBe(true);
    expect(editor.getModel().blocks[0].children!.map((b) => b.fields.body)).toEqual(["a", "b"]);

    const emptyId = editor.getModel().blocks[1].id;
    expect(editor.ungroupBlock(emptyId)).toBe(true);
    expect(editor.getModel().blocks).toHaveLength(1);
  });

  test("editing inside a group: typing syncs the child; Enter splits within the group", () => {
    setup(P("outside") + G(P("inside")));
    const group = () => editor.getModel().blocks[1];
    type(1, "inside!");
    expect(group().children![0].fields.body).toBe("inside!");

    const el = caretIn(1, Infinity);
    el.dispatchEvent(key("Enter"));
    expect(editor.getModel().blocks).toHaveLength(2); // top level untouched
    expect(group().children!.map((b) => b.fields.body)).toEqual(["inside!", ""]);
  });

  test("moveBlock moves among siblings and stops at the container's edges", () => {
    setup(G(P("a") + P("b")) + P("tail"));
    const group = () => editor.getModel().blocks[0];
    const [a, b] = group().children!;
    editor.moveBlock(a.id, 1);
    expect(group().children!.map((x) => x.id)).toEqual([b.id, a.id]);
    editor.moveBlock(a.id, 1); // last in its list — no-op even though a top-level block follows
    expect(group().children!.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(editor.getModel().blocks).toHaveLength(2);
  });

  test("moveBlockTo reorders across tree levels, is undoable, and rejects cycles", () => {
    setup(P("before") + G(P("inside")) + P("after"));
    const before = editor.getModel().blocks[0];
    const group = editor.getModel().blocks[1];
    const after = editor.getModel().blocks[2];

    expect(editor.canMoveTo(after.id, group.id)).toBe(true);
    expect(editor.moveBlockTo(after.id, group.id, 0)).toBe(true);
    expect(editor.getModel().blocks.map((block) => block.id)).toEqual([before.id, group.id]);
    expect(group.children!.map((block) => block.id)).toEqual([after.id, group.children![1].id]);

    editor.undo();
    expect(editor.getModel().blocks.map((block) => block.id)).toEqual([
      before.id,
      group.id,
      after.id,
    ]);

    const restoredGroup = editor.getBlock(group.id)!;
    const child = restoredGroup.children![0];
    expect(editor.moveBlockTo(child.id, null, 0)).toBe(true);
    expect(editor.getModel().blocks.map((block) => block.id)).toEqual([
      child.id,
      before.id,
      group.id,
      after.id,
    ]);
    expect(editor.canMoveTo(group.id, child.id)).toBe(false);
    expect(editor.moveBlockTo(group.id, group.id, 0)).toBe(false);
  });

  test("moveBlockTo never allows a container to become a child of its descendant", () => {
    setup(G(G(P("deep"))) + P("tail"));
    const outer = editor.getModel().blocks[0];
    const inner = outer.children![0];
    expect(editor.canMoveTo(outer.id, inner.id)).toBe(false);
    expect(editor.moveBlockTo(outer.id, inner.id, 0)).toBe(false);
    expect(editor.getModel().blocks[0].id).toBe(outer.id);
  });

  test("a freshly inserted container is seeded with one empty default block and lands BLOCK-SELECTED", () => {
    setup(P("x"));
    const g = editor.insertBlock("group")!;
    expect(g.children!.map((b) => b.type)).toEqual(["paragraph"]);
    // the user placed a structure — the whole block selects; no caret steals
    // into the seeded child's carrier
    expect(editor.selection.blocks).toEqual([g.id]);
    const root = canvas.querySelector(`[data-pb-id="${g.id}"]`)!;
    expect(root.classList.contains("pbe-selected")).toBe(true);
    expect(root.contains(document.activeElement)).toBe(false);
    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m);
  });

  test("selection promotion normalizes to the deepest common sibling list", async () => {
    setup(P("top") + G(P("one") + P("two")));
    const group = editor.getModel().blocks[1];

    // spanning two children INSIDE the group selects those children, not the group
    await selectAcross(1, 2, 2);
    expect(editor.selection.blocks).toEqual(group.children!.map((b) => b.id));

    // …and Cmd+G nests a fresh group INSIDE the group
    document.body.dispatchEvent(key("g", { metaKey: true }));
    const inner = editor.getModel().blocks[1].children![0];
    expect(inner.type).toBe("group");
    expect(inner.children!.map((b) => b.fields.body)).toEqual(["one", "two"]);
    editor.undo();

    // spanning from outside into the group selects the top-level run whole
    await selectAcross(0, 1, 2);
    expect(editor.selection.blocks).toEqual(editor.getModel().blocks.map((b) => b.id));
  });

  test("Backspace deletes a multiselected run inside a group without touching its siblings", async () => {
    setup(G(P("one") + P("two") + P("three")));
    await selectAcross(0, 1, 2);
    document.body.dispatchEvent(key("Backspace"));
    expect(editor.getModel().blocks[0].children!.map((b) => b.fields.body)).toEqual(["three"]);
    editor.undo();
    expect(editor.getModel().blocks[0].children).toHaveLength(3);
  });

  test("backspace at the start of a group's first child stays put — no cross-container merge", () => {
    setup(P("outside") + G(P("first")));
    const el = caretIn(1, 0);
    const e = key("Backspace");
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false); // handler declined: start of its container
    expect(editor.getModel().blocks).toHaveLength(2);
    expect(editor.getModel().blocks[1].children).toHaveLength(1);
  });

  // --- selection escalation ----------------------------------------------------

  const mousedown = (el: Element, init: MouseEventInit = {}) => {
    const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, ...init });
    el.dispatchEvent(e);
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return e;
  };

  test("plain click on a container's own surface selects it; child clicks don't", () => {
    setup(G(P("in")) + P("out"));
    const group = editor.getModel().blocks[0];
    const root = canvas.querySelector(`[data-pb-id="${group.id}"]`)!;
    mousedown(root); // padding click: the event target IS the group root
    expect(editor.selection.blocks).toEqual([group.id]);

    mousedown(carrierOf(0)); // clicking INTO a child releases the block selection
    expect(editor.selection.blocks).toHaveLength(0);
  });

  test("shift+click inside the selected block walks the selection up to the top level", () => {
    setup(G(G(P("deep"))) + P("tail"));
    const outer = editor.getModel().blocks[0];
    const inner = outer.children![0];
    const para = inner.children![0];
    const el = carrierOf(0); // the deep paragraph's carrier

    expect(mousedown(el, { shiftKey: true }).defaultPrevented).toBe(true);
    expect(editor.selection.blocks).toEqual([para.id]); // first: the block itself
    mousedown(el, { shiftKey: true });
    expect(editor.selection.blocks).toEqual([inner.id]); // then its container
    mousedown(el, { shiftKey: true });
    expect(editor.selection.blocks).toEqual([outer.id]); // then the outer one
    mousedown(el, { shiftKey: true });
    expect(editor.selection.blocks).toEqual([outer.id]); // top level: stays put
  });

  test("Cmd+A ladder: text → block → siblings → parent level → whole document", () => {
    setup(P("top") + G(P("one") + P("two")));
    const rootIds = () => editor.getModel().blocks.map((b) => b.id);
    const group = editor.getModel().blocks[1];
    const [k1] = group.children!;
    const el = carrierOf(1); // "one", inside the group
    el.focus();
    const sel = window.getSelection()!;
    const press = () => {
      const e = key("a", { metaKey: true });
      (document.activeElement ?? document.body).dispatchEvent(e);
      return e;
    };

    // partial text selection: the first press belongs to native select-all
    const partial = document.createRange();
    partial.setStart(el.firstChild!, 0);
    partial.setEnd(el.firstChild!, 2);
    sel.removeAllRanges();
    sel.addRange(partial);
    expect(press().defaultPrevented).toBe(false);

    // with the carrier fully covered (what native select-all leaves), ours starts
    const full = document.createRange();
    full.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(full);
    expect(press().defaultPrevented).toBe(true);
    expect(editor.selection.blocks).toEqual([k1.id]); // the block
    press();
    expect(editor.selection.blocks).toEqual(group.children!.map((b) => b.id)); // its siblings
    press();
    expect(editor.selection.blocks).toEqual(rootIds()); // the parent's level = everything here
    press();
    expect(editor.selection.blocks).toEqual(rootIds()); // the ladder tops out
  });

  test("Cmd+A in an empty default block selects the block straight away", () => {
    setup(P("full") + P(""));
    const el = carrierOf(1);
    el.focus();
    const e = key("a", { metaKey: true });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(editor.selection.blocks).toEqual([editor.getModel().blocks[1].id]);
  });

  test("click-to-append works inside containers: below the last child appends there", () => {
    setup(G(P("in")) + P("tail"));
    const group = editor.getModel().blocks[0];
    const groupRoot = () => canvas.querySelector<HTMLElement>(`[data-pb-id="${group.id}"]`)!;
    const childBottom = (id: string) =>
      canvas.querySelector(`[data-pb-id="${id}"]`)!.getBoundingClientRect().bottom;

    const e = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientY: childBottom(group.children![0].id) + 4,
    });
    groupRoot().dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true); // the appender owns the gesture…
    expect(editor.selection.blocks).toHaveLength(0); // …so it never doubles as select
    const kids = () => editor.getModel().blocks[0].children!;
    expect(kids().map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
    const fresh = kids()[1];
    expect(
      canvas.querySelector(`[data-pb-id="${fresh.id}"]`)!.contains(document.activeElement),
    ).toBe(true);
    expect(editor.getModel().blocks).toHaveLength(2); // root list untouched

    // a second below-click REUSES the trailing empty instead of stacking
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    groupRoot().dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientY: childBottom(fresh.id) + 4,
      }),
    );
    expect(kids()).toHaveLength(2);
  });

  test("clicks on a container's surface above its last child still select it", () => {
    setup(G(P("in")));
    const group = editor.getModel().blocks[0];
    const root = canvas.querySelector<HTMLElement>(`[data-pb-id="${group.id}"]`)!;
    const childTop = canvas
      .querySelector(`[data-pb-id="${group.children![0].id}"]`)!
      .getBoundingClientRect().top;
    root.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientY: Math.max(0, childTop - 4),
      }),
    );
    expect(editor.getModel().blocks[0].children).toHaveLength(1); // nothing appended
    expect(editor.selection.blocks).toEqual([group.id]); // selection kept the click
  });

  test("an empty container selects on its surface and appends only at its bottom edge", () => {
    setup(G("") + P("x"));
    const group = editor.getModel().blocks[0];
    const root = canvas.querySelector<HTMLElement>(`[data-pb-id="${group.id}"]`)!;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));

    root.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientY: 50,
      }),
    );
    expect(editor.getModel().blocks[0].children).toEqual([]);
    expect(editor.selection.blocks).toEqual([group.id]);
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    root.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientY: 96,
      }),
    );
    expect(editor.getModel().blocks[0].children!.map((b) => b.type)).toEqual(["paragraph"]);
    const kid = editor.getModel().blocks[0].children![0];
    expect(canvas.querySelector(`[data-pb-id="${kid.id}"]`)!.contains(document.activeElement)).toBe(
      true,
    );
    editor.undo();
    expect(editor.getModel().blocks[0].children).toEqual([]);
  });

  test("Cmd+A never fires outside the canvas, even with a block selection up", async () => {
    setup(P("one") + P("two"));
    await selectAcross(0, 1, 2);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const e = key("a", { metaKey: true });
    input.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false); // the input's own select-all
    input.remove();
  });

  test("Enter with a block selection inserts a default block below it", async () => {
    setup(P("text") + `<blockquote>opaque</blockquote>` + G(P("in")));
    const [, raw, group] = editor.getModel().blocks;

    // raw-html selected (its only interaction is the click) → Enter → paragraph after it
    canvas
      .querySelector("blockquote")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.selection.blocks).toEqual([raw.id]);
    const e1 = key("Enter");
    document.body.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(true);
    expect(editor.getModel().blocks.map((b) => b.type)).toEqual([
      "paragraph",
      RAW_TYPE,
      "paragraph",
      "group",
    ]);
    const fresh = editor.getModel().blocks[2];
    expect(
      canvas.querySelector(`[data-pb-id="${fresh.id}"]`)!.contains(document.activeElement),
    ).toBe(true); // caret ready in the new paragraph
    expect(editor.selection.blocks).toHaveLength(0);
    editor.undo();
    expect(editor.getModel().blocks).toHaveLength(3);

    // group selected → Enter → paragraph AFTER the group at its level, not inside
    const groupRoot = canvas.querySelector<HTMLElement>(`[data-pb-id="${group.id}"]`)!;
    groupRoot.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
    );
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.selection.blocks).toEqual([group.id]);
    document.body.dispatchEvent(key("Enter"));
    expect(editor.getModel().blocks.map((b) => b.type)).toEqual([
      "paragraph",
      RAW_TYPE,
      "group",
      "paragraph",
    ]);
    expect(editor.getModel().blocks[2].children).toHaveLength(1); // nothing leaked inside
  });

  test("Enter after a selected child inserts INSIDE its container; multi-selection inserts after the last", async () => {
    setup(G(P("one") + P("two")) + P("tail"));
    const group = editor.getModel().blocks[0];
    const [k1] = group.children!;

    // shift+click selects the first child, Enter → sibling inside the group
    const el = carrierOf(0);
    el.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, shiftKey: true }),
    );
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.selection.blocks).toEqual([k1.id]);
    document.body.dispatchEvent(key("Enter"));
    expect(editor.getModel().blocks[0].children!.map((b) => b.fields.body)).toEqual([
      "one",
      "",
      "two",
    ]);
    expect(editor.getModel().blocks).toHaveLength(2); // root untouched
    editor.undo();

    // multi-selection: Enter lands after the LAST selected block
    await selectAcross(0, 1, 2);
    document.body.dispatchEvent(key("Enter"));
    expect(editor.getModel().blocks[0].children!.map((b) => b.fields.body)).toEqual([
      "one",
      "two",
      "",
    ]);
  });

  test("Enter in chrome outside the canvas is never hijacked, block selection or not", async () => {
    setup(P("one") + P("two"));
    await selectAcross(0, 1, 2);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const e = key("Enter");
    input.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false); // the input's own Enter
    expect(editor.getModel().blocks).toHaveLength(2);
    input.remove();
  });

  // --- provisional (ghost) container appends -----------------------------------

  // Append via the container appender: mousedown on the container's root
  // below its last child. Returns the appended block.
  function appendInContainer(containerId: string) {
    const root = canvas.querySelector<HTMLElement>(`[data-pb-id="${containerId}"]`)!;
    const kids = editor.getBlock(containerId)?.children ?? [];
    const last = kids[kids.length - 1];
    const clientY = last
      ? canvas.querySelector(`[data-pb-id="${last.id}"]`)!.getBoundingClientRect().bottom + 4
      : 0;
    root.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientY }),
    );
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    const after = editor.getBlock(containerId)!.children!;
    return after[after.length - 1];
  }

  test("an appended-but-untouched paragraph in a container vanishes when the caret leaves — history-transparent", async () => {
    setup(G(P("in")) + P("out"));
    const group = editor.getModel().blocks[0];
    appendInContainer(group.id);
    expect(editor.getModel().blocks[0].children).toHaveLength(2);
    expect(editor.history.canUndo).toBe(true); // the append is recorded…

    caretIn(2, 1); // …but leaving without typing cancels it (carrier 2 = "out")
    await vi.waitFor(() => expect(editor.getModel().blocks[0].children).toHaveLength(1));
    expect(editor.history.canUndo).toBe(false); // …and erased — no history residue
    const outRoot = canvas.querySelector(`[data-pb-id="${editor.getModel().blocks[1].id}"]`)!;
    expect(outRoot.contains(document.activeElement)).toBe(true); // the new caret survived
    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m);
  });

  test("a ghost that received content stays; a root append is never a ghost", async () => {
    setup(G(P("in")) + P("out"));
    const group = editor.getModel().blocks[0];
    appendInContainer(group.id);
    type(1, "words"); // the ghost grew content — a real block now
    caretIn(2, 1);
    await new Promise((r) => setTimeout(r, 60));
    expect(editor.getModel().blocks[0].children!.map((b) => b.fields.body)).toEqual([
      "in",
      "words",
    ]);

    // root appender: click the canvas below everything, then leave — persists
    const lastRoot = [...canvas.querySelectorAll(":scope > [data-pb-id]")].pop()!;
    canvas.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientY: lastRoot.getBoundingClientRect().bottom + 20,
      }),
    );
    expect(editor.getModel().blocks).toHaveLength(3);
    caretIn(0, 1); // leave the empty root paragraph
    await new Promise((r) => setTimeout(r, 60));
    expect(editor.getModel().blocks).toHaveLength(3); // still there
  });

  test("a block-selected ghost is attention, not abandonment; Escape releases and removes it", async () => {
    setup(G(P("in")) + P("out"));
    const group = editor.getModel().blocks[0];
    const ghost = appendInContainer(group.id);

    // Cmd+A in the empty ghost selects it as a block — must NOT remove it
    const e = key("a", { metaKey: true });
    (document.activeElement ?? document.body).dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(editor.selection.blocks).toEqual([ghost.id]);
    await new Promise((r) => setTimeout(r, 60));
    expect(editor.getModel().blocks[0].children).toHaveLength(2);

    // Escape drops the selection — nothing holds the ghost anymore
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(editor.getModel().blocks[0].children).toHaveLength(1));
    expect(editor.history.canUndo).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("settings: declared sidebar metadata + the setField/transformBlock primitives", () => {
  beforeAll(() => {
    if (!getBlockType("group")) {
      registerBlock("group", {
        label: "Group",
        render: () => `<div data-pb-block="group" data-pb-children></div>`,
      });
    }
    if (!getBlockType("row")) {
      registerBlock("row", {
        label: "Row",
        render: () => `<div data-pb-block="row" class="flex gap-4" data-pb-children></div>`,
      });
    }
  });

  afterEach(() => unregisterBlock("probe"));

  const LEVELS = HEADING_TAGS.map((t) => ({ value: t, label: t.toUpperCase() }));

  test("settings + description are accepted editor-UI metadata, deep-frozen", () => {
    const def = registerBlock("probe", {
      label: "Probe",
      description: "Probes things.",
      settings: [
        { control: "toggle-group", label: "Shape", field: "shape", options: LEVELS },
        {
          control: "toggle-group",
          label: "Transform to",
          transform: true,
          options: [{ value: "probe", label: "Probe" }],
        },
      ],
      render: () => `<h2 data-pb-block="probe" data-pb-tag="shape" data-pb-text="t"></h2>`,
    });
    expect(def.description).toBe("Probes things.");
    expect(def.settings).toHaveLength(2);
    expect(def.settings![0]).toEqual({
      control: "toggle-group",
      label: "Shape",
      field: "shape",
      options: LEVELS,
    });
    expect(def.settings![1].transform).toBe(true);
    expect(Object.isFrozen(def.settings)).toBe(true);
    expect(Object.isFrozen(def.settings![0])).toBe(true);
    expect(Object.isFrozen(def.settings![0].options)).toBe(true);
    expect(Object.isFrozen(def.settings![0].options![0])).toBe(true);
  });

  test("settings are validated hard", () => {
    const render = () => `<h2 data-pb-block="probe" data-pb-tag="shape"></h2>`;
    const reg = (settings: unknown) =>
      registerBlock("probe", { label: "P", settings, render } as any);
    expect(() => reg({})).toThrow(/settings must be an array/);
    expect(() => reg([{ control: "dial", label: "L", field: "shape", options: LEVELS }])).toThrow(
      /unknown control/,
    );
    expect(() => reg([{ control: "toggle-group", field: "shape", options: LEVELS }])).toThrow(
      /label is required/,
    );
    // exactly one binding: field XOR transform XOR setting
    expect(() => reg([{ control: "toggle-group", label: "L", options: LEVELS }])).toThrow(
      /exactly one of "field", "transform", "setting" or "style"/,
    );
    expect(() =>
      reg([
        { control: "toggle-group", label: "L", field: "shape", transform: true, options: LEVELS },
      ]),
    ).toThrow(/exactly one of "field", "transform", "setting" or "style"/);
    // a field-bound setting must name a field the render carries
    expect(() =>
      reg([{ control: "toggle-group", label: "L", field: "nope", options: LEVELS }]),
    ).toThrow(/not carried by the render/);
    expect(() =>
      reg([{ control: "toggle-group", label: "L", field: "shape", options: [] }]),
    ).toThrow(/non-empty array/);
    expect(() =>
      reg([
        {
          control: "toggle-group",
          label: "L",
          field: "shape",
          options: [
            { value: "h1", label: "H1" },
            { value: "h1", label: "One again" },
          ],
        },
      ]),
    ).toThrow(/duplicate option value/);
    expect(() =>
      reg([{ control: "toggle-group", label: "L", field: "shape", options: [{ value: "h1" }] }]),
    ).toThrow(/non-empty string label/);
  });

  test("icon names are accepted metadata on definitions and options", () => {
    const def = registerBlock("probe", {
      label: "Probe",
      icon: "group",
      settings: [
        {
          control: "toggle-group",
          label: "Shape",
          field: "shape",
          options: [{ value: "h2", label: "H2", icon: "heading-level-2" }],
        },
      ],
      render: () => `<h2 data-pb-block="probe" data-pb-tag="shape"></h2>`,
    });
    expect(def.icon).toBe("group");
    expect(def.settings![0].options![0].icon).toBe("heading-level-2");
    unregisterBlock("probe");

    const render = () => `<h2 data-pb-block="probe" data-pb-tag="shape"></h2>`;
    expect(() => registerBlock("probe", { label: "P", icon: "", render } as any)).toThrow(
      /icon must be a non-empty string/,
    );
    expect(() =>
      registerBlock("probe", {
        label: "P",
        settings: [
          {
            control: "toggle-group",
            label: "L",
            field: "shape",
            options: [{ value: "h2", label: "H2", icon: 5 }],
          },
        ],
        render,
      } as any),
    ).toThrow(/option icon must be a non-empty string/);
  });

  // --- the primitives, on a live editor --------------------------------------

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

  const H = (level: string, text: string) =>
    `<${level} data-pb-block="heading" data-pb-tag="level" data-pb-text="text">${text}</${level}>`;
  const P = (body: string) => `<p data-pb-block="paragraph" data-pb-rich="body">${body}</p>`;
  const G = (inner: string, cls = "") =>
    `<div data-pb-block="group"${cls ? ` class="${cls}"` : ""} data-pb-children>${inner}</div>`;

  test("setField rewrites the carrier in place — a heading level change swaps the tag", () => {
    setup(H("h2", "Title"));
    const id = editor.getModel().blocks[0].id;
    editor.setField(id, "level", "h4");
    expect(editor.getModel().blocks[0].fields.level).toBe("h4");
    const root = canvas.querySelector(`[data-pb-id="${id}"]`)!;
    expect(root.tagName).toBe("H4");
    expect(root.textContent).toBe("Title"); // content untouched
    editor.undo();
    expect(editor.getModel().blocks[0].fields.level).toBe("h2");
    expect(canvas.querySelector(`[data-pb-id="${id}"]`)!.tagName).toBe("H2");
  });

  test("setField preserves the caret across the re-render", () => {
    setup(H("h2", "Title"));
    const id = editor.getModel().blocks[0].id;
    const carrier = canvas.querySelector<HTMLElement>("[data-pb-text]")!;
    carrier.focus();
    const range = document.createRange();
    range.setStart(carrier.firstChild!, 3);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    editor.setField(id, "level", "h5");
    const fresh = canvas.querySelector<HTMLElement>("[data-pb-text]")!;
    const at = window.getSelection()!.getRangeAt(0);
    expect(fresh.contains(at.startContainer)).toBe(true);
    expect(at.startOffset).toBe(3);
  });

  test("setField refuses unknown blocks and undeclared fields; same-value writes don't commit", () => {
    setup(H("h2", "Title"));
    const id = editor.getModel().blocks[0].id;
    editor.setField("b_nope", "level", "h3");
    editor.setField(id, "nope", "h3"); // no carrier reads it back — refused
    expect(editor.getModel().blocks[0].fields).toEqual({ level: "h2", text: "Title" });
    expect(editor.history.canUndo).toBe(false);
    editor.setField(id, "level", "h2"); // already h2 — no history entry
    expect(editor.history.canUndo).toBe(false);
  });

  test("transformBlock keeps id, children, and authored classes; shared fields carry over", () => {
    setup(G(P("one") + P("two"), "authored"));
    const src = editor.getModel().blocks[0];
    const kids = src.children!.map((b) => b.id);

    const next = editor.transformBlock(src.id, "row");
    expect(next).not.toBeNull();
    const after = editor.getModel().blocks[0];
    expect(after.type).toBe("row");
    expect(after.id).toBe(src.id); // identity survives — it's the SAME block
    expect(after.children!.map((b) => b.id)).toEqual(kids);
    expect(after.classes).toBe("authored");

    // the canvas swapped the root in place: row baseline classes + authored
    const root = canvas.querySelector(`[data-pb-id="${src.id}"]`)!;
    expect(root.getAttribute("data-pb-block")).toBe("row");
    expect(root.classList.contains("flex")).toBe(true);
    expect(root.classList.contains("authored")).toBe(true);

    editor.undo();
    const restored = editor.getModel().blocks[0];
    expect(restored.type).toBe("group");
    expect(restored.children!.map((b) => b.id)).toEqual(kids);
  });

  test("transformBlock round-trips: the transformed model survives downcast∘upcast", () => {
    setup(G(P("one"), "authored"));
    editor.transformBlock(editor.getModel().blocks[0].id, "row");
    const m = editor.getModel();
    expect(upcast(parse(downcast(m)))).toEqual(m);
  });

  test("transformBlock refuses: unknown/same type, raw-html, children into a childless type", () => {
    setup(G(P("in")) + G("") + `<blockquote>raw</blockquote>` + H("h2", "T"));
    const [full, empty, raw, heading] = editor.getModel().blocks;
    expect(editor.transformBlock(full.id, "nope")).toBeNull();
    expect(editor.transformBlock(full.id, "group")).toBeNull();
    expect(editor.transformBlock(raw.id, "group")).toBeNull();
    expect(editor.transformBlock(full.id, "heading")).toBeNull(); // would drop the child
    expect(editor.history.canUndo).toBe(false); // every refusal is commit-free

    // an EMPTY container has nothing to drop — transforming to a childless
    // type is fine; the target declares no children slot, so the key goes away
    const e = editor.transformBlock(empty.id, "heading");
    expect(e?.children).toBeUndefined();
    expect(e?.fields).toEqual({ level: "h2", text: "" }); // target defaults fill in

    // and the other way: no children key on the source, the target starts empty
    const h = editor.transformBlock(heading.id, "group");
    expect(h?.children).toEqual([]);
    expect(h?.fields).toEqual({}); // heading fields aren't declared by group — dropped
  });
});

// ---------------------------------------------------------------------------

describe("policy: the live model (A1 — config-sourced, no enforcement)", () => {
  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];

  function mount(policy?: EditorOptions["policy"], opts: Partial<EditorOptions> = {}) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy, ...opts });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }

  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const P = (attrs = "", body = "x") =>
    `<p data-pb-block="paragraph" data-pb-rich="body" ${attrs}>${body}</p>`;

  test("no policy config → unrestricted root, permissive blocks", () => {
    const editor = mount();
    expect(editor.policy.root).toEqual({ allowedBlocks: null, orderable: null, preset: null });
    editor.loadHtml(P(`data-pb-id="a"`));
    expect(editor.blockPolicy("a")).toEqual(DEFAULT_BLOCK_POLICY);
  });

  test("root policy comes from createEditor({ policy }), never the DOM", () => {
    const editor = mount({
      allowedBlocks: ["paragraph", "heading"],
      orderable: false,
      preset: "content-only",
    });
    // A stray attribute on the canvas must NOT influence policy.
    editor.canvas.setAttribute("data-pb-allowed", "everything");
    expect(editor.policy.root).toEqual({
      allowedBlocks: ["paragraph", "heading"],
      orderable: false,
      preset: "content-only",
    });
  });

  test("allowedBlocks: false is insertion-off; absent is unrestricted (null)", () => {
    expect(mount({ allowedBlocks: false }).policy.root.allowedBlocks).toBe(false);
    expect(mount().policy.root.allowedBlocks).toBeNull();
  });

  test("per-type overrides apply to blocks of that type; others stay permissive", () => {
    const editor = mount({ blocks: { heading: { movable: false, allowedFormats: ["bold"] } } });
    editor.loadHtml(
      `<h2 data-pb-block="heading" data-pb-id="H" data-pb-tag="level" data-pb-text="text">T</h2>` +
        P(`data-pb-id="P"`),
    );
    expect(editor.blockPolicy("H")).toEqual({
      ...DEFAULT_BLOCK_POLICY,
      movable: false,
      allowedFormats: ["bold"],
    });
    expect(editor.blockPolicy("P")).toEqual(DEFAULT_BLOCK_POLICY);
    expect(editor.blockPolicy("nope")).toEqual(DEFAULT_BLOCK_POLICY); // unknown id
  });

  test("policy never serializes — no schema vocabulary rides the output", () => {
    const editor = mount({ allowedBlocks: false, blocks: { paragraph: { movable: false } } });
    editor.loadHtml(P(`data-pb-id="P"`, "hi"));
    const html = editor.serialize();
    expect(html).not.toContain("data-pb-lock");
    expect(html).not.toContain("data-pb-allowed");
    expect(html).not.toContain("movable");
    expect(html).toContain("hi"); // content is intact
  });

  test("copy/paste round-trip carries content only — policy re-applies from config", () => {
    const editor = mount({ blocks: { paragraph: { removable: false } } });
    editor.loadHtml(P(`data-pb-id="P"`));
    editor.loadHtml(editor.serialize()); // "paste" the serialized content back
    const id = editor.getModel().blocks[0].id;
    expect(editor.blockPolicy(id).removable).toBe(false); // from config, not the content
  });

  test("a policy summary is traced at construction when debug is on", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    mount({ allowedBlocks: false, blocks: { heading: { movable: false } } }, { debug: true });
    const line = spy.mock.calls.find((c) => String(c[1]).startsWith("policy:"))?.[1] as string;
    spy.mockRestore();
    expect(line).toContain("allowed=none");
    expect(line).toContain("1 type-override");
  });
});

// ---------------------------------------------------------------------------

describe("policy: enforcement (A2 — editable + allowedFormats)", () => {
  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];

  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }

  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const P = (attrs = "", body = "x") =>
    `<p data-pb-block="paragraph" data-pb-rich="body" ${attrs}>${body}</p>`;
  const richOf = (editor: Editor) => editor.canvas.querySelector<HTMLElement>("[data-pb-rich]")!;
  const selectContents = (el: HTMLElement) => {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // --- editable ---------------------------------------------------------------

  test("editable:false makes the block's carriers non-editable", () => {
    const editor = mount({ blocks: { paragraph: { editable: false } } });
    editor.loadHtml(P(`data-pb-id="P"`, "locked"));
    expect(richOf(editor).isContentEditable).toBe(false);
  });

  test("a block with no editable lock stays editable", () => {
    const editor = mount();
    editor.loadHtml(P(`data-pb-id="P"`));
    expect(richOf(editor).isContentEditable).toBe(true);
  });

  test("editable:false blocks input — the model never updates", () => {
    const editor = mount({ blocks: { paragraph: { editable: false } } });
    editor.loadHtml(P(`data-pb-id="P"`, "locked"));
    const carrier = richOf(editor);
    carrier.innerHTML = "hacked";
    carrier.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(editor.getBlock("P")!.fields.body).toBe("locked");
  });

  // --- allowedFormats: enforcement in editor.format() -------------------------

  test("allowedFormats gates format(): a disallowed mark is a no-op, an allowed one applies", () => {
    const editor = mount({ blocks: { paragraph: { allowedFormats: ["bold"] } } });
    editor.loadHtml(P(`data-pb-id="P"`, "hi"));
    selectContents(richOf(editor));
    editor.format("italic"); // forbidden
    expect(editor.getBlock("P")!.fields.body).toBe("hi");
    editor.format("bold"); // allowed
    expect(editor.getBlock("P")!.fields.body).toBe("<b>hi</b>");
  });

  test("allowedFormats:[] (plain text) rejects every mark", () => {
    const editor = mount({ blocks: { paragraph: { allowedFormats: [] } } });
    editor.loadHtml(P(`data-pb-id="P"`, "hi"));
    selectContents(richOf(editor));
    editor.format("bold");
    expect(editor.getBlock("P")!.fields.body).toBe("hi");
  });

  // --- allowedFormats: registry ∩ createEditor override -----------------------

  test("blockPolicy.allowedFormats = registry ∩ createEditor override", () => {
    registerBlock("fmt-both", {
      label: "Fmt",
      allowedFormats: ["bold", "italic"],
      render: () => `<p data-pb-block="fmt-both" data-pb-rich="body"></p>`,
    });
    try {
      const editor = mount({ blocks: { "fmt-both": { allowedFormats: ["bold"] } } });
      editor.loadHtml(`<p data-pb-block="fmt-both" data-pb-id="F" data-pb-rich="body">x</p>`);
      expect(editor.blockPolicy("F").allowedFormats).toEqual(["bold"]);
    } finally {
      unregisterBlock("fmt-both");
    }
  });

  test("registry allowedFormats:[] applies on its own when config is silent", () => {
    registerBlock("fmt-plain", {
      label: "Plain",
      allowedFormats: [],
      render: () => `<p data-pb-block="fmt-plain" data-pb-rich="body"></p>`,
    });
    try {
      const editor = mount();
      editor.loadHtml(`<p data-pb-block="fmt-plain" data-pb-id="F" data-pb-rich="body">x</p>`);
      expect(editor.blockPolicy("F").allowedFormats).toEqual([]);
    } finally {
      unregisterBlock("fmt-plain");
    }
  });

  test("registerBlock rejects an unknown format name", () => {
    expect(() =>
      registerBlock("bad-fmt", {
        label: "Bad",
        allowedFormats: ["underline"],
        render: () => `<p data-pb-block="bad-fmt" data-pb-rich="body"></p>`,
      }),
    ).toThrow(/allowedFormats/);
  });

  // --- policy still never serializes (A2 keeps A1's guarantee) ----------------

  test("enforcement leaves no policy vocabulary in the serialized output", () => {
    const editor = mount({ blocks: { paragraph: { editable: false, allowedFormats: [] } } });
    editor.loadHtml(P(`data-pb-id="P"`, "hi"));
    const html = editor.serialize();
    expect(html).not.toContain("contenteditable");
    expect(html).not.toContain("data-pb-lock");
    expect(html).toContain("hi");
  });

  // --- setPolicy: runtime swap (what the manual-test harness uses) ------------

  test("setPolicy swaps policy at runtime and re-applies enforcement", () => {
    const editor = mount();
    editor.loadHtml(P(`data-pb-id="P"`, "hi"));
    expect(richOf(editor).isContentEditable).toBe(true);

    editor.setPolicy({ blocks: { paragraph: { editable: false, allowedFormats: ["bold"] } } });
    expect(richOf(editor).isContentEditable).toBe(false); // re-rendered locked
    expect(editor.blockPolicy("P").allowedFormats).toEqual(["bold"]);

    editor.setPolicy({}); // cleared → back to permissive
    expect(richOf(editor).isContentEditable).toBe(true);
    expect(editor.blockPolicy("P")).toEqual(DEFAULT_BLOCK_POLICY);
  });
});

// ---------------------------------------------------------------------------

describe("policy: enforcement — movable + orderable (A3)", () => {
  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];

  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }

  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const P = (id: string, body = "x") =>
    `<p data-pb-block="paragraph" data-pb-id="${id}" data-pb-rich="body">${body}</p>`;
  const order = (editor: Editor) => editor.getModel().blocks.map((b) => b.id);

  test("movable:false pins a block — moveBlock is a no-op, canMove is false", () => {
    const editor = mount({ blocks: { heading: { movable: false } } });
    editor.loadHtml(
      `<h2 data-pb-block="heading" data-pb-id="H" data-pb-tag="level" data-pb-text="text">T</h2>` +
        P("P1") +
        P("P2"),
    );
    expect(editor.canMove("H")).toBe(false);
    editor.moveBlock("H", 1); // try to shove the pinned heading down
    expect(order(editor)).toEqual(["H", "P1", "P2"]); // unchanged

    expect(editor.canMove("P1")).toBe(true); // an unpinned block still moves
    editor.moveBlock("P1", 1);
    expect(order(editor)).toEqual(["H", "P2", "P1"]);
  });

  test("orderable:false blocks ALL reordering in the editor", () => {
    const editor = mount({ orderable: false });
    editor.loadHtml(P("A") + P("B") + P("C"));
    expect(editor.canMove("A")).toBe(false);
    expect(editor.canMove("B")).toBe(false);
    editor.moveBlock("B", -1);
    expect(order(editor)).toEqual(["A", "B", "C"]);
  });

  test("no policy → blocks reorder freely", () => {
    const editor = mount();
    editor.loadHtml(P("A") + P("B"));
    expect(editor.canMove("A")).toBe(true);
    editor.moveBlock("A", 1);
    expect(order(editor)).toEqual(["B", "A"]);
  });

  test("orderable:false overrides an otherwise-movable block", () => {
    const editor = mount({ orderable: false, blocks: { paragraph: { movable: true } } });
    editor.loadHtml(P("A") + P("B"));
    expect(editor.canMove("A")).toBe(false); // container wins (most-restrictive)
  });

  test("canMove is false for an unknown id", () => {
    expect(mount().canMove("nope")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("policy: enforcement — removable (A4, via the dropBlock choke point)", () => {
  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];

  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }

  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const P = (id: string, body = "x") =>
    `<p data-pb-block="paragraph" data-pb-id="${id}" data-pb-rich="body">${body}</p>`;
  const H = (id: string, text = "T") =>
    `<h2 data-pb-block="heading" data-pb-id="${id}" data-pb-tag="level" data-pb-text="text">${text}</h2>`;
  const ids = (editor: Editor) => editor.getModel().blocks.map((b) => b.id);
  const richOf = (editor: Editor, id: string) => {
    // data-pb-rich may sit ON the block root (paragraph) or on a descendant (quote).
    const root = editor.canvas.querySelector<HTMLElement>(`[data-pb-id="${id}"]`)!;
    return root.matches("[data-pb-rich]")
      ? root
      : root.querySelector<HTMLElement>("[data-pb-rich]")!;
  };
  const caretStart = (carrier: HTMLElement) => {
    carrier.focus();
    const range = document.createRange();
    range.setStart(carrier.firstChild ?? carrier, 0);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const press = (target: EventTarget, key: string) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

  test("multiselect-delete skips a pinned block, deletes the rest", () => {
    const editor = mount({ blocks: { paragraph: { removable: false } } });
    editor.loadHtml(H("H") + P("P"));
    editor.selectBlock("H", { toggle: true });
    editor.selectBlock("P", { toggle: true });
    press(document, "Backspace");
    expect(ids(editor)).toEqual(["P"]); // heading gone, pinned paragraph survives
  });

  test("multiselect-delete with the whole run pinned removes nothing", () => {
    const editor = mount({ blocks: { paragraph: { removable: false } } });
    editor.loadHtml(P("A") + P("B"));
    editor.selectBlock("A", { toggle: true });
    editor.selectBlock("B", { toggle: true });
    press(document, "Delete");
    expect(ids(editor)).toEqual(["A", "B"]);
  });

  test("backspace-merge at the start of a pinned block does nothing", () => {
    const editor = mount({ blocks: { paragraph: { removable: false } } });
    editor.loadHtml(H("H", "Title") + P("P", "Body"));
    caretStart(richOf(editor, "P"));
    press(richOf(editor, "P"), "Backspace");
    expect(ids(editor)).toEqual(["H", "P"]); // pinned P not merged away
    expect(editor.getBlock("P")!.fields.body).toBe("Body");
  });

  test("backspace-merge still works for a removable block (control)", () => {
    const editor = mount();
    editor.loadHtml(P("A", "one") + P("B", "two"));
    caretStart(richOf(editor, "B"));
    press(richOf(editor, "B"), "Backspace");
    expect(ids(editor)).toEqual(["A"]); // B merged into A
    expect(editor.getBlock("A")!.fields.body).toBe("onetwo");
  });

  test("an empty pinned block is not removed by Backspace", () => {
    const editor = mount({ blocks: { paragraph: { removable: false } } });
    editor.loadHtml(H("H") + P("P", ""));
    caretStart(richOf(editor, "P"));
    press(richOf(editor, "P"), "Backspace");
    expect(ids(editor)).toEqual(["H", "P"]);
  });
});

// ---------------------------------------------------------------------------

describe("policy: preset expansion — fixed / content-only (A5)", () => {
  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];

  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }

  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const P = (id: string, body = "x") =>
    `<p data-pb-block="paragraph" data-pb-id="${id}" data-pb-rich="body">${body}</p>`;
  const richOf = (editor: Editor, id: string) => {
    const root = editor.canvas.querySelector<HTMLElement>(`[data-pb-id="${id}"]`)!;
    return root.matches("[data-pb-rich]")
      ? root
      : root.querySelector<HTMLElement>("[data-pb-rich]")!;
  };

  test("content-only expands the root: no insertion, no reorder", () => {
    expect(mount({ preset: "content-only" }).policy.root).toEqual({
      allowedBlocks: false,
      orderable: false,
      preset: "content-only",
    });
  });

  test("content-only expands every block to editable-only (movable/removable/duplicable off)", () => {
    const editor = mount({ preset: "content-only" });
    editor.loadHtml(P("P"));
    expect(editor.blockPolicy("P")).toEqual({
      editable: true,
      movable: false,
      removable: false,
      duplicable: false,
      stylable: false,
      allowedFormats: null,
    });
  });

  test("`fixed` is an alias for content-only", () => {
    const editor = mount({ preset: "fixed" });
    editor.loadHtml(P("P"));
    expect(editor.policy.root.allowedBlocks).toBe(false);
    expect(editor.blockPolicy("P").movable).toBe(false);
  });

  test("explicit config overrides the preset base (sugar, not a floor)", () => {
    const editor = mount({
      preset: "content-only",
      allowedBlocks: ["paragraph"],
      blocks: { heading: { removable: true } },
    });
    expect(editor.policy.root.allowedBlocks).toEqual(["paragraph"]); // explicit wins over preset
    editor.loadHtml(
      `<h2 data-pb-block="heading" data-pb-id="H" data-pb-tag="level" data-pb-text="text">T</h2>`,
    );
    expect(editor.blockPolicy("H").removable).toBe(true); // un-pinned by override
    expect(editor.blockPolicy("H").movable).toBe(false); // still preset-pinned
  });

  test("content-only is fully locked but TYPEABLE — the whole point", () => {
    const editor = mount({ preset: "content-only" });
    editor.loadHtml(P("P", "edit me"));
    expect(richOf(editor, "P").isContentEditable).toBe(true); // still editable
    expect(editor.canMove("P")).toBe(false); // not movable
    expect(editor.blockPolicy("P").removable).toBe(false); // not removable
  });

  test("an unknown preset is ignored — stays permissive", () => {
    const editor = mount({ preset: "bananas" });
    expect(editor.policy.root.allowedBlocks).toBeNull();
    editor.loadHtml(P("P"));
    expect(editor.blockPolicy("P")).toEqual(DEFAULT_BLOCK_POLICY);
  });
});

// ---------------------------------------------------------------------------

describe("policy: template-authoritative guardrail (A8)", () => {
  // Policy is config-sourced (thoughts/010): it never comes from loaded content,
  // so saved/pasted/AI-written HTML cannot loosen (or tighten) it. upcast keeps
  // only carriers/classes/children — policy-looking attributes are dropped. These
  // tests LOCK that invariant so a future upcast change can't reopen the hole.
  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];

  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }

  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const P = (id: string, body = "x") =>
    `<p data-pb-block="paragraph" data-pb-id="${id}" data-pb-rich="body">${body}</p>`;
  const richOf = (editor: Editor, id: string) => {
    const root = editor.canvas.querySelector<HTMLElement>(`[data-pb-id="${id}"]`)!;
    return root.matches("[data-pb-rich]")
      ? root
      : root.querySelector<HTMLElement>("[data-pb-rich]")!;
  };

  test("data-pb-lock baked into saved content is ignored — policy stays config-driven", () => {
    const editor = mount(); // no policy at all
    editor.loadHtml(
      `<p data-pb-block="paragraph" data-pb-id="P" data-pb-lock="move,remove" data-pb-rich="body">x</p>`,
    );
    expect(editor.blockPolicy("P")).toEqual(DEFAULT_BLOCK_POLICY); // NOT pinned by the content
  });

  test("contenteditable=true in saved content can't unlock an editable:false block", () => {
    const editor = mount({ blocks: { paragraph: { editable: false } } });
    editor.loadHtml(
      `<p data-pb-block="paragraph" data-pb-id="P" contenteditable="true" data-pb-rich="body">x</p>`,
    );
    expect(richOf(editor, "P").isContentEditable).toBe(false); // config wins; loaded attr dropped
  });

  test("data-pb-allowed in saved content can't change the root policy", () => {
    const editor = mount({ allowedBlocks: false });
    editor.loadHtml(
      `<div data-pb-doc data-pb-allowed="everything">` +
        `<p data-pb-block="paragraph" data-pb-id="P" data-pb-rich="body">x</p></div>`,
    );
    expect(editor.policy.root.allowedBlocks).toBe(false); // config is authoritative
  });

  test("policy persists across loads — new content never resets it", () => {
    const editor = mount({ blocks: { paragraph: { removable: false } } });
    editor.loadHtml(P("A"));
    expect(editor.blockPolicy("A").removable).toBe(false);
    editor.loadHtml(P("B")); // a totally different document
    expect(editor.blockPolicy("B").removable).toBe(false); // same policy applies
  });

  test("hostile content round-trips to clean output — no policy vocabulary survives", () => {
    const editor = mount({ preset: "content-only", blocks: { paragraph: { editable: false } } });
    editor.loadHtml(
      `<p data-pb-block="paragraph" data-pb-id="P" data-pb-lock="x" contenteditable="true" data-pb-rich="body">hi</p>`,
    );
    const html = editor.serialize();
    expect(html).not.toMatch(/data-pb-lock|data-pb-allowed|contenteditable/);
    expect(html).toContain("hi");
  });
});

// ---------------------------------------------------------------------------

describe("policy: enforcement — allowedBlocks on insertion (B2)", () => {
  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];

  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }

  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const types = (editor: Editor) => editor.getModel().blocks.map((b) => b.type);

  test("canInsert reflects the allowlist; canInsertAny reflects false", () => {
    expect(mount().canInsert("heading")).toBe(true); // no policy = all
    const listed = mount({ allowedBlocks: ["paragraph"] });
    expect(listed.canInsert("paragraph")).toBe(true);
    expect(listed.canInsert("heading")).toBe(false);
    expect(listed.canInsertAny).toBe(true);
    const none = mount({ allowedBlocks: false });
    expect(none.canInsert("paragraph")).toBe(false);
    expect(none.canInsertAny).toBe(false);
  });

  test("insertBlock is gated by allowedBlocks", () => {
    const editor = mount({ allowedBlocks: ["paragraph"] });
    expect(editor.insertBlock("heading")).toBeNull(); // not allowed
    expect(types(editor)).toEqual([]);
    expect(editor.insertBlock("paragraph")).not.toBeNull(); // allowed
    expect(types(editor)).toEqual(["paragraph"]);
  });

  test("allowedBlocks:false blocks every insertBlock; null allows all", () => {
    const locked = mount({ allowedBlocks: false });
    expect(locked.insertBlock("paragraph")).toBeNull();
    expect(types(locked)).toEqual([]);
    const open = mount();
    expect(open.insertBlock("heading")).not.toBeNull();
  });

  test("replaceBlock (the slash-picker transform) is gated too", () => {
    const editor = mount({ allowedBlocks: ["paragraph"] });
    editor.loadHtml(`<p data-pb-block="paragraph" data-pb-id="P" data-pb-rich="body">x</p>`);
    expect(editor.replaceBlock("P", "heading")).toBeNull(); // can't turn it into a disallowed type
    expect(editor.getBlock("P")!.type).toBe("paragraph");
  });

  test("insertPattern requires every stamped root type to be allowed", () => {
    registerPattern("two-paras", {
      label: "Two paragraphs",
      content:
        `<p data-pb-block="paragraph" data-pb-rich="body">one</p>` +
        `<p data-pb-block="paragraph" data-pb-rich="body">two</p>`,
    });
    try {
      const ok = mount({ allowedBlocks: ["paragraph"] });
      expect(ok.insertPattern("two-paras")).not.toBeNull(); // all paras allowed
      expect(types(ok)).toEqual(["paragraph", "paragraph"]);

      const no = mount({ allowedBlocks: ["heading"] });
      expect(no.insertPattern("two-paras")).toBeNull(); // paragraph not allowed
      expect(types(no)).toEqual([]);
    } finally {
      unregisterPattern("two-paras");
    }
  });

  test("content-only (A5) means no insertion at all", () => {
    const editor = mount({ preset: "content-only" });
    expect(editor.canInsertAny).toBe(false);
    expect(editor.insertBlock("paragraph")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("policy: scoped per-container (D2 — orderable + slot allowedBlocks)", () => {
  // A minimal container type, registered just for this suite.
  beforeAll(() => {
    if (!getBlockType("d2grp"))
      registerBlock("d2grp", {
        label: "D2 Group",
        render: () => `<div data-pb-block="d2grp" data-pb-children></div>`,
      });
  });
  afterAll(() => unregisterBlock("d2grp"));

  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];

  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }

  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const nested =
    `<div data-pb-block="d2grp" data-pb-id="G" data-pb-children>` +
    `<p data-pb-block="paragraph" data-pb-id="C1" data-pb-rich="body">a</p>` +
    `<p data-pb-block="paragraph" data-pb-id="C2" data-pb-rich="body">b</p></div>`;

  test("root orderable:false does NOT cascade into a nested container (scoped, thoughts/006)", () => {
    const editor = mount({ orderable: false });
    editor.loadHtml(nested);
    expect(editor.canMove("G")).toBe(false); // a ROOT child: root orderable applies
    expect(editor.canMove("C1")).toBe(true); // nested: its container has no lock of its own
  });

  test("a container's slot orderable:false locks ITS children only", () => {
    const editor = mount({ slots: { d2grp: { orderable: false } } });
    editor.loadHtml(nested);
    expect(editor.canMove("C1")).toBe(false); // the d2grp slot is locked
    expect(editor.canMove("G")).toBe(true); // root is untouched by the slot rule
  });

  test("slot allowedBlocks intersects block-def, gating nested insertion", () => {
    const editor = mount({ slots: { d2grp: { allowedBlocks: ["paragraph"] } } });
    editor.loadHtml(nested);
    expect(editor.replaceBlock("C1", "heading")).toBeNull(); // heading not allowed in this slot
    expect(editor.getBlock("C1")!.type).toBe("paragraph");
    expect(editor.replaceBlock("C1", "paragraph")).not.toBeNull(); // paragraph is allowed
  });

  test("existing children remain reorderable when current admission would reject fresh insertion", () => {
    const editor = mount({ slots: { d2grp: { allowedBlocks: ["heading"] } } });
    editor.loadHtml(nested); // upcast is intentionally permissive
    expect(editor.canMove("C1")).toBe(true);
    expect(editor.canMoveTo("C1", "G")).toBe(true);
    expect(editor.moveBlockTo("C1", "G", 1)).toBe(true);
    expect(editor.getBlock("G")!.children!.map((block) => block.id)).toEqual(["C2", "C1"]);
  });

  test("a slot policy never restricts the ROOT (independent, not cascaded)", () => {
    const editor = mount({ slots: { d2grp: { allowedBlocks: ["heading"] } } });
    expect(editor.canInsert("paragraph")).toBe(true); // root stays unrestricted
    expect(editor.insertBlock("paragraph")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("style: universal font-size (C1)", () => {
  // A block that opts into the typography/fontSize panel; root IS the carrier
  // (the tricky case — the style island lands inside a rich carrier).
  beforeAll(() => {
    if (!getBlockType("styled-p"))
      registerBlock("styled-p", {
        label: "Styled",
        supports: { typography: { fontSize: true } },
        render: (f) => `<p data-pb-block="styled-p" data-pb-rich="body">${str(f.body)}</p>`,
      });
  });
  afterAll(() => unregisterBlock("styled-p"));

  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];
  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }
  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const SP = (id: string, body = "hi") =>
    `<p data-pb-block="styled-p" data-pb-id="${id}" data-pb-rich="body">${body}</p>`;

  test("styleClasses maps presets and arbitrary values", () => {
    expect(styleClasses({ fontSize: "xl" })).toEqual(["text-xl"]);
    expect(styleClasses({ fontSize: "17px" })).toEqual(["text-[17px]"]); // custom → JIT arbitrary
    expect(styleClasses(undefined)).toEqual([]);
    expect(styleClasses({ fontSize: "" })).toEqual([]);
  });

  test("registerBlock rejects an unknown supports panel", () => {
    expect(() =>
      registerBlock("bad-support", {
        label: "Bad",
        supports: { spacing: true } as never,
        render: () => `<p data-pb-block="bad-support" data-pb-rich="body"></p>`,
      }),
    ).toThrow(/supports/);
  });

  test("setStyle writes the CLASS CARRIER (no island) and round-trips", () => {
    const editor = mount();
    editor.loadHtml(SP("P"));
    editor.setStyle("P", "fontSize", "xl");
    expect(editor.getStyle("P", "fontSize")).toBe("xl"); // lens read off the carrier
    expect(editor.getBlock("P")!.classes).toContain("text-xl"); // the class IS the storage
    expect(editor.getBlock("P")!.fields.body).toBe("hi");

    const html = editor.serialize();
    expect(html).toContain("text-xl");
    expect(html).not.toContain("data-pb-style"); // the island is retired (E2)

    const model = editor.getModel();
    expect(upcast(parse(downcast(model)))).toEqual(model); // round-trip law holds
  });

  test("both pipelines carry the same class (published form = editor form)", () => {
    const editor = mount();
    editor.loadHtml(SP("P"));
    editor.setStyle("P", "fontSize", "lg");
    const data = editor.serialize({ pipeline: "data" });
    expect(data).toContain("text-lg");
    expect(data).not.toContain("data-pb-style");
  });

  test("PASTED Tailwind is understood and REPLACED, never shadowed", () => {
    const editor = mount();
    editor.loadHtml(
      `<p data-pb-block="styled-p" data-pb-id="P" data-pb-rich="body" class="text-xl">hi</p>`,
    );
    expect(editor.getStyle("P", "fontSize")).toBe("xl"); // authored class registers in the control
    editor.setStyle("P", "fontSize", "lg");
    const classes = editor.getBlock("P")!.classes!;
    expect(classes).toContain("text-lg");
    expect(classes).not.toContain("text-xl"); // replaced in place — no cascade roulette
  });

  test("clearing a style removes its class (sparse)", () => {
    const editor = mount();
    editor.loadHtml(SP("P"));
    editor.setStyle("P", "fontSize", "xl");
    editor.setStyle("P", "fontSize", "");
    expect(editor.getStyle("P", "fontSize")).toBe("");
    expect(editor.serialize()).not.toContain("text-xl");
  });

  test("setStyle is refused when the type doesn't support the prop", () => {
    const editor = mount();
    editor.loadHtml(`<p data-pb-block="paragraph" data-pb-id="P" data-pb-rich="body">x</p>`);
    editor.setStyle("P", "fontSize", "xl");
    expect(editor.serialize()).not.toContain("text-xl"); // paragraph declares no supports
  });

  test("setStyle is refused when policy is not stylable (content-only)", () => {
    const editor = mount({ preset: "content-only" });
    editor.loadHtml(SP("P"));
    expect(editor.canStyle("P")).toBe(false);
    editor.setStyle("P", "fontSize", "xl");
    expect(editor.serialize()).not.toContain("text-xl");
  });

  test("styleSupports reflects the type's declared panels", () => {
    const editor = mount();
    editor.loadHtml(SP("P"));
    expect(editor.styleSupports("P")).toEqual({ typography: { fontSize: true } });
  });
});

// ---------------------------------------------------------------------------

describe("style: color (C2)", () => {
  beforeAll(() => {
    if (!getBlockType("color-p"))
      registerBlock("color-p", {
        label: "Color",
        supports: { color: { text: true, background: true } },
        render: (f) => `<p data-pb-block="color-p" data-pb-rich="body">${str(f.body)}</p>`,
      });
  });
  afterAll(() => unregisterBlock("color-p"));

  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];
  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }
  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const CP = (id: string) =>
    `<p data-pb-block="color-p" data-pb-id="${id}" data-pb-rich="body">x</p>`;

  test("theme tokens → color utilities; raw CSS → arbitrary-value", () => {
    expect(styleClasses({ textColor: "accent-surface" })).toEqual(["text-accent-surface"]); // semantic token
    expect(styleClasses({ backgroundColor: "surface" })).toEqual(["bg-surface"]);
    expect(styleClasses({ textColor: "#111111" })).toEqual(["text-[#111111]"]); // raw CSS
    expect(styleClasses({ backgroundColor: "var(--color-accent-surface)" })).toEqual([
      "bg-[var(--color-accent-surface)]",
    ]);
    expect(styleClasses({ textColor: "#f00", backgroundColor: "#fff" })).toEqual([
      "text-[#f00]",
      "bg-[#fff]",
    ]);
  });

  test("setStyle applies both colors, round-trips, and publishes clean classes", () => {
    const editor = mount();
    editor.loadHtml(CP("P"));
    editor.setStyle("P", "textColor", "#111111");
    editor.setStyle("P", "backgroundColor", "var(--color-accent-surface)");
    expect(editor.getStyle("P", "textColor")).toBe("#111111"); // arbitrary form reads back
    expect(editor.getStyle("P", "backgroundColor")).toBe("accent-surface");
    const model = editor.getModel();
    expect(upcast(parse(downcast(model)))).toEqual(model); // round-trip
    const data = editor.serialize({ pipeline: "data" });
    expect(data).toContain("text-[#111111]");
    expect(data).toContain("bg-[var(--color-accent-surface)]");
    expect(data).not.toContain("data-pb-style");
  });

  test("contextual semantic variables read back as their governed palette keys", () => {
    const editor = mount();
    editor.setTheme({
      tokens: [
        ...DEFAULT_THEME.tokens,
        { name: "color-brand-surface", value: "#607f99" },
        { name: "color-brand-accent", value: "#f7dda4" },
      ],
    });
    editor.loadHtml(
      '<p data-pb-block="color-p" data-pb-id="P" data-pb-rich="body" class="bg-[var(--color-brand-surface)] text-[var(--color-brand-accent)]">x</p>',
    );
    expect(editor.getStyle("P", "backgroundColor")).toBe("brand-surface");
    expect(editor.getStyle("P", "textColor")).toBe("brand-accent");
  });

  test("a block that supports only some panels rejects the others", () => {
    // color-p supports color but NOT typography
    const editor = mount();
    editor.loadHtml(CP("P"));
    editor.setStyle("P", "fontSize", "xl"); // not supported
    editor.setStyle("P", "textColor", "#000"); // supported
    expect(editor.getStyle("P", "fontSize")).toBe("");
    expect(editor.getStyle("P", "textColor")).toBe("#000");
    expect(editor.getBlock("P")!.classes).toBe("text-[#000]");
  });

  test("registerBlock validates the color panel shape", () => {
    expect(() =>
      registerBlock("bad-color", {
        label: "Bad",
        supports: { color: { text: "yes" } } as never,
        render: () => `<p data-pb-block="bad-color" data-pb-rich="body"></p>`,
      }),
    ).toThrow(/color/);
  });
});

// ---------------------------------------------------------------------------

describe("style: dimensions — padding/margin (C3)", () => {
  beforeAll(() => {
    if (!getBlockType("dim-p"))
      registerBlock("dim-p", {
        label: "Dim",
        supports: { spacing: { padding: true, margin: true } },
        render: (f) => `<p data-pb-block="dim-p" data-pb-rich="body">${str(f.body)}</p>`,
      });
  });
  afterAll(() => unregisterBlock("dim-p"));

  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];
  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }
  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const DP = (id: string) =>
    `<p data-pb-block="dim-p" data-pb-id="${id}" data-pb-rich="body">x</p>`;

  test("numeric steps map to p-/m- utilities (v4 multiplier); custom → arbitrary", () => {
    expect(styleClasses({ padding: "4" })).toEqual(["p-4"]);
    expect(styleClasses({ margin: "8" })).toEqual(["m-8"]);
    expect(styleClasses({ padding: "1.5" })).toEqual(["p-1.5"]); // any number is a step
    expect(styleClasses({ padding: "12px" })).toEqual(["p-[12px]"]);
  });

  test("named spacing tokens generate resolvable utilities and round-trip", () => {
    expect(styleClasses({ padding: "m" })).toEqual(["p-[var(--spacing-m)]"]);
    expect(readStyleClass("padding", ["p-[var(--spacing-m)]"], DEFAULT_THEME)).toBe("m");
  });

  test("setStyle applies padding + margin and round-trips", () => {
    const editor = mount();
    editor.loadHtml(DP("P"));
    editor.setStyle("P", "padding", "6");
    editor.setStyle("P", "margin", "2");
    expect(editor.getStyle("P", "padding")).toBe("6");
    expect(editor.getStyle("P", "margin")).toBe("2");
    const model = editor.getModel();
    expect(upcast(parse(downcast(model)))).toEqual(model);
    expect(editor.serialize({ pipeline: "data" })).toContain("p-6");
    expect(editor.serialize({ pipeline: "data" })).toContain("m-2");
  });

  test("spacing is refused on a block that doesn't support it", () => {
    const editor = mount();
    editor.loadHtml(`<p data-pb-block="paragraph" data-pb-id="Q" data-pb-rich="body">x</p>`);
    // paragraph DOES support spacing now, so use a heading (text/fontSize only)
    editor.loadHtml(
      `<h2 data-pb-block="heading" data-pb-id="H" data-pb-tag="level" data-pb-text="text">x</h2>`,
    );
    editor.setStyle("H", "padding", "6");
    expect(editor.getStyle("H", "padding")).toBe("");
    expect(editor.serialize()).not.toContain("p-6");
  });
});

// ---------------------------------------------------------------------------

describe("style: border — width/color/radius (C4)", () => {
  beforeAll(() => {
    if (!getBlockType("bord-p"))
      registerBlock("bord-p", {
        label: "Border",
        supports: { border: { width: true, color: true, radius: true } },
        render: (f) => `<p data-pb-block="bord-p" data-pb-rich="body">${str(f.body)}</p>`,
      });
  });
  afterAll(() => unregisterBlock("bord-p"));

  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];
  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }
  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const BP = (id: string) =>
    `<p data-pb-block="bord-p" data-pb-id="${id}" data-pb-rich="body">x</p>`;

  test("width/radius scales + arbitrary; border color", () => {
    expect(styleClasses({ borderWidth: "1" })).toEqual(["border"]); // 1px = the bare utility
    expect(styleClasses({ borderWidth: "2" })).toEqual(["border-2"]);
    expect(styleClasses({ borderWidth: "var(--edge)" })).toEqual(["border-[length:var(--edge)]"]);
    expect(styleClasses({ borderRadius: "lg" })).toEqual(["rounded-lg"]); // radius-lg token
    expect(styleClasses({ borderRadius: "5px" })).toEqual(["rounded-[5px]"]);
    expect(styleClasses({ borderColor: "border" })).toEqual(["border-border"]); // semantic token
    expect(styleClasses({ borderColor: "#111111" })).toEqual(["border-[color:#111111]"]);
    expect(
      styleClasses({
        borderTopWidth: "2.75rem",
        borderRightColor: "#abcdef",
        borderBottomLeftRadius: "lg",
      }),
    ).toEqual(["border-t-[length:2.75rem]", "border-r-[color:#abcdef]", "rounded-bl-lg"]);
  });

  test("independent border edges and corners round-trip", () => {
    const editor = mount();
    editor.loadHtml(BP("P"));
    editor.setStyle("P", "borderTopWidth", "2");
    editor.setStyle("P", "borderRightColor", "#111111");
    editor.setStyle("P", "borderBottomLeftRadius", "lg");
    expect(editor.getStyle("P", "borderTopWidth")).toBe("2");
    expect(editor.getStyle("P", "borderRightColor")).toBe("#111111");
    expect(editor.getStyle("P", "borderBottomLeftRadius")).toBe("lg");
    const model = editor.getModel();
    expect(upcast(parse(downcast(model)))).toEqual(model);
  });

  test("all three border props apply together and round-trip", () => {
    const editor = mount();
    editor.loadHtml(BP("P"));
    editor.setStyle("P", "borderWidth", "2");
    editor.setStyle("P", "borderColor", "#111111");
    editor.setStyle("P", "borderRadius", "lg");
    expect(editor.getStyle("P", "borderWidth")).toBe("2");
    expect(editor.getStyle("P", "borderColor")).toBe("#111111");
    expect(editor.getStyle("P", "borderRadius")).toBe("lg");
    const model = editor.getModel();
    expect(upcast(parse(downcast(model)))).toEqual(model);
    const data = editor.serialize({ pipeline: "data" });
    expect(data).toContain("border-2");
    expect(data).toContain("rounded-lg");
    expect(data).toContain("border-[color:#111111]");
  });

  test("registerBlock validates the border panel shape", () => {
    expect(() =>
      registerBlock("bad-border", {
        label: "Bad",
        supports: { border: { radius: 1 } } as never,
        render: () => `<p data-pb-block="bad-border" data-pb-rich="body"></p>`,
      }),
    ).toThrow(/border/);
  });
});

// ---------------------------------------------------------------------------

describe("style: typography panel — line-height/spacing/decoration/case (C5)", () => {
  beforeAll(() => {
    if (!getBlockType("typo-p"))
      registerBlock("typo-p", {
        label: "Typo",
        supports: {
          typography: {
            lineHeight: true,
            letterSpacing: true,
            decoration: true,
            letterCase: true,
          },
        },
        render: (f) => `<p data-pb-block="typo-p" data-pb-rich="body">${str(f.body)}</p>`,
      });
  });
  afterAll(() => unregisterBlock("typo-p"));

  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];
  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }
  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const TP = (id: string) =>
    `<p data-pb-block="typo-p" data-pb-id="${id}" data-pb-rich="body">x</p>`;

  test("each typography sub-prop maps to its utility", () => {
    expect(styleClasses({ lineHeight: "loose" })).toEqual(["leading-loose"]); // leading-loose token
    expect(styleClasses({ lineHeight: "2" })).toEqual(["leading-[2]"]); // custom
    expect(styleClasses({ letterSpacing: "wide" })).toEqual(["tracking-wide"]);
    expect(styleClasses({ decoration: "strike" })).toEqual(["line-through"]);
    expect(styleClasses({ letterCase: "upper" })).toEqual(["uppercase"]);
    expect(styleClasses({ decoration: "bogus" })).toEqual([]); // no arbitrary form → dropped
  });

  test("all four apply together and round-trip", () => {
    const editor = mount();
    editor.loadHtml(TP("P"));
    editor.setStyle("P", "lineHeight", "relaxed");
    editor.setStyle("P", "letterSpacing", "wide");
    editor.setStyle("P", "decoration", "underline");
    editor.setStyle("P", "letterCase", "caps");
    for (const [prop, v] of [
      ["lineHeight", "relaxed"],
      ["letterSpacing", "wide"],
      ["decoration", "underline"],
      ["letterCase", "caps"],
    ])
      expect(editor.getStyle("P", prop)).toBe(v);
    const model = editor.getModel();
    expect(upcast(parse(downcast(model)))).toEqual(model);
    const data = editor.serialize({ pipeline: "data" });
    for (const c of ["leading-relaxed", "tracking-wide", "underline", "capitalize"])
      expect(data).toContain(c);
  });
});

// ---------------------------------------------------------------------------

describe("style supports v2: descriptive capabilities and expanded lenses", () => {
  beforeAll(() => {
    if (!getBlockType("v2-box"))
      registerBlock("v2-box", {
        label: "V2 box",
        supports: {
          typography: {
            textAlign: true,
            fontWeight: { default: false, values: ["normal", "bold"], allowCustom: false },
            fontStyle: true,
          },
          color: { text: true, background: true },
          spacing: {
            padding: true,
            paddingInline: true,
            paddingBlock: true,
            paddingTop: true,
            paddingRight: true,
            paddingBottom: true,
            paddingLeft: true,
            marginLeft: true,
          },
          dimensions: {
            width: true,
            minHeight: true,
            minWidth: true,
            flexBasis: true,
            aspectRatio: true,
          },
          layout: {
            gap: true,
            justifyContent: true,
            alignItems: true,
            flexWrap: true,
            gridColumns: true,
          },
          border: { style: true },
        },
        render: (f) => `<div data-pb-block="v2-box" data-pb-rich="body">${str(f.body)}</div>`,
      });
  });
  afterAll(() => unregisterBlock("v2-box"));

  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];
  function mount(options?: Partial<EditorOptions>) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", ...options });
    mounted.push(editor);
    canvases.push(canvas);
    editor.loadHtml(`<div data-pb-block="v2-box" data-pb-id="V" data-pb-rich="body">x</div>`);
    return editor;
  }
  afterEach(() => {
    for (const editor of mounted) editor.destroy();
    for (const canvas of canvases) canvas.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  test("class lenses compose and round-trip", () => {
    const editor = mount();
    const values = {
      textAlign: "center",
      fontWeight: "bold",
      fontStyle: "italic",
      paddingTop: "4",
      marginLeft: "2",
      width: "50%",
      minHeight: "320px",
      minWidth: "12rem",
      flexBasis: "33.333%",
      aspectRatio: "4 / 3",
      gap: "6",
      justifyContent: "between",
      alignItems: "center",
      flexWrap: "wrap",
      gridColumns: "3",
      borderStyle: "dashed",
    };
    for (const [prop, value] of Object.entries(values)) editor.setStyle("V", prop, value);
    for (const [prop, value] of Object.entries(values))
      expect(editor.getStyle("V", prop)).toBe(value);
    const data = editor.serialize({ pipeline: "data" });
    for (const cls of [
      "text-center",
      "font-bold",
      "italic",
      "pt-4",
      "ml-2",
      "w-[50%]",
      "min-h-[320px]",
      "min-w-[12rem]",
      "basis-[33.333%]",
      "aspect-[4_/_3]",
      "gap-6",
      "justify-between",
      "items-center",
      "flex-wrap",
      "grid-cols-3",
      "border-dashed",
    ])
      expect(data).toContain(cls);
    expect(upcast(parse(editor.serialize()))).toEqual(editor.getModel());
  });

  test("responsive scopes author independent layout and logical padding values", () => {
    const editor = mount();
    editor.setTheme(HEARTH_THEME);
    editor.setStyles("V", {
      gridColumns: "1",
      alignItems: "center",
      gap: "8",
      backgroundColor: "inverse-surface",
      textColor: "inverse-foreground",
      paddingInline: "8",
      paddingBlock: "10",
    });
    editor.setStyle("V", "gridColumns", "1fr auto 1fr", "md");
    editor.setStyle("V", "paddingInline", "20", "lg");

    expect(editor.getStyle("V", "gridColumns")).toBe("1");
    expect(editor.getStyle("V", "gridColumns", "md")).toBe("1fr auto 1fr");
    expect(editor.getStyle("V", "paddingInline")).toBe("8");
    expect(editor.getStyle("V", "paddingInline", "lg")).toBe("20");
    expect(editor.getStyle("V", "backgroundColor")).toBe("inverse-surface");
    expect(editor.getStyle("V", "textColor")).toBe("inverse-foreground");

    const classes = editor.getBlock("V")!.classes!.split(/\s+/);
    for (const cls of [
      "grid-cols-1",
      "items-center",
      "gap-8",
      "bg-inverse-surface",
      "text-inverse-foreground",
      "px-8",
      "py-10",
      "md:grid-cols-[1fr_auto_1fr]",
      "lg:px-20",
    ])
      expect(classes).toContain(cls);

    expect(editor.resetStylePanel("V", "layout", "md")).toBe(true);
    expect(editor.getStyle("V", "gridColumns", "md")).toBe("");
    expect(editor.getStyle("V", "gridColumns")).toBe("1");
    editor.undo();
    expect(editor.getStyle("V", "gridColumns", "md")).toBe("1fr auto 1fr");
  });

  test("one container layout lens reads and writes responsive Group, Row, Stack, and Grid", () => {
    expect(readStyleClass("layoutMode", ["mx-auto", "lg:flex"], DEFAULT_THEME, "base")).toBe(
      undefined,
    );
    expect(readStyleClass("layoutMode", ["mx-auto", "lg:flex"], DEFAULT_THEME, "lg")).toBe("row");

    let classes = patchStyleClasses("layoutMode", "stack", ["mx-auto"], DEFAULT_THEME, "base");
    expect(classes).toEqual(["mx-auto", "flex", "flex-col"]);
    classes = patchStyleClasses("layoutMode", "row", classes, DEFAULT_THEME, "lg");
    expect(classes).toEqual(["mx-auto", "flex", "flex-col", "lg:flex", "lg:flex-row"]);
    classes = patchStyleClasses("layoutMode", "grid", classes, DEFAULT_THEME, "lg");
    expect(classes).toEqual(["mx-auto", "flex", "flex-col", "lg:grid"]);
    classes = patchStyleClasses("layoutMode", "group", classes, DEFAULT_THEME, "lg");
    expect(classes).toEqual(["mx-auto", "flex", "flex-col", "lg:block"]);
  });

  test("capability metadata is validated and deeply frozen", () => {
    const support = getBlockType("v2-box")!.supports!.typography!.fontWeight!;
    expect(support).toEqual({ default: false, values: ["normal", "bold"], allowCustom: false });
    expect(Object.isFrozen(support)).toBe(true);
    expect(Object.isFrozen(typeof support === "object" ? support.values : null)).toBe(true);
    expect(() =>
      registerBlock("bad-v2-support", {
        label: "Bad",
        supports: { dimensions: { width: { unknown: true } } } as never,
        render: () => `<div data-pb-block="bad-v2-support"></div>`,
      }),
    ).toThrow(/capability/);
  });

  test("panel reset is one undoable change", () => {
    const editor = mount();
    editor.setStyle("V", "gap", "4");
    editor.setStyle("V", "justifyContent", "center");
    expect(editor.resetStylePanel("V", "layout")).toBe(true);
    expect(editor.getStyle("V", "gap")).toBe("");
    expect(editor.getStyle("V", "justifyContent")).toBe("");
    editor.undo();
    expect(editor.getStyle("V", "gap")).toBe("4");
    expect(editor.getStyle("V", "justifyContent")).toBe("center");
  });

  test("multi-style writes migrate linked sides in one undoable change", () => {
    const editor = mount();
    editor.setStyle("V", "padding", "2");
    expect(
      editor.setStyles("V", {
        padding: "",
        paddingTop: "2",
        paddingRight: "2",
        paddingBottom: "2",
        paddingLeft: "2",
      }),
    ).toBe(true);
    expect(editor.getStyle("V", "padding")).toBe("");
    for (const prop of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"])
      expect(editor.getStyle("V", prop)).toBe("2");
    editor.undo();
    expect(editor.getStyle("V", "padding")).toBe("2");
    expect(editor.getStyle("V", "paddingTop")).toBe("");
  });

  test("inline backend carries the expanded properties", () => {
    const editor = mount({ styleBackend: inlineBackend });
    editor.setStyle("V", "textAlign", "right");
    editor.setStyle("V", "paddingTop", "3");
    editor.setStyle("V", "aspectRatio", "square");
    editor.setStyle("V", "justifyContent", "between");
    editor.setStyle("V", "flexBasis", "40%");
    editor.setStyle("V", "flexWrap", "wrap");
    editor.setStyle("V", "gridColumns", "3");
    expect(editor.getBlock("V")!.css).toContain("text-align: right");
    expect(editor.getBlock("V")!.css).toContain("padding-top: calc(var(--spacing) * 3)");
    expect(editor.getBlock("V")!.css).toContain("aspect-ratio: 1 / 1");
    expect(editor.getBlock("V")!.css).toContain("justify-content: space-between");
    expect(editor.getBlock("V")!.css).toContain("flex-basis: 40%");
    expect(editor.getBlock("V")!.css).toContain("flex-wrap: wrap");
    expect(editor.getBlock("V")!.css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
  });
});

// ---------------------------------------------------------------------------

describe("style: variants — semantic style recipes", () => {
  beforeAll(() => {
    if (!getBlockType("var-p"))
      registerBlock("var-p", {
        label: "Var",
        variants: [
          { name: "display", label: "Display", styles: { fontSize: "3xl", fontWeight: "bold" } },
          {
            name: "subtitle",
            label: "Subtitle",
            styles: { fontSize: "lg", textColor: "muted-foreground" },
          },
        ],
        render: (f) => `<p data-pb-block="var-p" data-pb-rich="body">${str(f.body)}</p>`,
      });
  });
  afterAll(() => unregisterBlock("var-p"));

  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];
  function mount(policy?: EditorOptions["policy"]) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", policy });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }
  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const VP = (id: string) =>
    `<p data-pb-block="var-p" data-pb-id="${id}" data-pb-rich="body">x</p>`;

  test("blockVariants reflects semantic style recipes", () => {
    const editor = mount();
    editor.loadHtml(VP("P"));
    expect(editor.blockVariants("P")).toEqual([
      { name: "display", label: "Display", styles: { fontSize: "3xl", fontWeight: "bold" } },
      {
        name: "subtitle",
        label: "Subtitle",
        styles: { fontSize: "lg", textColor: "muted-foreground" },
      },
    ]);
  });

  test("a variant resolves its semantic recipe into the carrier and round-trips", () => {
    const editor = mount();
    editor.loadHtml(VP("P"));
    editor.setStyle("P", "variation", "display");
    expect(editor.getStyle("P", "variation")).toBe("display");
    const classes = editor.getBlock("P")!.classes!;
    expect(classes).toContain("is-style-display"); // the marker (recognition survives tweaks)
    expect(classes).toContain("text-3xl");
    expect(classes).toContain("font-bold");
    const model = editor.getModel();
    expect(upcast(parse(downcast(model)))).toEqual(model);
    const data = editor.serialize({ pipeline: "data" });
    expect(data).toContain("text-3xl");
    expect(data).not.toContain("data-pb-style");
  });

  test("switching variations replaces the class-set (single value)", () => {
    const editor = mount();
    editor.loadHtml(VP("P"));
    editor.setStyle("P", "variation", "display");
    editor.setStyle("P", "variation", "subtitle");
    const data = editor.serialize({ pipeline: "data" });
    expect(data).toContain("text-lg");
    expect(data).not.toContain("text-3xl"); // the old variation's classes are gone
  });

  test("variation is refused on a block that declares none", () => {
    const editor = mount();
    editor.loadHtml(`<p data-pb-block="paragraph" data-pb-id="P" data-pb-rich="body">x</p>`);
    // paragraph HAS variations; use a heading (none)
    editor.loadHtml(
      `<h2 data-pb-block="heading" data-pb-id="H" data-pb-tag="level" data-pb-text="text">x</h2>`,
    );
    editor.setStyle("H", "variation", "display");
    expect(editor.getStyle("H", "variation")).toBe("");
    expect(editor.serialize()).not.toContain("is-style-");
  });

  test("registerBlock validates variations (non-empty, unique names)", () => {
    expect(() =>
      registerBlock("bad-var", {
        label: "Bad",
        variants: [],
        render: () => `<p data-pb-block="bad-var" data-pb-rich="body"></p>`,
      }),
    ).toThrow(/variants/);
  });

  test("registerBlock rejects utility-class variant recipes", () => {
    expect(() =>
      registerBlock("bad-class-var", {
        label: "Bad",
        variants: [{ name: "loud", label: "Loud", class: "text-red-500" } as any],
        render: () => `<p data-pb-block="bad-class-var" data-pb-rich="body"></p>`,
      }),
    ).toThrow(/styles/);
  });
});

// ---------------------------------------------------------------------------

describe("theme: token scales drive the style vocabulary (E1)", () => {
  test("DEFAULT_THEME keeps the generated scales but exposes semantic colors only", () => {
    const sizes = fontSizes(DEFAULT_THEME).map((o) => o.key);
    expect(sizes).toContain("xs");
    expect(sizes).toContain("9xl"); // the FULL Tailwind scale, not a curated subset
    expect(sizes.some((k) => k.startsWith("shadow"))).toBe(false); // text-shadow-* excluded
    expect(colors(DEFAULT_THEME).map((color) => color.key)).toEqual([
      "surface",
      "foreground",
      "border",
      "accent-surface",
      "accent-foreground",
      "accent-border",
      "muted-surface",
      "muted-foreground",
      "muted-border",
    ]);
    expect(colors(DEFAULT_THEME).find((c) => c.key === "red-500")).toBeUndefined();
    expect(colors(DEFAULT_THEME).find((c) => c.key === "white")).toBeUndefined();
    expect(colors(TAILWIND_COMPAT_THEME).find((c) => c.key === "red-500")).toMatchObject({
      family: "red",
      step: "500",
    });
    expect(colors(TAILWIND_COMPAT_THEME).find((c) => c.key === "white")).toMatchObject({
      family: "white",
    });
    expect(semanticColors(DEFAULT_THEME).map((color) => color.key)).toEqual([
      "surface",
      "foreground",
      "border",
      "accent-surface",
      "accent-foreground",
      "accent-border",
      "muted-surface",
      "muted-foreground",
      "muted-border",
    ]);
    expect(semanticColors(DEFAULT_THEME).some((color) => color.key === "red-500")).toBe(false);
    const contextual = semanticColors(
      themeFromTokens({
        "color-surface": "#fff",
        "color-brand-surface": "#607f99",
        "color-brand-accent-surface": "#f7dda4",
        "color-brand-accent-foreground": "#29413d",
        "color-inverse-surface": "#a45332",
      }),
    );
    expect(contextual.map((color) => color.key)).toEqual([
      "surface",
      "brand-surface",
      "brand-accent-surface",
      "brand-accent-foreground",
      "inverse-surface",
    ]);
    expect(contextual.find((color) => color.key === "brand-accent-surface")).toMatchObject({
      family: "Brand",
      label: "Brand · Accent Surface",
      value: "#f7dda4",
    });
    expect(semanticColors(HEARTH_THEME).find((color) => color.key === "surface")?.value).toBe(
      "#fbf8ef",
    );
    expect(semanticColors(HEARTH_THEME).find((color) => color.key === "brand-surface")?.value).toBe(
      "#607f99",
    );
    expect(colorContexts(DEFAULT_THEME)).toEqual([{ key: "default", label: "Default" }]);
    expect(colorContexts(HEARTH_THEME).map((context) => context.label)).toEqual([
      "Default",
      "Terracotta",
      "Slate blue",
    ]);
    expect(semanticColorRoles(DEFAULT_THEME).map((role) => role.key)).toEqual([
      "surface",
      "foreground",
      "border",
      "accent-surface",
      "accent-foreground",
      "accent-border",
      "muted-surface",
      "muted-foreground",
      "muted-border",
    ]);
    expect(
      semanticColors({
        tokens: HEARTH_THEME.tokens,
        semanticColorRoles: [
          {
            key: "notice",
            label: "Notice",
            description: "Callout color",
            value: "#f00",
          },
        ],
        colorContexts: [{ key: "default", label: "Primary" }],
      }),
    ).toEqual([]);
    expect(radii(DEFAULT_THEME).map((o) => o.key)).toContain("2xl");
    expect(spacingBase(DEFAULT_THEME)).toBe("0.25rem"); // the v4 multiplier
    expect(spacings(DEFAULT_THEME).map((o) => o.key)).toEqual([
      "2xs",
      "xs",
      "s",
      "m",
      "l",
      "xl",
      "2xl",
    ]);
    expect(containerWidths(DEFAULT_THEME)).toEqual({
      content: "645px",
      wide: "1340px",
      gutter: "24px",
    });
    expect(containerWidths(themeFromTokens({ "container-wide": "72rem" }))).toEqual({
      content: "645px",
      wide: "72rem",
      gutter: "24px",
    });
    expect(
      DEFAULT_THEME.tokens.find((token) => token.name === "publr-body-line-height")?.value,
    ).toBe(SITE_TYPOGRAPHY_DEFAULTS.bodyLineHeight);
    expect(DEFAULT_THEME.tokens.find((token) => token.name === "publr-heading-color")?.value).toBe(
      "inherit",
    );
    const defaultsCss = themeBaseCss();
    expect(defaultsCss).toContain("@layer base");
    expect(defaultsCss).toContain('data-pbe-template-width="content"');
    expect(defaultsCss).toContain("var(--publr-heading-1-size, 2.25rem)");
    expect(defaultsCss).toContain("var(--publr-paragraph-spacing, 1rem)");
  });

  test("withThemeDefaults fills missing tokens from DEFAULT_THEME without touching authored values", () => {
    const filled = withThemeDefaults(DEFAULT_THEME);
    expect(filled.tokens.find((token) => token.name === "color-surface")?.value).toBe("#ffffff");
    expect(filled.tokens.find((token) => token.name === "color-inverse-surface")).toBeUndefined();
    expect(colorContexts(filled)).toEqual([{ key: "default", label: "Default" }]);

    const customized = withThemeDefaults(
      themeFromTokens({
        "color-surface": "#123456",
        "color-foreground": "#abcdef",
      }),
    );
    expect(customized.tokens.find((token) => token.name === "color-surface")?.value).toBe(
      "#123456",
    );
    expect(customized.tokens.find((token) => token.name === "color-brand-surface")).toBeUndefined();
    expect(colorContexts(customized)).toEqual([{ key: "default", label: "Default" }]);

    const missing = withThemeDefaults(themeFromTokens({ "font-sans": "system-ui" }));
    expect(missing.tokens.find((token) => token.name === "color-surface")?.value).toBe("#ffffff");
    expect(missing.tokens.find((token) => token.name === "color-accent-surface")?.value).toBe(
      "#3858e9",
    );
    expect(missing.tokens.find((token) => token.name === "container-content")?.value).toBe("645px");
    expect(spacings(missing).map((option) => option.key)).toEqual([
      "2xs",
      "xs",
      "s",
      "m",
      "l",
      "xl",
      "2xl",
    ]);
    expect(missing.tokens.find((token) => token.name === "publr-body-font-size")?.value).toBe(
      SITE_TYPOGRAPHY_DEFAULTS.bodyFontSize,
    );
    expect(
      spacings(
        withThemeDefaults(themeFromTokens({ spacing: "0.25rem", "spacing-custom": "1.125rem" })),
      ).map((option) => option.key),
    ).toEqual(["custom"]);
  });

  test("responsive viewport widths resolve from portable breakpoint tokens", () => {
    const theme = themeFromTokens({
      ...Object.fromEntries(DEFAULT_THEME.tokens.map((token) => [token.name, token.value])),
      "breakpoint-sm": "36.25rem",
      "breakpoint-md": "780px",
      "breakpoint-lg": "77rem",
      "publr-preview-base": "360px",
      "color-accent": "#f00",
    });
    const widths = Object.fromEntries(
      styleBreakpoints(theme).map((breakpoint) => [breakpoint.key, breakpoint.viewport]),
    );
    expect(widths).toMatchObject({
      base: "360px",
      sm: "580px",
      md: "780px",
      lg: "1232px",
      xl: "1280px",
      "2xl": "1536px",
    });
    const containerCss = responsiveContainerCss(theme);
    expect(containerCss).toContain("@media (min-width:1232px)");
    expect(containerCss).toContain(".lg\\:pbe-container--on");
    expect(containerCss).toContain(".lg\\:pbe-container--off");
    expect(containerCss).toContain(".lg\\:pbe-container--bleed-right");
    expect(
      styleBreakpoints(
        themeFromTokens({
          "publr-breakpoints-configured": "1",
          "color-accent": "#f00",
        }),
      ).map((breakpoint) => breakpoint.key),
    ).toEqual(["base"]);
  });

  test("Tailwind compatibility is opt-in and preserves site-owned semantic roles", () => {
    const compatible = withTailwindCompatibility(
      themeFromTokens({
        "color-accent": "#ff006e",
        "color-accent-foreground": "#120009",
      }),
    );
    expect(colors(compatible).some((color) => color.key === "red-500")).toBe(true);
    expect(compatible.tokens.find((token) => token.name === "color-accent")?.value).toBe("#ff006e");
  });

  test("a theme token grows the vocabulary: text-xxxxl becomes a preset", () => {
    const theme = themeFromTokens({ "text-xxxxl": "6rem" });
    expect(styleClasses({ fontSize: "xxxxl" }, theme)).toEqual(["text-xxxxl"]); // token → utility
    expect(styleClasses({ fontSize: "xxxxl" })).toEqual(["text-[xxxxl]"]); // default theme: unknown → arbitrary
    expect(fontSizes(theme).map((o) => o.key)).toEqual(["xxxxl"]); // …and the control option exists
  });

  test("setActiveTheme swaps the page theme serialization resolves against", () => {
    setActiveTheme(themeFromTokens({ "text-huge": "5rem" }));
    try {
      expect(styleClasses({ fontSize: "huge" })).toEqual(["text-huge"]);
    } finally {
      setActiveTheme(undefined); // restore the default for the rest of the suite
    }
    expect(styleClasses({ fontSize: "huge" })).toEqual(["text-[huge]"]);
  });
});

// ---------------------------------------------------------------------------

describe("style backends: the inline carrier + unresolved utilities (E2)", () => {
  beforeAll(() => {
    if (!getBlockType("ib-p"))
      registerBlock("ib-p", {
        label: "Inline",
        supports: {
          typography: { fontSize: true },
          color: { text: true },
          spacing: { padding: true },
          border: { width: true, color: true, radius: true },
        },
        render: (f) => `<p data-pb-block="ib-p" data-pb-rich="body">${str(f.body)}</p>`,
      });
  });
  afterAll(() => unregisterBlock("ib-p"));

  const mounted: Editor[] = [];
  const canvases: HTMLElement[] = [];
  function mount(options?: Partial<EditorOptions>) {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", ...options });
    mounted.push(editor);
    canvases.push(canvas);
    return editor;
  }
  afterEach(() => {
    for (const e of mounted) e.destroy();
    for (const c of canvases) c.remove();
    mounted.length = 0;
    canvases.length = 0;
  });

  const IP = (id: string, extra = "") =>
    `<p data-pb-block="ib-p" data-pb-id="${id}" data-pb-rich="body"${extra}>x</p>`;

  test("inline backend writes var()-referencing declarations into the style attr", () => {
    const editor = mount({ styleBackend: inlineBackend });
    editor.loadHtml(IP("P"));
    editor.setStyle("P", "fontSize", "lg");
    editor.setStyle("P", "padding", "4");
    expect(editor.getBlock("P")!.css).toContain("font-size: var(--text-lg)");
    expect(editor.getBlock("P")!.css).toContain("padding: calc(var(--spacing) * 4)");
    expect(editor.getStyle("P", "fontSize")).toBe("lg"); // reads back through the lens
    expect(editor.getStyle("P", "padding")).toBe("4");
    const html = editor.serialize();
    expect(html).toContain('style="font-size: var(--text-lg); padding: calc(var(--spacing) * 4)"');
    const model = editor.getModel();
    expect(upcast(parse(downcast(model)))).toEqual(model); // style attr round-trips
  });

  test("inline backend resolves named spacing tokens", () => {
    const editor = mount({ styleBackend: inlineBackend });
    editor.loadHtml(IP("P"));
    editor.setStyle("P", "padding", "m");
    expect(editor.getBlock("P")!.css).toContain("padding: var(--spacing-m)");
    expect(editor.getStyle("P", "padding")).toBe("m");
  });

  test("inline backend: border width brings border-style along (self-sufficient carrier)", () => {
    const editor = mount({ styleBackend: inlineBackend });
    editor.loadHtml(IP("P"));
    editor.setStyle("P", "borderWidth", "2");
    expect(editor.getBlock("P")!.css).toContain("border-width: 2px");
    expect(editor.getBlock("P")!.css).toContain("border-style: solid");
    editor.setStyle("P", "borderWidth", "");
    expect(editor.getBlock("P")!.css).toBeUndefined(); // companion leaves with it
  });

  test("inline backend carries independent border edges and corners", () => {
    const editor = mount({ styleBackend: inlineBackend });
    editor.loadHtml(IP("P"));
    editor.setStyle("P", "borderTopWidth", "2");
    editor.setStyle("P", "borderRightColor", "#111111");
    editor.setStyle("P", "borderBottomLeftRadius", "lg");
    expect(editor.getBlock("P")!.css).toContain("border-top-width: 2px");
    expect(editor.getBlock("P")!.css).toContain("border-style: solid");
    expect(editor.getBlock("P")!.css).toContain("border-right-color: #111111");
    expect(editor.getBlock("P")!.css).toContain("border-bottom-left-radius: var(--radius-lg)");
  });

  test("inline backend leaves pasted Tailwind classes opaque (the honest boundary)", () => {
    const editor = mount({ styleBackend: inlineBackend });
    editor.loadHtml(IP("P", ' class="text-xl"'));
    expect(editor.getStyle("P", "fontSize")).toBe(""); // no engine, no understanding
    editor.setStyle("P", "fontSize", "lg");
    expect(editor.getBlock("P")!.classes).toContain("text-xl"); // untouched authored class
    expect(editor.getBlock("P")!.css).toContain("var(--text-lg)"); // cascade arbitrates (inline wins)
  });

  test("inline backend css() emits the theme's :root variables", () => {
    const css = inlineBackend.css!(themeFromTokens({ "text-lg": "1.125rem", spacing: "0.25rem" }));
    expect(css).toContain(":root {");
    expect(css).toContain("--text-lg: 1.125rem;");
    expect(css).toContain("--spacing: 0.25rem;");
  });

  test("an authored style attribute survives the round trip on the default backend", () => {
    const editor = mount();
    editor.loadHtml(IP("P", ' style="font-size: 19px"'));
    expect(editor.getBlock("P")!.css).toBe("font-size: 19px");
    expect(editor.serialize({ pipeline: "data" })).toContain('style="font-size: 19px"');
    const model = editor.getModel();
    expect(upcast(parse(downcast(model)))).toEqual(model);
  });

  test("the Define… loop: a pasted unknown utility resolves once its token exists", () => {
    const editor = mount();
    editor.loadHtml(
      `<p data-pb-block="ib-p" data-pb-id="P" data-pb-rich="body" class="text-xxxxl">x</p>`,
    );
    // Unknown token: no lens claims it (panel-level chip territory)…
    expect(editor.getStyle("P", "fontSize")).toBe("");
    expect(unresolvedUtilities(["text-xxxxl"]).map((u) => u.cls)).toEqual(["text-xxxxl"]);
    // …define the token (theme editor's job) — the SAME class now resolves.
    editor.setTheme({ tokens: [...DEFAULT_THEME.tokens, { name: "text-xxxxl", value: "6rem" }] });
    try {
      expect(editor.getStyle("P", "fontSize")).toBe("xxxxl");
      expect(unresolvedUtilities(["text-xxxxl"]).length).toBe(0);
      expect(fontSizes(themeFromTokens({ "text-xxxxl": "6rem" }))[0].key).toBe("xxxxl");
    } finally {
      setActiveTheme(undefined);
    }
  });

  test("@theme CSS import/export round-trips (E4)", () => {
    const theme = themeFromCssText(
      `/* site */ @theme { --text-xxxxl: 6rem; --color-brand: #3858e9 }`,
    )!;
    expect(theme.tokens).toEqual([
      { name: "text-xxxxl", value: "6rem" },
      { name: "color-brand", value: "#3858e9" },
    ]);
    // Custom properties OUTSIDE @theme are not theme tokens.
    expect(themeFromCssText(":root { --x: 1 } p { color: red }")).toBeNull();
    expect(themeToCssText(theme)).toBe(
      "@theme {\n  --text-xxxxl: 6rem;\n  --color-brand: #3858e9;\n}",
    );
    expect(themeToCssText(theme, ":root")).toContain(":root {"); // the inline backend's published form
  });

  test("explicitly imported Tailwind colors become managed palette values", () => {
    const imported = themeFromCssText(`@theme {
      --color-red-50: oklch(97.1% 0.013 17.38);
      --color-red-500: oklch(63.7% 0.237 25.331);
      --color-surface: #fff;
    }`)!;

    expect(paletteTokens(imported).map((token) => token.name)).toEqual([
      "color-red-50",
      "color-red-500",
    ]);
    expect(
      paletteTokens(TAILWIND_COMPAT_THEME).some((token) => token.name === "color-red-500"),
    ).toBe(false);
  });

  test("collectClasses gathers the unique class universe (E3 compile input)", () => {
    expect(
      collectClasses(`<p class="a b"><span class="b c"></span></p><div class="a"></div>`).sort(),
    ).toEqual(["a", "b", "c"]);
  });

  test("unresolvedUtilities flags missing tokens, skips static + resolved + arbitrary", () => {
    const found = unresolvedUtilities([
      "text-xxxxl", // missing token → flagged, ambiguous namespaces
      "text-lg", // resolved
      "text-center", // static utility, not token-driven
      "text-[17px]", // arbitrary — always resolvable
      "bg-brandish", // missing color token
      "hover:text-huge", // variant → out of v0 scope
      "rounded-mega", // missing radius token
      "hero-card", // not utility-shaped
    ]);
    expect(found.map((f) => f.cls)).toEqual(["text-xxxxl", "bg-brandish", "rounded-mega"]);
    expect(found[0].namespaces).toEqual(["text", "color"]); // Define… asks which
  });
});

// ---------------------------------------------------------------------------

describe("island settings: per-kind validation, the sparse island round trip, setSetting", () => {
  // A probe whose render DERIVES markup from its settings: `wide` also derives
  // a baseline class (the token-settings split of the canonical-carrier rule);
  // `start` and `name` ride only the island.
  const defineProbe = () =>
    registerBlock("probe", {
      label: "Probe",
      settings: [
        { control: "toggle", label: "Wide", setting: "wide", default: false },
        {
          control: "number",
          label: "Start",
          setting: "start",
          default: 1,
          min: 1,
          max: 99,
          step: 1,
        },
        { control: "text", label: "Name", setting: "name", default: "", placeholder: "a name" },
      ],
      render: (fields, settings) =>
        `<p data-pb-block="probe" data-pb-rich="body"${settings?.wide ? ` class="wide"` : ""}>${str(fields.body)}</p>`,
    });

  afterEach(() => {
    unregisterBlock("probe");
    unregisterBlock("probe2");
  });

  test("per-kind spec validation is hard", () => {
    const render = () => `<p data-pb-block="probe" data-pb-rich="body"></p>`;
    const reg = (settings: unknown) =>
      registerBlock("probe", { label: "P", settings, render } as any);
    const s = (spec: object) => [{ label: "L", ...spec }];
    // non-toggle-group kinds reduce to "setting is required"…
    expect(() => reg(s({ control: "toggle" }))).toThrow(
      /exactly one of "field", "transform", "setting" or "style"/,
    );
    // …because field/transform are toggle-group-only vocabulary
    expect(() => reg(s({ control: "toggle", field: "body" }))).toThrow(
      /unknown key "field" on a "toggle" control/,
    );
    expect(() => reg(s({ control: "toggle", setting: "x" }))).toThrow(/require a default/);
    expect(() => reg(s({ control: "toggle", setting: "x", default: "yes" }))).toThrow(
      /a "toggle" default must be a boolean/,
    );
    expect(() => reg(s({ control: "text", setting: "x", default: 5 }))).toThrow(
      /a "text" default must be a string/,
    );
    expect(() => reg(s({ control: "text", setting: "x", default: "", placeholder: 5 }))).toThrow(
      /placeholder must be a string/,
    );
    expect(() => reg(s({ control: "number", setting: "x", default: "5" }))).toThrow(
      /a "number" default must be a finite number/,
    );
    expect(() => reg(s({ control: "number", setting: "x", default: 5, step: 0 }))).toThrow(
      /step must be > 0/,
    );
    expect(() => reg(s({ control: "number", setting: "x", default: 5, min: 9, max: 1 }))).toThrow(
      /min must be ≤ max/,
    );
    expect(() => reg(s({ control: "number", setting: "x", default: 0, min: 1 }))).toThrow(
      /within \[min, max\]/,
    );
    expect(() => reg(s({ control: "number", setting: "x", default: 5, min: "1" }))).toThrow(
      /min must be a finite number/,
    );
    expect(() => reg(s({ control: "select", setting: "x", default: "a" }))).toThrow(
      /options must be a non-empty array/,
    );
    const OPTS = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ];
    expect(() => reg(s({ control: "select", setting: "x", default: "c", options: OPTS }))).toThrow(
      /must be one of the option values/,
    );
    expect(() =>
      reg(s({ control: "toggle-group", setting: "x", default: "c", options: OPTS })),
    ).toThrow(/must be one of the option values/);
    expect(() =>
      reg([
        { control: "toggle", label: "A", setting: "x", default: false },
        { control: "toggle", label: "B", setting: "x", default: true },
      ]),
    ).toThrow(/duplicate setting "x"/);
    // number-only keys are rejected elsewhere
    expect(() => reg(s({ control: "text", setting: "x", default: "", min: 1 }))).toThrow(
      /unknown key "min" on a "text" control/,
    );
  });

  test("islandSettings are derived from the specs, name → default", () => {
    const def = defineProbe();
    expect(def.islandSettings).toEqual([
      { name: "wide", default: false },
      { name: "start", default: 1 },
      { name: "name", default: "" },
    ]);
    expect(Object.isFrozen(def.islandSettings)).toBe(true);
    // field/transform settings contribute nothing
    expect(getBlockType("heading")!.islandSettings).toEqual([]);
  });

  test("a render emitting its own island is rejected — downcast owns the island", () => {
    expect(() =>
      registerBlock("probe", {
        label: "P",
        render: () =>
          `<p data-pb-block="probe"><script type="application/json" data-pb-settings>{}</` +
          `script></p>`,
      }),
    ).toThrow(/downcast owns the island/);
  });

  test("upcast normalizes the island: undeclared keys and default-equal values drop", () => {
    defineProbe();
    const doc = document.createElement("div");
    doc.innerHTML =
      `<p data-pb-block="probe" data-pb-id="b_1" data-pb-rich="body">` +
      `<script type="application/json" data-pb-settings>{"wide":true,"start":1,"bogus":9}</` +
      `script>Hello</p>`;
    const block = upcast(doc).blocks[0];
    expect(block.settings).toEqual({ wide: true }); // start === default, bogus undeclared
    expect(block.fields.body).toBe("Hello"); // the island is metadata, never field content
  });

  test("presence convention: {} without an island on declaring types, absent otherwise", () => {
    defineProbe();
    const doc = document.createElement("div");
    doc.innerHTML =
      `<p data-pb-block="probe" data-pb-id="b_1" data-pb-rich="body">Hi</p>` +
      `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-text="text">T</h2>`;
    const [probe, heading] = upcast(doc).blocks;
    expect(probe.settings).toEqual({});
    expect("settings" in heading).toBe(false);
  });

  test("a malformed island parses to {} — upcast never throws on content", () => {
    defineProbe();
    const doc = document.createElement("div");
    doc.innerHTML =
      `<p data-pb-block="probe" data-pb-id="b_1" data-pb-rich="body">` +
      `<script type="application/json" data-pb-settings>{oops</` +
      `script>Hi</p>`;
    expect(upcast(doc).blocks[0].settings).toEqual({});
  });

  test("downcast emits a first-child island only when the model diverges", () => {
    defineProbe();
    const model = {
      blocks: [
        { type: "probe", id: "b_1", fields: { body: "Hi" }, classes: "", settings: { wide: true } },
        { type: "probe", id: "b_2", fields: { body: "Ho" }, classes: "", settings: {} },
      ],
    };
    const html = downcast(model);
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const [b1, b2] = [...tmp.children];
    const island = b1.firstElementChild!;
    expect(island.matches('script[type="application/json"][data-pb-settings]')).toBe(true);
    expect(JSON.parse(island.textContent!)).toEqual({ wide: true });
    expect(b1.classList.contains("wide")).toBe(true); // derived from the setting
    expect(b2.querySelector("[data-pb-settings]")).toBeNull(); // sparse: all-default emits nothing
    // the round-trip law, settings included; the derived class stays baseline
    expect(upcast(tmp)).toEqual(model);
  });

  test("a </script> payload cannot break out of the island", () => {
    defineProbe();
    const hostile = `</script><b>pwn</b>`;
    const model = {
      blocks: [
        {
          type: "probe",
          id: "b_1",
          fields: { body: "Hi" },
          classes: "",
          settings: { name: hostile },
        },
      ],
    };
    const html = downcast(model);
    expect(html).toContain("<\\/script>"); // escaped inside the island JSON
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    expect(tmp.querySelectorAll("b").length).toBe(0); // nothing escaped into the DOM
    expect(upcast(tmp).blocks[0].settings).toEqual({ name: hostile }); // byte-identical read-back
  });

  // --- setSetting, on a live editor ----------------------------------------

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
  });

  const PROBE = `<p data-pb-block="probe" data-pb-id="b_1" data-pb-rich="body">Hi</p>`;

  test("setSetting writes sparsely, re-renders, and undoes as one step", () => {
    defineProbe();
    setup(PROBE);
    editor.setSetting("b_1", "wide", true);
    expect(editor.getBlock("b_1")!.settings).toEqual({ wide: true });
    expect(canvas.querySelector('[data-pb-id="b_1"]')!.classList.contains("wide")).toBe(true);
    expect(editor.serialize()).toContain("data-pb-settings");
    editor.undo();
    expect(editor.getBlock("b_1")!.settings).toEqual({});
    expect(editor.serialize()).not.toContain("data-pb-settings");
  });

  test("writing the declared default deletes the key — the model stays sparse", () => {
    defineProbe();
    setup(PROBE);
    editor.setSetting("b_1", "start", 5);
    expect(editor.getBlock("b_1")!.settings).toEqual({ start: 5 });
    editor.setSetting("b_1", "start", 1);
    expect(editor.getBlock("b_1")!.settings).toEqual({});
    expect(editor.serialize()).not.toContain("data-pb-settings");
  });

  test("no-ops: undeclared names, unchanged effective values, non-JSON values", () => {
    defineProbe();
    setup(PROBE);
    editor.setSetting("b_1", "bogus", true); // undeclared — no island home
    editor.setSetting("b_1", "wide", false); // already the effective (default) value
    editor.setSetting("b_1", "name", undefined); // not a JSON value
    expect(editor.history.canUndo).toBe(false);
    expect(editor.getBlock("b_1")!.settings).toEqual({});
  });

  test("fresh blocks of a declaring type start at {}; transforms carry shared names", () => {
    defineProbe();
    registerBlock("probe2", {
      label: "Probe2",
      settings: [
        { control: "toggle", label: "Wide", setting: "wide", default: false },
        { control: "number", label: "Zoom", setting: "zoom", default: 0 },
      ],
      render: (fields) => `<p data-pb-block="probe2" data-pb-rich="body">${str(fields.body)}</p>`,
    });
    setup("");
    const fresh = editor.insertBlock("probe")!;
    expect(fresh.settings).toEqual({});
    const plain = editor.insertBlock("paragraph")!;
    expect("settings" in plain).toBe(false);
    editor.setSetting(fresh.id, "wide", true);
    editor.setSetting(fresh.id, "start", 7);
    const next = editor.transformBlock(fresh.id, "probe2")!;
    expect(next.settings).toEqual({ wide: true }); // start: probe2 doesn't declare it
  });
});

// ---------------------------------------------------------------------------

describe("image + link carriers: probe, round trip, setField", () => {
  afterEach(() => unregisterBlock("probe"));

  // A figure block whose img carries the image field and whose anchor
  // carries BOTH a rich label and the link field (multi-carrier element).
  const defineProbe = () =>
    registerBlock("probe", {
      label: "Probe",
      render(fields) {
        const img = (fields.media ?? {}) as Partial<import("../src/index").ImageValue>;
        const dims =
          (img.width ? ` width="${escHtml(img.width)}"` : "") +
          (img.height ? ` height="${escHtml(img.height)}"` : "");
        return (
          `<figure data-pb-block="probe">` +
          `<img data-pb-image="media" src="${escHtml(img.src ?? "")}" alt="${escHtml(img.alt ?? "")}"${dims}>` +
          `<a data-pb-rich="label" data-pb-link="url" href="${escHtml(str(fields.url))}">${str(fields.label)}</a>` +
          `</figure>`
        );
      },
    });

  test("the probe derives image and link fields with attribute-borne defaults", () => {
    const def = defineProbe();
    expect(def.fields).toEqual([
      { name: "media", type: "image", default: { src: "", alt: "", width: "", height: "" } },
      { name: "label", type: "rich", default: "" },
      { name: "url", type: "link", default: "" },
    ]);
    expect(Object.isFrozen(def.fields[0].default)).toBe(true);
  });

  test("image and link values round-trip; dims are optional attributes", () => {
    defineProbe();
    const html =
      `<figure data-pb-block="probe" data-pb-id="b_1">` +
      `<img data-pb-image="media" src="/a.png" alt="A" width="640" height="480">` +
      `<a data-pb-rich="label" data-pb-link="url" href="/go">Click <em>me</em></a></figure>` +
      `<figure data-pb-block="probe" data-pb-id="b_2">` +
      `<img data-pb-image="media" src="/b.png" alt="">` +
      `<a data-pb-rich="label" data-pb-link="url" href="">bare</a></figure>`;
    const div = document.createElement("div");
    div.innerHTML = html;
    const m = upcast(div);
    expect(m.blocks[0].fields.media).toEqual({
      src: "/a.png",
      alt: "A",
      width: "640",
      height: "480",
    });
    expect(m.blocks[0].fields.url).toBe("/go");
    expect(m.blocks[0].fields.label).toBe("Click <em>me</em>");
    expect(m.blocks[1].fields.media).toEqual({ src: "/b.png", alt: "", width: "", height: "" });
    const gen1 = downcast(m);
    expect(gen1).toContain('width="640"');
    const div2 = document.createElement("div");
    div2.innerHTML = gen1;
    expect(upcast(div2)).toEqual(m);
    expect(downcast(upcast(div2))).toBe(gen1);
  });

  test("setField writes image objects structurally: clone on write, deep same-value no-op", () => {
    defineProbe();
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph" });
    editor.loadHtml(
      `<figure data-pb-block="probe" data-pb-id="b_1"><img data-pb-image="media" src="/a.png" alt="A">` +
        `<a data-pb-rich="label" data-pb-link="url" href="/go">x</a></figure>`,
    );
    const next = { src: "/c.png", alt: "C", width: "", height: "" };
    editor.setField("b_1", "media", next);
    expect(editor.getBlock("b_1")!.fields.media).toEqual(next);
    expect(editor.getBlock("b_1")!.fields.media).not.toBe(next); // cloned, never aliased
    expect(canvas.querySelector("img")!.getAttribute("src")).toBe("/c.png");
    editor.setField("b_1", "media", { ...next }); // structurally equal — no history entry
    editor.undo();
    expect(editor.getBlock("b_1")!.fields.media).toEqual({
      src: "/a.png",
      alt: "A",
      width: "",
      height: "",
    });
    expect(editor.history.canUndo).toBe(false);
    editor.destroy();
    canvas.remove();
  });
});
