// The media placeholder (chrome-inline, stories #365/#366): empty media
// blocks grow a placeholder card — Upload / Insert from URL / drag-drop. The
// card is canvas chrome: the serialized wire never contains it. Upload
// needs a controlling /media/* worker (absent under vitest — gated), so
// these tests cover presence, the URL flow, and wire cleanliness; the
// upload path is exercised end-to-end against the demo via Playwright.

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { attachInlineChrome, createEditor } from "../src/index";
import type { Editor, MediaAdapter } from "../src/index";
import { registerCoreBlocks } from "../src/blocks";

beforeAll(() => registerCoreBlocks());

let host!: HTMLElement;
let canvas!: HTMLElement;
let editor!: Editor;
let detach!: () => void;

function setup(html: string, media?: boolean | MediaAdapter) {
  host = document.createElement("div");
  canvas = document.createElement("main");
  host.appendChild(canvas);
  document.body.appendChild(host);
  editor = createEditor({ canvas, defaultBlock: "paragraph", groupBlock: "group" });
  editor.loadHtml(html);
  detach = attachInlineChrome(editor, { container: host, media });
  return editor;
}

afterEach(() => {
  detach?.();
  editor?.destroy();
  host?.remove();
  document.querySelector("#hostile-media-css")?.remove();
});

const EMPTY_IMAGE = `<figure data-pb-block="image" data-pb-id="b_1"><img data-pb-image="image" src="" alt=""><figcaption data-pb-rich="caption"></figcaption></figure>`;

const card = () => canvas.querySelector<HTMLElement>(".pbe-media-ph");
const cardRoot = () => card()!.shadowRoot!;

describe("media placeholder", () => {
  test("host selectors cannot cross the placeholder's shadow boundary", () => {
    const hostile = document.createElement("style");
    hostile.id = "hostile-media-css";
    hostile.textContent = `
      .pbe-media-ph, .pbe-media-ph * {
        background: rgb(255 0 255) !important;
        color: rgb(0 255 0) !important;
        border-color: rgb(255 0 0) !important;
        font-size: 40px !important;
      }
    `;
    document.head.appendChild(hostile);
    setup(EMPTY_IMAGE);

    const surface = cardRoot().querySelector<HTMLElement>(".card")!;
    const title = cardRoot().querySelector<HTMLElement>(".title")!;
    const action = cardRoot().querySelector<HTMLElement>(".pbe-mph-url-btn")!;
    expect(getComputedStyle(surface).backgroundColor).toBe("rgb(244, 244, 245)");
    expect(getComputedStyle(title).color).toBe("rgb(24, 24, 27)");
    expect(getComputedStyle(action).fontSize).toBe("14px");
  });

  test("an empty image block grows the card; a filled one never does", () => {
    setup(
      EMPTY_IMAGE +
        `<figure data-pb-block="image" data-pb-id="b_2"><img data-pb-image="image" src="/x.png" alt=""><figcaption data-pb-rich="caption"></figcaption></figure>`,
    );
    const cards = canvas.querySelectorAll(".pbe-media-ph");
    expect(cards).toHaveLength(1);
    expect(cards[0].closest("[data-pb-id]")!.getAttribute("data-pb-id")).toBe("b_1");
    expect(cards[0].shadowRoot!.textContent).toContain("Image");
    expect(cards[0].shadowRoot!.textContent).toContain("Insert from URL");
    // no /media/* worker controls a vitest page — Upload stays hidden
    expect(cards[0].shadowRoot!.querySelector<HTMLElement>(".pbe-mph-upload")!.hidden).toBe(true);
  });

  test("Insert from URL writes the field; the card leaves once media is set", async () => {
    setup(EMPTY_IMAGE);
    cardRoot().querySelector<HTMLButtonElement>(".pbe-mph-url-btn")!.click();
    const row = cardRoot().querySelector<HTMLFormElement>(".pbe-mph-url-row")!;
    expect(row.hidden).toBe(false);
    row.querySelector("input")!.value = "  https://pics.test/a.png ";
    row.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(editor.getBlock("b_1")!.fields.image).toEqual({
      src: "https://pics.test/a.png",
      alt: "",
      width: "",
      height: "",
    });
    await vi.waitFor(() => expect(card()).toBeNull()); // model change → re-render → re-sync
  });

  test("clearing the media brings the card back", async () => {
    setup(EMPTY_IMAGE);
    editor.setField("b_1", "image", { src: "/x.png", alt: "", width: "", height: "" });
    await vi.waitFor(() => expect(card()).toBeNull());
    editor.setField("b_1", "image", { src: "", alt: "", width: "", height: "" });
    await vi.waitFor(() => expect(card()).not.toBeNull());
  });

  test("the card is chrome only — the wire never carries it", () => {
    setup(EMPTY_IMAGE);
    expect(card()).not.toBeNull();
    expect(editor.serialize()).not.toContain("pbe-media-ph");
    expect(editor.serialize({ pipeline: "data" })).not.toContain("pbe-media-ph");
  });

  test("every media block type grows the card next to ITS empty carrier", () => {
    setup(
      `<figure data-pb-block="video" data-pb-id="b_v"><video data-pb-image="video" src="" alt=""></video><figcaption data-pb-rich="caption"></figcaption></figure>` +
        `<div data-pb-block="media-text" data-pb-id="b_m"><div><img data-pb-image="media" src="" alt=""></div><div data-pb-children><p data-pb-block="paragraph" data-pb-id="b_p" data-pb-rich="body">side</p></div></div>` +
        `<figure data-pb-block="embed" data-pb-id="b_e"><iframe data-pb-image="media" src=""></iframe><figcaption data-pb-rich="caption"></figcaption></figure>`,
    );
    expect(canvas.querySelectorAll(".pbe-media-ph")).toHaveLength(3);
    // the media-text card sits in the MEDIA column, not the grid root
    const mt = canvas.querySelector('[data-pb-id="b_m"] .pbe-media-ph')!;
    expect(mt.previousElementSibling!.tagName).toBe("IMG");
  });
});

// ---------------------------------------------------------------------------

describe("media adapter (host upload/browse seam)", () => {
  const pickFile = (input: HTMLInputElement, file: File) => {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  /** A real decodable PNG for the dimension-probe fallback. */
  const pngFile = async (w: number, h: number): Promise<File> => {
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d")!.fillRect(0, 0, w, h);
    const blob = await c.convertToBlob({ type: "image/png" });
    return new File([blob], "probe.png", { type: "image/png" });
  };

  test("a host upload() makes Upload available without any service worker", () => {
    const upload = vi.fn().mockResolvedValue({ src: "/cms/media/a.png" });
    setup(EMPTY_IMAGE, { upload });
    expect(cardRoot().querySelector<HTMLElement>(".pbe-mph-upload")!.hidden).toBe(false);
    expect(cardRoot().querySelector(".pbe-mph-browse")).toBeNull(); // no browse() → no button
  });

  test("Upload routes the file through the adapter; its result lands in the field", async () => {
    const upload = vi.fn().mockResolvedValue({
      src: "/cms/media/a.png",
      alt: "From host",
      width: 640,
      height: 480,
    });
    setup(EMPTY_IMAGE, { upload });
    const file = new File(["x"], "a.png", { type: "image/png" });
    pickFile(cardRoot().querySelector<HTMLInputElement>("input[type=file]")!, file);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledWith(file));
    await vi.waitFor(() =>
      expect(editor.getBlock("b_1")!.fields.image).toEqual({
        src: "/cms/media/a.png",
        alt: "From host",
        width: "640",
        height: "480",
      }),
    );
    await vi.waitFor(() => expect(card()).toBeNull());
  });

  test("dimensions missing from the adapter result are probed from the file", async () => {
    const upload = vi.fn().mockResolvedValue({ src: "/cms/media/probe.png" });
    setup(EMPTY_IMAGE, { upload });
    pickFile(cardRoot().querySelector<HTMLInputElement>("input[type=file]")!, await pngFile(3, 2));
    await vi.waitFor(() =>
      expect(editor.getBlock("b_1")!.fields.image).toEqual({
        src: "/cms/media/probe.png",
        alt: "",
        width: "3",
        height: "2",
      }),
    );
  });

  test("browse() renders a Media Library button; the pick lands in the field", async () => {
    const browse = vi.fn().mockResolvedValue({
      src: "/cms/media/lib.png",
      alt: "Library pick",
      width: "800",
      height: "500",
    });
    setup(EMPTY_IMAGE, { browse });
    const btn = cardRoot().querySelector<HTMLButtonElement>(".pbe-mph-browse")!;
    expect(btn.textContent).toBe("Media Library");
    // no upload() on this adapter → the Upload affordance stays hidden
    expect(cardRoot().querySelector<HTMLElement>(".pbe-mph-upload")!.hidden).toBe(true);
    btn.click();
    await vi.waitFor(() => expect(browse).toHaveBeenCalledWith(undefined)); // empty field
    await vi.waitFor(() =>
      expect(editor.getBlock("b_1")!.fields.image).toEqual({
        src: "/cms/media/lib.png",
        alt: "Library pick",
        width: "800",
        height: "500",
      }),
    );
  });

  test("browse() resolving null is a cancel — nothing changes", async () => {
    const browse = vi.fn().mockResolvedValue(null);
    setup(EMPTY_IMAGE, { browse });
    cardRoot().querySelector<HTMLButtonElement>(".pbe-mph-browse")!.click();
    await vi.waitFor(() => expect(browse).toHaveBeenCalled());
    expect(editor.getBlock("b_1")!.fields.image).toEqual({
      src: "",
      alt: "",
      width: "",
      height: "",
    });
    expect(card()).not.toBeNull();
  });

  test("media: false disables Upload AND Media Library; URL insertion stays", () => {
    setup(EMPTY_IMAGE, false);
    expect(cardRoot().querySelector<HTMLElement>(".pbe-mph-upload")!.hidden).toBe(true);
    expect(cardRoot().querySelector(".pbe-mph-browse")).toBeNull();
    expect(cardRoot().querySelector(".pbe-mph-url-btn")).not.toBeNull();
  });

  test("hidden card rows are really display:none without any host preflight", () => {
    // This vitest page ships no preflight [hidden] rule — like a CMS admin
    // page. The chrome must hide its own rows (flex class + hidden attr).
    setup(EMPTY_IMAGE, { upload: vi.fn(), browse: vi.fn() });
    const urlRow = cardRoot().querySelector<HTMLElement>(".pbe-mph-url-row")!;
    const busyRow = cardRoot().querySelector<HTMLElement>(".pbe-mph-busy")!;
    expect(getComputedStyle(urlRow).display).toBe("none");
    expect(getComputedStyle(busyRow).display).toBe("none");
    cardRoot().querySelector<HTMLButtonElement>(".pbe-mph-url-btn")!.click();
    expect(getComputedStyle(urlRow).display).not.toBe("none");
  });

  test("the card shows a spinner row while an upload is in flight", async () => {
    let resolveUpload!: (v: { src: string; width: number; height: number }) => void;
    const upload = vi.fn().mockReturnValue(new Promise((r) => (resolveUpload = r)));
    setup(EMPTY_IMAGE, { upload });
    pickFile(
      cardRoot().querySelector<HTMLInputElement>("input[type=file]")!,
      new File(["x"], "a.png", { type: "image/png" }),
    );
    await vi.waitFor(() => expect(card()!.getAttribute("aria-busy")).toBe("true"));
    const busy = cardRoot().querySelector<HTMLElement>(".pbe-mph-busy")!;
    expect(busy.hidden).toBe(false);
    expect(busy.textContent).toContain("Uploading…");
    resolveUpload({ src: "/cms/media/slow.png", width: 8, height: 6 });
    await vi.waitFor(() => expect(card()).toBeNull()); // resolved → field set → card gone
  });

  test("a failed upload surfaces on the card and leaves the field untouched", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("boom"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    setup(EMPTY_IMAGE, { upload });
    pickFile(
      cardRoot().querySelector<HTMLInputElement>("input[type=file]")!,
      new File(["x"], "a.png", { type: "image/png" }),
    );
    const error = () => cardRoot().querySelector<HTMLElement>(".pbe-mph-error")!;
    await vi.waitFor(() => expect(error().hidden).toBe(false));
    expect(error().textContent).toBe("Upload failed.");
    expect(editor.getBlock("b_1")!.fields.image).toEqual({
      src: "",
      alt: "",
      width: "",
      height: "",
    });
    expect(card()!.getAttribute("aria-busy")).toBeNull(); // busy state released
    // a retry clears the previous failure before it settles
    pickFile(
      cardRoot().querySelector<HTMLInputElement>("input[type=file]")!,
      new File(["y"], "b.png", { type: "image/png" }),
    );
    expect(error().hidden).toBe(true);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    consoleError.mockRestore();
  });

  test("a browse pick with no dimensions probes the source before the single write", async () => {
    // 4×5 PNG as a data URL — decodable by the probe without any server
    const c = new OffscreenCanvas(4, 5);
    c.getContext("2d")!.fillRect(0, 0, 4, 5);
    const blob = await c.convertToBlob({ type: "image/png" });
    const src: string = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
    const browse = vi.fn().mockResolvedValue({ src });
    setup(EMPTY_IMAGE, { browse });
    cardRoot().querySelector<HTMLButtonElement>(".pbe-mph-browse")!.click();
    await vi.waitFor(() =>
      expect(editor.getBlock("b_1")!.fields.image).toEqual({
        src,
        alt: "",
        width: "4",
        height: "5",
      }),
    );
  });
});

// ---------------------------------------------------------------------------

describe("drag-to-replace on image blocks", () => {
  const FILLED = `<figure data-pb-block="image" data-pb-id="b_1"><img data-pb-image="image" src="/old.png" alt="kept"><figcaption data-pb-rich="caption"></figcaption></figure>`;
  const PARAGRAPH = `<p data-pb-block="paragraph" data-pb-id="b_p" data-pb-rich="body">text</p>`;

  const withFile = (file?: File): DataTransfer => {
    const dt = new DataTransfer();
    if (file) dt.items.add(file);
    return dt;
  };
  const drag = (type: string, target: Element, dt: DataTransfer) =>
    target.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }),
    );
  const png = new File(["x"], "new.png", { type: "image/png" });

  test("a file drag over the canvas marks it; every image block highlights via CSS hook", () => {
    setup(FILLED + PARAGRAPH, { upload: vi.fn() });
    drag("dragenter", canvas, withFile(png));
    expect(canvas.classList.contains("pbe-file-drag")).toBe(true);
    // hovering an image block primes exactly that root
    drag("dragover", canvas.querySelector('[data-pb-id="b_1"] img')!, withFile(png));
    expect(canvas.querySelector("[data-pbe-drop-active]")!.getAttribute("data-pb-id")).toBe("b_1");
    // moving off it (over a paragraph) unprimes
    drag("dragover", canvas.querySelector('[data-pb-id="b_p"]')!, withFile(png));
    expect(canvas.querySelector("[data-pbe-drop-active]")).toBeNull();
    // leaving the canvas clears the drag state
    drag("dragleave", canvas, withFile(png));
    expect(canvas.classList.contains("pbe-file-drag")).toBe(false);
  });

  test("without an upload path the drag never lights anything up", () => {
    setup(FILLED, false);
    drag("dragenter", canvas, withFile(png));
    expect(canvas.classList.contains("pbe-file-drag")).toBe(false);
  });

  test("an internal (non-file) drag never lights anything up", () => {
    setup(FILLED, { upload: vi.fn() });
    const dt = new DataTransfer();
    dt.setData("text/plain", "b_1");
    drag("dragenter", canvas, dt);
    expect(canvas.classList.contains("pbe-file-drag")).toBe(false);
  });

  test("dropping on a filled image block uploads and replaces, keeping alt", async () => {
    const upload = vi.fn().mockResolvedValue({ src: "/cms/media/new.png", width: 8, height: 6 });
    setup(FILLED + PARAGRAPH, { upload });
    const img = canvas.querySelector('[data-pb-id="b_1"] img')!;
    drag("dragenter", canvas, withFile(png));
    drag("dragover", img, withFile(png));
    drag("drop", img, withFile(png));
    expect(canvas.classList.contains("pbe-file-drag")).toBe(false); // state clears on drop
    await vi.waitFor(() => expect(upload).toHaveBeenCalledWith(png));
    await vi.waitFor(() =>
      expect(editor.getBlock("b_1")!.fields.image).toEqual({
        src: "/cms/media/new.png",
        alt: "kept",
        width: "8",
        height: "6",
      }),
    );
  });

  test("dropping a non-image file on an image block is a no-op", () => {
    const upload = vi.fn();
    setup(FILLED, { upload });
    const txt = new File(["x"], "notes.txt", { type: "text/plain" });
    drag("drop", canvas.querySelector('[data-pb-id="b_1"] img')!, withFile(txt));
    expect(upload).not.toHaveBeenCalled();
    expect(editor.getBlock("b_1")!.fields.image).toMatchObject({ src: "/old.png" });
  });

  test("dropping outside any image block replaces nothing", () => {
    const upload = vi.fn();
    setup(FILLED + PARAGRAPH, { upload });
    drag("drop", canvas.querySelector('[data-pb-id="b_p"]')!, withFile(png));
    expect(upload).not.toHaveBeenCalled();
  });

  test("the drop-target attribute is chrome only — the wire never carries it", () => {
    setup(FILLED, { upload: vi.fn() });
    drag("dragenter", canvas, withFile(png));
    drag("dragover", canvas.querySelector('[data-pb-id="b_1"] img')!, withFile(png));
    expect(editor.serialize()).not.toContain("data-pbe-drop-active");
    expect(editor.serialize({ pipeline: "data" })).not.toContain("data-pbe-drop-active");
  });
});

// ---------------------------------------------------------------------------

describe("media block selection (regressions)", () => {
  const FILLED_IMAGE = `<figure data-pb-block="image" data-pb-id="b_1"><img data-pb-image="image" src="/x.png" alt=""><figcaption data-pb-rich="caption">cap</figcaption></figure>`;

  const mousedown = (el: Element) =>
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));

  test("clicking the uploaded image selects its block", () => {
    setup(FILLED_IMAGE + `<p data-pb-block="paragraph" data-pb-id="b_p" data-pb-rich="body">t</p>`);
    mousedown(canvas.querySelector('[data-pb-id="b_1"] img')!);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.selection.blocks).toEqual(["b_1"]);
    // a carrier click still routes to the caret, not block selection
    mousedown(canvas.querySelector('[data-pb-id="b_p"]')!);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.selection.blocks).toEqual([]);
  });

  test("clicking sidebar chrome (data-pbe-keep-selection) keeps the block selected", () => {
    setup(FILLED_IMAGE);
    const sidebar = document.createElement("aside");
    sidebar.setAttribute("data-pbe-keep-selection", "");
    const input = document.createElement("input");
    sidebar.appendChild(input);
    document.body.appendChild(sidebar);

    mousedown(canvas.querySelector('[data-pb-id="b_1"] img')!); // the user's gesture
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.selection.blocks).toEqual(["b_1"]);
    mousedown(input); // focusing an option field must not deselect
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.selection.blocks).toEqual(["b_1"]);

    const control = document.createElement("button");
    document.body.appendChild(control);
    mousedown(control); // ordinary controls outside the canvas also preserve context
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.selection.blocks).toEqual(["b_1"]);

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    mousedown(outside); // a genuinely-outside click still deselects
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.selection.blocks).toEqual([]);
    sidebar.remove();
    control.remove();
    outside.remove();
  });
});
