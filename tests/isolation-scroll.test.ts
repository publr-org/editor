import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createEditorShell, getPattern, registerCoreBlocks, registerCorePatterns } from "../src";
import { getBlockType } from "../src/registry";

beforeAll(() => {
  if (!getBlockType("paragraph")) registerCoreBlocks();
  if (!getPattern("call-to-action")) registerCorePatterns();
});

let host: HTMLElement | null = null;
let destroyShell: (() => void) | null = null;

afterEach(() => {
  destroyShell?.();
  destroyShell = null;
  host?.remove();
  host = null;
});

describe("isolation viewport restoration", () => {
  test("returns an edited pattern copy to its pre-edit position after cancel and save", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const spacer = (id: string) =>
      `<div data-pb-id="${id}" data-pb-block="spacer" aria-hidden="true"><script type="application/json" data-pb-settings>{"height":"xl"}</script></div>`;
    const before = Array.from({ length: 18 }, (_, index) => spacer(`before-${index}`)).join("");
    const after = Array.from({ length: 18 }, (_, index) => spacer(`after-${index}`)).join("");
    const shell = await createEditorShell({
      container: host,
      content: before + after,
      media: false,
    });
    destroyShell = shell.destroy;
    const [pattern] = shell.editor.insertPattern("call-to-action", 18)!;
    shell.editor.selectBlock(pattern.id);

    const frame = host.querySelector<HTMLIFrameElement>("#editor-frame")!;
    const frameWindow = frame.contentWindow!;
    const patternElement = () =>
      frame.contentDocument!.querySelector<HTMLElement>(
        `[data-pb-id="${CSS.escape(pattern.id)}"]`,
      )!;
    const placePatternAt = async (visualTop: number) => {
      const element = patternElement();
      frameWindow.scrollTo(
        frameWindow.scrollX,
        frameWindow.scrollY + element.getBoundingClientRect().top - visualTop,
      );
      await vi.waitFor(() =>
        expect(patternElement().getBoundingClientRect().top).toBeCloseTo(visualTop, 0),
      );
    };
    const openPattern = async () => {
      host!.querySelector<HTMLButtonElement>("#sidebar-edit-pattern")!.click();
      await vi.waitFor(() => expect(shell.isIsolated()).toBe(true));
    };

    await placePatternAt(210);
    const cancelTop = patternElement().getBoundingClientRect().top;
    await openPattern();
    host.querySelector<HTMLButtonElement>("#template-cancel")!.click();
    await vi.waitFor(() => expect(shell.isIsolated()).toBe(false));
    await vi.waitFor(() =>
      expect(patternElement().getBoundingClientRect().top).toBeCloseTo(cancelTop, 0),
    );

    await placePatternAt(280);
    const saveTop = patternElement().getBoundingClientRect().top;
    const entryWidth = frameWindow.innerWidth;
    await openPattern();
    host
      .querySelector<HTMLButtonElement>('#viewport-switcher button[data-device="tablet"]')!
      .click();
    await vi.waitFor(() => expect(frameWindow.innerWidth).not.toBe(entryWidth));
    host.querySelector<HTMLButtonElement>("#template-save")!.click();
    await vi.waitFor(() => expect(shell.isIsolated()).toBe(false));
    await vi.waitFor(() =>
      expect(patternElement().getBoundingClientRect().top).toBeCloseTo(saveTop, 0),
    );
  });
});
