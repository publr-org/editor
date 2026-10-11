// Live previews of the library's designs, drawn by the editor's own blocks with the
// working design system: each card's host is kept, and every change redraws the ones
// still on the page in the new tokens.
import { downcast, upcastBlocks } from "../../model/codec";
import { mountPreview } from "../../shell/preview";
import { fontStylesheets } from "../model/system";
import type { DesignSystem } from "../model/system";

type Drawn = { html: string };

const hosts = new Map<HTMLElement, Drawn>();
let styles: readonly string[] = [];
let tokens: DesignSystem["tokens"] = [];
let fonts: string[] = [];
let signature = "";

function draw(host: HTMLElement, drawn: Drawn): void {
  mountPreview(host, downcast(upcastBlocks(drawn.html), "data"), [...styles, ...fonts], tokens, { padding: "0", width: 1240 });
}

/** A card's preview host (a ref callback): drawn now, and again after each change. */
export function previewInto(host: Element | null, html: string): void {
  if (!host) return;
  const element = host as HTMLElement;
  const drawn = { html };
  hosts.set(element, drawn);
  queueMicrotask(() => draw(element, drawn));
}

/** The design system the previews are drawn in; redraws them when it changed. */
export function previewWith(system: DesignSystem, siteStyles: readonly string[]): void {
  const next = JSON.stringify([system.tokens, system.fonts, siteStyles]);
  if (next === signature) return;
  const first = signature === "";
  signature = next;
  styles = siteStyles;
  tokens = system.tokens;
  fonts = fontStylesheets(system);
  if (first) return;
  for (const [host, drawn] of hosts) {
    if (!host.isConnected) hosts.delete(host);
    else draw(host, drawn);
  }
}
