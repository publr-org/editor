// A live preview of markup in a small frame: the site's styles, the site's theme compiled
// by the jit, scaled down to a card. Pattern previews in the rail and the explorer.
import { Watcher } from "../canvas/engine";
import type { ThemeToken } from "../canvas/engine";

const WIDTH = 1100;

export type PreviewOptions = {
  padding?: string;
  /** The width the markup is laid out at before it is scaled to the host (1100 by default). */
  width?: number;
  /** `fit` (default) sizes the host to the scaled markup; `square` keeps the host's own box
   * and shows the markup from its top; `contain` scales it to fit the host and centres it. */
  shape?: "fit" | "square" | "contain";
  /** The tallest the markup may be before it is cut (900 by default; 0 for no limit). */
  maxHeight?: number;
};

export function mountPreview(host: HTMLElement, html: string, styles: readonly string[], theme: readonly ThemeToken[], options: PreviewOptions = {}): void {
  host.replaceChildren();
  const frame = host.ownerDocument.createElement("iframe");
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("aria-hidden", "true");
  const width = options.width ?? WIDTH;
  const shape = options.shape ?? "fit";
  const cap = options.maxHeight ?? 900;
  frame.style.width = `${width}px`;
  frame.style.border = "0";
  frame.style.pointerEvents = "none";
  frame.style.transformOrigin = "0 0";
  host.append(frame);
  const doc = frame.contentDocument!;
  for (const href of styles) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    doc.head.append(link);
  }
  const body = doc.createElement("div");
  body.style.padding = options.padding ?? "32px";
  const template = doc.createElement("template");
  template.innerHTML = html;
  body.append(template.content);
  doc.body.append(body);
  if (options.width) doc.body.style.margin = "0";
  new Watcher(doc, theme);
  const fit = () => {
    const natural = Math.max(options.width ? 48 : 80, body.scrollHeight, doc.body.scrollHeight);
    const height = cap > 0 ? Math.min(cap, natural) : natural;
    const widthScale = host.clientWidth / width || 0.25;
    const scale = shape === "contain" ? Math.min(widthScale, host.clientHeight / height || widthScale) : widthScale;
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${scale})`;
    if (shape === "contain") {
      frame.style.position = "absolute";
      frame.style.left = `${(host.clientWidth - width * scale) / 2}px`;
      frame.style.top = `${(host.clientHeight - height * scale) / 2}px`;
    }
    if (shape === "fit") host.style.height = `${height * scale}px`;
  };
  frame.addEventListener("load", fit);
  requestAnimationFrame(fit);
  setTimeout(fit, 120);
}

type LiveFrame = { frame: HTMLIFrameElement; body: HTMLElement; watcher: Watcher; styles: string };
const live = new WeakMap<HTMLElement, LiveFrame>();

/** A preview at full size: the frame fills its host's width and grows to its content,
 * unscaled. Called again on the same host it redraws in place (the markup, the styles,
 * the theme), so a live preview never flickers. */
export function mountLivePreview(host: HTMLElement, html: string, styles: readonly string[], theme: readonly ThemeToken[]): void {
  let current = live.get(host);
  if (!current || !current.frame.isConnected || current.frame.parentElement !== host) {
    host.replaceChildren();
    const frame = host.ownerDocument.createElement("iframe");
    frame.setAttribute("tabindex", "-1");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("data-live-preview", "");
    frame.style.cssText = "display:block;width:100%;border:0;pointer-events:none;";
    host.append(frame);
    const doc = frame.contentDocument!;
    doc.documentElement.style.overflow = "hidden";
    const body = doc.createElement("div");
    doc.body.style.margin = "0";
    doc.body.append(body);
    current = { frame, body, watcher: new Watcher(doc, theme), styles: "" };
    live.set(host, current);
    const fit = () => (frame.style.height = `${Math.max(1, body.scrollHeight)}px`);
    new (doc.defaultView ?? window).ResizeObserver(fit).observe(body);
  }
  const doc = current.frame.contentDocument!;
  const key = styles.join("\n");
  if (current.styles !== key) {
    for (const link of doc.head.querySelectorAll("link[data-live-style]")) link.remove();
    for (const href of styles) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-live-style", "");
      doc.head.append(link);
    }
    current.styles = key;
  }
  current.watcher.setTheme(theme);
  const template = doc.createElement("template");
  template.innerHTML = html;
  current.body.replaceChildren(template.content);
}

/** A frame drawn like the canvas at a device's width, scaled by its host's CSS. */
export type PreviewFrame = { update(html: string): void; destroy(): void };

/**
 * A live preview of the page at one device width: the site's styles and the canvas's own,
 * the theme compiled by the jit, the markup in a canvas root. The host scales it.
 */
export function mountFrame(host: HTMLElement, html: string, styles: readonly string[], theme: readonly ThemeToken[], width: number, canvasStylesheet: string): PreviewFrame {
  host.replaceChildren();
  const frame = host.ownerDocument.createElement("iframe");
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("aria-hidden", "true");
  frame.style.width = `${width}px`;
  frame.style.height = "100%";
  frame.style.border = "0";
  frame.style.display = "block";
  frame.style.pointerEvents = "none";
  host.append(frame);
  const doc = frame.contentDocument!;
  const meta = doc.createElement("meta");
  meta.setAttribute("name", "viewport");
  meta.setAttribute("content", "width=device-width, initial-scale=1");
  doc.head.append(meta);
  for (const href of [...styles, canvasStylesheet]) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL(href, host.ownerDocument.baseURI).href;
    doc.head.append(link);
  }
  const root = doc.createElement("div");
  root.setAttribute("data-canvas-root", "");
  doc.body.append(root);
  const watcher = new Watcher(doc, theme);
  const update = (next: string) => {
    const template = doc.createElement("template");
    template.innerHTML = next;
    // A page in its template draws the template full-bleed, as the canvas does.
    const inTemplate = template.content.querySelector("[data-publr-slot]") !== null;
    root.toggleAttribute("data-canvas-in-template", inTemplate);
    root.replaceChildren(template.content);
  };
  update(html);
  void watcher;
  return { update, destroy: () => frame.remove() };
}
