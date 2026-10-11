// What the Typography page does: retarget a font role, and keep the In use layout drawn
// with the system's fonts.
import { builder } from "../Builder.ptsx";
import { downcast, upcastBlocks } from "../../model/codec";
import { setFontRole } from "../model/fonts";
import { fontStylesheets } from "../model/system";
import { mountLivePreview } from "../../shell/preview";
import { inUseHtml } from "./preview";

export function retargetRole(role: string, event: Event): void {
  const b = builder();
  b.change(setFontRole(b.system(), role, (event.target as HTMLSelectElement).value));
}

/** The In use host's ref: draws now and whenever the view's stamp changes. */
export function attachInUse(host: Element | null): void {
  if (!host) return;
  const b = builder();
  const html = downcast(upcastBlocks(inUseHtml()), "data");
  const draw = () => {
    const system = b.system();
    mountLivePreview(host as HTMLElement, html, [...(b.props.siteStyles ?? []), ...fontStylesheets(system)], system.tokens);
  };
  queueMicrotask(draw);
  new MutationObserver(draw).observe(host, { attributes: true, attributeFilter: ["data-preview-stamp"] });
}
