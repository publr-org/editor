import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { attachInlineChrome, createEditor, flattenBlocks } from "../src/index";
import type { Editor } from "../src/index";
import { registerCoreBlocks, registerCorePatterns } from "../src/blocks";

beforeAll(() => {
  registerCoreBlocks();
  registerCorePatterns();
});

describe("declared contextual toolbars", () => {
  let host!: HTMLElement;
  let canvas!: HTMLElement;
  let editor!: Editor;
  let detach!: () => void;

  function setup(html: string, onEditPattern?: (name: string, id: string) => void) {
    host = document.createElement("div");
    canvas = document.createElement("main");
    host.appendChild(canvas);
    document.body.appendChild(host);
    editor = createEditor({
      canvas,
      defaultBlock: "paragraph",
      groupBlock: "group",
    });
    editor.loadHtml(html);
    detach = attachInlineChrome(editor, { container: host, onEditPattern });
  }

  afterEach(() => {
    detach?.();
    editor?.destroy();
    host?.remove();
    window.getSelection()?.removeAllRanges();
    document.querySelector("#hostile-inline-chrome-css")?.remove();
  });

  const chrome = () => host.querySelector<HTMLElement>("[data-pbe-inline-chrome]")!.shadowRoot!;
  const toolbar = () => chrome().querySelector<HTMLElement>(".pbe-toolbar")!;
  const control = (label: string) =>
    toolbar().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const controlRects = (label: string) => control(label)?.getClientRects().length ?? 0;

  test("host selectors and public site tokens cannot cross the chrome shadow boundary", async () => {
    const hostile = document.createElement("style");
    hostile.id = "hostile-inline-chrome-css";
    hostile.textContent = `
      [data-pbe-inline-chrome],
      .pbe-toolbar,
      .pbe-toolbar * {
        color: rgb(0 255 0) !important;
        background: rgb(255 0 255) !important;
        font-family: serif !important;
        font-size: 40px !important;
        --color-foreground: rgb(0 255 0) !important;
        --color-popover: rgb(255 0 255) !important;
      }
    `;
    document.head.appendChild(hostile);
    setup(`<p data-pb-block="paragraph" data-pb-id="p" data-pb-rich="body">Text</p>`);
    editor.selectBlock("p");
    await vi.waitFor(() => expect(toolbar().hidden).toBe(false));

    expect(getComputedStyle(toolbar()).backgroundColor).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(control("Bold")).fontSize).toBe("14px");
    expect(getComputedStyle(control("Bold")).color).toBe("rgb(24, 24, 27)");
  });

  test("hover preselects a default-mode block with its icon and name, then yields to editing", () => {
    setup(`<p data-pb-block="paragraph" data-pb-id="p" data-pb-rich="body">Text</p>`);
    const paragraph = canvas.querySelector<HTMLElement>('[data-pb-id="p"]')!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 300));
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 40, 300, 50));

    paragraph.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 100, clientY: 60 }),
    );

    const outline = chrome().querySelector<HTMLElement>(".pbe-hover-outline")!;
    const label = chrome().querySelector<HTMLElement>(".pbe-hover-label")!;
    expect(outline.hidden).toBe(false);
    expect(outline.dataset.target).toBe("p");
    expect(label.dataset.target).toBe("p");
    expect(label.textContent).toContain("Paragraph");

    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 60,
    });
    paragraph.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false); // the native caret/edit flow owns the click
    expect(outline.hidden).toBe(true);
  });

  test("hover visualizes the block's margin, border, padding, and content boxes", () => {
    setup(`<p data-pb-block="paragraph" data-pb-id="p" data-pb-rich="body">Text</p>`);
    const paragraph = canvas.querySelector<HTMLElement>('[data-pb-id="p"]')!;
    paragraph.style.margin = "10px 11px 12px 13px";
    paragraph.style.borderStyle = "solid";
    paragraph.style.borderWidth = "2px 3px 4px 5px";
    paragraph.style.padding = "6px 7px 8px 9px";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 300));
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 40, 300, 100));

    paragraph.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 100, clientY: 80 }),
    );

    const part = (name: string) => chrome().querySelector<HTMLElement>(`.pbe-hover-${name}`)!;
    expect(part("margin-top").style.left).toBe("-13px");
    expect(part("margin-top").style.top).toBe("-10px");
    expect(part("margin-top").style.width).toBe("324px");
    expect(part("border-left").style.width).toBe("5px");
    expect(part("padding-left").style.left).toBe("5px");
    expect(part("padding-left").style.width).toBe("9px");
    expect(part("content").style.left).toBe("14px");
    expect(part("content").style.top).toBe("8px");
    expect(part("content").style.width).toBe("276px");
    expect(part("content").style.height).toBe("80px");
  });

  test("the block currently holding the caret does not draw a hover preselection", async () => {
    setup(`<p data-pb-block="paragraph" data-pb-id="p" data-pb-rich="body">Text</p>`);
    const paragraph = canvas.querySelector<HTMLElement>('[data-pb-id="p"]')!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 300));
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 40, 300, 50));

    editor.selectBlock("p");
    await vi.waitFor(() => expect(editor.selection.active).toBe("p"));
    paragraph.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 100, clientY: 60 }),
    );

    expect(chrome().querySelector<HTMLElement>(".pbe-hover-outline")!.hidden).toBe(true);
    expect(chrome().querySelector<HTMLElement>(".pbe-hover-label")!.hidden).toBe(true);
  });

  test("the hover label moves above an open editing toolbar instead of colliding", async () => {
    setup(
      `<p data-pb-block="paragraph" data-pb-id="paragraph" data-pb-rich="body">Body</p>` +
        `<h2 data-pb-block="heading" data-pb-id="heading" data-pb-tag="level" data-pb-text="text">Title</h2>`,
    );
    const paragraph = canvas.querySelector<HTMLElement>('[data-pb-id="paragraph"]')!;
    const heading = canvas.querySelector<HTMLElement>('[data-pb-id="heading"]')!;
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 400));
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 400));
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 100, 300, 40));
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 160, 300, 40));

    editor.selectBlock("heading");
    await vi.waitFor(() => expect(toolbar().hidden).toBe(false));
    vi.spyOn(toolbar(), "getBoundingClientRect").mockReturnValue(new DOMRect(20, 50, 400, 40));

    paragraph.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 100, clientY: 120 }),
    );

    const label = chrome().querySelector<HTMLElement>(".pbe-hover-label")!;
    expect(label.hidden).toBe(false);
    expect(label.dataset.target).toBe("paragraph");
    expect(Number.parseFloat(label.style.top) + label.offsetHeight).toBeLessThanOrEqual(46);
  });

  test("the hover label moves above the visible add-block sentinel", () => {
    setup(`<p data-pb-block="paragraph" data-pb-id="paragraph" data-pb-rich="body">Body</p>`);
    const paragraph = canvas.querySelector<HTMLElement>('[data-pb-id="paragraph"]')!;
    const appender = chrome().querySelector<HTMLElement>(".pbe-appender")!;
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 400));
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 400));
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 100, 300, 40));
    vi.spyOn(appender, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 75, 300, 24));

    paragraph.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 100, clientY: 105 }),
    );

    const label = chrome().querySelector<HTMLElement>(".pbe-hover-label")!;
    expect(appender.style.visibility).toBe("visible");
    expect(label.dataset.target).toBe("paragraph");
    expect(Number.parseFloat(label.style.top) + label.offsetHeight).toBeLessThanOrEqual(71);
  });

  test("a rounded button's transparent corner preselects and selects its Buttons parent", () => {
    setup(
      `<div data-pb-block="buttons" data-pb-id="buttons" data-pb-children>` +
        `<a data-pb-block="button" data-pb-id="button" data-pb-rich="label" data-pb-link="url" href="#" style="border-radius:20px">Action</a>` +
        `</div>`,
    );
    const group = canvas.querySelector<HTMLElement>('[data-pb-id="buttons"]')!;
    const button = canvas.querySelector<HTMLElement>('[data-pb-id="button"]')!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 300));
    vi.spyOn(group, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 220, 60));
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 100, 40));

    button.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 101, clientY: 101 }),
    );
    expect(chrome().querySelector<HTMLElement>(".pbe-hover-outline")!.dataset.target).toBe(
      "buttons",
    );

    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 101,
      clientY: 101,
    });
    button.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(editor.selection.blocks).toEqual(["buttons"]);
  });

  test("nested blocks remain inspectable after selecting their parent, including margin and padding", () => {
    setup(
      `<div data-pb-block="group" data-pb-id="group" data-pb-children>` +
        `<p data-pb-block="paragraph" data-pb-id="paragraph" data-pb-rich="body" style="margin-bottom:20px">Body</p>` +
        `<h2 data-pb-block="heading" data-pb-id="heading" data-pb-tag="level" data-pb-text="text">Title</h2>` +
        `</div>`,
    );
    const group = canvas.querySelector<HTMLElement>('[data-pb-id="group"]')!;
    const paragraph = canvas.querySelector<HTMLElement>('[data-pb-id="paragraph"]')!;
    const heading = canvas.querySelector<HTMLElement>('[data-pb-id="heading"]')!;
    paragraph.style.marginBottom = "20px";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 400));
    vi.spyOn(group, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 400, 300));
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(60, 60, 240, 40));
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(new DOMRect(60, 140, 240, 40));
    const target = () => chrome().querySelector<HTMLElement>(".pbe-hover-outline")!.dataset.target;
    const move = (x: number, y: number) =>
      group.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y }),
      );

    editor.selectBlock("group");

    move(100, 80); // nested content, despite the parent already being selected
    expect(target()).toBe("paragraph");

    move(100, 110); // the paragraph's bottom margin
    expect(target()).toBe("paragraph");

    move(30, 220); // otherwise-empty group padding
    expect(target()).toBe("group");
  });

  test("flex space between child blocks resolves to their container", () => {
    setup(
      `<div data-pb-block="buttons" data-pb-id="buttons" data-pb-children>` +
        `<a data-pb-block="button" data-pb-id="one" data-pb-rich="label" data-pb-link="url" href="#">One</a>` +
        `<a data-pb-block="button" data-pb-id="two" data-pb-rich="label" data-pb-link="url" href="#">Two</a>` +
        `</div>`,
    );
    const group = canvas.querySelector<HTMLElement>('[data-pb-id="buttons"]')!;
    const one = canvas.querySelector<HTMLElement>('[data-pb-id="one"]')!;
    const two = canvas.querySelector<HTMLElement>('[data-pb-id="two"]')!;
    group.style.display = "flex";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 300));
    vi.spyOn(group, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 400, 80));
    vi.spyOn(one, "getBoundingClientRect").mockReturnValue(new DOMRect(60, 40, 80, 40));
    vi.spyOn(two, "getBoundingClientRect").mockReturnValue(new DOMRect(180, 40, 80, 40));

    group.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 160, clientY: 60 }),
    );
    expect(chrome().querySelector<HTMLElement>(".pbe-hover-outline")!.dataset.target).toBe(
      "buttons",
    );
    expect(chrome().querySelector<HTMLElement>(".pbe-hover-outline")!.dataset.layout).toBe("flex");
    expect(chrome().querySelectorAll(".pbe-hover-layout-item")).toHaveLength(2);
    const gap = [...chrome().querySelectorAll<HTMLElement>(".pbe-hover-layout-gap")].find(
      (candidate) => candidate.style.left === "120px",
    )!;
    expect(gap.style.left).toBe("120px");
    expect(gap.style.width).toBe("40px");
  });

  test("column flex hover uses full-width item slots and free-space bands", () => {
    setup(
      `<div data-pb-block="group" data-pb-id="stack" data-pb-children>` +
        `<p data-pb-block="paragraph" data-pb-id="one" data-pb-rich="body">One</p>` +
        `<p data-pb-block="paragraph" data-pb-id="two" data-pb-rich="body">Two</p>` +
        `</div>`,
    );
    const stack = canvas.querySelector<HTMLElement>('[data-pb-id="stack"]')!;
    const one = canvas.querySelector<HTMLElement>('[data-pb-id="one"]')!;
    const two = canvas.querySelector<HTMLElement>('[data-pb-id="two"]')!;
    stack.style.display = "flex";
    stack.style.flexDirection = "column";
    one.style.margin = "0";
    two.style.margin = "0";
    one.style.marginBottom = "20px";
    two.style.marginTop = "20px";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 400));
    vi.spyOn(stack, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 400, 300));
    vi.spyOn(one, "getBoundingClientRect").mockReturnValue(new DOMRect(60, 70, 240, 40));
    vi.spyOn(two, "getBoundingClientRect").mockReturnValue(new DOMRect(60, 150, 300, 60));

    stack.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 30, clientY: 130 }),
    );

    const items = [...chrome().querySelectorAll<HTMLElement>(".pbe-hover-layout-item")];
    const gaps = [...chrome().querySelectorAll<HTMLElement>(".pbe-hover-layout-gap")];
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.style.left === "0px" && item.style.width === "400px")).toBe(
      true,
    );
    expect(items.map((item) => [item.style.top, item.style.height])).toEqual([
      ["50px", "60px"],
      ["110px", "80px"],
    ]); // boundaries follow the touching margin boxes, not inner border boxes
    expect(gaps).toHaveLength(2); // leading + trailing; the inter-item space is margins
    expect(gaps.every((gap) => gap.style.left === "0px" && gap.style.width === "400px")).toBe(true);
  });

  test("grid hover outlines its items and hatches row and column gaps", () => {
    setup(
      `<div data-pb-block="group" data-pb-id="grid" data-pb-children>` +
        `<p data-pb-block="paragraph" data-pb-id="a" data-pb-rich="body">A</p>` +
        `<p data-pb-block="paragraph" data-pb-id="b" data-pb-rich="body">B</p>` +
        `<p data-pb-block="paragraph" data-pb-id="c" data-pb-rich="body">C</p>` +
        `<p data-pb-block="paragraph" data-pb-id="d" data-pb-rich="body">D</p>` +
        `</div>`,
    );
    const grid = canvas.querySelector<HTMLElement>('[data-pb-id="grid"]')!;
    const children = ["a", "b", "c", "d"].map(
      (id) => canvas.querySelector<HTMLElement>(`[data-pb-id="${id}"]`)!,
    );
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "80px 80px";
    grid.style.gridTemplateRows = "40px 40px";
    grid.style.columnGap = "40px";
    grid.style.rowGap = "40px";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 300));
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 300, 200));
    [
      new DOMRect(60, 40, 80, 40),
      new DOMRect(180, 40, 80, 40),
      new DOMRect(60, 120, 80, 40),
      new DOMRect(180, 120, 80, 40),
    ].forEach((rect, index) =>
      vi.spyOn(children[index], "getBoundingClientRect").mockReturnValue(rect),
    );

    grid.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 160, clientY: 60 }),
    );

    const outline = chrome().querySelector<HTMLElement>(".pbe-hover-outline")!;
    expect(outline.dataset.target).toBe("grid");
    expect(outline.dataset.layout).toBe("grid");
    expect(chrome().querySelectorAll(".pbe-hover-layout-item")).toHaveLength(4);
    expect(chrome().querySelectorAll(".pbe-hover-layout-gap")).toHaveLength(2);
  });

  test("placed-pattern content keeps direct editing; isolation enables hover preselection", () => {
    setup(
      `<div data-pb-block="pattern" data-pb-id="pattern" data-pb-pattern="call-to-action" data-pb-children>` +
        `<h2 data-pb-block="heading" data-pb-id="heading" data-pb-tag="level" data-pb-text="text">Title</h2>` +
        `</div>`,
    );
    const heading = canvas.querySelector<HTMLElement>('[data-pb-id="heading"]')!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 300));
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 40, 300, 50));
    const hover = () =>
      heading.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 100, clientY: 60 }),
      );

    hover();
    expect(chrome().querySelector<HTMLElement>(".pbe-hover-outline")!.hidden).toBe(true);

    editor.setPatternsOpaque(false);
    hover();
    expect(chrome().querySelector<HTMLElement>(".pbe-hover-outline")!.dataset.target).toBe(
      "heading",
    );
  });

  test("hovering a block edge reveals a line inserter and inserts at that edge", async () => {
    setup(
      `<p data-pb-block="paragraph" data-pb-id="first" data-pb-rich="body">First</p>` +
        `<p data-pb-block="paragraph" data-pb-id="middle" data-pb-rich="body">Middle</p>` +
        `<p data-pb-block="paragraph" data-pb-id="last" data-pb-rich="body">Last</p>`,
    );
    const middle = canvas.querySelector<HTMLElement>('[data-pb-id="middle"]')!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 10, 500, 300));
    vi.spyOn(
      canvas.querySelector<HTMLElement>('[data-pb-id="first"]')!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(30, 40, 440, 40));
    vi.spyOn(middle, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 120, 440, 40));
    vi.spyOn(
      canvas.querySelector<HTMLElement>('[data-pb-id="last"]')!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(30, 200, 440, 40));

    // The pointer is in the 40px visual gap between the first and middle
    // blocks—not within 12px of either literal element box.
    middle.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }),
    );

    const appender = chrome().querySelector<HTMLButtonElement>(".pbe-appender")!;
    expect(appender.dataset.target).toBe("middle");
    expect(appender.dataset.edge).toBe("before");
    expect(appender.style.width).toBe("440px");

    appender.click();
    const inserter = chrome().querySelector<HTMLElement>(".pbe-inserter")!;
    expect(inserter.hidden).toBe(false);
    inserter.querySelector<HTMLButtonElement>('button[data-type="heading"]')!.click();

    expect(editor.getModel().blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "heading",
      "paragraph",
      "paragraph",
    ]);
    expect(editor.getModel().blocks.map((block) => block.id)).toEqual([
      "first",
      expect.any(String),
      "middle",
      "last",
    ]);
  });

  test("rich text gets inline formats, while alignment is opt-in", async () => {
    setup(
      `<p data-pb-block="paragraph" data-pb-id="p" data-pb-rich="body">Text</p>` +
        `<pre data-pb-block="code" data-pb-id="c" data-pb-text="code">const x = 1;</pre>`,
    );

    editor.selectBlock("p");
    await vi.waitFor(() => expect(toolbar().hidden).toBe(false));
    expect(control("Align text").getClientRects().length).toBeGreaterThan(0);
    expect(control("Bold").getClientRects().length).toBeGreaterThan(0);

    editor.selectBlock("c");
    await vi.waitFor(() => expect(controlRects("Align text")).toBe(0));
    expect(control("Bold").getClientRects().length).toBe(0);
  });

  test("canvas toolbar offers arrow ordering without a drag control", async () => {
    setup(
      `<p data-pb-block="paragraph" data-pb-id="first" data-pb-rich="body">First</p>` +
        `<p data-pb-block="paragraph" data-pb-id="second" data-pb-rich="body">Second</p>`,
    );
    editor.selectBlock("second");
    await vi.waitFor(() => expect(toolbar().hidden).toBe(false));

    expect(toolbar().querySelector('button[aria-label="Drag block"]')).toBeNull();
    expect(control("Move up").hidden).toBe(false);
    control("Move up").click();
    expect(editor.getModel().blocks.map((block) => block.id)).toEqual(["second", "first"]);
  });

  test("heading level is a bound toolbar choice", async () => {
    setup(
      `<h2 data-pb-block="heading" data-pb-id="h" data-pb-tag="level" data-pb-rich="text">Title</h2>`,
    );
    editor.selectBlock("h");
    await vi.waitFor(() => expect(control("Change heading level")).toBeTruthy());

    control("Change heading level").click();
    const panel = chrome().querySelector<HTMLElement>(".pbe-toolbar-options")!;
    expect(panel.contains(chrome().activeElement)).toBe(true);
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect((chrome().activeElement as HTMLButtonElement).textContent).toBe("H2");
    const h3 = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "H3",
    )!;
    h3.click();
    expect(editor.getBlock("h")?.fields.level).toBe("h3");
    expect(control("Bold").getClientRects().length).toBeGreaterThan(0);
  });

  test("style-bound controls use grouped descriptors and the style backend", async () => {
    setup(
      `<div data-pb-block="row" data-pb-id="r" data-pb-tag="tag" data-pb-children>` +
        `<p data-pb-block="paragraph" data-pb-rich="body">Child</p></div>`,
    );
    editor.selectBlock("r");
    await vi.waitFor(() => expect(control("Change justification")).toBeTruthy());
    expect(
      control("Change justification")
        .closest("[data-toolbar-group]")
        ?.getAttribute("data-toolbar-group"),
    ).toBe("block");
    control("Change justification").click();
    let panel = chrome().querySelector<HTMLElement>(".pbe-toolbar-options")!;
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(chrome().activeElement).toBe(control("Change justification"));
    control("Change justification").click();
    panel = chrome().querySelector<HTMLElement>(".pbe-toolbar-options")!;
    const center = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Center",
    )!;
    center.click();
    expect(editor.getStyle("r", "justifyContent")).toBe("center");
    editor.undo();
    expect(editor.getStyle("r", "justifyContent")).toBe("");
  });

  test("Group exposes theme-resolved semantic container widths", async () => {
    setup(
      `<div data-pb-block="group" data-pb-id="g" data-pb-tag="tag" data-pb-children>` +
        `<p data-pb-block="paragraph" data-pb-rich="body">Child</p></div>`,
    );
    editor.selectBlock("g");
    await vi.waitFor(() => expect(controlRects("Container width")).toBe(0));
    expect(controlRects("Bleed")).toBe(0);

    editor.setSetting("g", "isContainer", true);
    await vi.waitFor(() => expect(control("Container width")).toBeTruthy());
    expect(control("Bleed")).toBeTruthy();
    expect(control("Container width").querySelector("svg")).toBeTruthy();
    expect(control("Bleed").querySelector("svg")).toBeTruthy();

    control("Container width").click();
    const panel = chrome().querySelector<HTMLElement>(".pbe-toolbar-options")!;
    expect(panel.textContent).toContain("Content width · Max 645px");
    expect(panel.textContent).toContain("Wide width · Max 1340px");
    expect(panel.querySelectorAll("button svg")).toHaveLength(2);

    const content = [...panel.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.startsWith("Content width"),
    )!;
    content.click();
    control("Bleed").click();
    const bleedPanel = chrome().querySelector<HTMLElement>(".pbe-toolbar-options")!;
    expect(bleedPanel.querySelectorAll("button svg")).toHaveLength(4);
    const right = [...bleedPanel.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Bleed right",
    )!;
    right.click();
    expect(editor.getBlock("g")?.settings).toEqual({
      isContainer: true,
      containerWidth: "content",
      containerBleed: "right",
    });
    expect(canvas.querySelector('[data-pb-id="g"]')?.classList).toContain("pbe-container--content");
    expect(canvas.querySelector('[data-pb-id="g"]')?.classList).toContain(
      "pbe-container--bleed-right",
    );
  });

  test("Group wrapping is a direct toolbar toggle", async () => {
    setup(
      `<div data-pb-block="group" data-pb-id="g" data-pb-children class="flex flex-row">` +
        `<p data-pb-block="paragraph" data-pb-rich="body">Child</p></div>`,
    );
    editor.selectBlock("g");
    await vi.waitFor(() => expect(control("Wrap")).toBeTruthy());
    expect(control("Wrap").getAttribute("aria-pressed")).toBe("false");
    const noWrapIcon = control("Wrap").innerHTML;

    control("Wrap").click();
    expect(editor.getStyle("g", "flexWrap")).toBe("wrap");
    await vi.waitFor(() => expect(control("Wrap").getAttribute("aria-pressed")).toBe("true"));
    expect(control("Wrap").innerHTML).not.toBe(noWrapIcon);

    control("Wrap").click();
    expect(editor.getStyle("g", "flexWrap")).toBe("");
  });

  test("the options menu duplicates and removes through editor history", async () => {
    setup(`<p data-pb-block="paragraph" data-pb-id="p" data-pb-rich="body">Text</p>`);
    editor.selectBlock("p");
    await vi.waitFor(() => expect(control("Options")).toBeTruthy());

    control("Options").click();
    const menu = chrome().querySelector<HTMLElement>(".pbe-more")!;
    const duplicate = [...menu.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Duplicate",
    )!;
    duplicate.click();
    expect(editor.getModel().blocks).toHaveLength(2);
    expect(editor.getModel().blocks[1].fields.body).toBe("Text");
    expect(editor.getModel().blocks[1].id).not.toBe("p");

    const copiedId = editor.getModel().blocks[1].id;
    expect(editor.removeBlock(copiedId)).toBe(true);
    expect(editor.getModel().blocks).toHaveLength(1);
    editor.undo();
    expect(editor.getModel().blocks).toHaveLength(2);
  });

  test("alignment, text, and options popovers return focus on Escape", async () => {
    setup(
      `<p data-pb-block="paragraph" data-pb-id="p" data-pb-rich="body">Text</p>` +
        `<span data-pb-block="icon" data-pb-id="i" data-pb-rich="svg"><svg></svg></span>`,
    );
    editor.selectBlock("p");
    await vi.waitFor(() => expect(control("Align text")).toBeTruthy());
    const align = control("Align text");
    align.click();
    chrome()
      .querySelector<HTMLElement>(".pbe-align")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(chrome().activeElement).toBe(align);

    const options = control("Options");
    options.click();
    chrome()
      .querySelector<HTMLElement>(".pbe-more")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(chrome().activeElement).toBe(options);

    options.blur();
    editor.selectBlock("i");
    await vi.waitFor(() => expect(control("Accessible label")).toBeTruthy());
    const label = control("Accessible label");
    label.click();
    const dialog = chrome().querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Accessible label"]',
    )!;
    expect(dialog.contains(chrome().activeElement)).toBe(true);
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(chrome().activeElement).toBe(label);
  });

  test("resetStyles clears supported values atomically", () => {
    setup(`<p data-pb-block="paragraph" data-pb-id="p" data-pb-rich="body">Text</p>`);
    editor.setStyle("p", "fontSize", "lg");
    editor.setStyle("p", "padding", "4");

    expect(editor.resetStyles("p")).toBe(true);
    expect(editor.getStyle("p", "fontSize")).toBe("");
    expect(editor.getStyle("p", "padding")).toBe("");
    editor.undo();
    expect(editor.getStyle("p", "fontSize")).toBe("lg");
    expect(editor.getStyle("p", "padding")).toBe("4");
  });

  test("settings sections reset only their declared role", () => {
    setup(`<p data-pb-block="paragraph" data-pb-id="p" data-pb-rich="body">Text</p>`);
    editor.setSetting("p", "dropCap", true);
    editor.setSetting("p", "direction", "rtl");
    expect(editor.resetSettings("p", "design")).toBe(true);
    expect(editor.getBlock("p")?.settings).toEqual({ direction: "rtl" });
    editor.undo();
    expect(editor.getBlock("p")?.settings).toEqual({
      dropCap: true,
      direction: "rtl",
    });
  });

  test("container toolbars append declared child types", async () => {
    setup(
      `<figure data-pb-block="gallery" data-pb-id="g"><div data-pb-children></div>` +
        `<figcaption data-pb-rich="caption"></figcaption></figure>`,
    );
    editor.selectBlock("g");
    await vi.waitFor(() => expect(control("Add image").getClientRects().length).toBeGreaterThan(0));
    control("Add image").click();
    expect(editor.getBlock("g")?.children).toHaveLength(1);
    expect(editor.getBlock("g")?.children?.[0].type).toBe("image");
    editor.undo();
    expect(editor.getBlock("g")?.children).toHaveLength(0);
  });

  test("the spacer resize handle commits one undoable custom height", async () => {
    setup(`<div data-pb-block="spacer" data-pb-id="s" aria-hidden="true"></div>`);
    editor.selectBlock("s");
    const handle = chrome().querySelector<HTMLButtonElement>(".pbe-spacer-handle")!;
    await vi.waitFor(() => expect(handle.hidden).toBe(false));
    handle.setPointerCapture = () => undefined;
    const startHeight = canvas
      .querySelector<HTMLElement>('[data-pb-id="s"]')!
      .getBoundingClientRect().height;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientY: 100,
      }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientY: 140,
      }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientY: 140,
      }),
    );
    expect(editor.getStyle("s", "height")).toBe(`${Math.round(startHeight + 40)}px`);
    editor.undo();
    expect(editor.getStyle("s", "height")).toBe("");
  });

  const IMAGE_HTML =
    `<figure data-pb-block="image" data-pb-id="i">` +
    `<img data-pb-image="image" src="/x.png" width="200" height="100" class="block max-w-full">` +
    `<figcaption data-pb-rich="caption"></figcaption></figure>`;

  const dragImageHandle = (
    handle: HTMLButtonElement,
    axis: "clientX" | "clientY",
    from: number,
    to: number,
  ) => {
    handle.setPointerCapture = () => undefined;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        [axis]: from,
      }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        [axis]: to,
      }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        [axis]: to,
      }),
    );
  };

  test("the image width handle commits width + height:auto in one undo step", async () => {
    setup(IMAGE_HTML);
    editor.selectBlock("i");
    const handle = chrome().querySelector<HTMLButtonElement>(".pbe-image-width-handle")!;
    await vi.waitFor(() => expect(handle.hidden).toBe(false));
    expect(handle.dataset.edge).toBe("right");
    const startWidth = canvas.querySelector("img")!.getBoundingClientRect().width;
    dragImageHandle(handle, "clientX", 300, 340);
    expect(editor.getStyle("i", "width")).toBe(`${Math.round(startWidth + 40)}px`);
    expect(editor.getStyle("i", "height")).toBe("auto");
    editor.undo();
    expect(editor.getStyle("i", "width")).toBe("");
    expect(editor.getStyle("i", "height")).toBe("");
  });

  test("the bottom handle scales by height, keeping the natural ratio", async () => {
    setup(IMAGE_HTML);
    editor.selectBlock("i");
    const handle = chrome().querySelector<HTMLButtonElement>(".pbe-image-height-handle")!;
    await vi.waitFor(() => expect(handle.hidden).toBe(false));
    // 200×100 → dragging the bottom edge +50 targets height 150 → width 300.
    dragImageHandle(handle, "clientY", 200, 250);
    expect(editor.getStyle("i", "width")).toBe("300px");
    expect(editor.getStyle("i", "height")).toBe("auto");
  });

  test("resizing replaces an authored w-full instead of shadowing it", async () => {
    // The Logo-cloud pattern authors `w-full` on its imgs — a committed
    // `w-[…px]` must REPLACE it, or the resize never sticks.
    setup(
      `<figure data-pb-block="image" data-pb-id="i">` +
        `<img data-pb-image="image" src="/x.png" width="200" height="100" class="block max-w-full w-full object-contain">` +
        `<figcaption data-pb-rich="caption"></figcaption></figure>`,
    );
    expect(editor.getStyle("i", "width")).toBe("full");
    editor.selectBlock("i");
    const handle = chrome().querySelector<HTMLButtonElement>(".pbe-image-width-handle")!;
    await vi.waitFor(() => expect(handle.hidden).toBe(false));
    const startWidth = canvas.querySelector("img")!.getBoundingClientRect().width;
    dragImageHandle(handle, "clientX", 300, 260);
    expect(editor.getStyle("i", "width")).toBe(`${Math.round(startWidth - 40)}px`);
    const cls = canvas.querySelector("img")!.classList;
    expect(cls.contains("w-full")).toBe(false);
    expect(cls.contains("max-w-full")).toBe(true); // the responsive baseline survives
  });

  test("a clipped right edge hands resizing to the left edge, still left-anchored", async () => {
    setup(IMAGE_HTML);
    // Make the image overflow the viewport: the canvas (and so the figure)
    // is wider than the window, the img fills it.
    canvas.style.width = "5000px";
    canvas.querySelector("img")!.setAttribute("width", "5000");
    editor.selectBlock("i");
    const handle = chrome().querySelector<HTMLButtonElement>(".pbe-image-width-handle")!;
    await vi.waitFor(() => expect(handle.hidden).toBe(false));
    expect(handle.dataset.edge).toBe("left");
    const startWidth = canvas.querySelector("img")!.getBoundingClientRect().width;
    // Left handle: dragging toward the image (right) SHRINKS it; the left
    // edge stays put (left-aligned).
    dragImageHandle(handle, "clientX", 100, 140);
    expect(editor.getStyle("i", "width")).toBe(`${Math.round(startWidth - 40)}px`);
    expect(editor.getStyle("i", "height")).toBe("auto");
    const rect = canvas.querySelector("img")!.getBoundingClientRect();
    const figure = canvas.querySelector("figure")!.getBoundingClientRect();
    expect(Math.round(rect.left)).toBe(Math.round(figure.left));
  });

  test("a ratio preset suppresses the image resize handles", async () => {
    setup(IMAGE_HTML);
    editor.setSetting("i", "aspectRatio", "16-9");
    editor.selectBlock("i");
    await vi.waitFor(() => expect(toolbar().hidden).toBe(false));
    expect(chrome().querySelector<HTMLButtonElement>(".pbe-image-width-handle")!.hidden).toBe(true);
    expect(chrome().querySelector<HTMLButtonElement>(".pbe-image-height-handle")!.hidden).toBe(
      true,
    );
  });

  test("a pattern converts to blocks instead of exposing Ungroup", async () => {
    setup(`<p data-pb-block="paragraph" data-pb-id="seed" data-pb-rich="body"></p>`);
    const [root] = editor.insertPattern("hero")!;
    const published = editor.serialize({ pipeline: "data" });

    expect(editor.ungroupTarget(root.id)).toBeNull();
    expect(editor.ungroupBlock(root.id)).toBe(false);
    editor.selectBlock(root.id);
    await vi.waitFor(() => expect(control("Options").getClientRects().length).toBeGreaterThan(0));
    control("Options").click();

    const menu = chrome().querySelector<HTMLElement>(".pbe-more")!;
    const byText = (text: string) =>
      [...menu.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === text,
      )!;
    expect(byText("Ungroup").hidden).toBe(true);
    expect(byText("Convert to blocks").hidden).toBe(false);

    byText("Convert to blocks").click();
    expect(editor.getBlock(root.id)).toBeUndefined();
    expect(editor.serialize({ pipeline: "data" })).toBe(published);
    editor.undo();
    expect(editor.getBlock(root.id)?.pattern).toBe("hero");
  });

  test("legacy pattern provenance on a real group also replaces Ungroup", async () => {
    setup(
      `<div data-pb-block="group" data-pb-id="legacy" data-pb-pattern="hero" data-pb-tag="tag" data-pb-children>` +
        `<p data-pb-block="paragraph" data-pb-rich="body">Legacy content</p></div>`,
    );
    const published = editor.serialize({ pipeline: "data" });
    editor.selectBlock("legacy");
    await vi.waitFor(() => expect(control("Options").getClientRects().length).toBeGreaterThan(0));
    control("Options").click();

    const menu = chrome().querySelector<HTMLElement>(".pbe-more")!;
    const byText = (text: string) =>
      [...menu.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === text,
      )!;
    expect(byText("Ungroup").hidden).toBe(true);
    expect(byText("Convert to blocks").hidden).toBe(false);

    byText("Convert to blocks").click();
    expect(editor.getBlock("legacy")?.type).toBe("group");
    expect(editor.getBlock("legacy")?.pattern).toBeUndefined();
    expect(editor.serialize({ pipeline: "data" })).toBe(published);
    expect(editor.ungroupTarget("legacy")).toBe("legacy");
  });

  test("pattern descendants use the content-only toolbar variant", async () => {
    const seen: [string, string][] = [];
    setup(`<p data-pb-block="paragraph" data-pb-id="seed" data-pb-rich="body"></p>`, (name, id) =>
      seen.push([name, id]),
    );
    const [root] = editor.insertPattern("hero")!;
    const paragraph = flattenBlocks(root.children ?? []).find(
      (block) => block.type === "paragraph",
    )!;

    editor.selectBlock(paragraph.id);
    await vi.waitFor(() => expect(toolbar().hidden).toBe(false));
    expect(editor.editingMode(paragraph.id)).toBe("content-only");
    expect(editor.canDuplicate(paragraph.id)).toBe(false);
    expect(editor.canRemove(paragraph.id)).toBe(false);
    expect(control("Move up").getClientRects().length).toBe(0);
    expect(controlRects("Align text")).toBe(0);
    expect(control("Bold").getClientRects().length).toBeGreaterThan(0);

    const edit = [...toolbar().querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Edit pattern",
    )!;
    expect(edit.closest<HTMLElement>("div")!.hidden).toBe(true);
    expect(seen).toEqual([]);

    editor.selectBlock(root.id);
    await vi.waitFor(() => expect(edit.closest<HTMLElement>("div")!.hidden).toBe(false));
    edit.click();
    expect(seen).toEqual([["hero", root.id]]);
  });
});
