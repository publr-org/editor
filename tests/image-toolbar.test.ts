// Per-block-type floating toolbar (registry `toolbar` + chrome-inline): the
// image block swaps the generic align/format strip for Replace / Link /
// Caption controls. Covers the registration validation, the showCaption render
// gate, and the chrome that renders the controls.

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  attachInlineChrome,
  createEditor,
  downcast,
  getBlockType,
  registerBlock,
  unregisterBlock,
  upcast,
} from "../src/index";
import type { BlockDefinition, Editor, InlineChromeOptions } from "../src/index";
import { registerCoreBlocks } from "../src/blocks";

beforeAll(() => registerCoreBlocks());

const parse = (html: string): HTMLElement => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d;
};

// A minimal image-shaped block for validation tests: pic (image), cap (rich),
// href + show island settings — the surface the toolbar controls bind to.
const imgLike = (type: string, toolbar: unknown): BlockDefinition => ({
  label: type,
  settings: [
    { control: "text", label: "URL", setting: "href", default: "" },
    { control: "toggle", label: "Cap", setting: "show", default: false },
  ],
  toolbar: toolbar as BlockDefinition["toolbar"],
  render: (f, s) => {
    const cap = typeof f.cap === "string" ? f.cap : "";
    const show = s === undefined || s.show === true || cap.trim() !== "";
    return `<figure data-pb-block="${type}"><img data-pb-image="pic" src="" alt="">${show ? `<figcaption data-pb-rich="cap">${cap}</figcaption>` : ""}</figure>`;
  },
});

describe("registry: toolbar control validation", () => {
  const registered: string[] = [];
  const ok = (type: string, toolbar: unknown) => {
    registerBlock(type, imgLike(type, toolbar));
    registered.push(type);
  };
  afterEach(() => {
    for (const t of registered.splice(0)) unregisterBlock(t);
  });

  test("the core image block ships a validated toolbar (replace / link / caption)", () => {
    const t = getBlockType("image")!.toolbar!;
    expect(t.map((c) => c.control)).toEqual(["replace", "link", "caption", "toggle-setting"]);
    expect(t.find((c) => c.control === "caption")).toMatchObject({
      field: "caption",
      setting: "showCaption",
    });
  });

  test("a well-formed toolbar registers and freezes onto the type", () => {
    ok("tb-good", [
      { control: "replace", label: "Replace", field: "pic" },
      { control: "link", label: "Link", setting: "href" },
      { control: "caption", label: "Caption", field: "cap", setting: "show" },
    ]);
    expect(getBlockType("tb-good")!.toolbar).toHaveLength(3);
    expect(Object.isFrozen(getBlockType("tb-good")!.toolbar![0])).toBe(true);
  });

  test("style-bound choices require a supported style property", () => {
    registerBlock("tb-style", {
      label: "Style toolbar",
      supports: { typography: { textAlign: true } },
      toolbar: [
        {
          control: "style-options",
          label: "Alignment",
          style: "textAlign",
          options: [{ value: "center", label: "Center" }],
        },
      ],
      render: () => `<p data-pb-block="tb-style" data-pb-rich="body"></p>`,
    });
    registered.push("tb-style");
    expect(getBlockType("tb-style")!.toolbar![0]).toMatchObject({
      style: "textAlign",
      role: "design",
      group: "block",
    });
    expect(() =>
      registerBlock("tb-bad", {
        label: "Bad",
        toolbar: [
          {
            control: "style-options",
            label: "Gap",
            style: "gap",
            options: [{ value: "2", label: "2" }],
          },
        ],
        render: () => `<div data-pb-block="tb-bad"></div>`,
      }),
    ).toThrow(/not supported/);
  });

  test("rejects unknown controls, mis-kinded fields, undeclared settings, and stray keys", () => {
    const bad = (toolbar: unknown) =>
      expect(() => registerBlock("tb-bad", imgLike("tb-bad", toolbar))).toThrow();

    bad([{ control: "bogus", label: "x" }]); // unknown control
    bad([{ control: "replace", label: "x", field: "cap" }]); // replace wants an image field
    bad([{ control: "replace", label: "x", field: "missing" }]); // no such field
    bad([{ control: "caption", label: "x", field: "pic", setting: "show" }]); // caption wants a rich field
    bad([{ control: "caption", label: "x", field: "cap", setting: "href" }]); // href isn't boolean
    bad([{ control: "link", label: "x", setting: "nope" }]); // undeclared island setting
    bad([{ control: "link", label: "x", setting: "href", targetSetting: "nope" }]); // undeclared target
    bad([{ control: "replace", label: "x", field: "pic", setting: "show" }]); // stray key
    bad([{ control: "add-child", label: "Add", type: "image" }]); // leaf has no child slot
    // none of the rejects leaked into the registry
    expect(getBlockType("tb-bad")).toBeUndefined();
  });
});

describe("image: showCaption render gate", () => {
  const F = (extra = "") =>
    `<figure data-pb-block="image" data-pb-id="b1"${extra}><img data-pb-image="image" src="/a.jpg" alt="">`;

  test("a caption with content always renders (no island needed)", () => {
    const doc = parse(F() + `<figcaption data-pb-rich="caption">Hi there</figcaption></figure>`);
    const model = upcast(doc);
    const html = downcast(model);
    expect(html).toContain("<figcaption");
    expect(html).toContain("Hi there");
    // no showCaption island is needed when content already forces it visible
    expect(model.blocks[0].settings?.showCaption).toBeUndefined();
  });

  test("an empty image renders NO figcaption, and the round-trip stays clean", () => {
    const doc = parse(F() + `<figcaption data-pb-rich="caption"></figcaption></figure>`);
    const model = upcast(doc);
    const html = downcast(model);
    expect(html).not.toContain("figcaption");
    expect(upcast(parse(html))).toEqual(model); // law holds with the caption hidden
  });

  test("showCaption:true renders the empty figcaption carrier and round-trips via the island", () => {
    const doc = parse(
      F() +
        `<figcaption data-pb-rich="caption"></figcaption></figure>` +
        `<script type="application/json" data-pb-settings>{"showCaption":true}</script>`,
    );
    // island can sit anywhere scoped to the root — re-home it inside for upcast
    const fig = doc.querySelector("figure")!;
    fig.appendChild(doc.querySelector("script")!);
    const model = upcast(doc);
    expect(model.blocks[0].settings?.showCaption).toBe(true);
    const html = downcast(model);
    expect(html).toContain("<figcaption");
    expect(upcast(parse(html))).toEqual(model);
  });
});

describe("chrome: the image floating toolbar", () => {
  let host!: HTMLElement;
  let canvas!: HTMLElement;
  let editor!: Editor;
  let detach!: () => void;

  const IMG = `<figure data-pb-block="image" data-pb-id="img1"><img data-pb-image="image" src="/a.jpg" alt=""><figcaption data-pb-rich="caption">A caption</figcaption></figure>`;

  function setup(html: string, media?: InlineChromeOptions["media"]) {
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
  });

  const toolbar = () => host.querySelector<HTMLElement>(".pbe-toolbar")!;
  const byLabel = (label: string) =>
    toolbar().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  test("selecting an image shows Replace/Link/Caption and hides generic alignment", async () => {
    setup(IMG);
    editor.selectBlock("img1");
    await vi.waitFor(() => expect(toolbar().hidden).toBe(false));

    // the image's own controls are present…
    expect(byLabel("Replace")).toBeTruthy();
    expect(byLabel("Link")).toBeTruthy();
    expect(byLabel("Caption")).toBeTruthy();
    // …and the generic alignment dropdown is not shown (its segment collapses)
    expect(byLabel("Align text")).toBeNull();
  });

  test("the Caption toggle is lit for a captioned image and clears it when toggled off", async () => {
    setup(IMG);
    editor.selectBlock("img1");
    await vi.waitFor(() => expect(byLabel("Caption")).toBeTruthy());
    const cap = byLabel("Caption")!;
    // captioned → the toggle reads as ON (Publr DS accent surface)
    expect(cap.classList.contains("bg-ui-accent")).toBe(true);

    cap.click(); // toggle off → clears content + hides the figcaption
    expect(editor.getBlock("img1")!.fields.caption).toBe("");
    // showCaption:false is the default, so setSetting stores it SPARSELY (the
    // key is deleted) — the effective value is off either way.
    expect(editor.getBlock("img1")!.settings?.showCaption).toBeFalsy();
    expect(canvas.querySelector("[data-pb-id='img1'] figcaption")).toBeFalsy();
  });

  test("the Replace dropdown opens with the current source and a Reset action", async () => {
    setup(IMG);
    editor.selectBlock("img1");
    await vi.waitFor(() => expect(byLabel("Replace")).toBeTruthy());
    byLabel("Replace")!.click();
    const panel = host.querySelector<HTMLElement>(".pbe-replace")!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("Insert from URL");
    expect(panel.textContent).toContain("Reset");
    expect(panel.querySelector("a")?.getAttribute("href")).toBe("/a.jpg");
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(byLabel("Replace"));
  });

  test("the Replace dropdown's Media Library entry browses with the CURRENT value", async () => {
    const browse = vi.fn().mockResolvedValue({
      src: "/cms/media/swap.png",
      alt: "Swapped",
      width: "10",
      height: "20",
    });
    const upload = vi.fn().mockResolvedValue({ src: "/unused.png" });
    setup(IMG, { browse, upload });
    editor.selectBlock("img1");
    await vi.waitFor(() => expect(byLabel("Replace")).toBeTruthy());
    byLabel("Replace")!.click();
    const panel = host.querySelector<HTMLElement>(".pbe-replace")!;
    // adapter affordances render alongside the built-ins, library first
    const items = [...panel.querySelectorAll("button, label")].map((b) => b.textContent!.trim());
    expect(items[0]).toBe("Media Library");
    expect(panel.textContent).toContain("Upload");
    panel.querySelector<HTMLButtonElement>(".pbe-replace-browse")!.click();
    expect(panel.hidden).toBe(true); // panel closes on pick
    await vi.waitFor(() =>
      expect(browse).toHaveBeenCalledWith({ src: "/a.jpg", alt: "", width: "", height: "" }),
    );
    await vi.waitFor(() =>
      expect(editor.getBlock("img1")!.fields.image).toEqual({
        src: "/cms/media/swap.png",
        alt: "Swapped",
        width: "10",
        height: "20",
      }),
    );
  });

  test("a Replace-menu upload on a filled image floats a busy pill over the block", async () => {
    let resolveUpload!: (v: { src: string; width: string; height: string }) => void;
    const upload = vi.fn().mockReturnValue(new Promise((r) => (resolveUpload = r)));
    setup(IMG, { upload });
    editor.selectBlock("img1");
    await vi.waitFor(() => expect(byLabel("Replace")).toBeTruthy());
    byLabel("Replace")!.click();
    const fileInput = host.querySelector<HTMLInputElement>(".pbe-replace input[type=file]")!;
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "swap.png", { type: "image/png" }));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    // no placeholder card on a filled field — the floating pill is the feedback
    await vi.waitFor(() => expect(host.querySelector(".pbe-media-busy")).toBeTruthy());
    expect(host.querySelector(".pbe-media-busy")!.textContent).toContain("Uploading…");
    resolveUpload({ src: "/cms/media/swap.png", width: "5", height: "5" });
    await vi.waitFor(() => expect(host.querySelector(".pbe-media-busy")).toBeNull());
    expect(editor.getBlock("img1")!.fields.image).toMatchObject({ src: "/cms/media/swap.png" });
  });

  test("Escape closes the shared link popover and returns focus to its trigger", async () => {
    setup(IMG);
    editor.selectBlock("img1");
    await vi.waitFor(() => expect(byLabel("Link")).toBeTruthy());
    const trigger = byLabel("Link")!;
    trigger.click();
    const panel = host.querySelector<HTMLElement>(".pbe-link")!;
    expect(panel.contains(document.activeElement)).toBe(true);
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(trigger);
    expect(panel.hidden).toBe(true);
  });
});
