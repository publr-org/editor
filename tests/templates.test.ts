import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { page as browserPage } from "@vitest/browser/context";
import {
  createEditorShell,
  getPattern,
  getTemplate,
  hydrateTemplateParts,
  publishTemplatePart,
  registerCoreBlocks,
  registerCorePatterns,
  registerTemplate,
  registerTemplatePart,
  renderTemplate,
  resolveTemplate,
  unregisterTemplate,
  unregisterTemplatePart,
} from "../src";
import { downcast, upcast } from "../src/cast";
import { getBlockType } from "../src/registry";

const partWire = (body: string) =>
  `<div data-pb-block="template-part" data-pb-children data-publr-template-part="test-header">
    <script type="application/json" data-pb-settings>{"name":"test-header"}</script>
    ${body}
  </div>`;

const slotWire = (name = "content") =>
  `<div data-pb-block="template-slot" data-publr-slot="${name}">
    <script type="application/json" data-pb-settings>{"name":"${name}"}</script>
    <span>${name}</span>
  </div>`;

beforeAll(() => {
  if (!getBlockType("paragraph")) registerCoreBlocks();
  if (!getPattern("hero")) registerCorePatterns();
});

let shell: Awaited<ReturnType<typeof createEditorShell>> | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  shell?.destroy();
  shell = null;
  host?.remove();
  host = null;
  unregisterTemplate("shell-page");
  unregisterTemplatePart("shell-header");
  unregisterTemplatePart("shell-promo");
});

describe("shared templates", () => {
  test("resolves a content-type template with a general fallback", () => {
    registerTemplate("default", {
      label: "Default",
      content: slotWire(),
    });

    expect(resolveTemplate("missing")?.name).toBe("default");
    expect(resolveTemplate("missing")?.label).toBe("Default");

    unregisterTemplate("default");
  });

  test("hydrates template-part references from the latest shared definition", () => {
    registerTemplatePart("test-header", {
      label: "Header",
      area: "header",
      content: `<p data-pb-block="paragraph" data-pb-rich="body">First header</p>`,
    });
    registerTemplate("test-page", {
      label: "Page",
      content: `${partWire(
        `<p data-pb-block="paragraph" data-pb-rich="body">Stale copy</p>`,
      )}${slotWire()}`,
    });

    expect(hydrateTemplateParts(getTemplate("test-page")!.content)).toContain("First header");

    publishTemplatePart(
      "test-header",
      `<p data-pb-block="paragraph" data-pb-rich="body">Shared update</p>`,
    );
    const hydrated = hydrateTemplateParts(getTemplate("test-page")!.content);
    expect(hydrated).toContain("Shared update");
    expect(hydrated).not.toContain("Stale copy");

    const root = document.createElement("div");
    root.innerHTML = hydrated;
    const published = downcast(upcast(root), "data");
    expect(published).toContain('data-publr-template-part="test-header"');
    expect(published).toContain('data-publr-slot="content"');
    expect(published).not.toContain("data-pb-block");

    unregisterTemplate("test-page");
    unregisterTemplatePart("test-header");
  });

  test("renders shared parts and document values into the published template", () => {
    registerTemplatePart("test-header", {
      label: "Header",
      content: `<p data-pb-block="paragraph" data-pb-rich="body">Shared header</p>`,
    });
    registerTemplate("test-page", {
      label: "Page",
      content: `${partWire("")}${slotWire("title")}${slotWire()}${slotWire("featured-image")}`,
    });

    const rendered = renderTemplate("test-page", {
      content: "<p>Document body</p>",
      title: "<Unsafe title>",
      featuredImage: '<img src="/hero.jpg" alt="">',
    });
    expect(rendered).toContain("Shared header");
    expect(rendered).toContain("&lt;Unsafe title&gt;");
    expect(rendered).toContain("Document body");
    expect(rendered).toContain('src="/hero.jpg"');
    expect(rendered).not.toContain("data-pb-block");

    unregisterTemplate("test-page");
    unregisterTemplatePart("test-header");
  });

  test("rejects duplicate slots and unknown template-part references", () => {
    expect(() =>
      registerTemplate("bad-slots", {
        label: "Bad slots",
        content: `${slotWire()}${slotWire()}`,
      }),
    ).toThrow(/used more than once/);
    expect(() =>
      registerTemplate("bad-part", {
        label: "Bad part",
        content: partWire(""),
      }),
    ).toThrow(/is not registered/);
  });

  test("show-template mode projects locked parts and nests document blocks under Content", async () => {
    registerTemplatePart("shell-header", {
      label: "Site header",
      area: "header",
      content: `<p class="template-only-style" data-pb-block="paragraph" data-pb-rich="body">Shared header</p>`,
    });
    registerTemplate("shell-page", {
      label: "Page template",
      content: `<div data-pb-block="template-part" data-pb-children data-publr-template-part="shell-header">
        <script type="application/json" data-pb-settings>{"name":"shell-header"}</script>
      </div>${slotWire("title")}<div class="legacy-slot" data-pb-block="template-slot" data-publr-slot="content">
        <script type="application/json" data-pb-settings>{"name":"content"}</script>
        <span>Content</span>
      </div>`,
    });
    const compile = vi.fn(async (classes: readonly string[]) => ({
      css: classes.includes("template-only-style")
        ? ".template-only-style{color:rgb(1, 2, 3)}"
        : "",
      unresolved: [],
    }));
    const savePart = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    shell = await createEditorShell({
      container: host,
      content: `<p data-pb-block="paragraph" data-pb-rich="body">Page body</p>`,
      cssEngine: { compile },
      siteCss: ".legacy-slot{padding:32px;text-align:center}",
      templateWidth: "content",
      document: {
        title: "Test page",
        template: { name: "shell-page", onSavePart: savePart },
      },
    });

    const canvasDocument = host.querySelector<HTMLIFrameElement>("#editor-frame")!.contentDocument!;
    await vi.waitFor(() =>
      expect(canvasDocument.querySelector("[data-publr-template-part]")).not.toBeNull(),
    );
    await vi.waitFor(() =>
      expect(
        canvasDocument.defaultView!.getComputedStyle(
          canvasDocument.querySelector(".template-only-style")!,
        ).color,
      ).toBe("rgb(1, 2, 3)"),
    );
    expect(compile).toHaveBeenCalledWith(expect.arrayContaining(["template-only-style"]));
    expect(host.querySelector("#tree-rows")?.textContent).toContain("Site header");
    expect(host.querySelector("#tree-rows")?.textContent).toContain("Content");
    expect(host.querySelector("#tree-rows")?.textContent).toContain("Paragraph");
    expect(host.querySelector("#document-template-slots")?.textContent).toContain("Title");
    expect(host.querySelector("#document-template-slots")?.textContent).toContain("Content");
    const contentSlot = canvasDocument.querySelector<HTMLElement>(
      '[data-pbe-template-node-name="content"]',
    )!;
    const canvas = canvasDocument.querySelector<HTMLElement>("#canvas")!;
    expect(canvasDocument.defaultView!.getComputedStyle(contentSlot).display).toBe("contents");
    expect(
      canvasDocument.defaultView!.getComputedStyle(canvas.querySelector("p")!).textAlign,
    ).not.toBe("center");
    expect(canvas.dataset.pbeTemplateWidth).toBe("content");

    const treeToggle = host.querySelector<HTMLButtonElement>("#tree-toggle")!;
    treeToggle.click();
    await vi.waitFor(() => expect(treeToggle.getAttribute("aria-expanded")).toBe("true"));
    const templatePartRow = host.querySelector<HTMLElement>("[data-tree-row][data-template-part]")!;
    const templateRestBackground = getComputedStyle(templatePartRow).backgroundColor;
    const templatePartLocator = browserPage.elementLocator(templatePartRow);
    await templatePartLocator.hover();
    expect(getComputedStyle(templatePartRow).backgroundColor).not.toBe(templateRestBackground);
    templatePartRow.querySelectorAll<HTMLButtonElement>("button")[1].click();
    await vi.waitFor(() => expect(templatePartRow.classList.contains("bg-ui-accent")).toBe(true));
    await templatePartLocator.unhover();
    expect(getComputedStyle(templatePartRow).backgroundColor).not.toBe(templateRestBackground);
    expect(getComputedStyle(templatePartRow).color).toBe("rgb(124, 58, 237)");

    const lockedPart = canvasDocument.querySelector<HTMLElement>(
      "[data-publr-template-part='shell-header']",
    )!;
    lockedPart.click();
    await vi.waitFor(() =>
      expect(host!.querySelector("#block-card-title")?.textContent).toBe("Site header"),
    );
    expect(shell.editor.serialize()).toContain("Page body");
    expect(shell.editor.serialize()).not.toContain("Shared header");
    expect(canvasDocument.querySelector("[data-pbe-template-node-toolbar]")?.textContent).toContain(
      "Edit original",
    );

    (
      canvasDocument.querySelector("[data-pbe-template-node-toolbar] button") as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(shell!.isIsolated()).toBe(true));
    const directStage = host.querySelector<HTMLElement>("#editor-content")!;
    expect(directStage.hasAttribute("data-isolation-stage")).toBe(true);
    expect(
      host.querySelector<HTMLElement>("#editor-shell")!.classList.contains("pbe-isolation-pattern"),
    ).toBe(false);
    expect(getComputedStyle(host.querySelector<HTMLElement>("#topbar")!).backgroundColor).toBe(
      "rgb(88, 28, 135)",
    );
    const paragraph = shell.editor.getModel().blocks[0];
    shell.editor.setField(paragraph.id, "body", "Updated locked header");
    (host.querySelector("#template-save") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(shell!.isIsolated()).toBe(false));
    expect(savePart).toHaveBeenCalled();
    expect(canvasDocument.body.textContent).toContain("Updated locked header");

    (host.querySelector("#document-toggle-template") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(canvasDocument.querySelector("[data-publr-template-part]")).toBeNull(),
    );
    expect(canvasDocument.body.textContent).toContain("Page body");
    expect(canvas.dataset.pbeTemplateWidth).toBe("content");
    expect(host.querySelector("#tree-rows")?.textContent).not.toContain("Site header");
    expect(host.querySelector("#document-template-slots")?.classList.contains("hidden")).toBe(true);

    (host.querySelector("#document-toggle-template") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(canvasDocument.body.textContent).toContain("Updated locked header"),
    );
    expect(host.querySelector("#tree-rows")?.textContent).toContain("Site header");
  });

  test("opens from the Document tab and edits a shared part in nested isolation", async () => {
    registerTemplatePart("shell-header", {
      label: "Site header",
      area: "header",
      content: `<p data-pb-block="paragraph" data-pb-rich="body">Shared header</p>`,
    });
    registerTemplate("shell-page", {
      label: "Page template",
      content: `<div data-pb-block="template-part" data-pb-children data-publr-template-part="shell-header">
        <script type="application/json" data-pb-settings>{"name":"shell-header"}</script>
        <p data-pb-block="paragraph" data-pb-rich="body">Embedded fallback</p>
      </div>${slotWire()}`,
    });
    const saveTemplate = vi.fn();
    const savePart = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    shell = await createEditorShell({
      container: host,
      content: `<p data-pb-block="paragraph" data-pb-rich="body">Page body</p>`,
      document: {
        title: "Test page",
        template: {
          name: "shell-page",
          onSave: saveTemplate,
          onSavePart: savePart,
        },
      },
    });

    const canvasDocument = host.querySelector<HTMLIFrameElement>("#editor-frame")!.contentDocument!;
    expect(host.querySelector("#document-template")?.textContent).toContain("Page template");
    expect(canvasDocument.body.textContent).toContain("Shared header");
    expect(canvasDocument.body.textContent).toContain("Page body");
    (host.querySelector("#document-edit-template") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(shell!.isIsolated()).toBe(true));
    expect(shell.editor.serialize()).toContain("Shared header");
    const stage = host.querySelector<HTMLElement>("#editor-content")!;
    const viewport = host.querySelector<HTMLElement>(".pbe-canvas-viewport")!;
    expect(stage.hasAttribute("data-isolation-stage")).toBe(false);

    await vi.waitFor(() =>
      expect(
        (host!.querySelector("#sidebar-edit-template-part") as HTMLElement).classList.contains(
          "hidden",
        ),
      ).toBe(false),
    );
    (host.querySelector("#sidebar-edit-template-part") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(host!.querySelector("#template-scope")?.textContent).toContain("Site header"),
    );
    expect(stage.hasAttribute("data-isolation-stage")).toBe(true);
    expect(getComputedStyle(stage).display).toBe("flex");
    await vi.waitFor(() => expect(viewport.style.height).toMatch(/^\d+px$/));
    const editorShell = host.querySelector<HTMLElement>("#editor-shell")!;
    expect(editorShell.classList.contains("pbe-isolation-pattern")).toBe(false);
    expect(getComputedStyle(host.querySelector<HTMLElement>("#topbar")!).backgroundColor).toBe(
      "rgb(88, 28, 135)",
    );
    const paragraph = shell.editor.getModel().blocks[0];
    shell.editor.setField(paragraph.id, "body", "Updated everywhere");
    (host.querySelector("#template-save") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(savePart).toHaveBeenCalledWith(
        "shell-header",
        expect.stringContaining("Updated everywhere"),
        shell!.editor,
      ),
    );

    expect(shell.isIsolated()).toBe(true);
    await vi.waitFor(() => expect(stage.hasAttribute("data-isolation-stage")).toBe(false));
    await vi.waitFor(() => expect(viewport.style.height).toBe("100%"));
    expect(shell.editor.serialize()).toContain("Updated everywhere");
    (host.querySelector("#template-save") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(saveTemplate).toHaveBeenCalled());
    await vi.waitFor(() => expect(shell!.isIsolated()).toBe(false));
    expect(shell.editor.serialize()).toContain("Page body");
    expect(canvasDocument.body.textContent).toContain("Updated everywhere");
    expect(canvasDocument.body.textContent).toContain("Page body");
    expect(canvasDocument.body.querySelector("#canvas")).not.toBeNull();
  });

  test("keeps patterns content-only in a template part and opens Edit pattern as nested isolation", async () => {
    registerTemplatePart("shell-header", {
      label: "Site header",
      area: "header",
      content: `
        <div data-pb-block="pattern" data-pb-pattern="hero" data-pb-children>
          <section data-pb-block="group" data-pb-tag="tag" data-pb-children>
            <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Nested hero</h2>
            <p data-pb-block="paragraph" data-pb-rich="body">Template-part copy</p>
          </section>
        </div>`,
    });
    registerTemplate("shell-page", {
      label: "Page template",
      content: `
        <div data-pb-block="template-part" data-pb-children data-publr-template-part="shell-header">
          <script type="application/json" data-pb-settings>{"name":"shell-header"}</script>
        </div>
        ${slotWire()}`,
    });
    const savePart = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    shell = await createEditorShell({
      container: host,
      content: `<p data-pb-block="paragraph" data-pb-rich="body">Page body</p>`,
      document: {
        title: "Test page",
        template: { name: "shell-page", onSavePart: savePart },
      },
    });

    const canvasDocument = host.querySelector<HTMLIFrameElement>("#editor-frame")!.contentDocument!;
    await vi.waitFor(() =>
      expect(canvasDocument.querySelector("[data-publr-template-part]")).not.toBeNull(),
    );
    canvasDocument.querySelector<HTMLElement>("[data-publr-template-part]")!.click();
    await vi.waitFor(() =>
      expect(canvasDocument.querySelector("[data-pbe-template-node-toolbar]")).not.toBeNull(),
    );
    canvasDocument
      .querySelector<HTMLButtonElement>("[data-pbe-template-node-toolbar] button")!
      .click();

    await vi.waitFor(() =>
      expect(host!.querySelector("#template-scope")?.textContent).toContain("Site header"),
    );
    let patternRoot = shell.editor.getModel().blocks[0];
    let heading = patternRoot.children![0].children![0];
    expect(shell.editor.editingMode(patternRoot.id)).toBe("default");
    expect(shell.editor.editingMode(heading.id)).toBe("content-only");
    expect(shell.editor.blockPolicy(heading.id)).toMatchObject({
      movable: false,
      removable: false,
      stylable: false,
    });

    shell.editor.selectBlock(patternRoot.id);
    const inlineChrome = canvasDocument.querySelector<HTMLElement>(
      "[data-pbe-inline-chrome]",
    )!.shadowRoot!;
    const editPattern = [
      ...inlineChrome.querySelectorAll<HTMLButtonElement>(".pbe-toolbar button"),
    ].find((button) => button.textContent === "Edit pattern")!;
    await vi.waitFor(() => expect(editPattern.closest<HTMLElement>("div")!.hidden).toBe(false));
    editPattern.click();

    await vi.waitFor(() =>
      expect(host!.querySelector("#template-scope")?.textContent).toContain("Hero"),
    );
    heading = shell.editor.getModel().blocks[0].children![0];
    expect(shell.editor.editingMode(heading.id)).toBe("default");
    shell.editor.setField(heading.id, "text", "Edited nested hero");
    expect(host.querySelector("#template-save")?.textContent).toBe("Apply to this copy");
    (host.querySelector("#template-save") as HTMLButtonElement).click();

    await vi.waitFor(() =>
      expect(host!.querySelector("#template-scope")?.textContent).toContain("Site header"),
    );
    patternRoot = shell.editor.getModel().blocks[0];
    heading = patternRoot.children![0].children![0];
    expect(heading.fields.text).toBe("Edited nested hero");
    expect(shell.editor.editingMode(heading.id)).toBe("content-only");
    expect(shell.isIsolated()).toBe(true);

    (host.querySelector("#template-save") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(savePart).toHaveBeenCalledWith(
        "shell-header",
        expect.stringContaining("Edited nested hero"),
        shell!.editor,
      ),
    );
    await vi.waitFor(() => expect(shell!.isIsolated()).toBe(false));
  });

  test("nests patterns and template parts recursively with clickable typed breadcrumbs", async () => {
    registerTemplatePart("shell-promo", {
      label: "Promo strip",
      content: `
        <div data-pb-block="pattern" data-pb-pattern="call-to-action" data-pb-children>
          <section data-pb-block="group" data-pb-tag="tag" data-pb-children>
            <h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Inner offer</h3>
            <p data-pb-block="paragraph" data-pb-rich="body">Nested shared copy</p>
          </section>
        </div>`,
    });
    registerTemplatePart("shell-header", {
      label: "Site header",
      area: "header",
      content: `
        <div data-pb-block="pattern" data-pb-pattern="hero" data-pb-children>
          <section data-pb-block="group" data-pb-tag="tag" data-pb-children>
            <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Outer hero</h2>
            <div data-pb-block="pattern" data-pb-pattern="features" data-pb-children>
              <div data-pb-block="group" data-pb-tag="tag" data-pb-children>
                <p data-pb-block="paragraph" data-pb-rich="body">Nested pattern copy</p>
              </div>
            </div>
            <div data-pb-block="template-part" data-pb-children data-publr-template-part="shell-promo">
              <script type="application/json" data-pb-settings>{"name":"shell-promo"}</script>
            </div>
          </section>
        </div>`,
    });
    registerTemplate("shell-page", {
      label: "Page template",
      content: `
        <div data-pb-block="template-part" data-pb-children data-publr-template-part="shell-header">
          <script type="application/json" data-pb-settings>{"name":"shell-header"}</script>
        </div>
        ${slotWire()}`,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    shell = await createEditorShell({
      container: host,
      content: `<p data-pb-block="paragraph" data-pb-rich="body">Page body</p>`,
      document: {
        title: "Test page",
        template: { name: "shell-page" },
      },
    });

    const canvasDocument = host.querySelector<HTMLIFrameElement>("#editor-frame")!.contentDocument!;
    await vi.waitFor(() =>
      expect(canvasDocument.querySelector("[data-publr-template-part]")).not.toBeNull(),
    );
    expect(canvasDocument.body.textContent).toContain("Inner offer");
    canvasDocument.querySelector<HTMLElement>("[data-publr-template-part]")!.click();
    await vi.waitFor(() =>
      expect(canvasDocument.querySelector("[data-pbe-template-node-toolbar]")).not.toBeNull(),
    );
    canvasDocument
      .querySelector<HTMLButtonElement>("[data-pbe-template-node-toolbar] button")!
      .click();

    let outerPattern = shell.editor.getModel().blocks[0];
    shell.editor.selectBlock(outerPattern.id);
    const inlineChrome = canvasDocument.querySelector<HTMLElement>(
      "[data-pbe-inline-chrome]",
    )!.shadowRoot!;
    const editPattern = [
      ...inlineChrome.querySelectorAll<HTMLButtonElement>(".pbe-toolbar button"),
    ].find((button) => button.textContent === "Edit pattern")!;
    await vi.waitFor(() => expect(editPattern.closest<HTMLElement>("div")!.hidden).toBe(false));
    editPattern.click();

    await vi.waitFor(() => {
      const breadcrumbBar = host!.querySelector<HTMLElement>("#isolation-breadcrumbs")!;
      const editorShell = host!.querySelector<HTMLElement>("#editor-shell")!;
      const crumbs = host!.querySelectorAll<HTMLButtonElement>(".pbe-isolation-crumb");
      expect([...crumbs].map((crumb) => crumb.textContent?.trim())).toEqual([
        "Site header",
        "Hero",
      ]);
      expect(breadcrumbBar.nextElementSibling?.id).toBe("topbar");
      expect(getComputedStyle(breadcrumbBar).backgroundColor).toBe("rgb(23, 23, 23)");
      expect(editorShell.classList.contains("pbe-isolation-nested")).toBe(true);
      expect(getComputedStyle(editorShell).overflow).toBe("visible");
      const barRect = breadcrumbBar.getBoundingClientRect();
      const shellRect = editorShell.getBoundingClientRect();
      expect(barRect.left).toBe(shellRect.left);
      expect(barRect.right).toBe(shellRect.right);
      expect(getComputedStyle(crumbs[0]).color).toBe("rgb(148, 82, 232)");
      expect(getComputedStyle(crumbs[1]).color).toBe("rgb(57, 116, 239)");
      expect(crumbs[0].querySelector("svg")).not.toBeNull();
    });
    host.querySelector<HTMLButtonElement>("#inserter-toggle")!.click();
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-block-type="template-part"]')).not.toBeNull(),
    );
    host.querySelector<HTMLButtonElement>("#inserter-close")!.click();
    let outerGroup = shell.editor.getModel().blocks[0];
    const nestedPattern = outerGroup.children![1];
    const nestedPatternContent = nestedPattern.children![0].children![0];
    expect(shell.editor.editingMode(nestedPatternContent.id)).toBe("content-only");

    shell.editor.selectBlock(nestedPattern.id);
    await vi.waitFor(() => expect(editPattern.closest<HTMLElement>("div")!.hidden).toBe(false));
    editPattern.click();
    await vi.waitFor(() => {
      const crumbs = host!.querySelectorAll<HTMLButtonElement>(".pbe-isolation-crumb");
      expect([...crumbs].map((crumb) => crumb.dataset.kind)).toEqual([
        "template-part",
        "pattern",
        "pattern",
      ]);
    });
    host.querySelector<HTMLButtonElement>('.pbe-isolation-crumb[data-index="1"]')!.click();
    await vi.waitFor(() =>
      expect(host!.querySelector("#template-scope")?.textContent).toContain("Hero"),
    );

    outerGroup = shell.editor.getModel().blocks[0];
    const nestedPart = outerGroup.children![2];
    shell.editor.selectBlock(nestedPart.id);
    await vi.waitFor(() =>
      expect(
        (host!.querySelector("#sidebar-edit-template-part") as HTMLElement).classList.contains(
          "hidden",
        ),
      ).toBe(false),
    );
    (host.querySelector("#sidebar-edit-template-part") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      const crumbs = host!.querySelectorAll<HTMLButtonElement>(".pbe-isolation-crumb");
      expect([...crumbs].map((crumb) => crumb.dataset.kind)).toEqual([
        "template-part",
        "pattern",
        "template-part",
      ]);
    });
    const innerPattern = shell.editor.getModel().blocks[0];
    const innerHeading = innerPattern.children![0].children![0];
    expect(shell.editor.editingMode(innerHeading.id)).toBe("content-only");

    shell.editor.selectBlock(innerPattern.id);
    await vi.waitFor(() => expect(editPattern.closest<HTMLElement>("div")!.hidden).toBe(false));
    editPattern.click();
    await vi.waitFor(() => expect(host!.querySelectorAll(".pbe-isolation-crumb")).toHaveLength(4));
    expect(
      [...host.querySelectorAll<HTMLButtonElement>(".pbe-isolation-crumb")].map(
        (crumb) => crumb.dataset.kind,
      ),
    ).toEqual(["template-part", "pattern", "template-part", "pattern"]);
  });
});
