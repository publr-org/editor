// What a host page loads to put the editor on its rich text fields. Each control marked
// `data-rich-text` (a textarea in the record form) gets an inline editor in its place;
// the control stays in the form, hidden, and carries the field's value.
import { mount } from "publr/dom";
import { component } from "publr-jsx";
import { registerCoreBlocks } from "../blocks/index";
import type { ThemeToken } from "../canvas/engine";
import { loadEngine } from "../canvas/engine";
import { isRegistered } from "../model/registry";
import { InlineEditor } from "../shell/InlineEditor.ptsx";
import { ICONS, ensureIcon } from "../../icons/src/index";
import type { IconName } from "../../icons/src/index";

export type BootOptions = {
  /** Where the editor's own files are served from (its canvas stylesheet and engine). */
  base: string;
  siteStyles?: readonly string[];
  theme?: readonly ThemeToken[];
};

let booted = false;

export async function boot(options: BootOptions): Promise<void> {
  if (!booted) {
    if (!isRegistered("paragraph")) registerCoreBlocks();
    // The page owns the sprite; the editor adds the icons its chrome and blocks name.
    for (const name of Object.keys(ICONS)) ensureIcon(name as IconName);
    await loadEngine(new URL("runtime/jit_engine.wasm", options.base).href);
    booted = true;
  }
}

/**
 * Mounts an inline editor on every rich text field under `root` not yet mounted: the
 * design system's RichTextInput (`[data-rich-text]` holding a hidden `[data-rich-canvas]`
 * and the field's textarea), or a bare `textarea[data-rich-text]`.
 */
export async function mountRichFields(root: ParentNode, options: BootOptions): Promise<number> {
  await boot(options);
  let mounted = 0;
  for (const field of root.querySelectorAll<HTMLElement>("[data-rich-text]:not([data-rich-mounted])")) {
    field.setAttribute("data-rich-mounted", "");
    const control = (field.localName === "textarea" ? field : field.querySelector("textarea")) as HTMLTextAreaElement | null;
    if (!control) continue;
    // A visual record's own field belongs to the full editor, never to an inline one.
    if (field.closest<HTMLElement>("[data-visual-mounted]")?.dataset.visualField === control.name) continue;
    const list = field.dataset.formats;
    const formats = list === undefined ? undefined : list.split(/[\s,]+/).filter(Boolean);
    let host = field.querySelector<HTMLElement>("[data-rich-canvas]");
    if (!host) {
      host = control.ownerDocument.createElement("div");
      control.after(host);
    }
    host.hidden = false;
    host.className = "";
    control.hidden = true;
    mount(
      host,
      () =>
        component(InlineEditor, {
          control,
          formats,
          canvasStylesheet: new URL("editor/canvas/canvas.css", options.base).href,
          siteStyles: options.siteStyles,
          theme: options.theme,
          placeholder: field.dataset.placeholder,
        }),
      {},
    );
    mounted++;
  }
  return mounted;
}
