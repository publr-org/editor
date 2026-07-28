// Host seams on the full shell: topbar actions, ⋮ Tools menu entries, and
// the isolation flag. The Tools seam specifically regressed once by being
// injected AFTER hydration — the menu is portaled out of the container
// during hydrate, so late container queries miss it.

import { afterEach, describe, expect, test, vi } from "vitest";
import { page as browserPage } from "@vitest/browser/context";
import { composeContentCss, createEditorShell } from "../src/shell";
import { registerCoreBlocks, registerCorePatterns } from "../src/blocks";
import { registerHomepagePatterns } from "../src/blocks/homepage-patterns";
import { getPattern } from "../src/patterns";
import { getBlockType } from "../src/registry";
import {
  registerTemplate,
  registerTemplatePart,
  unregisterTemplate,
  unregisterTemplatePart,
} from "../src/templates";
import {
  DEFAULT_THEME,
  HEARTH_THEME,
  TAILWIND_COMPAT_THEME,
  activeTheme,
  colorContexts,
  semanticColorRoles,
  tokenValue,
  type Theme,
} from "../src/theme";
import preflightCss from "../vendor/jit/preflight.css?raw";
import siteCss from "../src/styles.css?inline";
import { wasmCssEngine } from "../src/wasm-engine";

if (!getBlockType("paragraph")) registerCoreBlocks();
if (!getPattern("hero")) registerCorePatterns();
if (!getPattern("home-giveaway")) registerHomepagePatterns();

let host!: HTMLElement;
let destroyShell!: () => void;

const canvasDocument = (): Document =>
  host.querySelector<HTMLIFrameElement>("#editor-frame")!.contentDocument!;
const canvasQuery = <T extends Element = HTMLElement>(selector: string): T | null =>
  canvasDocument().querySelector<T>(selector);
const selectViewportBreakpoint = async (
  breakpoint: string,
  device: "mobile" | "tablet" | "desktop",
): Promise<void> => {
  host
    .querySelector<HTMLButtonElement>(`#viewport-switcher button[data-device="${device}"]`)!
    .click();
  if (breakpoint === "base") return;
  await vi.waitFor(() =>
    expect(
      host
        .querySelector<HTMLButtonElement>(`#viewport-switcher button[data-device="${device}"]`)!
        .getAttribute("aria-pressed"),
    ).toBe("true"),
  );
  host
    .querySelector<HTMLButtonElement>(`#viewport-switcher button[data-device="${device}"]`)!
    .click();
  let endpoint!: HTMLButtonElement;
  await vi.waitFor(() => {
    endpoint = [
      ...document.querySelectorAll<HTMLButtonElement>(
        `[role="menuitemradio"][data-breakpoint="${breakpoint}"]`,
      ),
    ].find(
      (button) =>
        !button.closest<HTMLElement>('[data-publr-part="content"]')?.classList.contains("hidden"),
    )!;
    expect(endpoint).toBeTruthy();
  });
  if (endpoint.getAttribute("aria-checked") === "true") {
    host
      .querySelector<HTMLButtonElement>(`#viewport-switcher button[data-device="${device}"]`)!
      .click();
    return;
  }
  endpoint.click();
};

afterEach(() => {
  destroyShell?.();
  host?.remove();
  document.querySelector('[data-test-site-sheet="pattern-preview"]')?.remove();
  document.documentElement.style.removeProperty("--pbe-test-inherited-theme");
  unregisterTemplate("tree-drop-page");
  unregisterTemplatePart("tree-drop-footer");
});

describe("shell host seams", () => {
  test("the Document tab renders host metadata, page actions, and the shared image menu", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const action = vi.fn();
    const rename = vi.fn();
    const featuredChanged = vi.fn();
    const browse = vi.fn(async () => ({
      id: "m_featured",
      src: "/media/featured.jpg",
      alt: "Featured",
      width: 1200,
      height: 630,
    }));
    const upload = vi.fn(async () => ({ src: "/media/uploaded.jpg" }));
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: { browse, upload },
      theme: DEFAULT_THEME,
      document: {
        title: "Hello from Publr",
        featuredImage: { src: "", alt: "", width: "", height: "" },
        onFeaturedImageChange: featuredChanged,
        actions: {
          view: action,
          rename,
          setAsHomepage: action,
          trash: action,
        },
      },
    });
    destroyShell = shell.destroy;

    expect(host.querySelector("#document-title")?.textContent).toBe("Hello from Publr");
    host.querySelector<HTMLButtonElement>('[aria-label="Document actions"]')!.click();
    const actionsMenu = document.querySelector<HTMLElement>("[data-document-actions-menu]")!;
    await vi.waitFor(() => expect(actionsMenu.classList.contains("hidden")).toBe(false));
    const labels = [...actionsMenu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .filter((button) => !button.classList.contains("hidden"))
      .map((button) => button.textContent?.trim());
    expect(labels).toEqual(["View", "Rename", "Set as homepage", "Trash"]);
    expect(actionsMenu.textContent).not.toContain("Order");
    expect(actionsMenu.textContent).not.toContain("Set as posts page");
    actionsMenu.querySelector<HTMLButtonElement>('[data-action="view"]')!.click();
    expect(action).toHaveBeenCalledWith(shell.editor, expect.any(MouseEvent));

    host.querySelector<HTMLButtonElement>('[aria-label="Document actions"]')!.click();
    await vi.waitFor(() => expect(actionsMenu.classList.contains("hidden")).toBe(false));
    actionsMenu.querySelector<HTMLButtonElement>('[data-action="rename"]')!.click();
    const renameDialog = host.querySelector<HTMLElement>("#document-rename-dialog")!;
    await vi.waitFor(() => expect(renameDialog.classList.contains("hidden")).toBe(false));
    const renameInput = renameDialog.querySelector<HTMLInputElement>("#document-rename-input")!;
    expect(document.activeElement).toBe(renameInput);
    expect(renameInput.value).toBe("Hello from Publr");
    renameInput.value = "A better title";
    renameInput.dispatchEvent(new Event("input", { bubbles: true }));
    renameInput.closest("form")!.requestSubmit();
    await vi.waitFor(() => expect(rename).toHaveBeenCalledWith("A better title", shell.editor));
    await vi.waitFor(() => expect(renameDialog.classList.contains("hidden")).toBe(true));
    expect(host.querySelector("#document-title")?.textContent).toBe("A better title");

    host.querySelector<HTMLButtonElement>("#document-featured-dropdown button")!.click();
    const mediaMenu = document.querySelector<HTMLElement>("[data-document-featured-menu]")!;
    await vi.waitFor(() => expect(mediaMenu.classList.contains("hidden")).toBe(false));
    expect(
      [...mediaMenu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["Media Library", "Upload", "Insert from URL", "Reset"]);

    mediaMenu.querySelector<HTMLButtonElement>('[data-p-on*="browseDocumentFeatured"]')!.click();
    await vi.waitFor(() => expect(featuredChanged).toHaveBeenCalledTimes(1));
    expect(browse).toHaveBeenCalledWith(undefined);
    expect(featuredChanged).toHaveBeenCalledWith(
      {
        id: "m_featured",
        src: "/media/featured.jpg",
        alt: "Featured",
        width: "1200",
        height: "630",
      },
      shell.editor,
    );
    expect(
      host.querySelector<HTMLImageElement>(
        '#document-featured-dropdown img[src="/media/featured.jpg"]',
      ),
    ).not.toBeNull();
    expect(
      [...host.querySelectorAll<HTMLButtonElement>("#document-featured-dropdown button")]
        .filter((button) => !button.closest(".hidden"))
        .map((button) => button.textContent?.trim()),
    ).toEqual(expect.arrayContaining(["Replace", "Remove"]));

    [...host.querySelectorAll<HTMLButtonElement>("#document-featured-dropdown button")]
      .find((button) => button.textContent?.trim() === "Replace")!
      .click();
    await vi.waitFor(() => expect(mediaMenu.classList.contains("hidden")).toBe(false));
    mediaMenu.querySelector<HTMLButtonElement>('[data-p-on*="toggleDocumentFeaturedUrl"]')!.click();
    const url = mediaMenu.querySelector<HTMLInputElement>("#document-featured-url")!;
    url.value = "https://example.com/featured.png";
    url.closest("form")!.requestSubmit();
    await vi.waitFor(() => expect(featuredChanged).toHaveBeenCalledTimes(2));
    expect(featuredChanged).toHaveBeenLastCalledWith(
      {
        src: "https://example.com/featured.png",
        alt: "Featured",
        width: "",
        height: "",
      },
      shell.editor,
    );
    await vi.waitFor(() => expect(mediaMenu.classList.contains("hidden")).toBe(true));

    [...host.querySelectorAll<HTMLButtonElement>("#document-featured-dropdown button")]
      .find((button) => button.textContent?.trim() === "Remove")!
      .click();
    await vi.waitFor(() => expect(featuredChanged).toHaveBeenCalledTimes(3));
    expect(featuredChanged).toHaveBeenLastCalledWith(
      {
        src: "",
        alt: "Featured",
        width: "",
        height: "",
      },
      shell.editor,
    );
    expect(
      [...host.querySelectorAll<HTMLButtonElement>("#document-featured-dropdown button")].find(
        (button) =>
          !button.closest(".hidden") && button.textContent?.trim() === "Set featured image",
      ),
    ).toBeTruthy();

    shell.updateDocument({ title: "Renamed externally" });
    await vi.waitFor(() =>
      expect(host.querySelector("#document-title")?.textContent).toBe("Renamed externally"),
    );
  });

  test("standalone content CSS preserves responsive utilities over component defaults", () => {
    const tag = document.createElement("style");
    const grid = document.createElement("div");
    tag.textContent = composeContentCss([preflightCss, siteCss]);
    grid.className = "grid pbe-grid--2 grid-cols-4";
    grid.style.width = "400px";
    document.head.appendChild(tag);
    document.body.appendChild(grid);
    try {
      // Preview used to resolve this to two columns: the prepended preflight
      // declared `base,utilities`, accidentally placing the site's later
      // `components` layer above responsive utilities.
      expect(getComputedStyle(grid).gridTemplateColumns.split(" ")).toHaveLength(4);
    } finally {
      tag.remove();
      grid.remove();
    }
  });

  test("runtime site utilities stay scoped away from shell chrome", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<p class="border border-border" data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    shell.setCssEngine({
      async compile() {
        return {
          css: ".border-border{border-color:rgb(255 0 255)}",
          unresolved: [],
        };
      },
    });
    shell.refreshCss();
    const tag = canvasQuery<HTMLStyleElement>("#pbe-engine-css")!;
    await vi.waitFor(() => expect(tag.textContent).toContain("rgb(255 0 255)"));

    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    const chromeHeader = host.querySelector<HTMLElement>("#design-workspace > header")!;
    const canvasBlock = canvasQuery<HTMLElement>("#canvas .border-border")!;
    expect(getComputedStyle(chromeHeader).borderColor).not.toBe("rgb(255, 0, 255)");
    expect(getComputedStyle(canvasBlock).borderColor).toBe("rgb(255, 0, 255)");
  });

  test("tools render in the ⋮ menu and fire with the editor", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const onTool = vi.fn();
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme: DEFAULT_THEME,
      tools: [
        {
          id: "reset-content",
          label: "Reset to default content",
          onClick: onTool,
        },
      ],
      actions: [{ id: "save", label: "Save", primary: true, onClick: () => {} }],
    });
    destroyShell = shell.destroy;

    // The menu may live in the portal root by now — the item must exist
    // wherever the menu went, styled as a menuitem.
    const item = document.querySelector<HTMLElement>('[data-host-tool="reset-content"]');
    expect(item).not.toBeNull();
    expect(item!.getAttribute("role")).toBe("menuitem");
    expect(item!.textContent).toBe("Reset to default content");

    item!.click();
    expect(onTool).toHaveBeenCalledTimes(1);
    expect(onTool.mock.calls[0][0]).toBe(shell.editor);

    // Topbar action seam still renders alongside.
    expect(document.querySelector('[data-host-action="save"]')).not.toBeNull();

    // Isolation flag: host persistence guard reads false on a plain doc.
    expect(shell.isIsolated()).toBe(false);
  });

  test("the standalone menu toggles light appearance while host-owned controls can hide it", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    let shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    const shellRoot = host.querySelector<HTMLElement>("#editor-shell")!;
    const appearanceItem = document.querySelector<HTMLButtonElement>("#menu-toggle-appearance")!;
    const check = appearanceItem.querySelector<SVGElement>("[data-appearance-check]")!;
    expect(shellRoot.classList.contains("dark")).toBe(true);
    expect(appearanceItem.getAttribute("role")).toBe("menuitemcheckbox");
    expect(appearanceItem.getAttribute("aria-checked")).toBe("false");
    expect(check.hasAttribute("hidden")).toBe(true);

    appearanceItem.click();
    expect(shellRoot.classList.contains("dark")).toBe(false);
    expect(appearanceItem.getAttribute("aria-checked")).toBe("true");
    expect(check.hasAttribute("hidden")).toBe(false);

    shell.setAppearance("dark");
    expect(shellRoot.classList.contains("dark")).toBe(true);
    expect(appearanceItem.getAttribute("aria-checked")).toBe("false");
    expect(check.hasAttribute("hidden")).toBe(true);

    shell.destroy();
    destroyShell = () => {};
    host.remove();
    host = document.createElement("div");
    document.body.appendChild(host);
    shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme: DEFAULT_THEME,
      appearance: "light",
      showAppearanceToggle: false,
    });
    destroyShell = shell.destroy;

    expect(host.querySelector<HTMLElement>("#editor-shell")!.classList.contains("dark")).toBe(
      false,
    );
    expect(document.querySelector("#menu-appearance-control")).toBeNull();
  });

  test("a host can route the Design affordance to its own site-level destination", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const openSiteDesign = vi.fn();
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme: HEARTH_THEME,
      openSiteDesign,
    });
    destroyShell = shell.destroy;

    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    expect(openSiteDesign).toHaveBeenCalledWith(shell.editor);
    expect(host.querySelector<HTMLElement>("#design-workspace")!.classList.contains("hidden")).toBe(
      true,
    );

    shell.openSiteDesign();
    expect(openSiteDesign).toHaveBeenCalledTimes(2);
  });

  test("an embedded host can keep Design in navigation and leave its dedicated destination", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const closeSiteDesign = vi.fn();
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme: HEARTH_THEME,
      initialDesignOpen: true,
      closeSiteDesign,
      showSiteDesignButton: false,
    });
    destroyShell = shell.destroy;

    expect(host.querySelector("#design-system-toggle")).toBeNull();
    const workspace = host.querySelector<HTMLElement>("#design-workspace")!;
    await vi.waitFor(() => expect(workspace.classList.contains("hidden")).toBe(false));
    workspace.querySelector<HTMLButtonElement>('[data-p-on="click:closeDesignWorkspace"]')!.click();
    expect(closeSiteDesign).toHaveBeenCalledWith(shell.editor);
    expect(workspace.classList.contains("hidden")).toBe(false);
  });

  test("a dedicated Design host persists and resets from the workspace header", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const savedThemes: Theme[] = [];
    const saveSiteDesign = vi.fn(async (theme: Theme) => {
      savedThemes.push(theme);
    });
    const resetSiteDesign = vi.fn(async () => {});
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme: HEARTH_THEME,
      initialDesignOpen: true,
      saveSiteDesign,
      resetSiteDesign,
    });
    destroyShell = shell.destroy;

    const workspace = host.querySelector<HTMLElement>("#design-workspace")!;
    await vi.waitFor(() => expect(workspace.classList.contains("hidden")).toBe(false));
    workspace.querySelector<HTMLButtonElement>('[data-p-on="click:publishSiteDesign"]')!.click();
    await vi.waitFor(() => expect(saveSiteDesign).toHaveBeenCalledTimes(1));
    expect(savedThemes[0]!.tokens).toEqual(HEARTH_THEME.tokens);
    await vi.waitFor(() => expect(workspace.textContent).toContain("Saved to site"));

    workspace.querySelector<HTMLButtonElement>('[data-p-on="click:resetSiteDesign"]')!.click();
    await vi.waitFor(() => expect(resetSiteDesign).toHaveBeenCalledWith(shell.editor));
  });

  test("a locked host frame surrounds the editable slot without entering serialization", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">Editable</p>',
      media: false,
      theme: HEARTH_THEME,
      frame: {
        html: '<header data-test-locked>Theme header</header><main data-publr-slot="entry-content"></main><footer data-test-locked>Theme footer</footer>',
      },
    });
    destroyShell = shell.destroy;

    expect(canvasQuery("header[data-test-locked]")?.textContent).toBe("Theme header");
    expect(canvasQuery('[data-publr-slot="entry-content"]')?.contains(canvasQuery("#canvas"))).toBe(
      true,
    );
    expect(shell.editor.serialize()).toContain("Editable");
    expect(shell.editor.serialize()).not.toContain("Theme header");
    expect(shell.editor.serialize({ pipeline: "data" })).not.toContain("Theme footer");
  });

  test("Design opens a site-level workspace with contextual previews", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const liveSiteSheet = document.createElement("style");
    liveSiteSheet.dataset.testSiteSheet = "pattern-preview";
    liveSiteSheet.textContent = `
      #canvas { --pbe-test-mirrored-css: ready }
      #canvas > * { background-color: rgb(12 34 56) }
      @media (min-width: 1000px) {
        #canvas > * { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) }
      }
    `;
    document.head.appendChild(liveSiteSheet);
    document.documentElement.style.setProperty("--pbe-test-inherited-theme", "context-ready");
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme: HEARTH_THEME,
    });
    destroyShell = shell.destroy;

    expect(host.querySelector('[data-tab="design"]')).toBeNull();
    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    const workspace = host.querySelector<HTMLElement>("#design-workspace")!;
    const documentWorkspace = host.querySelector<HTMLElement>("#main")!;
    const topbar = host.querySelector<HTMLElement>("#topbar")!;
    await vi.waitFor(() => expect(workspace.classList.contains("hidden")).toBe(false));
    expect(documentWorkspace.classList.contains("hidden")).toBe(true);
    expect(topbar.classList.contains("hidden")).toBe(true);

    host.querySelector<HTMLButtonElement>('[data-context="inverse"]')!.click();
    await vi.waitFor(() =>
      expect(
        workspace
          .querySelector<HTMLButtonElement>('[data-context="inverse"]')!
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(workspace.textContent).toMatch(/Terracotta\s+context/);
    expect(
      workspace
        .querySelector<HTMLButtonElement>('[data-name="color-inverse-surface"][title="Clay"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    host.querySelector<HTMLButtonElement>('[data-context="default"]')!.click();
    await vi.waitFor(() =>
      expect(
        workspace
          .querySelector<HTMLButtonElement>('[data-name="color-surface"][title="Canvas"]')
          ?.getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    const surfaceRole = workspace.querySelector<HTMLButtonElement>(
      '[data-name="color-surface"][aria-expanded]',
    )!;
    expect(surfaceRole.getAttribute("aria-expanded")).toBe("false");
    surfaceRole.click();
    await vi.waitFor(() => expect(surfaceRole.getAttribute("aria-expanded")).toBe("true"));
    workspace
      .querySelector<HTMLButtonElement>('[data-name="color-surface"][title="Brand"]')!
      .click();
    await vi.waitFor(() =>
      expect(tokenValue(activeTheme(), "color-surface")).toBe("var(--color-palette-brand)"),
    );

    const components = host.querySelector<HTMLButtonElement>('button[data-page="components"]')!;
    components.click();
    await vi.waitFor(() => expect(components.getAttribute("aria-current")).toBe("true"));
    expect(workspace.textContent).not.toContain("Live primitive editor");
    expect(workspace.querySelector('[data-block-type="paragraph"]')).not.toBeNull();
    expect(workspace.querySelector('[data-block-type="group"]')).toBeNull();
    expect(workspace.querySelector('[data-block-type="row"]')).toBeNull();
    expect(workspace.querySelector('[data-block-type="html"]')).toBeNull();

    await vi.waitFor(() => expect(shell.isIsolated()).toBe(true));
    expect(workspace.classList.contains("hidden")).toBe(false);
    expect(documentWorkspace.classList.contains("hidden")).toBe(false);
    expect(topbar.classList.contains("hidden")).toBe(true);
    // The editor stays in its original DOM home: reparenting its iframe would
    // reload and blank the editable document. It is positioned over this slot.
    expect(host.querySelector("#main")!.contains(host.querySelector("#editor-column"))).toBe(true);
    expect(host.querySelector("#main")!.contains(host.querySelector("#tree"))).toBe(true);
    expect(host.querySelector("#main")!.contains(host.querySelector("#sidebar"))).toBe(true);
    expect(host.querySelector<HTMLElement>("#template-scope")!.classList.contains("hidden")).toBe(
      true,
    );
    await vi.waitFor(() =>
      expect(host.querySelector("#block-card-title")?.textContent).toBe("Paragraph"),
    );
    const primitiveTreeToggle = host.querySelector<HTMLButtonElement>(
      "#design-primitive-tree-toggle",
    )!;
    primitiveTreeToggle.click();
    await vi.waitFor(() => expect(primitiveTreeToggle.getAttribute("aria-expanded")).toBe("true"));
    expect(host.querySelector<HTMLElement>("#tree")!.classList.contains("hidden")).toBe(false);
    expect(host.querySelector('[data-ttab="outline"]')!.classList.contains("hidden")).toBe(true);
    expect(host.querySelector('[role="group"][aria-label="Text direction"]')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!.click();
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLElement>("#block-styles")!.classList.contains("hidden")).toBe(
        false,
      ),
    );
    const authorColors = [
      ...host.querySelectorAll<HTMLElement>('button[data-prop="textColor"][data-value]'),
    ].map((button) => button.dataset.value);
    expect(authorColors).toContain("foreground");
    expect(authorColors).not.toContain("brand-surface");
    expect(authorColors).not.toContain("inverse-surface");
    expect(authorColors).not.toContain("red-500");
    expect(workspace.textContent).not.toContain("Not in your theme");

    // Compatibility colors remain available to the compiler but never become
    // editable/exported site-theme vocabulary.
    shell.applyTheme(TAILWIND_COMPAT_THEME.tokens);
    const advanced = host.querySelector<HTMLButtonElement>(
      'button[data-page="advanced"][data-p-bind]',
    )!;
    advanced.click();
    await vi.waitFor(() => expect(advanced.getAttribute("aria-current")).toBe("true"));
    expect(workspace.querySelector('[data-name="color-red-500"]')).toBeNull();
    const themeExport = workspace.querySelector<HTMLElement>('[data-p-text="$designExport"]');
    expect(themeExport?.textContent).not.toContain("--color-red-500");
    expect(themeExport?.textContent).toContain("--color-accent-surface:");
    const transferPanel = workspace.querySelector<HTMLElement>(
      '[data-p-show="$designTokenTransferShown"]',
    )!;
    expect(transferPanel.classList.contains("hidden")).toBe(true);
    host.querySelector<HTMLButtonElement>('[data-p-on="click:openDesignTransfer"]')!.click();
    await vi.waitFor(() => expect(transferPanel.classList.contains("hidden")).toBe(false));
    components.click();
    await vi.waitFor(() => expect(components.getAttribute("aria-current")).toBe("true"));

    host.querySelector<HTMLButtonElement>("#design-primitive-cancel")!.click();
    await vi.waitFor(() => expect(workspace.textContent).toContain("Changes reverted"));
    expect(shell.isIsolated()).toBe(true);
    expect(components.getAttribute("aria-current")).toBe("true");
    expect(host.querySelector("#main")!.contains(host.querySelector("#editor-column"))).toBe(true);
    const primitiveSave = host.querySelector<HTMLButtonElement>("#design-primitive-save")!;
    expect(getComputedStyle(primitiveSave).color).toBe("rgb(23, 23, 23)");
    primitiveSave.click();
    await vi.waitFor(() => expect(workspace.textContent).toContain("Paragraph default saved"));
    expect(shell.isIsolated()).toBe(true);

    const patterns = host.querySelector<HTMLButtonElement>('button[data-page="patterns"]')!;
    patterns.click();
    await vi.waitFor(() => expect(patterns.getAttribute("aria-current")).toBe("true"));
    expect(
      workspace
        .querySelector<HTMLElement>("[data-design-workspace-sidebar]")!
        .classList.contains("hidden"),
    ).toBe(true);
    const patternPage = workspace.querySelector<HTMLElement>('[data-design-preview="patterns"]')!;
    expect(patternPage.querySelector("[data-design-pattern-grid]")).not.toBeNull();
    const previewHolder = patternPage.querySelector<HTMLElement>('[data-pattern-preview="hero"]')!;
    expect(previewHolder.dataset.patternPreviewShape).toBe("square");
    expect(getComputedStyle(previewHolder).backgroundColor).toBe("rgb(36, 38, 38)");
    await vi.waitFor(() => {
      const bounds = previewHolder.getBoundingClientRect();
      expect(bounds.width).toBeGreaterThan(0);
      expect(Math.abs(bounds.width - bounds.height)).toBeLessThan(1);
    });
    const preview = patternPage.querySelector<HTMLIFrameElement>(
      '[data-pattern-preview="hero"] iframe',
    )!;
    await vi.waitFor(() => expect(preview.contentDocument?.querySelector("#canvas")).toBeTruthy());
    expect(preview.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(preview.contentDocument!.querySelector("#editor-shell")).toBeNull();
    expect(
      getComputedStyle(preview.contentDocument!.querySelector<HTMLElement>("#canvas")!)
        .getPropertyValue("--pbe-test-mirrored-css")
        .trim(),
    ).toBe("ready");
    expect(
      getComputedStyle(preview.contentDocument!.querySelector<HTMLElement>("#canvas")!)
        .getPropertyValue("--pbe-test-inherited-theme")
        .trim(),
    ).toBe("context-ready");
    const previewRoot = preview.contentDocument!.querySelector<HTMLElement>("#canvas > *")!;
    expect(getComputedStyle(previewRoot).backgroundColor).toBe("rgb(12, 34, 56)");
    expect(getComputedStyle(previewRoot).gridTemplateColumns.split(" ")).toHaveLength(4);
    expect(documentWorkspace.contains(host.querySelector("#tree"))).toBe(true);
    expect(host.querySelector<HTMLElement>("#tree")!.classList.contains("hidden")).toBe(true);
    expect(documentWorkspace.contains(host.querySelector("#editor-column"))).toBe(true);
    expect(documentWorkspace.contains(host.querySelector("#sidebar"))).toBe(true);
    workspace
      .querySelector<HTMLElement>('[data-design-pattern-card][data-pattern="hero"]')!
      .click();
    await vi.waitFor(() => expect(shell.isIsolated()).toBe(true));
    const patternStage = host.querySelector<HTMLElement>("#editor-content")!;
    const patternViewport = host.querySelector<HTMLElement>(".pbe-canvas-viewport")!;
    expect(patternStage.hasAttribute("data-isolation-stage")).toBe(true);
    expect(getComputedStyle(patternStage).display).toBe("flex");
    await vi.waitFor(() => expect(patternViewport.style.height).toMatch(/^\d+px$/));
    expect(topbar.classList.contains("hidden")).toBe(false);
    expect(host.querySelector("#inserter-toggle")).not.toBeNull();
    expect(host.querySelector("#undo")).not.toBeNull();
    expect(host.querySelector("#redo")).not.toBeNull();
    const patternTreeToggle = host.querySelector<HTMLButtonElement>("#tree-toggle")!;
    patternTreeToggle.click();
    await vi.waitFor(() => expect(patternTreeToggle.getAttribute("aria-expanded")).toBe("true"));
    expect(host.querySelector<HTMLElement>("#tree")!.classList.contains("hidden")).toBe(false);
    expect(host.querySelector<HTMLElement>("#template-scope")!.classList.contains("hidden")).toBe(
      false,
    );
    expect(host.querySelector("#editor-shell")!.classList.contains("pbe-isolation")).toBe(true);
    // The morphing bar: page-scoped tools + host actions yield to the mode's
    // Cancel/commit pair; pattern isolation paints the bar blue and keeps its
    // white commit action legible.
    expect(host.querySelector<HTMLElement>("#host-actions")!.classList.contains("hidden")).toBe(
      true,
    );
    expect(host.querySelector<HTMLElement>("#more-dropdown")!.classList.contains("hidden")).toBe(
      true,
    );
    expect(
      host.querySelector<HTMLElement>("#design-system-toggle")!.classList.contains("hidden"),
    ).toBe(true);
    expect(host.querySelector<HTMLElement>("#preview")!.classList.contains("hidden")).toBe(true);
    expect(host.querySelector("#editor-shell")!.classList.contains("pbe-isolation-pattern")).toBe(
      true,
    );
    expect(getComputedStyle(topbar).backgroundColor).toBe("rgb(40, 90, 225)");
    const templateSave = host.querySelector<HTMLButtonElement>("#template-save")!;
    expect(getComputedStyle(templateSave).backgroundColor).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(templateSave).color).toBe("rgb(23, 59, 158)");
    host.querySelector<HTMLButtonElement>("#template-cancel")!.click();
    await vi.waitFor(() => expect(workspace.classList.contains("hidden")).toBe(false));
    expect(patterns.getAttribute("aria-current")).toBe("true");
    expect(patternStage.hasAttribute("data-isolation-stage")).toBe(false);
    expect(patternViewport.style.height).toBe("100%");
    // Leaving the mode restores the page chrome: host actions + tools return.
    expect(host.querySelector<HTMLElement>("#host-actions")!.classList.contains("hidden")).toBe(
      false,
    );
    expect(host.querySelector("#editor-shell")!.classList.contains("pbe-isolation")).toBe(false);

    host.querySelector<HTMLButtonElement>('[aria-label="Back to document"]')!.click();
    await vi.waitFor(() => expect(workspace.classList.contains("hidden")).toBe(true));
    expect(documentWorkspace.classList.contains("hidden")).toBe(false);
    expect(topbar.classList.contains("hidden")).toBe(false);
  });

  test("themes own their semantic roles and named color contexts", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    host.querySelector<HTMLButtonElement>('button[data-page="foundations"]')!.click();
    const workspace = host.querySelector<HTMLElement>("#design-workspace")!;
    await vi.waitFor(() =>
      expect(
        workspace.querySelectorAll('[data-design-preview="foundations"] button[data-context]')
          .length,
      ).toBe(1),
    );
    expect(colorContexts(activeTheme()).map((context) => context.key)).toEqual(["default"]);

    workspace
      .querySelector<HTMLButtonElement>('[data-p-on="click:designToggleContextForm"]')!
      .click();
    const contextForm = workspace.querySelector<HTMLElement>("[data-context-add]")!;
    const [contextLabel, contextKey] = [...contextForm.querySelectorAll<HTMLInputElement>("input")];
    contextLabel.value = "Night";
    contextKey.value = "night";
    contextForm.querySelector<HTMLButtonElement>("button")!.click();
    await vi.waitFor(() =>
      expect(colorContexts(activeTheme()).map((context) => context.key)).toEqual([
        "default",
        "night",
      ]),
    );
    expect(tokenValue(activeTheme(), "color-night-surface")).toBe(
      tokenValue(activeTheme(), "color-surface"),
    );

    const contextName = workspace.querySelector<HTMLInputElement>(
      'input[data-context="night"][aria-label="Context name"]',
    )!;
    contextName.value = "After dark";
    contextName.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(colorContexts(activeTheme()).find((context) => context.key === "night")?.label).toBe(
        "After dark",
      ),
    );

    workspace
      .querySelector<HTMLButtonElement>(
        'button[data-name="color-night-accent-surface"][data-p-on="click:designToggleSemantic"]',
      )!
      .click();
    const paletteReference = workspace.querySelector<HTMLButtonElement>(
      'button[data-name="color-night-accent-surface"][data-p-on="click:designSetSemanticToken"]',
    )!;
    paletteReference.click();
    await vi.waitFor(() =>
      expect(tokenValue(activeTheme(), "color-night-accent-surface")).toMatch(
        /^var\(--color-palette-/,
      ),
    );

    workspace.querySelector<HTMLButtonElement>('[data-p-on="click:designToggleRoleForm"]')!.click();
    const roleForm = workspace.querySelector<HTMLElement>("[data-role-add]")!;
    const [roleLabel, roleKey] = [...roleForm.querySelectorAll<HTMLInputElement>("input")];
    roleLabel.value = "Notice";
    roleKey.value = "notice";
    roleForm.querySelector<HTMLButtonElement>("button")!.click();
    await vi.waitFor(() =>
      expect(semanticColorRoles(activeTheme()).map((role) => role.key)).toContain("notice"),
    );
    expect(tokenValue(activeTheme(), "color-notice")).toBeTruthy();
    expect(tokenValue(activeTheme(), "color-night-notice")).toBeTruthy();

    const roleName = workspace.querySelector<HTMLInputElement>(
      'input[data-role="notice"][data-field="label"]',
    )!;
    roleName.value = "Callout";
    roleName.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(semanticColorRoles(activeTheme()).find((role) => role.key === "notice")?.label).toBe(
        "Callout",
      ),
    );

    workspace
      .querySelector<HTMLButtonElement>(
        'button[data-role="notice"][data-p-on="click:designRemoveRole"]',
      )!
      .click();
    await vi.waitFor(() =>
      expect(semanticColorRoles(activeTheme()).some((role) => role.key === "notice")).toBe(false),
    );
    expect(tokenValue(activeTheme(), "color-notice")).toBeUndefined();
    expect(tokenValue(activeTheme(), "color-night-notice")).toBeUndefined();

    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    const [patternRoot] = shell.editor.insertPattern("hero")!;
    shell.editor.selectBlock(patternRoot.id);
    await vi.waitFor(() =>
      expect(host.querySelector('#pattern-context [data-context="night"]')).not.toBeNull(),
    );
    const contextAccent = host.querySelector<HTMLElement>(
      '#pattern-context [data-context="night"] .pbe-pattern-context__preview b',
    )!;
    expect(contextAccent.style.backgroundColor).not.toBe("");
    expect(contextAccent.style.backgroundColor).toBe(paletteReference.style.backgroundColor);

    workspace
      .querySelector<HTMLButtonElement>(
        'button[data-context="night"][data-p-on="click:designRemoveContext"]',
      )!
      .click();
    await vi.waitFor(() =>
      expect(colorContexts(activeTheme()).map((context) => context.key)).toEqual(["default"]),
    );
    expect(tokenValue(activeTheme(), "color-night-surface")).toBeUndefined();
  });

  test("a theme can predefine validated patterns alongside its tokens", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme: {
        ...DEFAULT_THEME,
        patterns: [
          {
            name: "theme-callout",
            label: "Theme callout",
            category: "Theme",
            content:
              '<div data-pb-block="group" data-pb-tag="tag" data-pb-children><h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Theme pattern</h2><p data-pb-block="paragraph" data-pb-rich="body">Bundled with the theme.</p></div>',
          },
        ],
      },
    });
    destroyShell = shell.destroy;

    expect(getPattern("theme-callout")).toMatchObject({
      label: "Theme callout",
      category: "Theme",
    });
    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    host.querySelector<HTMLButtonElement>('button[data-page="patterns"]')!.click();
    await vi.waitFor(() =>
      expect(
        host.querySelector<HTMLButtonElement>('[data-pattern="theme-callout"]'),
      ).not.toBeNull(),
    );
    const themeCategory = host.querySelector<HTMLButtonElement>(
      'button[data-design-pattern-category="Theme"]',
    )!;
    expect(themeCategory).not.toBeNull();
    expect(themeCategory.textContent).toContain("1");
    themeCategory.click();
    await vi.waitFor(() => {
      const cards = [...host.querySelectorAll<HTMLElement>("[data-design-pattern-card]")];
      expect(cards).toHaveLength(1);
      expect(cards[0].dataset.pattern).toBe("theme-callout");
      expect(cards[0].dataset.category).toBe("Theme");
    });

    host.querySelector<HTMLButtonElement>('button[data-design-pattern-category="All"]')!.click();
    await vi.waitFor(() =>
      expect(
        host.querySelector<HTMLElement>('[data-design-pattern-card][data-pattern="hero"]'),
      ).not.toBeNull(),
    );
  });

  test("primitive buttons use the site accent while selected and while editing text", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const theme = {
      tokens: DEFAULT_THEME.tokens.map((token) =>
        token.name === "color-accent-surface"
          ? { ...token, value: "#ff006e" }
          : token.name === "color-accent-foreground"
            ? { ...token, value: "#120009" }
            : token.name === "color-muted-surface"
              ? { ...token, value: "#00ff00" }
              : token,
      ),
    };
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">hi</p>',
      media: false,
      theme,
      appearance: "dark",
    });
    destroyShell = shell.destroy;

    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    host.querySelector<HTMLButtonElement>('button[data-page="components"]')!.click();
    await vi.waitFor(() => expect(shell.isIsolated()).toBe(true));
    const buttonPrimitive = host.querySelector<HTMLButtonElement>(
      '#design-workspace [data-block-type="button"]',
    )!;
    expect(buttonPrimitive).not.toBeNull();
    buttonPrimitive.click();
    await vi.waitFor(() =>
      expect(host.querySelector("#block-card-title")?.textContent).toBe("Button"),
    );
    let button!: HTMLElement;
    await vi.waitFor(() => {
      button = canvasQuery<HTMLElement>('#canvas [data-pb-block="button"]')!;
      expect(button).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(button.classList.contains("pbe-selected")).toBe(true);
      expect(getComputedStyle(button).backgroundColor).toBe("rgb(255, 0, 110)");
      expect(getComputedStyle(button).color).toBe("rgb(18, 0, 9)");
    });
    const toolbarButton = canvasDocument()
      .querySelector<HTMLElement>("[data-pbe-inline-chrome]")!
      .shadowRoot!.querySelector<HTMLButtonElement>(".pbe-toolbar button")!;
    expect(toolbarButton).not.toBeNull();
    expect(getComputedStyle(toolbarButton).color).not.toBe("rgb(18, 0, 9)");

    button.focus();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(getComputedStyle(button).backgroundColor).toBe("rgb(255, 0, 110)");
    expect(getComputedStyle(button).color).toBe("rgb(18, 0, 9)");

    host.querySelector<HTMLButtonElement>('#design-workspace [data-block-type="image"]')!.click();
    let placeholder!: HTMLElement;
    await vi.waitFor(() => {
      placeholder = canvasQuery<HTMLElement>("#canvas .pbe-media-ph")!;
      expect(placeholder).not.toBeNull();
    });
    const placeholderSurface = placeholder.shadowRoot!.querySelector<HTMLElement>(".card")!;
    expect(getComputedStyle(placeholderSurface).backgroundColor).toBe("oklch(0.269 0 0)");
    expect(getComputedStyle(placeholderSurface).color).toBe("oklch(0.985 0 0)");
  });

  test("iframe chrome inherits dark appearance, dismisses across documents, and formats text", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<p data-pb-block="paragraph" data-pb-rich="body">Make this bold</p>' +
        '<figure data-pb-block="image"><img data-pb-image="image" src="/kitchen.jpg" alt=""><figcaption data-pb-rich="caption"></figcaption></figure>',
      media: false,
      theme: HEARTH_THEME,
      appearance: "dark",
    });
    destroyShell = shell.destroy;

    const chrome = canvasDocument().querySelector<HTMLElement>(
      "[data-pbe-inline-chrome]",
    )!.shadowRoot!;
    const toolbar = chrome.querySelector<HTMLElement>(".pbe-toolbar")!;
    const carrier = canvasQuery<HTMLElement>('[data-pb-block="paragraph"]')!;
    const text = carrier.firstChild!;
    carrier.focus();
    const range = canvasDocument().createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    const selection = canvasDocument().defaultView!.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const bold = chrome.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')!;
    await vi.waitFor(() => expect(bold.hidden).toBe(false));
    expect(getComputedStyle(toolbar).backgroundColor).toBe("oklch(0.205 0 0)");
    expect(getComputedStyle(toolbar).color).toBe("oklch(0.985 0 0)");
    bold.click();
    expect(shell.editor.getModel().blocks[0].fields.body).toBe("<b>Make</b> this bold");
    expect(selection.toString()).toBe("Make");

    const image = shell.editor.getModel().blocks[1];
    shell.editor.selectBlock(image.id);
    let replace!: HTMLButtonElement;
    await vi.waitFor(() => {
      replace = chrome.querySelector<HTMLButtonElement>('button[aria-label="Replace"]')!;
      expect(replace?.hidden).toBe(false);
    });
    replace.click();
    const panel = chrome.querySelector<HTMLElement>(".pbe-replace")!;
    expect(panel.hidden).toBe(false);
    host
      .querySelector<HTMLElement>("#topbar")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(panel.hidden).toBe(true);
  });

  test("contextual semantic colors are visible and selected in block controls", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<div data-pb-block="group" data-pb-tag="tag" data-pb-children class="bg-[var(--color-brand-surface)] text-[var(--color-brand-foreground)]"><p data-pb-block="paragraph" data-pb-rich="body">Brand panel</p></div>',
      media: false,
      // Contexts are theme data, not inferred product constants. Declaring
      // Brand makes its complete role set available to controls.
      theme: {
        tokens: [{ name: "font-sans", value: "system-ui" }],
        semanticColorRoles: DEFAULT_THEME.semanticColorRoles,
        colorContexts: [
          { key: "default", label: "Default" },
          { key: "brand", label: "Brand" },
        ],
      },
    });
    destroyShell = shell.destroy;

    const root = shell.editor.getModel().blocks[0];
    shell.editor.selectBlock(root.id);
    const stylesTab = host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!;
    await vi.waitFor(() => expect(stylesTab.disabled).toBe(false));
    stylesTab.click();
    await vi.waitFor(() =>
      expect(
        host
          .querySelector('[data-prop="backgroundColor"][data-value="brand-surface"]')
          ?.getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(
      host
        .querySelector('[data-prop="textColor"][data-value="brand-foreground"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(host.querySelector('[data-prop="textColor"][data-value="surface"]')).toBeNull();
    expect(host.querySelector('[data-prop="textColor"][data-value="inverse-surface"]')).toBeNull();
    expect(host.textContent).toContain("Brand");
  });

  test("pattern roots expose their base and responsive layout recipe", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: getPattern("home-giveaway")!.content,
      media: false,
      theme: HEARTH_THEME,
    });
    destroyShell = shell.destroy;

    const root = shell.editor.getModel().blocks[0];
    expect(root.type).toBe("group");
    shell.editor.selectBlock(root.id, { toggle: true });
    host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!.click();
    await selectViewportBreakpoint("base", "mobile");

    await vi.waitFor(() =>
      expect(
        host
          .querySelector('#viewport-switcher button[data-device="mobile"]')
          ?.getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(host.querySelector('[data-context="inverse"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    const boxPadding = (side: string): HTMLButtonElement =>
      host.querySelector<HTMLButtonElement>(
        `.pbe-box-model__value[data-kind="padding"][data-side="${side}"]`,
      )!;
    expect(boxPadding("Left").textContent).toBe("8");
    expect(boxPadding("Right").textContent).toBe("8");
    expect(boxPadding("Top").textContent).toBe("10");
    expect(boxPadding("Bottom").textContent).toBe("10");
    expect(
      host.querySelector('[data-publr-component="token-scale"] [data-prop="paddingInline"]'),
    ).toBeNull();
    const tokenScale = (prop: string): HTMLElement =>
      host
        .querySelector<HTMLElement>(`[data-publr-component="token-scale"] [data-prop="${prop}"]`)!
        .closest<HTMLElement>('[data-publr-component="token-scale"]')!;
    const tokenScaleValue = (prop: string): string =>
      tokenScale(prop).querySelector<HTMLInputElement>('input[type="text"]')?.value ??
      tokenScale(prop).querySelector<HTMLInputElement>('input[type="range"]')!.value;
    host.querySelector<HTMLButtonElement>('[data-itab="settings"]')!.click();
    await vi.waitFor(() => expect(tokenScaleValue("gridColumns")).toBe("1"));

    await selectViewportBreakpoint("md", "tablet");
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLElement>(".pbe-canvas-viewport")!.style.width).toBe("768px"),
    );
    expect(tokenScaleValue("gridColumns")).toBe("1fr auto 1fr");

    await selectViewportBreakpoint("lg", "desktop");
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLElement>(".pbe-canvas-viewport")!.style.width).toBe("1024px"),
    );
    host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!.click();
    expect(boxPadding("Left").textContent).toBe("20");
    expect(boxPadding("Right").textContent).toBe("20");
  });

  test("the unified box model edits Border width and previews its layers", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-id="P" data-pb-block="paragraph" data-pb-rich="body">Border</p>',
      media: false,
      theme: DEFAULT_THEME,
      cssEngine: wasmCssEngine(),
    });
    destroyShell = shell.destroy;
    shell.editor.selectBlock("P", { toggle: true });
    host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!.click();

    expect(
      host.querySelector(
        '#block-border [data-publr-component="token-scale"] input[data-prop="borderWidth"]',
      ),
    ).toBeNull();
    expect(host.querySelector(".pbe-box-model__link")).toBeNull();
    expect(host.querySelectorAll(".pbe-box-model__radius-corner")).toHaveLength(4);
    for (const use of host.querySelectorAll(".pbe-box-model__radius-corner use"))
      expect(use.getAttribute("href")).toBe("#pbe-i-border-radius-corner");
    const borderTop = host.querySelector<HTMLButtonElement>(
      '.pbe-box-model__value[data-kind="border"][data-side="Top"]',
    )!;
    borderTop.click();

    let component!: HTMLElement;
    await vi.waitFor(() => {
      component = host
        .querySelector<HTMLInputElement>(
          '.pbe-box-model__control [data-publr-component="token-scale"] input[data-kind="border"][data-prop="borderWidth"]',
        )!
        .closest<HTMLElement>('[data-publr-component="token-scale"]')!;
      expect(component).toBeTruthy();
    });
    expect(host.querySelector(".pbe-spacing-pane__header strong")?.textContent).toBe("Border");
    expect(host.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe("Top");
    host
      .querySelector<HTMLButtonElement>(
        '.pbe-box-model__value[data-kind="border"][data-side="Right"]',
      )!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    await vi.waitFor(() =>
      expect(host.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe("Top, Right"),
    );
    expect(
      host
        .querySelector('.pbe-box-model__control input[data-prop="borderWidth"]')
        ?.closest('[data-publr-component="token-scale"]')
        ?.querySelectorAll(".pbe-spacing-side svg"),
    ).toHaveLength(2);
    host.querySelector<HTMLButtonElement>('.pbe-spacing-pane__sync[data-mode="all"]')!.click();
    await vi.waitFor(() =>
      expect(host.querySelector(".pbe-spacing-pane__header strong")?.textContent).toBe("Border"),
    );
    expect(host.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe("All sides");
    expect(
      host
        .querySelector('.pbe-box-model__control input[data-prop="borderWidth"]')
        ?.closest('[data-publr-component="token-scale"]')
        ?.querySelectorAll(".pbe-spacing-side svg"),
    ).toHaveLength(4);
    expect(
      host
        .querySelector<HTMLButtonElement>('.pbe-spacing-pane__sync[data-mode="pair"]')
        ?.classList.contains("hidden"),
    ).toBe(false);
    expect(
      host.querySelector(
        '.pbe-box-model__control input[data-kind="border"][data-prop="borderRadius"]',
      ),
    ).toBeNull();
    const borderColorField = host
      .querySelector(".pbe-box-model__control .pbe-spacing-pane__color")
      ?.closest<HTMLElement>(".pbe-spacing-pane__field");
    expect(borderColorField?.classList.contains("hidden")).toBe(true);
    expect(
      [
        ...host.querySelectorAll<HTMLElement>(
          ".pbe-box-model__control .pbe-spacing-pane__field-label",
        ),
      ]
        .filter(
          (label) =>
            !label.classList.contains("hidden") &&
            !label.closest<HTMLElement>(".pbe-spacing-pane__field")?.classList.contains("hidden"),
        )
        .map((label) => label.textContent?.trim()),
    ).toEqual([]);

    const range = host.querySelector<HTMLInputElement>(
      '.pbe-box-model__control input[type="range"][data-prop="borderWidth"]',
    )!;
    range.value = "1";
    range.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(shell.editor.getStyle("P", "borderWidth")).toBe("1");
      expect(borderColorField?.classList.contains("hidden")).toBe(false);
    });
    const recommendedColors = host.querySelectorAll(
      ".pbe-box-model__control .pbe-spacing-pane__color",
    ).length;
    host
      .querySelector<HTMLButtonElement>(
        '.pbe-spacing-pane__color-tabs button[data-tier="semantic"]',
      )!
      .click();
    await vi.waitFor(() =>
      expect(
        host.querySelectorAll(".pbe-box-model__control .pbe-spacing-pane__color").length,
      ).toBeGreaterThan(recommendedColors),
    );
    host
      .querySelector<HTMLButtonElement>(
        '.pbe-spacing-pane__color-tabs button[data-tier="recommended"]',
      )!
      .click();
    const initialColor = host.querySelector<HTMLButtonElement>(
      ".pbe-box-model__control .pbe-spacing-pane__color",
    )!;
    const selectedBlock = canvasQuery<HTMLElement>('[data-pb-id="P"]')!;
    const canvasView = selectedBlock.ownerDocument.defaultView!;
    const previousBorderColor = canvasView.getComputedStyle(selectedBlock).borderTopColor;
    initialColor.click();
    await vi.waitFor(() => expect(shell.editor.getStyle("P", "borderColor")).not.toBe(""));
    const initialBorderColor = shell.editor.getStyle("P", "borderColor");
    expect(shell.editor.getStyle("P", "borderWidth")).toBe("1");
    expect(shell.editor.getStyle("P", "borderStyle")).toBe("solid");
    await vi.waitFor(() =>
      expect(canvasView.getComputedStyle(selectedBlock).borderTopColor).not.toBe(
        previousBorderColor,
      ),
    );

    range.value = "2";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(shell.editor.getStyle("P", "borderWidth")).toBe("2"));

    component.querySelector<HTMLButtonElement>('[aria-label="Set custom value"]')!.click();
    await vi.waitFor(() =>
      expect(component.querySelector<HTMLInputElement>('input[type="number"]')).toBeTruthy(),
    );
    const number = component.querySelector<HTMLInputElement>('input[type="number"]')!;
    number.value = "3";
    number.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(shell.editor.getStyle("P", "borderWidth")).toBe("3px"));

    host
      .querySelector<HTMLButtonElement>(
        '.pbe-box-model__value[data-kind="border"][data-side="Top"]',
      )!
      .click();
    await vi.waitFor(() =>
      expect(host.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe("Top"),
    );
    const topWidth = host.querySelector<HTMLInputElement>(
      '.pbe-box-model__control input[type="number"][data-prop="borderWidth"]',
    )!;
    topWidth.value = "4";
    topWidth.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(shell.editor.getStyle("P", "borderTopWidth")).toBe("4px"));
    expect(shell.editor.getStyle("P", "borderRightWidth")).toBe("3px");
    expect(shell.editor.getStyle("P", "borderWidth")).toBe("");

    host
      .querySelector<HTMLButtonElement>(
        '.pbe-box-model__radius-corner[data-corner="borderTopLeftRadius"]',
      )!
      .click();
    await vi.waitFor(() =>
      expect(host.querySelector(".pbe-spacing-pane__header strong")?.textContent).toBe(
        "Border Radius",
      ),
    );
    expect(host.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe("Top Left");
    expect(
      getComputedStyle(
        host.querySelector<HTMLElement>(".pbe-box-model__border > .pbe-box-model__label")!,
      ).opacity,
    ).toBe("0");
    expect(host.querySelector('.pbe-box-model__control input[data-prop="borderWidth"]')).toBeNull();
    expect(borderColorField?.classList.contains("hidden")).toBe(true);
    const radiusField = host.querySelector<HTMLElement>(".pbe-spacing-pane__radius")!;
    expect(getComputedStyle(radiusField).borderTopWidth).toBe("0px");
    expect(
      host.querySelectorAll('.pbe-spacing-pane__radius [data-publr-component="token-scale"]'),
    ).toHaveLength(1);
    const allCorners = host.querySelector<HTMLButtonElement>(".pbe-spacing-pane__sync--corners")!;
    expect(allCorners.classList.contains("hidden")).toBe(false);
    expect(allCorners.querySelectorAll("use")).toHaveLength(4);
    allCorners.click();
    await vi.waitFor(() => {
      expect(host.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe(
        "All corners",
      );
      expect(
        host.querySelectorAll('.pbe-box-model__radius-corner[aria-pressed="true"]'),
      ).toHaveLength(4);
    });
    allCorners.click();
    await vi.waitFor(() =>
      expect(host.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe("Top Left"),
    );
    expect(
      host
        .querySelector('[data-prop="borderTopLeftRadius"]')!
        .closest('[data-publr-component="token-scale"]')
        ?.querySelector("use")
        ?.getAttribute("href"),
    ).toBe("#pbe-i-border-radius-top-left");
    const topLeftRadius = host.querySelector<HTMLInputElement>(
      '.pbe-spacing-pane__radius input[type="range"][data-prop="borderTopLeftRadius"]',
    )!;
    topLeftRadius.value = "1";
    topLeftRadius.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(shell.editor.getStyle("P", "borderTopLeftRadius")).not.toBe("");
      expect(
        host.querySelector(
          '.pbe-box-model__radius-corner[data-corner="borderTopLeftRadius"] > span',
        )?.textContent,
      ).toBe(shell.editor.getStyle("P", "borderTopLeftRadius"));
    });
    const topLeftRadiusButton = host.querySelector<HTMLElement>(
      '.pbe-box-model__radius-corner[data-corner="borderTopLeftRadius"]',
    )!;
    const topLeftRadiusValue = topLeftRadiusButton.querySelector<HTMLElement>("span")!;
    expect(getComputedStyle(topLeftRadiusValue).color).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(topLeftRadiusValue).fontSize).toBe("10px");
    expect(getComputedStyle(topLeftRadiusValue).left).toBe("12px");
    expect(getComputedStyle(topLeftRadiusValue).top).toBe("10px");
    expect(getComputedStyle(topLeftRadiusButton.querySelector("svg")!).opacity).toBe("0.5");
    const topRightRadiusValue = host.querySelector<HTMLElement>(
      '.pbe-box-model__radius-corner[data-corner="borderTopRightRadius"] > span',
    )!;
    expect(getComputedStyle(topRightRadiusValue).right).toBe("12px");
    expect(getComputedStyle(topRightRadiusValue).top).toBe("10px");
    const bottomRightRadiusValue = host.querySelector<HTMLElement>(
      '.pbe-box-model__radius-corner[data-corner="borderBottomRightRadius"] > span',
    )!;
    expect(getComputedStyle(bottomRightRadiusValue).right).toBe("12px");
    expect(getComputedStyle(bottomRightRadiusValue).bottom).toBe("10px");
    const bottomLeftRadiusValue = host.querySelector<HTMLElement>(
      '.pbe-box-model__radius-corner[data-corner="borderBottomLeftRadius"] > span',
    )!;
    expect(getComputedStyle(bottomLeftRadiusValue).left).toBe("12px");
    expect(getComputedStyle(bottomLeftRadiusValue).bottom).toBe("10px");
    expect(
      host.querySelector('.pbe-box-model__radius-corner[data-corner="borderTopRightRadius"] > span')
        ?.textContent,
    ).toBe("");
    host
      .querySelector<HTMLButtonElement>(
        '.pbe-box-model__radius-corner[data-corner="borderBottomRightRadius"]',
      )!
      .click();
    await vi.waitFor(() => {
      expect(host.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe(
        "Bottom Right",
      );
      expect(topLeftRadiusButton.getAttribute("aria-pressed")).toBe("false");
    });
    expect(
      getComputedStyle(
        host.querySelector<HTMLElement>(".pbe-box-model__border > .pbe-box-model__label")!,
      ).opacity,
    ).toBe("0");
    expect(getComputedStyle(topLeftRadiusButton).opacity).toBe("1");
    topLeftRadiusButton.click();
    await vi.waitFor(() =>
      expect(host.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe("Top Left"),
    );
    host
      .querySelector<HTMLButtonElement>(
        '.pbe-box-model__radius-corner[data-corner="borderBottomRightRadius"]',
      )!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    await vi.waitFor(() => {
      expect(host.querySelector(".pbe-spacing-pane__header small")?.textContent).toBe(
        "Top Left, Bottom Right",
      );
      expect(
        host.querySelectorAll('.pbe-spacing-pane__radius [data-publr-component="token-scale"]'),
      ).toHaveLength(1);
      const iconLayers = host.querySelectorAll<SVGElement>(
        ".pbe-spacing-pane__radius .pbe-spacing-side svg",
      );
      expect(iconLayers).toHaveLength(2);
    });
    const combinedRadius = host.querySelector<HTMLInputElement>(
      '.pbe-spacing-pane__radius .pbe-token-scale:not(.pbe-token-scale--custom) input[type="range"]',
    )!;
    combinedRadius.value = "2";
    combinedRadius.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(shell.editor.getStyle("P", "borderBottomRightRadius")).not.toBe("");
      expect(shell.editor.getStyle("P", "borderBottomRightRadius")).toBe(
        shell.editor.getStyle("P", "borderTopLeftRadius"),
      );
      expect(
        host.querySelector(
          '.pbe-box-model__radius-corner[data-corner="borderBottomRightRadius"] > span',
        )?.textContent,
      ).toBe(shell.editor.getStyle("P", "borderBottomRightRadius"));
    });
    expect(shell.editor.getStyle("P", "borderRadius")).toBe("");
    expect(shell.editor.getStyle("P", "borderTopLeftRadius")).not.toBe("");
    expect(selectedBlock.classList.contains("pbe-selected")).toBe(true);
    expect(canvasView.getComputedStyle(selectedBlock).borderTopLeftRadius).not.toBe("2px");

    host
      .querySelector<HTMLButtonElement>(
        '.pbe-box-model__value[data-kind="border"][data-side="Top"]',
      )!
      .click();
    const color = host.querySelector<HTMLButtonElement>(
      ".pbe-box-model__control .pbe-spacing-pane__color",
    )!;
    color.click();
    await vi.waitFor(() => expect(shell.editor.getStyle("P", "borderTopColor")).not.toBe(""));
    expect(shell.editor.getStyle("P", "borderRightColor")).toBe(initialBorderColor);
    host
      .querySelector<HTMLButtonElement>(
        '.pbe-box-model__value[data-kind="border"][data-side="Right"]',
      )!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    await vi.waitFor(() =>
      expect(
        host
          .querySelector<HTMLButtonElement>(
            '.pbe-box-model__value[data-kind="border"][data-side="Right"]',
          )
          ?.getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    const colors = host.querySelectorAll<HTMLButtonElement>(
      ".pbe-box-model__control .pbe-spacing-pane__color",
    );
    colors[colors.length - 1]!.click();
    await vi.waitFor(() =>
      expect(shell.editor.getStyle("P", "borderRightColor")).toBe(
        shell.editor.getStyle("P", "borderTopColor"),
      ),
    );
    host
      .querySelector<HTMLButtonElement>('.pbe-spacing-pane__color-tabs button[data-tier="custom"]')!
      .click();
    const customColor = host.querySelector<HTMLInputElement>(
      '.pbe-spacing-pane__custom-color input[type="text"]',
    )!;
    customColor.value = "#123456";
    customColor.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(shell.editor.getStyle("P", "borderTopColor")).toBe("#123456"));
    expect(shell.editor.getStyle("P", "borderRightColor")).toBe("#123456");

    const frame = host.querySelector<HTMLIFrameElement>("#editor-frame")!;
    const canvasDoc = frame.contentDocument!;
    const paddingLayer = host.querySelector<HTMLElement>(".pbe-box-model__padding")!;
    const marginLayer = host.querySelector<HTMLElement>(".pbe-box-model__margin")!;
    const borderLayer = host.querySelector<HTMLElement>(".pbe-box-model__border")!;
    const previewedBlock = canvasDoc.querySelector<HTMLElement>('[data-pb-id="P"]')!;

    for (const side of ["top", "right", "bottom", "left"]) {
      previewedBlock.style.setProperty(`border-${side}-width`, "0px", "important");
    }
    previewedBlock.style.setProperty("padding", "0px", "important");
    previewedBlock.style.setProperty("margin", "0px", "important");
    borderLayer.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(canvasDoc.querySelector("[data-pbe-box-layer-preview]")).toBeNull();
    borderLayer.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    paddingLayer.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(canvasDoc.querySelector("[data-pbe-box-layer-preview]")).toBeNull();
    paddingLayer.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    marginLayer.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(canvasDoc.querySelector("[data-pbe-box-layer-preview]")).toBeNull();
    marginLayer.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));

    previewedBlock.style.setProperty("padding", "8px", "important");
    previewedBlock.style.setProperty("margin", "6px", "important");
    paddingLayer.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await vi.waitFor(() =>
      expect(canvasDoc.querySelector('[data-pbe-box-layer-preview="padding"]')).toBeTruthy(),
    );
    expect(canvasDoc.querySelectorAll(".pbe-box-layer-preview__part")).toHaveLength(4);
    const paddingPreviewPart = canvasDoc.querySelector<HTMLElement>(
      ".pbe-box-layer-preview__part",
    )!;
    const paddingPreviewStyle = getComputedStyle(paddingPreviewPart);
    expect(paddingPreviewStyle.zIndex).toBe("20");
    expect(paddingPreviewStyle.backgroundColor).toContain("147, 196, 125");
    expect(paddingPreviewStyle.backgroundImage).not.toContain("124, 58, 237");
    paddingLayer.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    await vi.waitFor(() =>
      expect(canvasDoc.querySelector("[data-pbe-box-layer-preview]")).toBeNull(),
    );

    marginLayer.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await vi.waitFor(() =>
      expect(canvasDoc.querySelector('[data-pbe-box-layer-preview="margin"]')).toBeTruthy(),
    );
    const marginPreviewStyle = getComputedStyle(
      canvasDoc.querySelector<HTMLElement>(".pbe-box-layer-preview__part")!,
    );
    expect(marginPreviewStyle.backgroundImage).toContain("repeating-linear-gradient");
    expect(marginPreviewStyle.backgroundImage).toContain("230, 142, 68");
    marginLayer.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    await vi.waitFor(() =>
      expect(canvasDoc.querySelector("[data-pbe-box-layer-preview]")).toBeNull(),
    );
  });

  test("token border colors render visibly on Groups", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<div data-pb-id="G" data-pb-block="group" data-pb-children><p data-pb-block="paragraph" data-pb-rich="body">Group</p></div>',
      media: false,
      theme: HEARTH_THEME,
      cssEngine: wasmCssEngine(),
    });
    destroyShell = shell.destroy;
    shell.editor.setStyle("G", "borderWidth", "16px");
    shell.editor.selectBlock("G", { toggle: true });
    host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!.click();
    host
      .querySelector<HTMLButtonElement>(
        '.pbe-box-model__value[data-kind="border"][data-side="Top"]',
      )!
      .click();
    host.querySelector<HTMLButtonElement>('.pbe-spacing-pane__sync[data-mode="all"]')!.click();
    host
      .querySelector<HTMLButtonElement>('.pbe-spacing-pane__color-tabs button[data-tier="tokens"]')!
      .click();

    let swatch!: HTMLButtonElement;
    await vi.waitFor(() => {
      swatch = host.querySelector<HTMLButtonElement>(
        '.pbe-spacing-pane__color[data-value="palette-clay"]',
      )!;
      expect(swatch).toBeTruthy();
    });
    const initialBlock = canvasQuery<HTMLElement>('[data-pb-id="G"]')!;
    const canvasView = initialBlock.ownerDocument.defaultView!;
    const previousColor = canvasView.getComputedStyle(initialBlock).borderTopColor;
    swatch.click();

    await vi.waitFor(() => {
      expect(shell.editor.getStyle("G", "borderColor")).toBe("palette-clay");
      expect(shell.editor.getStyle("G", "borderStyle")).toBe("solid");
      const block = canvasQuery<HTMLElement>('[data-pb-id="G"]')!;
      const computed = canvasView.getComputedStyle(block);
      expect(computed.borderTopStyle).toBe("solid");
      expect(computed.borderTopWidth).toBe("16px");
      expect(computed.borderTopColor).not.toBe(previousColor);
    });
  });

  test("Group layout identity follows the effective responsive style without transforming", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<div data-pb-block="group" data-pb-id="G" data-pb-children class="mx-auto lg:flex"><p data-pb-block="paragraph" data-pb-rich="body">One</p><p data-pb-block="paragraph" data-pb-rich="body">Two</p></div>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;
    shell.editor.selectBlock("G", { toggle: true });

    await selectViewportBreakpoint("base", "mobile");
    await vi.waitFor(() =>
      expect(host.querySelector("#block-card-title")?.textContent).toBe("Group"),
    );
    expect(
      host
        .querySelector('[data-style="layoutMode"][data-value="group"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    await selectViewportBreakpoint("lg", "desktop");
    await vi.waitFor(() =>
      expect(host.querySelector("#block-card-title")?.textContent).toBe("Row"),
    );
    expect(shell.editor.getBlock("G")?.type).toBe("group");
    expect(
      host
        .querySelector('[data-style="layoutMode"][data-value="row"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(host.querySelector("#tree-rows")?.textContent).toContain("Row");

    host.querySelector<HTMLButtonElement>('[data-style="layoutMode"][data-value="stack"]')!.click();
    await vi.waitFor(() =>
      expect(host.querySelector("#block-card-title")?.textContent).toBe("Stack"),
    );
    expect(shell.editor.getBlock("G")?.type).toBe("group");
    expect(shell.editor.getBlock("G")?.classes?.split(/\s+/)).toEqual([
      "mx-auto",
      "lg:flex",
      "lg:flex-col",
    ]);

    host
      .querySelector<HTMLButtonElement>('button[role="switch"][data-style="containerEnabled"]')!
      .click();
    await vi.waitFor(() =>
      expect(shell.editor.getStyle("G", "containerEnabled", "lg")).toBe("true"),
    );
    await vi.waitFor(() =>
      expect(
        host.querySelector<HTMLElement>("#block-card-container-chip")!.classList.contains("hidden"),
      ).toBe(false),
    );
    expect(host.querySelector("#tree-rows")?.textContent).toContain("Container");
    expect(
      host.querySelector<HTMLSelectElement>('select[data-style="containerWidth"]')!.value,
    ).toBe("wide");
    expect(
      host.querySelector<HTMLSelectElement>('select[data-style="containerBleed"]')!.value,
    ).toBe("none");
    const width = host.querySelector<HTMLSelectElement>('select[data-style="containerWidth"]')!;
    width.value = "content";
    width.dispatchEvent(new Event("change", { bubbles: true }));
    const bleed = host.querySelector<HTMLSelectElement>('select[data-style="containerBleed"]')!;
    bleed.value = "right";
    bleed.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(shell.editor.getStyle("G", "containerWidth", "lg")).toBe("content");
      expect(shell.editor.getStyle("G", "containerBleed", "lg")).toBe("right");
    });

    await selectViewportBreakpoint("base", "mobile");
    expect(
      host
        .querySelector<HTMLButtonElement>('button[role="switch"][data-style="containerEnabled"]')
        ?.getAttribute("aria-checked"),
    ).toBe("false");
    expect(host.querySelector('select[data-style="containerWidth"]')).toBeNull();
    expect(shell.editor.getStyle("G", "containerEnabled", "base")).toBe("");

    await selectViewportBreakpoint("lg", "desktop");
    await vi.waitFor(() =>
      expect(
        host
          .querySelector<HTMLButtonElement>('button[role="switch"][data-style="containerEnabled"]')
          ?.getAttribute("aria-checked"),
      ).toBe("true"),
    );
    expect(
      host.querySelector<HTMLSelectElement>('select[data-style="containerWidth"]')!.value,
    ).toBe("content");
    expect(
      host.querySelector<HTMLSelectElement>('select[data-style="containerBleed"]')!.value,
    ).toBe("right");
    host
      .querySelector<HTMLButtonElement>('button[role="switch"][data-style="containerEnabled"]')!
      .click();
    await vi.waitFor(() =>
      expect(
        host.querySelector<HTMLElement>("#block-card-container-chip")!.classList.contains("hidden"),
      ).toBe(true),
    );

    host
      .querySelector<HTMLButtonElement>('[data-role="structure"][data-style="layoutMode"]')!
      .click();
    await vi.waitFor(() =>
      expect(host.querySelector("#block-card-title")?.textContent).toBe("Group"),
    );
    expect(shell.editor.getBlock("G")?.classes).toBe("mx-auto");
    expect(shell.editor.getBlock("G")?.settings).toBeUndefined();
  });

  test("non-homogeneous fields reveal their configured-width progression", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<div data-pb-block="group" data-pb-id="G" data-pb-children class="pbe-container--on lg:pbe-container--off"><p data-pb-block="paragraph" data-pb-rich="body">One</p></div>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;
    shell.editor.selectBlock("G", { toggle: true });

    await selectViewportBreakpoint("lg", "desktop");
    await vi.waitFor(() =>
      expect(
        host
          .querySelector<HTMLButtonElement>('button[role="switch"][data-style="containerEnabled"]')
          ?.getAttribute("aria-checked"),
      ).toBe("false"),
    );

    const indicator = [...host.querySelectorAll<HTMLDetailsElement>(".pbe-responsive-field")].find(
      (candidate) => !candidate.classList.contains("hidden"),
    )!;
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toContain("Responsive");
    expect(indicator.textContent).not.toContain("On");
    expect(indicator.textContent).not.toContain("Off");
    indicator.open = true;

    const points = [
      ...indicator.querySelectorAll<HTMLButtonElement>(".pbe-responsive-field__point"),
    ];
    expect(points.map((point) => point.textContent?.trim())).toEqual([
      "390px",
      "640px",
      "768px",
      "1024px",
      "1280px",
      "1536px",
    ]);
    expect(points[3].hasAttribute("data-changed")).toBe(true);
    expect(points[3].hasAttribute("data-active")).toBe(true);
    expect(indicator.querySelector("summary")?.getAttribute("aria-label")).toBe(
      "Changes at 1024px",
    );

    points[0].click();
    await vi.waitFor(() =>
      expect(host.querySelector(".pbe-breakpoint-status")?.textContent).toContain("Mobile"),
    );
    expect(
      host
        .querySelector<HTMLButtonElement>('button[role="switch"][data-style="containerEnabled"]')
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(points[3].getAttribute("aria-label")).toContain("field changes here");
  });

  test("Row layout options use shared icons for every segmented choice", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<div data-pb-block="group" data-pb-id="G" data-pb-children class="flex flex-row"><p data-pb-block="paragraph" data-pb-rich="body">One</p><p data-pb-block="paragraph" data-pb-rich="body">Two</p></div>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;
    shell.editor.selectBlock("G", { toggle: true });

    let justification!: HTMLElement;
    await vi.waitFor(() => {
      justification = host.querySelector<HTMLElement>(
        '.pbe-option-group[aria-label="Justification"]',
      )!;
      expect(justification).toBeTruthy();
    });
    const alignment = host.querySelector<HTMLElement>(
      '.pbe-option-group[aria-label="Items alignment"]',
    )!;
    const wrapping = host.querySelector<HTMLElement>('.pbe-option-group[aria-label="Wrapping"]')!;
    expect(justification.querySelectorAll("button")).toHaveLength(7);
    expect(alignment.querySelectorAll("button")).toHaveLength(6);
    expect(wrapping.querySelectorAll("button")).toHaveLength(4);
    expect(
      [...justification.querySelectorAll("button")].map((button) =>
        button.querySelector("use")?.getAttribute("href"),
      ),
    ).toEqual([
      "#pbe-i-reset",
      "#pbe-i-justify-start",
      "#pbe-i-justify-center",
      "#pbe-i-justify-end",
      "#pbe-i-justify-between",
      "#pbe-i-justify-around",
      "#pbe-i-justify-evenly",
    ]);
    expect(
      [...alignment.querySelectorAll("button")].map((button) =>
        button.querySelector("use")?.getAttribute("href"),
      ),
    ).toEqual([
      "#pbe-i-reset",
      "#pbe-i-align-start",
      "#pbe-i-align-center",
      "#pbe-i-align-end",
      "#pbe-i-align-stretch",
      "#pbe-i-align-baseline",
    ]);
    expect(
      [...wrapping.querySelectorAll("button")].map((button) =>
        button.querySelector("use")?.getAttribute("href"),
      ),
    ).toEqual(["#pbe-i-reset", "#pbe-i-wrap-none", "#pbe-i-wrap", "#pbe-i-wrap-reverse"]);

    wrapping.querySelector<HTMLButtonElement>('button[aria-label="Reverse"]')!.click();
    await vi.waitFor(() => expect(shell.editor.getStyle("G", "flexWrap")).toBe("reverse"));
    wrapping.querySelector<HTMLButtonElement>('button[aria-label="Default"]')!.click();
    await vi.waitFor(() => expect(shell.editor.getStyle("G", "flexWrap")).toBe(""));
  });

  test("tree-selected iframe blocks keep keyboard focus so Backspace removes them", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<div data-pb-id="G" data-pb-block="group" data-pb-children><p data-pb-id="P" data-pb-block="paragraph" data-pb-rich="body">Child</p></div>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    host.querySelector<HTMLButtonElement>("#tree-toggle")!.click();
    let groupRow!: HTMLButtonElement;
    await vi.waitFor(() => {
      groupRow = [
        ...host.querySelectorAll<HTMLButtonElement>('#tree-rows button[data-id="G"]'),
      ].find((button) => button.textContent?.includes("Group"))!;
      expect(groupRow).toBeTruthy();
    });
    groupRow.click();

    const frame = host.querySelector<HTMLIFrameElement>("#editor-frame")!;
    const frameCanvas = canvasQuery<HTMLElement>("#canvas")!;
    expect(shell.editor.selection.blocks).toEqual(["G"]);
    expect(document.activeElement).toBe(frame);
    expect(frame.contentDocument!.activeElement).toBe(frameCanvas);

    frameCanvas.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(shell.editor.getBlock("G")).toBeUndefined();
    expect(shell.editor.getModel().blocks).toHaveLength(0);
  });

  test("inert shell and pattern-stage clicks clear blocks while controls preserve them", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-id="P" data-pb-block="paragraph" data-pb-rich="body">Child</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    shell.editor.selectBlock("P", { block: true });
    await vi.waitFor(() => expect(shell.editor.selection.blocks).toEqual(["P"]));

    const sidebarField = host.querySelector<HTMLInputElement>("#sidebar input")!;
    expect(sidebarField).toBeTruthy();
    sidebarField.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(shell.editor.selection.blocks).toEqual(["P"]);

    host
      .querySelector<HTMLButtonElement>("#tree-toggle")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    expect(shell.editor.selection.blocks).toEqual(["P"]);

    const stage = host.querySelector<HTMLElement>("#editor-content")!;
    stage.setAttribute("data-isolation-stage", "");
    stage.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
    );

    await vi.waitFor(() => expect(shell.editor.selection.blocks).toEqual([]));
    expect(canvasQuery('[data-pb-id="P"]')?.classList.contains("pbe-selected")).toBe(false);
  });

  test("the tree color-codes pattern roots while keeping their content neutral", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">Before</p>',
      media: false,
      theme: HEARTH_THEME,
      appearance: "light",
    });
    destroyShell = shell.destroy;

    const [root] = shell.editor.insertPattern("home-hero")!;
    shell.editor.clearSelection();
    host.querySelector<HTMLButtonElement>("#tree-toggle")!.click();
    const rowSelector = `[data-tree-row][data-id="${root.id}"]`;
    await vi.waitFor(() => expect(host.querySelector(rowSelector)).not.toBeNull());
    const patternRow = host.querySelector<HTMLElement>(rowSelector)!;

    expect(patternRow.hasAttribute("data-pattern")).toBe(true);
    expect(patternRow.hasAttribute("data-template-part")).toBe(false);
    expect(getComputedStyle(patternRow).color).toBe("rgb(40, 90, 225)");
    const restBackground = getComputedStyle(patternRow).backgroundColor;
    expect(restBackground).not.toBe("rgba(0, 0, 0, 0)");

    const patternLocator = browserPage.elementLocator(patternRow);
    await patternLocator.hover();
    const hoverBackground = getComputedStyle(patternRow).backgroundColor;
    expect(hoverBackground).not.toBe(restBackground);

    patternRow.querySelectorAll<HTMLButtonElement>("button")[1].click();
    await vi.waitFor(() => expect(patternRow.classList.contains("bg-ui-accent")).toBe(true));
    await patternLocator.unhover();
    const selectedBackground = getComputedStyle(patternRow).backgroundColor;
    expect(selectedBackground).not.toBe(restBackground);
    expect(selectedBackground).not.toBe(hoverBackground);
    expect(getComputedStyle(patternRow).color).toBe("rgb(40, 90, 225)");

    patternRow.querySelector<HTMLButtonElement>('button[aria-label="Toggle children"]')!.click();
    await vi.waitFor(() =>
      expect(host.querySelectorAll("[data-tree-row]").length).toBeGreaterThan(2),
    );
    const contentRow = host.querySelector<HTMLElement>(
      `[data-tree-row][data-depth="1"]:not([data-id="${root.id}"])`,
    )!;
    expect(contentRow.hasAttribute("data-pattern")).toBe(false);
    expect(getComputedStyle(contentRow).color).not.toBe("rgb(40, 90, 225)");
  });

  test("the theme workspace imports a pasted Tailwind theme document", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: "",
      media: false,
      theme: HEARTH_THEME,
    });
    destroyShell = shell.destroy;

    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    host.querySelector<HTMLButtonElement>('[data-p-on="click:openDesignTransfer"]')!.click();

    const transfer = host.querySelector<HTMLElement>("#design-workspace main [data-import]")!;
    await vi.waitFor(() =>
      expect(transfer.closest<HTMLElement>('[data-p-show="$designTokenTransferShown"]')).not.toBe(
        null,
      ),
    );
    const textarea = transfer.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = `@theme {
      --color-red-50: oklch(97.1% 0.013 17.38);
      --color-red-500: oklch(63.7% 0.237 25.331);
      --color-black: #000;
      --color-surface: #102030;
      --color-foreground: #fefefe;
      --spacing: 0.5rem
    }`;
    transfer.querySelector<HTMLButtonElement>('[data-p-on="click:designImport"]')!.click();

    await vi.waitFor(() => expect(tokenValue(activeTheme(), "color-surface")).toBe("#102030"));
    expect(tokenValue(activeTheme(), "color-foreground")).toBe("#fefefe");
    expect(tokenValue(activeTheme(), "spacing")).toBe("0.5rem");
    expect(textarea.value).toBe("");
    expect(transfer.textContent).toContain("6 tokens imported");

    host.querySelector<HTMLButtonElement>('[aria-label="Back to styles"]')!.click();
    host.querySelector<HTMLButtonElement>('button[data-page="advanced"]')!.click();
    const library = host.querySelector<HTMLElement>(
      '#design-workspace main [data-p-show="$designTokenLibraryShown"]',
    )!;
    await vi.waitFor(() => expect(library.classList.contains("hidden")).toBe(false));
    const redFamily = library.querySelector<HTMLButtonElement>(
      '[data-design-color-family-row][data-color-family="color:red"]',
    )!;
    expect(redFamily).not.toBeNull();
    expect(redFamily.querySelectorAll("[data-design-color-swatch]")).toHaveLength(2);
    const blackFamily = library.querySelector<HTMLButtonElement>(
      '[data-design-color-family-row][data-color-family="color:black"]',
    )!;
    expect(blackFamily).not.toBeNull();
    expect(blackFamily.querySelectorAll("[data-design-color-swatch]")).toHaveLength(1);
    const slateFamily = library.querySelector<HTMLButtonElement>(
      '[data-design-color-family-row][data-color-family="color-palette:slate"]',
    )!;
    expect(slateFamily).not.toBeNull();
    expect(slateFamily.querySelectorAll("[data-design-color-swatch]")).toHaveLength(2);
    const clayFamily = library.querySelector<HTMLButtonElement>(
      '[data-design-color-family-row][data-color-family="color-palette:clay"]',
    )!;
    expect(clayFamily).not.toBeNull();
    expect(clayFamily.querySelectorAll("[data-design-color-swatch]")).toHaveLength(3);

    redFamily.click();
    const colorDialog = host.querySelector<HTMLElement>("#design-color-family-dialog")!;
    await vi.waitFor(() => expect(colorDialog.classList.contains("hidden")).toBe(false));
    const familyName = colorDialog.querySelector<HTMLInputElement>(
      "[data-design-color-family-name]",
    )!;
    expect(familyName.value).toBe("red");
    familyName.value = "crimson";
    familyName.dispatchEvent(new Event("input", { bubbles: true }));
    expect(colorDialog.querySelectorAll("[data-design-color-shade]")).toHaveLength(2);
    colorDialog
      .querySelector<HTMLButtonElement>('[data-p-on="click:designGenerateColorScale"]')!
      .click();
    await vi.waitFor(() =>
      expect(colorDialog.querySelectorAll("[data-design-color-shade]")).toHaveLength(11),
    );
    const red500Row = [
      ...colorDialog.querySelectorAll<HTMLElement>("[data-design-color-shade]"),
    ].find(
      (row) =>
        row.querySelector<HTMLInputElement>('input[data-shade-field="key"]')?.value === "500",
    )!;
    const red500 = red500Row.querySelector<HTMLInputElement>(
      'input[data-shade-field="value"]:not([type="color"])',
    )!;
    red500.value = "oklch(60% 0.2 25)";
    red500.dispatchEvent(new Event("input", { bubbles: true }));
    colorDialog
      .querySelector<HTMLButtonElement>('[data-p-on="click:designSaveColorFamily"]')!
      .click();
    await vi.waitFor(() =>
      expect(tokenValue(activeTheme(), "color-crimson-500")).toBe("oklch(60% 0.2 25)"),
    );
    expect(tokenValue(activeTheme(), "color-crimson-50")).toMatch(/^oklch\(/);
    expect(tokenValue(activeTheme(), "color-crimson-950")).toMatch(/^oklch\(/);
    expect(tokenValue(activeTheme(), "color-red-500")).toBeUndefined();
    expect(colorDialog.classList.contains("hidden")).toBe(true);
    expect(
      host.querySelector<HTMLElement>('#design-workspace [data-p-text="$designExport"]')
        ?.textContent,
    ).toContain("--color-crimson-500:");

    const claySoft = tokenValue(activeTheme(), "color-palette-clay-soft");
    library
      .querySelector<HTMLButtonElement>(
        '[data-design-color-family-row][data-color-family="color-palette:clay"]',
      )!
      .click();
    await vi.waitFor(() => expect(colorDialog.classList.contains("hidden")).toBe(false));
    colorDialog
      .querySelector<HTMLButtonElement>('[data-p-on="click:designGenerateColorScale"]')!
      .click();
    await vi.waitFor(() =>
      expect(colorDialog.querySelectorAll("[data-design-color-shade]")).toHaveLength(14),
    );
    colorDialog
      .querySelector<HTMLButtonElement>('[data-p-on="click:designSaveColorFamily"]')!
      .click();
    await vi.waitFor(() =>
      expect(tokenValue(activeTheme(), "color-palette-clay-950")).toMatch(/^oklch\(/),
    );
    expect(tokenValue(activeTheme(), "color-palette-clay-soft")).toBe(claySoft);
    expect(tokenValue(activeTheme(), "color-palette-clay-subtle")).toBe("#f7ddca");
  });

  test("slash input in an iframe-rendered block opens the full pattern dialog", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: "",
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    // This render-after-mount path used to create the carrier in the parent
    // realm and adopt it into the iframe. The iframe input listener then
    // rejected it as "not an Element", leaving both the model and `/` picker
    // untouched.
    const block = shell.editor.insertBlock("paragraph")!;
    const carrier = canvasQuery<HTMLElement>(
      `[data-pb-id="${block.id}"] [data-pb-rich], [data-pb-id="${block.id}"][data-pb-rich]`,
    )!;
    expect(carrier instanceof canvasDocument().defaultView!.Element).toBe(true);
    carrier.focus();
    carrier.textContent = "/";
    const FrameInputEvent = canvasDocument().defaultView!.InputEvent;
    carrier.dispatchEvent(
      new FrameInputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: "/",
      }),
    );

    await vi.waitFor(() => expect(shell.editor.getBlock(block.id)?.fields.body).toBe("/"));
    const inlineChrome = canvasQuery<HTMLElement>("[data-pbe-inline-chrome]")!.shadowRoot!;
    let quick!: HTMLElement;
    await vi.waitFor(() => {
      quick = inlineChrome.querySelector<HTMLElement>(".pbe-quick")!;
      expect(quick.hidden).toBe(false);
    });

    quick.querySelector<HTMLButtonElement>("[data-browse-patterns]")!.click();
    const explorer = host.querySelector<HTMLElement>("#pattern-explorer")!;
    await vi.waitFor(() => expect(explorer.classList.contains("hidden")).toBe(false));
    expect(host.querySelector<HTMLElement>("#inserter")!.classList.contains("hidden")).toBe(true);
    expect(host.querySelector<HTMLElement>("#sidebar")!.classList.contains("hidden")).toBe(true);
    expect(
      host.querySelector<HTMLButtonElement>("#sidebar-toggle")!.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(shell.editor.getBlock(block.id)?.fields.body).toBe("");
    expect(document.activeElement).toBe(host.querySelector("#explorer-search"));
    const allCategory = explorer.querySelector<HTMLButtonElement>('[data-group="All"]')!;
    expect(allCategory.getAttribute("aria-pressed")).toBe("true");
    expect(allCategory.querySelector("[data-pattern-category-count]")?.textContent).not.toBe("");
    const previewHolder = explorer.querySelector<HTMLElement>("[data-pattern-preview]")!;
    expect(previewHolder.dataset.patternPreviewShape).toBe("square");
    await vi.waitFor(() => {
      const bounds = previewHolder.getBoundingClientRect();
      expect(bounds.width).toBeGreaterThan(0);
      expect(Math.abs(bounds.width - bounds.height)).toBeLessThan(1);
    });
  });

  test("Patterns is a separate selector tab in the left library", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: "",
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    host.querySelector<HTMLButtonElement>("#inserter-toggle")!.click();
    const patternsTab = host.querySelector<HTMLButtonElement>('[data-itab="patterns"]')!;
    patternsTab.click();

    await vi.waitFor(() => expect(patternsTab.getAttribute("aria-selected")).toBe("true"));
    expect(host.querySelector<HTMLElement>("#ipanel-patterns")!.classList.contains("hidden")).toBe(
      false,
    );
    expect(host.querySelector<HTMLElement>("#sidebar")!.classList.contains("hidden")).toBe(true);
    expect(document.activeElement).toBe(host.querySelector("#pattern-search"));
    expect(
      host.querySelector("#pattern-groups [data-group='All'] [data-pattern-category-count]")
        ?.textContent,
    ).not.toBe("");
  });

  test("document overview exposes Patterns beside List View and Outline", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-id="P" data-pb-block="paragraph" data-pb-rich="body">Anchor</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    shell.editor.selectBlock("P");
    host.querySelector<HTMLButtonElement>("#tree-toggle")!.click();
    const patternsTab = host.querySelector<HTMLButtonElement>('#tree-tabs [data-ttab="patterns"]')!;
    expect(patternsTab).toBeTruthy();
    patternsTab.click();

    await vi.waitFor(() => expect(patternsTab.getAttribute("aria-selected")).toBe("true"));
    expect(host.querySelector<HTMLElement>("#tpanel-patterns")!.classList.contains("hidden")).toBe(
      false,
    );
    expect(document.activeElement).toBe(host.querySelector("#tree-pattern-search"));

    host.querySelector<HTMLButtonElement>('#tree-pattern-groups [data-group="All"]')!.click();
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLElement>("#pattern-flyout")!.classList.contains("hidden")).toBe(
        false,
      ),
    );
    expect(host.querySelector("#pattern-flyout [data-pattern-preview]")).not.toBeNull();
    expect(
      host.querySelector<HTMLElement>("#pattern-flyout [data-pattern-preview]")?.dataset
        .patternPreviewShape,
    ).toBeUndefined();
  });

  test("List View selects editable leaves as blocks and keeps keyboard deletion in the iframe", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<p data-pb-id="P" data-pb-block="paragraph" data-pb-rich="body">First</p>' +
        '<p data-pb-id="Q" data-pb-block="paragraph" data-pb-rich="body">Second</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    host.querySelector<HTMLButtonElement>("#tree-toggle")!.click();
    let paragraphRow!: HTMLButtonElement;
    await vi.waitFor(() => {
      paragraphRow = host.querySelector<HTMLButtonElement>(
        '#tree-rows button[data-id="P"]:not([aria-label])',
      )!;
      expect(paragraphRow).toBeTruthy();
    });
    paragraphRow.click();

    await vi.waitFor(() => expect(shell.editor.selection.blocks).toEqual(["P"]));
    expect(shell.editor.selection.active).toBeNull();
    expect(canvasQuery('[data-pb-id="P"]')?.classList.contains("pbe-selected")).toBe(true);
    expect(canvasDocument().activeElement).toBe(canvasQuery("#canvas"));

    canvasDocument().activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
    );
    await vi.waitFor(() => expect(shell.editor.getBlock("P")).toBeUndefined());
    expect(shell.editor.serialize()).toContain("Second");
  });

  test("List View drag keeps its source row, shows a depth line, and nests on drop", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<p data-pb-id="A" data-pb-block="paragraph" data-pb-rich="body">Before</p>' +
        '<div data-pb-id="G" data-pb-block="group" data-pb-children>' +
        '<p data-pb-id="C" data-pb-block="paragraph" data-pb-rich="body">Child</p></div>' +
        '<p data-pb-id="M" data-pb-block="paragraph" data-pb-rich="body">Moving</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;
    host.querySelector<HTMLButtonElement>("#tree-toggle")!.click();

    let groupRow!: HTMLElement;
    let movingRow!: HTMLElement;
    let beforeRow!: HTMLElement;
    await vi.waitFor(() => {
      beforeRow = host.querySelector<HTMLElement>('[data-tree-row][data-id="A"]')!;
      groupRow = host.querySelector<HTMLElement>('[data-tree-row][data-id="G"]')!;
      movingRow = host.querySelector<HTMLElement>('[data-tree-row][data-id="M"]')!;
      expect(movingRow.draggable).toBe(true);
    });
    expect(movingRow.querySelector('button[aria-label="Drag block"]')).toBeNull();
    vi.spyOn(beforeRow, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 40, 320, 40));
    vi.spyOn(groupRow, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 320, 40));
    vi.spyOn(movingRow, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 200, 320, 40));

    const transfer = new DataTransfer();
    movingRow.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
    movingRow.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 220,
        dataTransfer: transfer,
      }),
    );
    expect(host.querySelector("[data-tree-drop-indicator]")).toBeNull();

    groupRow.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 120,
        dataTransfer: transfer,
      }),
    );

    const indicator = host.querySelector<HTMLElement>("[data-tree-drop-indicator]")!;
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toBe("");
    expect(getComputedStyle(indicator).position).toBe("absolute");
    expect(getComputedStyle(indicator).backgroundColor).toBe("rgb(88, 28, 135)");
    expect(getComputedStyle(indicator).borderWidth).toBe("0px");
    expect(getComputedStyle(indicator).outlineStyle).toBe("none");
    expect(getComputedStyle(indicator).boxShadow).toBe("none");
    expect(getComputedStyle(indicator).height).toBe("3px");
    expect(indicator.style.left).toBe("48px");
    expect(indicator.dataset.depth).toBe("1");
    expect(indicator.dataset.parentId).toBe("G");
    expect(groupRow.nextElementSibling).toBe(movingRow);
    expect(host.querySelectorAll("[data-tree-row]")).toHaveLength(3);
    expect(host.querySelector('[data-tree-row][data-id="M"]')).toBe(movingRow);
    expect(shell.editor.getModel().blocks.map((block) => block.id)).toEqual(["A", "G", "M"]);

    groupRow.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 120,
        dataTransfer: transfer,
      }),
    );
    expect(host.querySelector("[data-tree-drop-indicator]")).toBeNull();
    expect(shell.editor.getModel().blocks.map((block) => block.id)).toEqual(["A", "G"]);
    expect(shell.editor.getBlock("G")!.children!.map((block) => block.id)).toEqual(["C", "M"]);
    await vi.waitFor(() =>
      expect(host.querySelector('[data-tree-row][data-id="C"]')).not.toBeNull(),
    );

    // Pulling the nested row left through its indent projects it back at the
    // document root (after its containing group).
    const nestedMovingRow = host.querySelector<HTMLElement>('[data-tree-row][data-id="M"]')!;
    vi.spyOn(nestedMovingRow, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 200, 320, 40),
    );
    nestedMovingRow.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
    nestedMovingRow.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: 2,
        clientY: 238,
        dataTransfer: transfer,
      }),
    );
    expect(host.querySelector<HTMLElement>("[data-tree-drop-indicator]")!.dataset.parentId).toBe(
      "",
    );
    nestedMovingRow.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: 2,
        clientY: 238,
        dataTransfer: transfer,
      }),
    );
    expect(shell.editor.getModel().blocks.map((block) => block.id)).toEqual(["A", "G", "M"]);
  });

  test("List View anchors a root-end drop before the template Footer row", async () => {
    registerTemplatePart("tree-drop-footer", {
      label: "Footer",
      area: "footer",
      content: '<p data-pb-block="paragraph" data-pb-rich="body">Shared footer</p>',
    });
    registerTemplate("tree-drop-page", {
      label: "Tree drop page",
      content:
        '<div data-pb-block="template-slot" data-publr-slot="content">' +
        '<script type="application/json" data-pb-settings>{"name":"content"}</script>' +
        "<span>Content</span></div>" +
        '<div data-pb-block="template-part" data-pb-children ' +
        'data-publr-template-part="tree-drop-footer">' +
        '<script type="application/json" data-pb-settings>{"name":"tree-drop-footer"}</script>' +
        "</div>",
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<p data-pb-id="A" data-pb-block="paragraph" data-pb-rich="body">Moving</p>' +
        '<p data-pb-id="M" data-pb-block="paragraph" data-pb-rich="body">Last</p>',
      media: false,
      theme: DEFAULT_THEME,
      document: {
        title: "Tree drop page",
        template: { name: "tree-drop-page" },
      },
    });
    destroyShell = shell.destroy;
    host.querySelector<HTMLButtonElement>("#tree-toggle")!.click();

    let contentRow!: HTMLElement;
    let movingRow!: HTMLElement;
    let lastRow!: HTMLElement;
    let footerRow!: HTMLElement;
    await vi.waitFor(() => {
      const contentId = canvasQuery<HTMLElement>('[data-pbe-template-node-name="content"]')?.dataset
        .pbeTemplateNodeId;
      const footerId = canvasQuery<HTMLElement>('[data-pbe-template-node-name="tree-drop-footer"]')
        ?.dataset.pbeTemplateNodeId;
      expect(contentId).toBeTruthy();
      expect(footerId).toBeTruthy();
      contentRow = host.querySelector(`[data-tree-row][data-id="${contentId}"]`)!;
      movingRow = host.querySelector('[data-tree-row][data-id="A"]')!;
      lastRow = host.querySelector('[data-tree-row][data-id="M"]')!;
      footerRow = host.querySelector(`[data-tree-row][data-id="${footerId}"]`)!;
      expect(contentRow).toBeTruthy();
      expect(movingRow).toBeTruthy();
      expect(lastRow).toBeTruthy();
      expect(footerRow).toBeTruthy();
    });

    const rows = host.querySelector<HTMLElement>("#tree-rows")!;
    vi.spyOn(rows, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 200));
    vi.spyOn(contentRow, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 40, 320, 40));
    vi.spyOn(movingRow, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 80, 320, 40));
    vi.spyOn(lastRow, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 120, 320, 40));
    vi.spyOn(footerRow, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 160, 320, 40));

    const transfer = new DataTransfer();
    movingRow.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
    lastRow.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 150,
        dataTransfer: transfer,
      }),
    );

    const indicator = host.querySelector<HTMLElement>("[data-tree-drop-indicator]")!;
    expect(indicator.dataset.parentId).toBe("");
    expect(indicator.style.top).toBe("160px");
    expect(indicator.style.left).toBe("48px");

    lastRow.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 150,
        dataTransfer: transfer,
      }),
    );
    expect(shell.editor.getModel().blocks.map((block) => block.id)).toEqual(["M", "A"]);
  });

  test("the settings sidebar toggles predictably and yields to pattern browsing", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<div data-pb-id="G" data-pb-block="group" data-pb-children class="flex flex-row"><p data-pb-id="P" data-pb-block="paragraph" data-pb-rich="body">Selected</p></div>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;
    shell.editor.selectBlock("G", { toggle: true });

    const sidebar = host.querySelector<HTMLElement>("#sidebar")!;
    const toggle = host.querySelector<HTMLButtonElement>("#sidebar-toggle")!;
    const blockTab = host.querySelector<HTMLButtonElement>('#sidebar-tabs [data-tab="block"]')!;
    const settingsTab = host.querySelector<HTMLButtonElement>('[data-itab="settings"]')!;
    const stylesTab = host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!;
    await vi.waitFor(() => expect(blockTab.getAttribute("aria-selected")).toBe("true"));
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(sidebar.classList.contains("hidden")).toBe(false);

    stylesTab.click();
    await vi.waitFor(() => expect(stylesTab.getAttribute("aria-selected")).toBe("true"));
    toggle.click();
    await vi.waitFor(() => expect(sidebar.classList.contains("hidden")).toBe(true));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    await vi.waitFor(() => expect(sidebar.classList.contains("hidden")).toBe(false));
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(blockTab.getAttribute("aria-selected")).toBe("true");
    expect(settingsTab.getAttribute("aria-selected")).toBe("true");

    host.querySelector<HTMLButtonElement>("#tree-toggle")!.click();
    host.querySelector<HTMLButtonElement>('#tree-tabs [data-ttab="patterns"]')!.click();
    await vi.waitFor(() => expect(sidebar.classList.contains("hidden")).toBe(true));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    expect(sidebar.classList.contains("hidden")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    host.querySelector<HTMLButtonElement>('#tree-tabs [data-ttab="list"]')!.click();
    toggle.click();
    await vi.waitFor(() => expect(sidebar.classList.contains("hidden")).toBe(false));
    expect(blockTab.getAttribute("aria-selected")).toBe("true");
    expect(settingsTab.getAttribute("aria-selected")).toBe("true");
  });

  test("the compact inspector exposes viewport, color popover, and transient variant previews", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-id="P" data-pb-block="paragraph" data-pb-rich="body">Preview me</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    shell.editor.selectBlock("P", { toggle: true });
    host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!.click();

    const viewport = host.querySelector<HTMLElement>(".pbe-canvas-viewport")!;
    const editorContent = host.querySelector<HTMLElement>("#editor-content")!;
    expect(viewport.style.width).toBe("100%");
    expect(editorContent.classList.contains("p-3")).toBe(false);
    expect(editorContent.classList.contains("p-0")).toBe(true);
    expect(
      host
        .querySelector<HTMLButtonElement>('[data-device="desktop"]')!
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      host.querySelectorAll("#viewport-switcher button.pbe-viewport-device[data-device]"),
    ).toHaveLength(3);
    host.querySelector<HTMLButtonElement>('[data-device="mobile"]')!.click();
    await vi.waitFor(() => expect(viewport.style.width).toBe("390px"));
    expect(
      host.querySelector<HTMLButtonElement>('[data-device="mobile"]')!.getAttribute("aria-pressed"),
    ).toBe("true");
    host.querySelector<HTMLButtonElement>('[data-device="mobile"]')!.click();
    await vi.waitFor(() => expect(viewport.style.width).toBe("100%"));
    expect(document.querySelector(".pbe-viewport-menu:not(.hidden)")).toBeNull();
    expect(
      host.querySelector<HTMLButtonElement>('[data-device="mobile"]')!.getAttribute("aria-pressed"),
    ).toBe("false");
    host.querySelector<HTMLButtonElement>('[data-device="mobile"]')!.click();
    await vi.waitFor(() => expect(viewport.style.width).toBe("390px"));

    host.querySelector<HTMLButtonElement>('[data-device="tablet"]')!.click();
    await vi.waitFor(() => expect(viewport.style.width).toBe("640px"));
    host.querySelector<HTMLButtonElement>('[data-device="tablet"]')!.click();
    const visibleViewportEndpoint = (breakpoint: string): HTMLButtonElement =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          `[role="menuitemradio"][data-breakpoint="${breakpoint}"]`,
        ),
      ].find(
        (button) =>
          !button.closest<HTMLElement>('[data-publr-part="content"]')?.classList.contains("hidden"),
      )!;
    await vi.waitFor(() => expect(visibleViewportEndpoint("sm")).toBeTruthy());
    expect(visibleViewportEndpoint("sm").getAttribute("aria-checked")).toBe("true");
    visibleViewportEndpoint("md").click();
    await vi.waitFor(() => expect(viewport.style.width).toBe("768px"));

    host.querySelector<HTMLButtonElement>('[data-device="desktop"]')!.click();
    await vi.waitFor(() => expect(viewport.style.width).toBe("1024px"));
    host.querySelector<HTMLButtonElement>('[data-device="desktop"]')!.click();
    await vi.waitFor(() => expect(visibleViewportEndpoint("lg")).toBeTruthy());
    expect(visibleViewportEndpoint("lg").getAttribute("aria-checked")).toBe("true");
    visibleViewportEndpoint("xl").click();
    await vi.waitFor(() => expect(viewport.style.width).toBe("1280px"));
    host.querySelector<HTMLButtonElement>('[data-device="desktop"]')!.click();
    await vi.waitFor(() => expect(visibleViewportEndpoint("xl")).toBeTruthy());
    visibleViewportEndpoint("xl").click();
    await vi.waitFor(() => expect(viewport.style.width).toBe("100%"));
    expect(
      [
        ...host.querySelectorAll("#viewport-switcher button.pbe-viewport-device[data-device]"),
      ].every((button) => button.getAttribute("aria-pressed") === "false"),
    ).toBe(true);

    const color = host.querySelector<HTMLButtonElement>('.pbe-color-value[data-prop="textColor"]')!;
    const popover = color.nextElementSibling as HTMLElement;
    expect(popover.classList.contains("hidden")).toBe(true);
    color.click();
    await vi.waitFor(() => expect(popover.classList.contains("hidden")).toBe(false));
    expect(popover.classList.contains("fixed")).toBe(true);
    expect(popover.style.left).not.toBe("");
    expect(popover.textContent).toContain("Default style");

    const block = canvasQuery<HTMLElement>('[data-pb-id="P"]')!;
    const display = host.querySelector<HTMLButtonElement>(
      '.pbe-variant-option[data-name="display"]',
    )!;
    expect(shell.editor.getStyle("P", "variation")).toBe("");
    display.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await vi.waitFor(() =>
      expect(canvasQuery(".pbe-variant-preview-popover .text-3xl")).not.toBeNull(),
    );
    expect(block.classList.contains("text-3xl")).toBe(false);
    expect(shell.editor.getStyle("P", "variation")).toBe("");
    display.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    await vi.waitFor(() => expect(canvasQuery(".pbe-variant-preview-popover")).toBeNull());

    const advanced = host.querySelector<HTMLDetailsElement>(".pbe-advanced-section")!;
    expect(advanced.open).toBe(false);
  });

  test("the breakpoint canvas resizes freely and follows the mobile-first device scope", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-id="P" data-pb-block="paragraph">Resize me</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    const viewport = host.querySelector<HTMLElement>(".pbe-canvas-viewport")!;
    const editorContent = host.querySelector<HTMLElement>("#editor-content")!;
    const resizeHandle = host.querySelector<HTMLElement>(".pbe-viewport-resizer")!;
    const tablet = host.querySelector<HTMLButtonElement>('[data-device="tablet"]')!;
    const desktop = host.querySelector<HTMLButtonElement>('[data-device="desktop"]')!;

    expect(resizeHandle.classList.contains("hidden")).toBe(true);
    tablet.click();
    await vi.waitFor(() => expect(viewport.style.width).toBe("640px"));
    expect(resizeHandle.classList.contains("hidden")).toBe(false);

    Object.defineProperty(editorContent, "clientWidth", {
      configurable: true,
      value: 1400,
    });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 640, 800));
    resizeHandle.setPointerCapture = () => undefined;
    resizeHandle.hasPointerCapture = () => false;

    resizeHandle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 640,
        pointerId: 7,
      }),
    );
    resizeHandle.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 770,
        pointerId: 7,
      }),
    );
    await vi.waitFor(() => expect(viewport.style.width).toBe("900px"));
    expect(tablet.getAttribute("aria-pressed")).toBe("true");
    expect(tablet.textContent).toContain("900px");
    expect(resizeHandle.textContent).toContain("900px");

    resizeHandle.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 890,
        pointerId: 7,
      }),
    );
    await vi.waitFor(() => expect(viewport.style.width).toBe("1140px"));
    expect(tablet.getAttribute("aria-pressed")).toBe("false");
    expect(desktop.getAttribute("aria-pressed")).toBe("true");
    expect(desktop.textContent).toContain("1140px");
    expect(resizeHandle.getAttribute("aria-valuenow")).toBe("1140");

    resizeHandle.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: 890,
        pointerId: 7,
      }),
    );
    await vi.waitFor(() => expect(viewport.getAttribute("data-resizing")).not.toBe("true"));
  });

  test("fit mode preserves a desktop iframe viewport while scaling its presentation", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-id="P" data-pb-block="paragraph">Fit me</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    const editorContent = host.querySelector<HTMLElement>("#editor-content")!;
    const viewport = host.querySelector<HTMLElement>(".pbe-canvas-viewport")!;
    const frame = host.querySelector<HTMLIFrameElement>("#editor-frame")!;
    const fit = host.querySelector<HTMLButtonElement>("#viewport-fit-toggle")!;
    const desktop = host.querySelector<HTMLButtonElement>('[data-device="desktop"]')!;
    Object.defineProperty(editorContent, "clientWidth", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(editorContent, "clientHeight", {
      configurable: true,
      value: 800,
    });

    expect(viewport.style.width).toBe("100%");
    expect(fit.getAttribute("aria-pressed")).toBe("false");
    fit.click();

    await vi.waitFor(() => expect(viewport.style.width).toBe("1024px"));
    expect(fit.getAttribute("aria-pressed")).toBe("true");
    expect(desktop.getAttribute("aria-pressed")).toBe("true");
    expect(Number(viewport.style.zoom)).toBeLessThan(1);
    expect(viewport.getBoundingClientRect().width).toBeLessThanOrEqual(600);
    await vi.waitFor(() => expect(frame.contentWindow!.innerWidth).toBe(1024));
    expect(Number.parseFloat(viewport.style.height)).toBeGreaterThan(800);

    fit.click();
    await vi.waitFor(() => expect(viewport.style.zoom).toBe("1"));
    expect(fit.getAttribute("aria-pressed")).toBe("false");
    expect(viewport.style.width).toBe("1024px");
    await vi.waitFor(() => expect(frame.contentWindow!.innerWidth).toBe(1024));
  });

  test("responsive comparison selects and authors from every projected breakpoint", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const spacer = (id: string) =>
      `<div data-pb-id="${id}" data-pb-block="spacer" aria-hidden="true"><script type="application/json" data-pb-settings>{"height":"xl"}</script></div>`;
    const before = Array.from({ length: 24 }, (_, index) => spacer(`before-${index}`)).join("");
    const after = Array.from({ length: 24 }, (_, index) => spacer(`after-${index}`)).join("");
    const shell = await createEditorShell({
      container: host,
      content: `${before}<p data-pb-id="P" data-pb-block="paragraph" data-pb-rich="body">Compare me</p>${after}`,
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    const toggle = host.querySelector<HTMLButtonElement>("#viewport-compare-toggle")!;
    const editorContent = host.querySelector<HTMLElement>("#editor-content")!;
    const viewport = host.querySelector<HTMLElement>(".pbe-canvas-viewport")!;
    toggle.click();

    await vi.waitFor(() => {
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(editorContent.hasAttribute("data-responsive-compare")).toBe(true);
      expect(host.querySelectorAll(".pbe-responsive-surface")).toHaveLength(6);
    });
    expect(viewport.style.width).toBe("390px");
    expect(getComputedStyle(viewport).transitionDuration).toBe("0s");
    expect(getComputedStyle(editorContent).overflowAnchor).toBe("none");
    expect(host.querySelector(".pbe-responsive-surface[data-breakpoint='base']")).toBeTruthy();

    const tabletSurface = host.querySelector<HTMLElement>(
      ".pbe-responsive-surface--preview[data-breakpoint='md']",
    )!;
    const tabletFrame = tabletSurface.querySelector<HTMLIFrameElement>("iframe")!;
    await vi.waitFor(() => {
      expect(tabletFrame.contentDocument?.querySelector("[data-pb-id='P']")).toBeTruthy();
      expect(tabletFrame.contentWindow?.innerWidth).toBe(768);
    });
    const tabletBlock =
      tabletFrame.contentDocument!.querySelector<HTMLElement>("[data-pb-id='P']")!;
    const tabletScale =
      tabletFrame.getBoundingClientRect().width / tabletFrame.contentWindow!.innerWidth;
    const selectedVisualTop = 180;
    tabletFrame.contentWindow!.scrollTo(
      0,
      tabletBlock.getBoundingClientRect().top -
        selectedVisualTop / tabletScale +
        tabletFrame.contentWindow!.scrollY,
    );
    expect(tabletBlock.getBoundingClientRect().top * tabletScale).toBeCloseTo(selectedVisualTop, 0);
    editorContent.scrollLeft = 500;
    expect(editorContent.scrollLeft).toBe(500);
    tabletBlock.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
      }),
    );

    await vi.waitFor(() => {
      expect(viewport.style.width).toBe("768px");
      expect(shell.editor.selection.blocks).toEqual(["P"]);
      expect(
        host.querySelector(".pbe-responsive-surface--canonical")?.getAttribute("data-breakpoint"),
      ).toBe("md");
      expect(editorContent.scrollLeft).toBe(500);
    });
    const expectSelectedBlockAligned = () => {
      const documents = [
        canvasDocument(),
        ...[
          ...host.querySelectorAll<HTMLIFrameElement>(".pbe-responsive-surface--preview iframe"),
        ].map((frame) => frame.contentDocument!),
      ];
      expect(documents).toHaveLength(6);
      const visualTops: number[] = [];
      for (const doc of documents) {
        const root = doc.querySelector<HTMLElement>("[data-pb-id='P']")!;
        const frame = doc.defaultView!.frameElement!;
        const scale = frame.getBoundingClientRect().width / doc.defaultView!.innerWidth;
        expect(root).toBeTruthy();
        visualTops.push(root.getBoundingClientRect().top * scale);
        expect(doc.defaultView!.scrollY).toBeGreaterThan(0);
      }
      expect(Math.max(...visualTops) - Math.min(...visualTops)).toBeLessThanOrEqual(1);
      expect(visualTops[0]).toBeCloseTo(selectedVisualTop, 0);
    };
    await vi.waitFor(expectSelectedBlockAligned);

    host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!.click();
    const fontSize = host.querySelector<HTMLInputElement>('input[data-prop="fontSize"]')!;
    fontSize.value = "21px";
    fontSize.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(shell.editor.getStyle("P", "fontSize", "md")).toBe("21px"));
    expect(shell.editor.getStyle("P", "fontSize", "base")).toBe("");
    await vi.waitFor(expectSelectedBlockAligned);

    await vi.waitFor(() =>
      expect(
        host
          .querySelector<HTMLIFrameElement>(
            ".pbe-responsive-surface--preview[data-breakpoint='base'] iframe",
          )
          ?.contentDocument?.querySelector("[data-pb-id='P']"),
      ).toBeTruthy(),
    );

    const wideFrame = host.querySelector<HTMLIFrameElement>(
      ".pbe-responsive-surface--preview[data-breakpoint='2xl'] iframe",
    )!;
    wideFrame
      .contentDocument!.querySelector<HTMLElement>("[data-pb-id='P']")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await vi.waitFor(() =>
      expect(
        host.querySelector(".pbe-responsive-surface--canonical")?.getAttribute("data-breakpoint"),
      ).toBe("2xl"),
    );

    const largeFrame = host.querySelector<HTMLIFrameElement>(
      ".pbe-responsive-surface--preview[data-breakpoint='xl'] iframe",
    )!;
    await vi.waitFor(() =>
      expect(largeFrame.contentDocument?.querySelector("[data-pb-id='P']")).toBeTruthy(),
    );
    editorContent.scrollLeft = 700;
    const retainedScrollLeft = editorContent.scrollLeft;
    largeFrame
      .contentDocument!.querySelector<HTMLElement>("[data-pb-id='P']")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await vi.waitFor(() =>
      expect(
        host.querySelector(".pbe-responsive-surface--canonical")?.getAttribute("data-breakpoint"),
      ).toBe("xl"),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    expect(editorContent.scrollLeft).toBe(retainedScrollLeft);
  });

  test("theme breakpoint settings drive viewport widths and device assignments", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-id="P" data-pb-block="paragraph" data-pb-rich="body">Responsive</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    const breakpointsNav = host.querySelector<HTMLButtonElement>('[data-page="breakpoints"]')!;
    breakpointsNav.click();
    await vi.waitFor(() => expect(breakpointsNav.getAttribute("aria-current")).toBe("true"));

    const page = host.querySelector<HTMLElement>('[data-design-preview="breakpoints"]')!;
    const controls = host.querySelector<HTMLElement>('[data-design-controls="breakpoints"]')!;
    expect(page.textContent).not.toContain("Mobile-first cascade");
    expect(
      host
        .querySelector<HTMLElement>("[data-design-workspace-sidebar]")!
        .classList.contains("hidden"),
    ).toBe(true);

    const mdWidth = controls.querySelector<HTMLInputElement>(
      'input[data-breakpoint="md"][data-name="breakpoint-md"]',
    )!;
    expect(mdWidth.value).toBe("768");
    mdWidth.value = "780";
    mdWidth.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(tokenValue(activeTheme(), "breakpoint-md")).toBe("780px"));

    const mdDragHandle = page.querySelector<HTMLElement>(
      '[data-breakpoint-row][data-breakpoint="md"] [data-breakpoint="md"]',
    )!;
    const desktopDrop = page.querySelector<HTMLElement>(
      '[data-breakpoint-device-drop][data-device="desktop"]',
    )!;
    const transfer = new DataTransfer();
    mdDragHandle.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
    desktopDrop.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
    desktopDrop.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
    await vi.waitFor(() =>
      expect(tokenValue(activeTheme(), "publr-breakpoint-md-device")).toBe("desktop"),
    );

    page
      .querySelector<HTMLButtonElement>(
        '[data-breakpoint-device-drop][data-device="desktop"] button[aria-label="Add breakpoint"]',
      )!
      .click();
    const addForm = page.querySelector<HTMLElement>(
      '[data-breakpoint-device-drop][data-device="desktop"] [data-add-breakpoint]',
    )!;
    const nameInput = addForm.querySelector<HTMLInputElement>('[aria-label="Breakpoint name"]')!;
    const widthInput = addForm.querySelector<HTMLInputElement>('[aria-label="Breakpoint width"]')!;
    nameInput.value = "cinema";
    widthInput.value = "1800px";
    addForm.querySelector<HTMLButtonElement>("[data-add-breakpoint-submit]")!.click();
    await vi.waitFor(() => expect(tokenValue(activeTheme(), "breakpoint-cinema")).toBe("1800px"));
    expect(tokenValue(activeTheme(), "publr-breakpoint-cinema-device")).toBe("desktop");
    const removeCinema = page.querySelector<HTMLButtonElement>('button[data-breakpoint="cinema"]')!;
    expect(removeCinema).not.toBeNull();
    removeCinema.click();
    await vi.waitFor(() => expect(tokenValue(activeTheme(), "breakpoint-cinema")).toBeUndefined());
    expect(tokenValue(activeTheme(), "publr-breakpoint-cinema-device")).toBeUndefined();

    host.querySelector<HTMLButtonElement>('[aria-label="Back to document"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-device="desktop"]')!.click();
    await vi.waitFor(() =>
      expect(
        host
          .querySelector<HTMLButtonElement>('[data-device="desktop"]')!
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    host.querySelector<HTMLButtonElement>('[data-device="desktop"]')!.click();
    let desktopMd!: HTMLButtonElement;
    await vi.waitFor(() => {
      desktopMd = [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="menuitemradio"][data-breakpoint="md"]',
        ),
      ].find(
        (button) =>
          !button.closest<HTMLElement>('[data-publr-part="content"]')?.classList.contains("hidden"),
      )!;
      expect(desktopMd).toBeTruthy();
    });
    expect(desktopMd.textContent).toContain("780px");
    expect(desktopMd.getAttribute("aria-checked")).toBe("true");
    host.querySelector<HTMLButtonElement>('[data-device="desktop"]')!.click();
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLElement>(".pbe-canvas-viewport")!.style.width).toBe("780px"),
    );
  });

  test("theme container settings expose semantic widths without block-level free text", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<div data-pb-id="G" data-pb-block="group" data-pb-tag="tag" data-pb-children class="pbe-container--on pbe-container--wide"></div>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    const containersNav = host.querySelector<HTMLButtonElement>('[data-page="containers"]')!;
    containersNav.click();
    await vi.waitFor(() => expect(containersNav.getAttribute("aria-current")).toBe("true"));

    const page = host.querySelector<HTMLElement>('[data-design-preview="containers"]')!;
    const controls = host.querySelector<HTMLElement>('[data-design-controls="containers"]')!;
    expect(
      host
        .querySelector<HTMLElement>("[data-design-workspace-sidebar]")!
        .classList.contains("hidden"),
    ).toBe(true);
    expect(page.textContent).toContain("Authors can pick");

    const content = controls.querySelector<HTMLInputElement>('[data-name="container-content"]')!;
    const wide = controls.querySelector<HTMLInputElement>('[data-name="container-wide"]')!;
    const gutter = controls.querySelector<HTMLInputElement>('[data-name="container-gutter"]')!;
    expect([content.type, wide.type, gutter.type]).toEqual(["range", "range", "range"]);
    expect(controls.textContent).toContain("645px");
    expect(controls.textContent).toContain("1340px");
    expect(controls.textContent).toContain("24px");

    wide.value = String(((1200 - 900) / (1800 - 900)) * 100);
    wide.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(tokenValue(activeTheme(), "container-wide")).toBe("1200px"));

    gutter.value = String(((64 - 8) / (96 - 8)) * 100);
    gutter.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(tokenValue(activeTheme(), "container-gutter")).toBe("64px"));
    await vi.waitFor(() =>
      expect(
        getComputedStyle(canvasQuery<HTMLElement>('[data-pb-id="G"]')!)
          .getPropertyValue("--container-gutter")
          .trim(),
      ).toBe("64px"),
    );
    expect(getComputedStyle(canvasQuery<HTMLElement>('[data-pb-id="G"]')!).paddingInlineStart).toBe(
      "64px",
    );

    controls
      .querySelector<HTMLButtonElement>("button[data-p-on='click:designResetContainerWidths']")!
      .click();
    await vi.waitFor(() => expect(tokenValue(activeTheme(), "container-wide")).toBe("1340px"));
    expect(tokenValue(activeTheme(), "container-gutter")).toBe("24px");
    await vi.waitFor(() =>
      expect(
        getComputedStyle(canvasQuery<HTMLElement>('[data-pb-id="G"]')!)
          .getPropertyValue("--container-gutter")
          .trim(),
      ).toBe("24px"),
    );
  });

  test("a template content boundary constrains the canvas without adding a Group block", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<h1 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Title</h1><p data-pb-block="paragraph" data-pb-rich="body">Body</p>',
      media: false,
      theme: DEFAULT_THEME,
      templateWidth: "content",
    });
    destroyShell = shell.destroy;

    expect(shell.editor.getModel().blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
    ]);
    const canvas = canvasQuery<HTMLElement>("#canvas")!;
    expect(canvas.getAttribute("data-pbe-template-width")).toBe("content");
    await vi.waitFor(() => expect(getComputedStyle(canvas).paddingLeft).toBe("24px"));
    expect(getComputedStyle(canvas).fontSize).toBe("16px");
    expect(getComputedStyle(canvasQuery("h1")!).fontSize).toBe("36px");
    expect(getComputedStyle(canvasQuery("p")!).marginBottom).toBe("16px");
  });

  test("site element defaults yield to semantic contexts and block utilities", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<section class="text-brand-foreground"><h2 data-pb-id="Context" data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Context wins</h2></section>' +
        '<h2 data-pb-id="H" data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="m-0 text-brand-foreground">Utility wins</h2>',
      media: false,
      theme: HEARTH_THEME,
      siteCss: `
        .m-0 { margin: 0 }
        .text-brand-foreground { color: var(--color-brand-foreground) }
      `,
    });
    destroyShell = shell.destroy;

    const heading = canvasQuery<HTMLElement>('[data-pb-id="H"]')!;
    const contextualHeading = canvasQuery<HTMLElement>('[data-pb-id="Context"]')!;
    await vi.waitFor(() => expect(getComputedStyle(heading).marginTop).toBe("0px"));
    expect(getComputedStyle(heading).marginBottom).toBe("0px");
    expect(getComputedStyle(heading).color).toBe("rgb(255, 250, 240)");
    expect(getComputedStyle(contextualHeading).color).toBe("rgb(255, 250, 240)");
  });

  test("text blocks can zero inherited element spacing in one action", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content:
        '<h2 data-pb-id="H" data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Section</h2>',
      media: false,
      theme: DEFAULT_THEME,
    });
    destroyShell = shell.destroy;

    shell.editor.selectBlock("H", { toggle: true });
    host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!.click();
    const zero = host.querySelector<HTMLButtonElement>(
      '[data-p-on="mousedown.prevent:swallow;click:zeroTextSpacing"]',
    )!;
    await vi.waitFor(() => expect(zero.classList.contains("hidden")).toBe(false));
    zero.click();
    await vi.waitFor(() => expect(shell.editor.getStyle("H", "margin")).toBe("0"));
    expect(shell.editor.getStyle("H", "marginTop")).toBe("0");
    expect(shell.editor.getStyle("H", "marginBottom")).toBe("0");
    expect(shell.editor.getStyle("H", "padding")).toBe("0");
  });

  test("theme typography settings update inherited site defaults and reset cleanly", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">Readable by default.</p>',
      media: false,
      theme: DEFAULT_THEME,
      templateWidth: "content",
    });
    destroyShell = shell.destroy;

    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    const typographyNav = host.querySelector<HTMLButtonElement>('[data-page="typography"]')!;
    typographyNav.click();
    await vi.waitFor(() => expect(typographyNav.getAttribute("aria-current")).toBe("true"));

    const page = host.querySelector<HTMLElement>('[data-design-preview="typography"]')!;
    expect(
      host
        .querySelector<HTMLElement>("[data-design-workspace-sidebar]")!
        .classList.contains("hidden"),
    ).toBe(true);
    expect(page.textContent).toContain("representative long-form document");
    expect(page.querySelector("dl")).toBeTruthy();
    expect(page.querySelector("blockquote")).toBeTruthy();
    expect(page.querySelector("pre")).toBeTruthy();

    const typographyControls = host.querySelector<HTMLElement>(
      '[data-design-controls="typography"]',
    )!;
    expect(
      typographyControls.querySelector('[data-element="text"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(typographyControls.querySelector('input[type="range"]')).toBeNull();

    const size = typographyControls.querySelector<HTMLButtonElement>(
      '[data-name="publr-body-font-size"][data-value="var(--text-lg)"]',
    )!;
    const bodyFont = typographyControls.querySelector<HTMLButtonElement>(
      '[data-name="publr-body-font-family"][data-value="var(--font-serif)"]',
    )!;
    const normalWeight = typographyControls.querySelector<HTMLButtonElement>(
      '[data-name="publr-body-font-weight"][data-value="var(--font-weight-normal)"]',
    )!;
    expect(size.textContent).toContain("1.125rem");
    expect(bodyFont.textContent).toContain("Serif");
    expect(normalWeight.textContent?.trim()).toBe("Normal");

    size.click();
    await vi.waitFor(() =>
      expect(tokenValue(activeTheme(), "publr-body-font-size")).toBe("var(--text-lg)"),
    );
    expect(getComputedStyle(canvasQuery("#canvas")!).fontSize).toBe("18px");
    expect(getComputedStyle(page.querySelector("article")!).fontSize).toBe("18px");

    bodyFont.click();
    await vi.waitFor(() =>
      expect(tokenValue(activeTheme(), "publr-body-font-family")).toBe("var(--font-serif)"),
    );

    const lineHeight = typographyControls.querySelector<HTMLInputElement>(
      'input[type="number"][data-name="publr-body-line-height"]',
    )!;
    lineHeight.value = "1.75";
    lineHeight.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(tokenValue(activeTheme(), "publr-body-line-height")).toBe("1.75"),
    );

    typographyControls.querySelector<HTMLButtonElement>('[data-element="headings"]')!.click();
    await vi.waitFor(() =>
      expect(
        typographyControls.querySelector('[data-element="headings"]')?.getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    typographyControls.querySelector<HTMLButtonElement>('[data-level="h2"]')!.click();
    let headingSize: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
      headingSize = typographyControls.querySelector<HTMLButtonElement>(
        '[data-name="publr-heading-2-size"][data-value="var(--text-4xl)"]',
      );
      expect(headingSize).toBeTruthy();
    });
    headingSize!.click();
    await vi.waitFor(() =>
      expect(tokenValue(activeTheme(), "publr-heading-2-size")).toBe("var(--text-4xl)"),
    );

    typographyControls.querySelector<HTMLButtonElement>('[data-element="links"]')!.click();
    let noUnderline: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
      noUnderline = typographyControls.querySelector<HTMLButtonElement>(
        '[data-name="publr-link-text-decoration"][data-value="none"]',
      );
      expect(noUnderline).toBeTruthy();
    });
    noUnderline!.click();
    await vi.waitFor(() =>
      expect(tokenValue(activeTheme(), "publr-link-text-decoration")).toBe("none"),
    );

    typographyControls
      .querySelector<HTMLButtonElement>("button[data-p-on='click:designResetTypographyDefaults']")!
      .click();
    await vi.waitFor(() => expect(tokenValue(activeTheme(), "publr-body-font-size")).toBe("1rem"));
    expect(tokenValue(activeTheme(), "publr-body-font-family")).toBe("var(--font-sans)");
    expect(tokenValue(activeTheme(), "publr-body-line-height")).toBe("1.6");
    expect(tokenValue(activeTheme(), "publr-heading-2-size")).toBe("1.75rem");
    expect(tokenValue(activeTheme(), "publr-link-text-decoration")).toBe("underline");
    expect(shell.editor.getModel().blocks.map((block) => block.type)).toEqual(["paragraph"]);
  });

  test("the iframe viewport drives responsive layout and desktop color writes", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: getPattern("home-hero")!.content,
      media: false,
      theme: HEARTH_THEME,
      siteCss: `
        .grid { display:grid }
        .grid-cols-1 { grid-template-columns:minmax(0,1fr) }
        .bg-brand-surface { background-color:var(--color-brand-surface) }
        @media (min-width:1024px) {
          .lg\\:grid-cols-2 { grid-template-columns:repeat(2,minmax(0,1fr)) }
          .lg\\:bg-inverse-surface { background-color:var(--color-inverse-surface) }
        }
      `,
    });
    destroyShell = shell.destroy;

    const root = shell.editor.getModel().blocks[0];
    shell.editor.selectBlock(root.id, { toggle: true });
    const frame = host.querySelector<HTMLIFrameElement>("#editor-frame")!;
    const surface = canvasQuery<HTMLElement>('#canvas > [data-pb-block="group"]')!;
    const grid = surface.querySelector<HTMLElement>(':scope > [data-pb-block="group"]')!;
    const copy = grid.querySelector<HTMLElement>(':scope > [data-pb-block="group"]')!;
    const media = grid.querySelector<HTMLElement>(":scope > figure")!;

    await selectViewportBreakpoint("base", "mobile");
    await vi.waitFor(() => expect(frame.getBoundingClientRect().width).toBe(390));
    expect(getComputedStyle(grid).gridTemplateColumns.split(" ")).toHaveLength(1);
    expect(getComputedStyle(copy).paddingLeft).toBe("24px");
    expect(getComputedStyle(copy).paddingRight).toBe("24px");

    await selectViewportBreakpoint("lg", "desktop");
    await vi.waitFor(() => expect(frame.getBoundingClientRect().width).toBe(1024));
    await vi.waitFor(() =>
      expect(getComputedStyle(grid).gridTemplateColumns.split(" ")).toHaveLength(2),
    );
    // The outer border-box carries both gutters, so they protect narrow
    // content without consuming the semantic max width.
    expect(getComputedStyle(copy).paddingLeft).toBe("0px");
    expect(getComputedStyle(grid).paddingLeft).toBe("24px");
    expect(grid.getBoundingClientRect().left).toBeCloseTo(0, 0);
    expect(grid.getBoundingClientRect().width).toBeCloseTo(1024, 0);
    expect(media.getBoundingClientRect().right).toBeCloseTo(1024, 0);

    await selectViewportBreakpoint("2xl", "desktop");
    await vi.waitFor(() => expect(frame.getBoundingClientRect().width).toBe(1536));
    expect(grid.getBoundingClientRect().left).toBeCloseTo(74, 0);
    expect(grid.getBoundingClientRect().width).toBeCloseTo(1388, 0);
    expect(
      grid.getBoundingClientRect().width -
        Number.parseFloat(getComputedStyle(grid).paddingLeft) -
        Number.parseFloat(getComputedStyle(grid).paddingRight),
    ).toBeCloseTo(1340, 0);
    expect(media.getBoundingClientRect().right).toBeCloseTo(1536, 0);

    await selectViewportBreakpoint("lg", "desktop");
    await vi.waitFor(() => expect(frame.getBoundingClientRect().width).toBe(1024));
    host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!.click();
    host
      .querySelector<HTMLButtonElement>('[aria-label="Color context"] [data-context="inverse"]')!
      .click();
    await vi.waitFor(() =>
      expect(shell.editor.getStyle(root.id, "backgroundColor", "lg")).toBe("inverse-surface"),
    );
    const recoloredGrid = canvasQuery<HTMLElement>('#canvas > [data-pb-block="group"]')!;
    expect(recoloredGrid.classList.contains("lg:bg-inverse-surface")).toBe(true);
    expect(getComputedStyle(recoloredGrid).backgroundColor).toBe("rgb(164, 83, 50)");

    await selectViewportBreakpoint("base", "mobile");
    await vi.waitFor(() => expect(frame.getBoundingClientRect().width).toBe(390));
    expect(getComputedStyle(recoloredGrid).backgroundColor).toBe("rgb(96, 127, 153)");
  });

  test("a placed pattern remaps every semantic role through its pattern-level style", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const shell = await createEditorShell({
      container: host,
      content: '<p data-pb-block="paragraph" data-pb-rich="body">Before</p>',
      media: false,
      theme: HEARTH_THEME,
    });
    destroyShell = shell.destroy;

    const [root] = shell.editor.insertPattern("home-hero")!;
    shell.editor.selectBlock(root.id);
    await vi.waitFor(() =>
      expect(
        host.querySelector('#pattern-context [data-context="brand"]')?.getAttribute("aria-pressed"),
      ).toBe("true"),
    );

    host.querySelector<HTMLButtonElement>('#pattern-context [data-context="inverse"]')!.click();
    await vi.waitFor(() =>
      expect(shell.editor.serialize({ pipeline: "data" })).toContain("bg-inverse-surface"),
    );
    const data = shell.editor.serialize({ pipeline: "data" });
    expect(data).toContain("text-inverse-foreground");
    expect(data).toContain("bg-inverse-accent-surface");
    expect(data).toContain("text-inverse-accent-foreground");
    expect(data).not.toContain("bg-brand-surface");
    expect(shell.editor.serialize()).toContain('"colorContext":"inverse"');
    expect(
      host.querySelector('#pattern-context [data-context="inverse"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
