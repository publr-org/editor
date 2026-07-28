// Parity harness (editor-refactor step 1 — see
// ../.claude/thoughts/editor-refactor/001-components-stores-css.md).
//
// Captures getComputedStyle for every VISIBLE chrome element of the full
// shell, per canonical state, into __style-baselines__/*.json file snapshots.
// The refactor law: a PR must not change these files unless the diff is an
// intended design change. Regenerate deliberately with `vp test -u`.
//
// Element keys are structural (tag#id / tag[nth]) — never class lists — so
// migrating a rule from chrome.css into utility classes keeps the KEY stable
// and any visual drift shows up in the VALUES. The canvas iframe's interior
// is content, not chrome: the <iframe> element's own box is captured, its
// document is not.

import { page } from "@vitest/browser/context";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createEditorShell } from "../src/shell";
import type { EditorShell } from "../src/shell";
import { registerCoreBlocks } from "../src/blocks";
import { getBlockType } from "../src/registry";
import { DEFAULT_THEME } from "../src/theme";

if (!getBlockType("paragraph")) registerCoreBlocks();

// Curated visual surface: layout, box, paint, type, interaction. Transition/
// animation props are excluded (a settle-freeze style below zeroes their
// durations so captures never land mid-flight).
const PROPS = [
  "display",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "z-index",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "box-sizing",
  "overflow-x",
  "overflow-y",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "color",
  "background-color",
  "background-image",
  "box-shadow",
  "outline-width",
  "outline-style",
  "outline-color",
  "opacity",
  "visibility",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "align-items",
  "align-self",
  "justify-content",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "text-decoration-line",
  "white-space",
  "cursor",
  "pointer-events",
  "transform",
  "fill",
  "stroke",
];

// Structural key: walk up to the nearest id-bearing ancestor; disambiguate
// same-tag siblings by index. Class names are deliberately absent.
const keyOf = (el: Element, stop: Element): string => {
  const parts: string[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    const tag = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`${tag}#${node.id}`);
      break;
    }
    const parent = node.parentElement;
    const twins = parent ? [...parent.children].filter((s) => s.tagName === node.tagName) : [node];
    parts.unshift(twins.length > 1 ? `${tag}[${twins.indexOf(node)}]` : tag);
    if (node === stop) break;
  }
  return parts.join(">");
};

const capture = (root: HTMLElement): Record<string, Record<string, string>> => {
  const out: Record<string, Record<string, string>> = {};
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
    if (!el.getClientRects().length) continue; // hidden right now — other states cover it
    const cs = getComputedStyle(el);
    const styles: Record<string, string> = {};
    for (const p of PROPS) styles[p] = cs.getPropertyValue(p);
    out[keyOf(el, root)] = styles;
  }
  return out;
};

const settle = async (): Promise<void> => {
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};

describe("shell chrome computed-style baselines", () => {
  let host!: HTMLElement;
  let shell!: EditorShell;
  let shellRoot!: HTMLElement;

  const snapshot = async (name: string): Promise<void> => {
    await settle();
    // Trailing newline matches the repo formatter, so `vp check --fix` never
    // rewrites the baselines out from under the snapshot comparison.
    await expect(JSON.stringify(capture(shellRoot), null, 2) + "\n").toMatchFileSnapshot(
      `__style-baselines__/${name}.json`,
    );
  };

  beforeAll(async () => {
    await page.viewport(1440, 900);
    // Freeze motion so captures never land mid-transition. Durations are not
    // captured props, so this does not distort the baseline itself.
    const freeze = document.createElement("style");
    freeze.textContent =
      "*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}";
    document.head.appendChild(freeze);

    host = document.createElement("div");
    host.style.cssText = "position:relative;width:1280px;height:800px;overflow:hidden";
    document.body.appendChild(host);
    shell = await createEditorShell({
      container: host,
      content:
        '<h2 data-pb-block="heading" data-pb-id="h1" data-pb-tag="level" data-pb-rich="text">Baseline</h2>' +
        '<p data-pb-block="paragraph" data-pb-id="p1" data-pb-rich="body">Chrome parity fixture</p>',
      media: false,
      theme: DEFAULT_THEME,
    });
    shellRoot = host.querySelector<HTMLElement>("#editor-shell")!;
    const canvasDoc = () =>
      host.querySelector<HTMLIFrameElement>("#editor-frame")!.contentDocument!;
    await vi.waitFor(() => expect(canvasDoc().querySelector("#canvas [data-pb-id]")).toBeTruthy(), {
      timeout: 10_000,
    });
  });

  afterAll(() => {
    shell?.destroy();
    host?.remove();
  });

  test("default", async () => {
    await snapshot("default");
  });

  test("inserter open", async () => {
    const toggle = host.querySelector<HTMLButtonElement>("#inserter-toggle")!;
    toggle.click();
    await vi.waitFor(() =>
      expect(host.querySelector("#inserter")!.getClientRects().length).toBeGreaterThan(0),
    );
    await snapshot("inserter-open");
    toggle.click();
    await vi.waitFor(() =>
      expect(host.querySelector("#inserter")!.getClientRects().length).toBe(0),
    );
  });

  test("list view open", async () => {
    const toggle = host.querySelector<HTMLButtonElement>("#tree-toggle")!;
    toggle.click();
    await vi.waitFor(() =>
      expect(host.querySelector("#tree")!.getClientRects().length).toBeGreaterThan(0),
    );
    await snapshot("list-view");
    toggle.click();
    await vi.waitFor(() => expect(host.querySelector("#tree")!.getClientRects().length).toBe(0));
  });

  test("block selected — settings tab", async () => {
    shell.editor.selectBlock("h1");
    await vi.waitFor(() =>
      expect(host.querySelector("#block-card-title")?.textContent).toBe("Heading"),
    );
    await snapshot("block-selected-settings");
  });

  test("block selected — styles tab", async () => {
    const tab = host.querySelector<HTMLButtonElement>('[data-itab="styles"]')!;
    tab.click();
    await vi.waitFor(() => {
      expect(tab.getAttribute("aria-selected")).toBe("true");
      expect(host.querySelector(".pbe-box-model")).toBeTruthy();
    });
    await snapshot("block-selected-styles");
    host.querySelector<HTMLButtonElement>('[data-itab="settings"]')!.click();
  });

  test("light appearance", async () => {
    shell.setAppearance("light");
    await snapshot("appearance-light");
    shell.setAppearance("dark");
  });

  test("design workspace", async () => {
    host.querySelector<HTMLButtonElement>("#design-system-toggle")!.click();
    await vi.waitFor(() =>
      expect(host.querySelector("#design-workspace")!.getClientRects().length).toBeGreaterThan(0),
    );
    await snapshot("design-workspace");
  });
});
