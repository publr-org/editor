import { page } from "@vitest/browser/context";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { attachInlineChrome, createEditor } from "../src/index";
import type { Editor } from "../src/index";
import { registerCoreBlocks } from "../src/blocks";

beforeAll(() => registerCoreBlocks());

describe("toolbar visual parity", () => {
  let host!: HTMLElement;
  let canvas!: HTMLElement;
  let editor!: Editor;
  let detach!: () => void;

  afterEach(() => {
    detach?.();
    editor?.destroy();
    host?.remove();
  });

  test("text, layout, media, and complex descriptors stay visually stable", async () => {
    host = document.createElement("div");
    host.style.cssText =
      "position:relative;width:960px;min-height:720px;padding:96px 40px;background:#f6f7f7";
    canvas = document.createElement("main");
    host.appendChild(canvas);
    document.body.appendChild(host);
    editor = createEditor({
      canvas,
      defaultBlock: "paragraph",
      groupBlock: "group",
    });
    editor.loadHtml(
      `<h2 data-pb-block="heading" data-pb-id="heading" data-pb-tag="level" data-pb-rich="text">Deploy with confidence</h2>` +
        `<div data-pb-block="group" data-pb-id="row" data-pb-tag="tag" class="flex flex-row" data-pb-children><p data-pb-block="paragraph" data-pb-rich="body">One</p><p data-pb-block="paragraph" data-pb-rich="body">Two</p></div>` +
        `<figure data-pb-block="image" data-pb-id="image"><img data-pb-image="image" src="/sample.jpg" alt="Sample"><figcaption data-pb-rich="caption">Caption</figcaption></figure>` +
        `<div data-pb-block="accordion" data-pb-id="accordion" data-pb-children><details data-pb-block="accordion-item"><summary data-pb-rich="title">Question</summary><div data-pb-children></div></details></div>`,
    );
    detach = attachInlineChrome(editor, { container: host });

    const toolbar = host
      .querySelector<HTMLElement>("[data-pbe-inline-chrome]")!
      .shadowRoot!.querySelector<HTMLElement>(".pbe-toolbar")!;
    for (const [id, snapshot] of [
      ["heading", "toolbar-text"],
      ["row", "toolbar-layout"],
      ["image", "toolbar-media"],
      ["accordion", "toolbar-complex"],
    ] as const) {
      editor.selectBlock(id);
      await vi.waitFor(() => expect(toolbar.hidden).toBe(false));
      await expect.element(page.elementLocator(toolbar)).toMatchScreenshot(snapshot, {
        comparatorOptions: { allowedMismatchedPixelRatio: 0.01 },
      });
    }

    editor.selectBlock("row");
    editor.setStyle("row", "flexWrap", "wrap");
    await vi.waitFor(() => expect(toolbar.hidden).toBe(false));
    await expect.element(page.elementLocator(toolbar)).toMatchScreenshot("toolbar-layout-wrapped", {
      comparatorOptions: { allowedMismatchedPixelRatio: 0.01 },
    });

    host.style.width = "360px";
    editor.selectBlock("image");
    await vi.waitFor(() => expect(toolbar.hidden).toBe(false));
    await expect.element(page.elementLocator(toolbar)).toMatchScreenshot("toolbar-media-narrow", {
      comparatorOptions: { allowedMismatchedPixelRatio: 0.01 },
    });
  });

  test("the live demo inspector stays stable at desktop and narrow widths", async () => {
    let frame: HTMLIFrameElement | null = null;
    const loadDemo = async (width: number) => {
      const next = document.createElement("iframe");
      next.width = String(width);
      next.height = "760";
      next.style.cssText = "display:block;border:0";
      document.body.appendChild(next);
      const loaded = new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("demo iframe timed out")), 10_000);
        next.addEventListener("load", () => {
          window.clearTimeout(timer);
          resolve();
        });
      });
      next.src = `/index.html?visual-inspector=${width}`;
      await loaded;
      const doc = next.contentDocument!;
      const editorFrame = doc.querySelector<HTMLIFrameElement>("#editor-frame")!;
      const canvasDoc = editorFrame.contentDocument!;
      const frameEvent = (name: string) => {
        const event = doc.createEvent("Event");
        event.initEvent(name, true, false);
        return event;
      };
      await vi.waitFor(() => expect(canvasDoc.querySelector("#canvas [data-pb-id]")).toBeTruthy(), {
        timeout: 10_000,
      });
      expect(
        canvasDoc.querySelector('[data-publr-template-part="site-header"] header'),
      ).not.toBeNull();
      expect(
        canvasDoc.querySelector('[data-publr-template-part="site-footer"] footer'),
      ).not.toBeNull();
      expect(
        canvasDoc.querySelector('[data-publr-template-part="site-header"]')?.textContent,
      ).toContain("Hearth & Home");
      expect(
        canvasDoc.querySelector('[data-publr-template-part="site-footer"]')?.textContent,
      ).toContain("Unlock thoughtful living.");
      const documentHeading = () =>
        [...canvasDoc.querySelectorAll<HTMLElement>('[data-pb-block="heading"]')].find(
          (candidate) => !candidate.closest("[data-publr-template-part]"),
        )!;
      const heading = documentHeading();
      const demoEditor = (next.contentWindow as unknown as { Publr: { editor: Editor } }).Publr
        .editor;
      expect(demoEditor.serialize()).toContain("Hello, PublrEditor");
      expect(demoEditor.getModel().blocks.some((block) => block.pattern)).toBe(false);
      expect(canvasDoc.querySelector("#canvas")?.getAttribute("data-pbe-template-width")).toBe(
        "content",
      );
      heading.focus();
      const range = canvasDoc.createRange();
      range.selectNodeContents(heading);
      range.collapse(false);
      const selection = editorFrame.contentWindow!.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      const selectionEvent = canvasDoc.createEvent("Event");
      selectionEvent.initEvent("selectionchange", true, false);
      canvasDoc.dispatchEvent(selectionEvent);
      demoEditor.selectBlock(heading.dataset.pbId!, { toggle: true });
      await vi.waitFor(() =>
        expect(doc.querySelector("#block-card-title")?.textContent).toBe("Heading"),
      );
      const stylesTab = doc.querySelector<HTMLButtonElement>('[data-itab="styles"]')!;
      stylesTab.click();
      await vi.waitFor(() => {
        expect(stylesTab.getAttribute("aria-selected")).toBe("true");
        expect(doc.querySelector(".pbe-box-model")).toBeTruthy();
      });

      const marginTop = doc.querySelector<HTMLButtonElement>(
        '.pbe-box-model__value[data-kind="margin"][data-side="Top"]',
      )!;
      const currentHeading = documentHeading;
      marginTop.click();
      await vi.waitFor(() =>
        expect(
          doc
            .querySelector<HTMLButtonElement>(
              '.pbe-box-model__value[data-kind="margin"][data-side="Top"]',
            )!
            .getAttribute("aria-pressed"),
        ).toBe("true"),
      );
      const spacingPane = () => doc.querySelector<HTMLElement>(".pbe-spacing-pane")!;
      expect(spacingPane().classList.contains("hidden")).toBe(false);
      const namedScale = spacingPane().querySelector<HTMLElement>(
        ".pbe-token-scale:not(.pbe-token-scale--custom):not(.hidden)",
      )!;
      const namedCenters = [...namedScale.children].map((child) => {
        const rect = (child as HTMLElement).getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      expect(Math.max(...namedCenters) - Math.min(...namedCenters)).toBeLessThan(1);
      marginTop.click();
      await vi.waitFor(() => expect(spacingPane().classList.contains("hidden")).toBe(true));
      marginTop.click();
      await vi.waitFor(() => expect(spacingPane().classList.contains("hidden")).toBe(false));
      doc.querySelector<HTMLButtonElement>('.pbe-spacing-pane__sync[data-mode="pair"]')!.click();
      await vi.waitFor(() =>
        expect(
          doc
            .querySelector<HTMLButtonElement>(
              '.pbe-box-model__value[data-kind="margin"][data-side="Bottom"]',
            )!
            .getAttribute("aria-pressed"),
        ).toBe("true"),
      );
      doc.querySelector<HTMLButtonElement>('.pbe-spacing-pane__sync[data-mode="pair"]')!.click();
      doc
        .querySelector<HTMLButtonElement>(
          '.pbe-box-model__value[data-kind="margin"][data-side="Right"]',
        )!
        .dispatchEvent(
          new doc.defaultView!.MouseEvent("click", {
            bubbles: true,
            shiftKey: true,
          }),
        );
      await vi.waitFor(() => {
        expect(doc.querySelector(".pbe-spacing-pane__header strong")?.textContent).toBe("Margin");
        expect(doc.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe(
          "Top, Right",
        );
      });
      marginTop.click();
      const beforeSpacing = currentHeading().outerHTML;
      const boxScale = doc.querySelector<HTMLInputElement>(
        '.pbe-box-model__control input[type="range"]',
      )!;
      boxScale.focus();
      boxScale.value = "4";
      boxScale.dispatchEvent(frameEvent("change"));
      await vi.waitFor(() => expect(currentHeading().outerHTML).not.toBe(beforeSpacing));
      const appliedSpacing = currentHeading().outerHTML;
      const customToggle = doc.querySelector<HTMLButtonElement>(
        ".pbe-spacing-pane__custom-toggle",
      )!;
      customToggle.click();
      await vi.waitFor(() =>
        expect(
          doc.querySelector<HTMLElement>(".pbe-token-scale--custom")?.classList.contains("hidden"),
        ).toBe(false),
      );
      const customScale = doc.querySelector<HTMLElement>(".pbe-token-scale--custom:not(.hidden)")!;
      const customCenters = [...customScale.children]
        .filter((child) => !(child as HTMLElement).classList.contains("hidden"))
        .map((child) => {
          const rect = (child as HTMLElement).getBoundingClientRect();
          return rect.top + rect.height / 2;
        });
      expect(Math.max(...customCenters) - Math.min(...customCenters)).toBeLessThan(1);
      expect(
        customScale
          .querySelector<HTMLInputElement>('input[type="range"]')!
          .classList.contains("pbe-spacing-pane__range"),
      ).toBe(true);
      const arbitraryInput = doc.querySelector<HTMLInputElement>(
        '.pbe-token-scale--custom input[type="number"]',
      )!;
      const arbitraryUnit = doc.querySelector<HTMLSelectElement>(
        ".pbe-token-scale--custom select",
      )!;
      arbitraryUnit.value = "px";
      arbitraryInput.focus();
      arbitraryInput.value = "18";
      arbitraryInput.dispatchEvent(frameEvent("change"));
      await vi.waitFor(() => expect(currentHeading().outerHTML).not.toBe(appliedSpacing));
      const arbitraryMargin = currentHeading().outerHTML;
      expect(arbitraryInput.value).toBe("18");
      customToggle.click();
      const resetArbitrary = doc.querySelector<HTMLInputElement>(
        '.pbe-token-scale:not(.pbe-token-scale--custom) input[type="range"]',
      )!;
      resetArbitrary.value = "0";
      resetArbitrary.dispatchEvent(frameEvent("change"));
      await vi.waitFor(() => expect(currentHeading().outerHTML).not.toBe(arbitraryMargin));
      if (width === 1180) {
        doc.querySelector<HTMLButtonElement>(".pbe-spacing-pane__close")!.click();
        await vi.waitFor(() => expect(spacingPane().classList.contains("hidden")).toBe(true));
        const unifiedBoxModel = doc.querySelector<HTMLElement>(".pbe-box-model")!;
        expect(unifiedBoxModel.querySelector(".pbe-box-model__border")).toBeTruthy();
        expect(unifiedBoxModel.getBoundingClientRect().height).toBeLessThanOrEqual(190);
      }

      const lineHeight = doc.querySelector<HTMLInputElement>(
        '[data-publr-component="token-scale"] input[type="range"][data-prop="lineHeight"]',
      )!;
      const beforeScale = currentHeading().outerHTML;
      lineHeight.focus();
      lineHeight.value = "2";
      lineHeight.dispatchEvent(frameEvent("change"));
      await vi.waitFor(() => expect(currentHeading().outerHTML).not.toBe(beforeScale));
      const appliedScale = currentHeading().outerHTML;
      const updatedLineHeight = doc.querySelector<HTMLInputElement>(
        '[data-publr-component="token-scale"] input[type="range"][data-prop="lineHeight"]',
      )!;
      updatedLineHeight.focus();
      updatedLineHeight.value = "0";
      updatedLineHeight.dispatchEvent(frameEvent("change"));
      await vi.waitFor(() => expect(currentHeading().outerHTML).not.toBe(appliedScale));

      const liveHeading = currentHeading();
      liveHeading.focus();
      const liveRange = canvasDoc.createRange();
      liveRange.selectNodeContents(liveHeading);
      liveRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(liveRange);
      const liveSelectionEvent = canvasDoc.createEvent("Event");
      liveSelectionEvent.initEvent("selectionchange", true, false);
      canvasDoc.dispatchEvent(liveSelectionEvent);
      await vi.waitFor(() =>
        expect(doc.querySelector("#block-card-title")?.textContent).toBe("Heading"),
      );
      doc.querySelector<HTMLButtonElement>('[data-itab="styles"]')!.click();
      const boxModel = doc.querySelector<HTMLElement>(".pbe-box-model")!;
      expect(boxModel).toBeTruthy();
      await vi.waitFor(() =>
        expect(doc.querySelector<HTMLElement>("#block-styles")!.offsetParent).toBeTruthy(),
      );
      // Dense controls stay collapsed until requested; the default screenshot
      // exercises the compact inspector rather than a scrolled box model.
      expect(doc.querySelector<HTMLDetailsElement>("#block-dimensions")!.open).toBe(false);
      expect(
        doc.querySelector(
          '[data-publr-component="token-scale"] input[type="range"][data-prop="lineHeight"]',
        ),
      ).toBeTruthy();
      const sidebar = doc.querySelector<HTMLElement>("#sidebar")!;
      sidebar.scrollTop = 0;
      await new Promise<void>((resolve) =>
        next.contentWindow!.requestAnimationFrame(() => resolve()),
      );
      return next;
    };
    try {
      await page.viewport(1400, 900);
      frame = await loadDemo(1180);
      await expect.element(page.elementLocator(frame)).toMatchScreenshot("inspector-desktop", {
        comparatorOptions: { allowedMismatchedPixelRatio: 0.01 },
      });

      frame.remove();
      await page.viewport(600, 900);
      frame = await loadDemo(430);
      await expect.element(page.elementLocator(frame)).toMatchScreenshot("inspector-narrow", {
        comparatorOptions: { allowedMismatchedPixelRatio: 0.01 },
      });
    } finally {
      frame?.remove();
    }
  });

  test("the homepage fixture alone boots from the registered pattern composition", async () => {
    const frame = document.createElement("iframe");
    frame.width = "1180";
    frame.height = "760";
    frame.style.cssText = "display:block;border:0";
    document.body.appendChild(frame);
    try {
      const loaded = new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("demo iframe timed out")), 10_000);
        frame.addEventListener("load", () => {
          window.clearTimeout(timer);
          resolve();
        });
      });
      frame.src = "/index.html?fixture=features/poc-homepage";
      await loaded;
      const demoEditor = (frame.contentWindow as unknown as { Publr: { editor: Editor } }).Publr
        .editor;
      await vi.waitFor(
        () =>
          expect(demoEditor.getModel().blocks.map((block) => block.pattern)).toEqual([
            "home-hero",
            "home-giveaway",
            "home-steps",
            "home-community",
            "home-categories",
          ]),
        { timeout: 10_000 },
      );
      expect(demoEditor.history.undoDepth).toBe(0);
      expect(demoEditor.serialize()).not.toContain("Hello, PublrEditor");
      expect(
        frame.contentDocument
          ?.querySelector<HTMLIFrameElement>("#editor-frame")
          ?.contentDocument?.querySelector("#canvas")
          ?.getAttribute("data-pbe-template-width"),
      ).toBe("full");
    } finally {
      frame.remove();
    }
  });

  test("site typography is edited against a representative long-form specimen", async () => {
    const frame = document.createElement("iframe");
    frame.width = "1400";
    frame.height = "900";
    frame.style.cssText = "display:block;border:0";
    document.body.appendChild(frame);
    try {
      await page.viewport(1440, 940);
      const loaded = new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("demo iframe timed out")), 10_000);
        frame.addEventListener("load", () => {
          window.clearTimeout(timer);
          resolve();
        });
      });
      frame.src = "/index.html?visual-typography";
      await loaded;

      const doc = frame.contentDocument!;
      await vi.waitFor(
        () =>
          expect(
            doc
              .querySelector<HTMLIFrameElement>("#editor-frame")
              ?.contentDocument?.querySelector("#canvas [data-pb-id]"),
          ).toBeTruthy(),
        { timeout: 10_000 },
      );
      doc.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
      await vi.waitFor(() =>
        expect(
          doc.querySelector<HTMLElement>("[data-design-styles-panel]")!.offsetParent,
        ).toBeTruthy(),
      );
      const stylesPanel = doc.querySelector<HTMLElement>("[data-design-styles-panel]")!;
      expect(stylesPanel.textContent).toContain("Library");
      expect(stylesPanel.textContent).toContain("Semantic layer");
      expect(stylesPanel.textContent).toContain("Defaults");
      await expect.element(page.elementLocator(frame)).toMatchScreenshot("theme-styles", {
        comparatorOptions: { allowedMismatchedPixelRatio: 0 },
      });

      const shellRoot = doc.querySelector<HTMLElement>("#editor-shell")!;
      shellRoot.classList.remove("dark");
      await new Promise<void>((resolve) =>
        frame.contentWindow!.requestAnimationFrame(() => resolve()),
      );
      await expect.element(page.elementLocator(frame)).toMatchScreenshot("theme-styles-light", {
        comparatorOptions: { allowedMismatchedPixelRatio: 0 },
      });

      const lightTokensNav = doc.querySelector<HTMLButtonElement>('[data-page="advanced"]')!;
      lightTokensNav.click();
      await vi.waitFor(() => expect(lightTokensNav.getAttribute("aria-current")).toBe("true"));
      await expect
        .element(page.elementLocator(frame))
        .toMatchScreenshot("theme-token-library-light", {
          comparatorOptions: { allowedMismatchedPixelRatio: 0.01 },
        });
      doc.querySelector<HTMLButtonElement>('[aria-label="Back to styles"]')!.click();
      const lightAssetsNav = doc.querySelector<HTMLButtonElement>('[data-page="assets"]')!;
      lightAssetsNav.click();
      await vi.waitFor(() => expect(lightAssetsNav.getAttribute("aria-current")).toBe("true"));
      await expect.element(page.elementLocator(frame)).toMatchScreenshot("theme-assets-light", {
        comparatorOptions: { allowedMismatchedPixelRatio: 0.01 },
      });
      doc.querySelector<HTMLButtonElement>('[aria-label="Back to styles"]')!.click();

      const lightContainersNav = doc.querySelector<HTMLButtonElement>('[data-page="containers"]')!;
      lightContainersNav.click();
      await vi.waitFor(() => expect(lightContainersNav.getAttribute("aria-current")).toBe("true"));
      await expect.element(page.elementLocator(frame)).toMatchScreenshot("theme-containers-light", {
        comparatorOptions: { allowedMismatchedPixelRatio: 0 },
      });
      doc.querySelector<HTMLButtonElement>('[aria-label="Back to styles"]')!.click();

      const lightBreakpointsNav = doc.querySelector<HTMLButtonElement>(
        '[data-page="breakpoints"]',
      )!;
      lightBreakpointsNav.click();
      await vi.waitFor(() => expect(lightBreakpointsNav.getAttribute("aria-current")).toBe("true"));
      await expect
        .element(page.elementLocator(frame))
        .toMatchScreenshot("theme-breakpoints-light", {
          comparatorOptions: { allowedMismatchedPixelRatio: 0 },
        });
      doc.querySelector<HTMLButtonElement>('[aria-label="Back to styles"]')!.click();
      shellRoot.classList.add("dark");

      const typographyNav = doc.querySelector<HTMLButtonElement>('[data-page="typography"]')!;
      typographyNav.click();
      await vi.waitFor(() => {
        expect(typographyNav.getAttribute("aria-current")).toBe("true");
        expect(
          doc.querySelector<HTMLElement>('[data-design-preview="typography"] article')!
            .offsetParent,
        ).toBeTruthy();
        expect(
          doc.querySelector<HTMLButtonElement>(
            '[data-design-controls="typography"] [data-name="publr-body-font-size"][data-value="var(--text-lg)"]',
          )!.offsetParent,
        ).toBeTruthy();
      });
      await new Promise<void>((resolve) =>
        frame.contentWindow!.requestAnimationFrame(() => resolve()),
      );
      expect(
        getComputedStyle(
          doc.querySelector<HTMLElement>('[data-design-preview="typography"] article')!,
        ).backgroundColor,
      ).toBe("rgb(255, 255, 255)");

      await expect
        .element(page.elementLocator(frame))
        .toMatchScreenshot("theme-element-typography", {
          comparatorOptions: { allowedMismatchedPixelRatio: 0.01 },
        });

      doc.querySelector<HTMLButtonElement>('[aria-label="Back to styles"]')!.click();
      const semanticNav = doc.querySelector<HTMLButtonElement>('[data-page="foundations"]')!;
      semanticNav.click();
      await vi.waitFor(() => expect(semanticNav.getAttribute("aria-current")).toBe("true"));
      doc
        .querySelector<HTMLButtonElement>(
          '[data-design-controls="foundations"] [aria-expanded="false"]',
        )!
        .click();
      await expect.element(page.elementLocator(frame)).toMatchScreenshot("theme-semantic-colors", {
        comparatorOptions: { allowedMismatchedPixelRatio: 0 },
      });

      doc.querySelector<HTMLButtonElement>('[aria-label="Back to styles"]')!.click();
      const tokensNav = doc.querySelector<HTMLButtonElement>('[data-page="advanced"]')!;
      tokensNav.click();
      await vi.waitFor(() => expect(tokensNav.getAttribute("aria-current")).toBe("true"));
      await expect.element(page.elementLocator(frame)).toMatchScreenshot("theme-token-library", {
        comparatorOptions: { allowedMismatchedPixelRatio: 0.01 },
      });
    } finally {
      frame.remove();
    }
  });

  test("layout inspector choices stay icon-led at sidebar width", async () => {
    let frame: HTMLIFrameElement | null = null;
    try {
      await page.viewport(1400, 1000);
      frame = document.createElement("iframe");
      frame.width = "1180";
      frame.height = "960";
      frame.style.cssText = "display:block;border:0";
      document.body.appendChild(frame);
      const loaded = new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("demo iframe timed out")), 10_000);
        frame!.addEventListener("load", () => {
          window.clearTimeout(timer);
          resolve();
        });
      });
      frame.src = "/index.html?visual-layout-icons";
      await loaded;

      const doc = frame.contentDocument!;
      const editorFrame = doc.querySelector<HTMLIFrameElement>("#editor-frame")!;
      await vi.waitFor(
        () =>
          expect(editorFrame.contentDocument?.querySelector("#canvas [data-pb-id]")).toBeTruthy(),
        { timeout: 10_000 },
      );
      const demoEditor = (frame.contentWindow as unknown as { Publr: { editor: Editor } }).Publr
        .editor;
      demoEditor.loadHtml(
        '<div data-pb-block="group" data-pb-id="layout-icons" data-pb-children class="flex flex-row"><p data-pb-block="paragraph" data-pb-rich="body">One</p><p data-pb-block="paragraph" data-pb-rich="body">Two</p></div>',
      );
      demoEditor.selectBlock("layout-icons", { toggle: true });

      await vi.waitFor(() => {
        expect(doc.querySelector("#block-card-title")?.textContent).toBe("Row");
        expect(
          doc.querySelector<HTMLElement>('.pbe-option-group[aria-label="Wrapping"]')!.offsetParent,
        ).toBeTruthy();
        expect(
          doc.querySelector(
            '.pbe-option-group[aria-label="Wrapping"] use[href="#pbe-i-wrap-reverse"]',
          ),
        ).toBeTruthy();
      });
      const sidebar = doc.querySelector<HTMLElement>("#sidebar")!;
      sidebar.scrollTop = sidebar.scrollHeight;
      await new Promise<void>((resolve) =>
        frame!.contentWindow!.requestAnimationFrame(() => resolve()),
      );
      await expect.element(page.elementLocator(frame)).toMatchScreenshot("inspector-layout-icons", {
        comparatorOptions: { allowedMismatchedPixelRatio: 0.04 },
      });
    } finally {
      frame?.remove();
    }
  });
});
