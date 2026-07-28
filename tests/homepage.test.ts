// The manual homepage fixture is a composition of LIVE registered patterns,
// not a second copy of their HTML. These tests read the same Markdown
// directive the demo fixture loader reads and verify the resulting document,
// its wire round-trip, and representative styling behavior.

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  DEFAULT_THEME,
  collectClasses,
  createEditor,
  downcast,
  getPattern,
  httpCssEngine,
  inlineBackend,
  responsiveContainerCss,
  setActiveTheme,
  themeBaseCss,
  upcast,
} from "../src/index";
import { HEARTH_THEME } from "../src/demo-theme";
import type { Block, Model } from "../src/index";
import { registerCoreBlocks } from "../src/blocks";
import { registerHomepagePatterns } from "../src/blocks/homepage-patterns";
import md from "./manual/features/poc-homepage.md?raw";

const configFence = /^```json\r?\n([\s\S]*?)^```/m.exec(md);
const PATTERN_NAMES =
  (configFence ? (JSON.parse(configFence[1]) as { patterns?: string[] }).patterns : undefined) ??
  [];

function parse(html: string): Element {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.querySelector("[data-pb-doc]") ?? tmp;
}

function patternCompositionHtml(names: readonly string[]): string {
  const root = document.createElement("div");
  for (const name of names) {
    const pattern = getPattern(name);
    if (!pattern) throw new Error(`missing homepage pattern: ${name}`);
    const instance = document.createElement("div");
    instance.setAttribute("data-pb-block", "pattern");
    instance.setAttribute("data-pb-pattern", name);
    instance.setAttribute("data-pb-children", "");
    instance.innerHTML = pattern.content;
    root.appendChild(instance);
  }
  return root.innerHTML;
}

function census(blocks: Block[], counts: Record<string, number> = {}): Record<string, number> {
  for (const block of blocks) {
    counts[block.type] = (counts[block.type] ?? 0) + 1;
    if (block.children) census(block.children, counts);
  }
  return counts;
}

describe("POC homepage registered-pattern fixture", () => {
  let html: string;
  let model: Model;

  beforeAll(() => {
    registerCoreBlocks();
    registerHomepagePatterns();
    setActiveTheme(HEARTH_THEME);
    html = patternCompositionHtml(PATTERN_NAMES);
    model = upcast(parse(html));
  });

  afterAll(() => setActiveTheme(DEFAULT_THEME));

  test("the fixture declares the intended five content pattern instances", () => {
    expect(PATTERN_NAMES).toEqual([
      "home-hero",
      "home-giveaway",
      "home-steps",
      "home-community",
      "home-categories",
    ]);
    expect(model.blocks.map((block) => block.pattern)).toEqual(PATTERN_NAMES);
    expect(model.blocks.every((block) => block.type === "pattern")).toBe(true);

    const counts = census(model.blocks);
    expect(counts.pattern).toBe(5);
    expect(counts["raw-html"] ?? 0).toBe(0);
    expect(counts.group).toBeGreaterThanOrEqual(13);
    expect(counts.heading).toBeGreaterThan(10);
    expect(counts.image).toBeGreaterThanOrEqual(6);
  });

  test("every homepage pattern flashes its editable units from its layout surface", () => {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", theme: HEARTH_THEME });
    try {
      editor.loadHtml(html);
      for (const name of PATTERN_NAMES) {
        const root = canvas.querySelector<HTMLElement>(`[data-pb-pattern="${name}"]`)!;
        const layout = root.querySelector<HTMLElement>(":scope > [data-pb-id]")!;
        layout.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
        const flash = document.querySelector<HTMLElement>("[data-pbe-pattern-flash]")!;
        expect(flash, `${name} should create a flash overlay`).toBeTruthy();
        expect(flash.shadowRoot!.querySelectorAll(".veil").length).toBeGreaterThan(0);
        flash.remove();
        layout.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
      }
    } finally {
      editor.destroy();
      canvas.remove();
    }
  });

  test("the round-trip law holds over the composed page", () => {
    expect(upcast(parse(downcast(model)))).toEqual(model);
  });

  test("a self-contained preview carries reset, utilities, and the Hearth theme root", async () => {
    try {
      if (!(await fetch("/__jit", { method: "POST", body: "p-1" })).ok) return;
    } catch {
      return;
    }

    const published = downcast(model, "data");
    const { css } = await httpCssEngine("/__jit?preflight=1").compile(collectClasses(published));
    const themeRoot = inlineBackend.css!(HEARTH_THEME);
    const doc = `<style>${css}\n${themeRoot}</style>${published}`;

    expect(css).toMatch(/\bmargin:\s*0\b/);
    for (const rule of [".bg-brand-surface", ".text-5xl", ".grid", ".rounded-full"])
      expect(css).toContain(rule);
    expect(doc).toContain(":root");
    expect(doc).toContain("--color-brand-surface:");
    expect(published).not.toContain("data-pb-pattern");
  });

  test("a fully-authored button keeps its authored padding/radius", async () => {
    try {
      if (!(await fetch("/__jit", { method: "POST", body: "p-1" })).ok) return;
    } catch {
      return;
    }
    const canvas = document.createElement("main");
    canvas.id = "canvas";
    document.body.appendChild(canvas);
    await import("../src/styles.css");
    const editor = createEditor({ canvas, defaultBlock: "paragraph", theme: DEFAULT_THEME });
    const tag = document.createElement("style");
    try {
      editor.loadHtml(
        `<a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="rounded-md bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white">Get started</a>`,
      );
      tag.textContent = (
        await httpCssEngine("/__jit").compile(collectClasses(editor.serialize()))
      ).css;
      document.head.appendChild(tag);
      const style = getComputedStyle(canvas.querySelector("a")!);
      expect(style.paddingLeft).toBe("14px");
      expect(style.paddingTop).toBe("10px");
    } finally {
      tag.remove();
      editor.destroy();
      canvas.remove();
    }
  });

  test("an enabled container preserves authored padding", async () => {
    try {
      if (!(await fetch("/__jit", { method: "POST", body: "p-1" })).ok) return;
    } catch {
      return;
    }
    const canvas = document.createElement("main");
    canvas.id = "canvas";
    canvas.style.width = "1000px";
    document.body.appendChild(canvas);
    await import("../src/styles.css");
    const editor = createEditor({ canvas, defaultBlock: "paragraph", theme: DEFAULT_THEME });
    const tag = document.createElement("style");
    try {
      editor.loadHtml(
        `<div data-pb-block="group" data-pb-id="active" data-pb-children class="pbe-container--on pbe-container--wide px-8"></div>`,
      );
      tag.textContent = (
        await httpCssEngine("/__jit").compile(collectClasses(editor.serialize()))
      ).css;
      document.head.appendChild(tag);
      const active = canvas.querySelector<HTMLElement>('[data-pb-id="active"]')!;
      expect(getComputedStyle(active).paddingLeft).toBe("32px");
      expect(getComputedStyle(active).paddingRight).toBe("32px");
    } finally {
      tag.remove();
      editor.destroy();
      canvas.remove();
    }
  });

  test("the desktop hero container keeps its two grid tracks while bleeding the media edge", async () => {
    if (!matchMedia("(min-width: 1024px)").matches) return;
    try {
      if (!(await fetch("/__jit", { method: "POST", body: "p-1" })).ok) return;
    } catch {
      return;
    }
    const canvas = document.createElement("main");
    canvas.id = "canvas";
    canvas.style.width = "1200px";
    document.body.appendChild(canvas);
    await import("../src/styles.css");
    const editor = createEditor({ canvas, defaultBlock: "paragraph", theme: HEARTH_THEME });
    const tag = document.createElement("style");
    try {
      editor.loadHtml(getPattern("home-hero")!.content);
      tag.textContent =
        (await httpCssEngine("/__jit").compile(collectClasses(editor.serialize()))).css +
        responsiveContainerCss(HEARTH_THEME);
      document.head.appendChild(tag);
      const root = canvas.querySelector<HTMLElement>(':scope > [data-pb-block="group"]')!;
      const hero = root.querySelector<HTMLElement>(':scope > [data-pb-block="group"]')!;
      const [copy, media] = [...hero.children].filter(
        (child) => !child.matches("script[data-pb-settings]"),
      ) as HTMLElement[];
      expect(getComputedStyle(hero).display).toBe("grid");
      expect(
        Math.abs(copy.getBoundingClientRect().width - media.getBoundingClientRect().width),
      ).toBeLessThan(2);
      expect(copy.getBoundingClientRect().width).toBeLessThan(
        hero.getBoundingClientRect().width * 0.7,
      );
    } finally {
      tag.remove();
      editor.destroy();
      canvas.remove();
    }
  });

  test("blocks are margin-0 by default: only authored margins apply", async () => {
    try {
      if (!(await fetch("/__jit", { method: "POST", body: "p-1" })).ok) return;
    } catch {
      return;
    }
    const canvas = document.createElement("main");
    canvas.id = "canvas";
    document.body.appendChild(canvas);
    await import("../src/styles.css");
    const editor = createEditor({ canvas, defaultBlock: "paragraph", theme: DEFAULT_THEME });
    const tag = document.createElement("style");
    try {
      editor.loadHtml(
        `<div data-pb-doc><p data-pb-block="paragraph" data-pb-rich="body" class="mt-8">Spaced.</p><p data-pb-block="paragraph" data-pb-rich="body">Bare.</p></div>`,
      );
      tag.textContent = (
        await httpCssEngine("/__jit").compile(collectClasses(editor.serialize()))
      ).css;
      document.head.appendChild(tag);
      const [spaced, bare] = [...canvas.querySelectorAll("p")];
      expect(getComputedStyle(spaced).marginTop).toBe("32px");
      expect(getComputedStyle(spaced).marginBottom).toBe("0px");
      expect(getComputedStyle(bare).marginTop).toBe("0px");
      expect(getComputedStyle(bare).marginBottom).toBe("0px");
    } finally {
      tag.remove();
      editor.destroy();
      canvas.remove();
    }
  });

  test("contextual semantic foregrounds reach headings in the composed page", async () => {
    try {
      if (!(await fetch("/__jit", { method: "POST", body: "p-1" })).ok) return;
    } catch {
      return;
    }
    const canvas = document.createElement("main");
    canvas.id = "canvas";
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", theme: HEARTH_THEME });
    const tag = document.createElement("style");
    try {
      editor.loadHtml(html);
      const published = editor.serialize({ pipeline: "data" });
      tag.textContent = [
        (await httpCssEngine("/__jit").compile(collectClasses(published))).css,
        inlineBackend.css!(HEARTH_THEME),
        themeBaseCss(),
      ].join("\n");
      document.head.appendChild(tag);

      const headings = [...canvas.querySelectorAll<HTMLElement>("h1, h2, h3")];
      const hero = headings.find((heading) =>
        heading.textContent?.includes("Beautiful tools for everyday rituals"),
      )!;
      const giveaway = headings.find((heading) =>
        heading.textContent?.includes("What you’ll win"),
      )!;
      expect(hero).toBeTruthy();
      expect(giveaway).toBeTruthy();
      expect(getComputedStyle(hero).color).toBe("rgb(255, 250, 240)");
      expect(getComputedStyle(giveaway).color).toBe("rgb(255, 247, 233)");
    } finally {
      tag.remove();
      editor.destroy();
      canvas.remove();
    }
  });

  test("an icon's authored flex is not fought by a baseline inline-block", () => {
    const iconModel = upcast(
      parse(
        `<div data-pb-doc><span data-pb-block="icon" data-pb-rich="svg" class="mb-6 flex size-10 items-center justify-center rounded-lg bg-indigo-500"><svg viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg></span></div>`,
      ),
    );
    const icon = iconModel.blocks[0];
    expect(icon.type).toBe("icon");
    expect(icon.classes).toBe(
      "mb-6 flex size-10 items-center justify-center rounded-lg bg-indigo-500",
    );
    const wire = downcast(iconModel);
    expect(wire).not.toContain("inline-block");
    expect(wire).toContain("flex");
    expect(upcast(parse(wire))).toEqual(iconModel);
  });

  test("a bare image height class sizes the image, not its wrapping figure", () => {
    const imageModel = upcast(
      parse(
        `<div data-pb-doc><img data-pb-block="image" data-pb-image="image" src="/mark.svg" alt="Co" class="h-11"></div>`,
      ),
    );
    const image = imageModel.blocks[0];
    expect(image.type).toBe("image");
    expect(image.classes).toBe("h-11");
    const wire = downcast(imageModel);
    const host = document.createElement("div");
    host.innerHTML = wire;
    expect(host.querySelector("img")!.className).toContain("h-11");
    expect(host.querySelector("img")!.className).not.toContain("h-auto");
    expect(host.querySelector("figure")!.className).not.toContain("h-11");
    expect(upcast(parse(wire))).toEqual(imageModel);
  });

  test("pattern classes register in lenses and are replaced while editing the copy", () => {
    const canvas = document.createElement("main");
    document.body.appendChild(canvas);
    const editor = createEditor({ canvas, defaultBlock: "paragraph", theme: HEARTH_THEME });
    try {
      editor.loadHtml(html);
      editor.setPatternsOpaque(false);
      const h1 = editor
        .getModel()
        .blocks.flatMap(function all(block: Block): Block[] {
          return [block, ...(block.children ?? []).flatMap(all)];
        })
        .find((block) => block.type === "heading" && block.classes?.includes("text-5xl"))!;
      expect(h1).toBeDefined();
      expect(editor.getStyle(h1.id, "fontSize")).toBe("5xl");
      editor.setStyle(h1.id, "fontSize", "7xl");
      const classes = editor.getBlock(h1.id)!.classes!;
      expect(classes).toContain("text-7xl");
      expect(classes).not.toMatch(/(^| )text-5xl( |$)/);
      expect(classes).toContain("sm:text-7xl");
    } finally {
      editor.destroy();
      canvas.remove();
    }
  });
});
