// The Breakpoints canvas: one frame per breakpoint, the document drawn like the canvas at
// that width and scaled to one column's width.
import { Publr } from "publr-jsx";
import { downcast, upcastBlocks } from "../../model/codec";
import { allPatterns } from "../../model/patterns";
import { mountFrame } from "../../shell/preview";
import type { PreviewFrame } from "../../shell/preview";
import { fontStylesheets } from "../model/system";
import type { DesignSystem } from "../model/system";
import type { BuilderInstance, BuilderProps, State } from "../state";
import { FRAME_HEIGHT, FRAME_WIDTH } from "./view";

const canvasStylesheet = new URL("../../canvas/canvas.css", import.meta.url).href;

/** The page the frames show: the app's header and footer patterns around the document's
 * place, or every pattern the library holds. */
export function demoDocument(props: BuilderProps): string {
  const patterns = props.library?.patterns?.length ? props.library.patterns : allPatterns().map((pattern) => ({ name: pattern.name, label: pattern.label, category: pattern.category ?? "", html: pattern.html }));
  const header = patterns.find((pattern) => /header/i.test(pattern.category) || /header/i.test(pattern.name));
  const footer = patterns.find((pattern) => /footer/i.test(pattern.category) || /footer/i.test(pattern.name));
  const chosen = header && footer ? [header, footer] : patterns;
  const html = chosen.map((pattern) => pattern.html).join("\n") || '<h1 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">Hearth &amp; Home</h1><p data-pb-block="paragraph" data-pb-rich="body">The document at this breakpoint.</p>';
  return downcast(upcastBlocks(html), "data");
}

type Drawn = { frame: PreviewFrame; width: number };
const drawn = new WeakMap<Element, Drawn>();
const widths = new WeakMap<Element, number>();
const hosts = new WeakMap<object, Set<Element>>();
const shown = new WeakMap<object, string>();

function draw(host: HTMLElement, width: number, b: { system: DesignSystem; props: BuilderProps }): void {
  if (!host.isConnected) return;
  const styles = [...(b.props.siteStyles ?? []), ...fontStylesheets(b.system)];
  const html = demoDocument(b.props);
  const frame = mountFrame(host, html, styles, b.system.tokens, width, canvasStylesheet);
  const element = host.querySelector("iframe");
  if (element) {
    const scale = FRAME_WIDTH / width;
    element.style.transformOrigin = "0 0";
    element.style.transform = `scale(${scale})`;
    element.style.height = `${FRAME_HEIGHT / scale}px`;
    // The frames show the page edge to edge, as a visitor sees it at that width.
    const root = element.contentDocument?.querySelector<HTMLElement>("[data-canvas-root]");
    if (root) root.style.padding = "0";
    element.setAttribute("title", Publr.t("The document at {width}px", { width }));
  }
  drawn.get(host)?.frame.destroy();
  drawn.set(host, { frame, width });
}

/** A frame host's ref callback. */
export function mountBreakpointFrame(host: Element | null, width: number, b: BuilderInstance): void {
  if (!host) return;
  widths.set(host, width);
  let set = hosts.get(b.state);
  if (!set) hosts.set(b.state, (set = new Set()));
  set.add(host);
  shown.set(b.state, JSON.stringify([b.system().tokens, b.system().fonts]));
  // The host has its size once it is in the page.
  queueMicrotask(() => draw(host as HTMLElement, width, { system: b.system(), props: b.props }));
}

/** Redraws every frame of the instance whose store this is (the theme changed). */
export function redrawFrames(state: State, system: DesignSystem, props: BuilderProps): void {
  const set = hosts.get(state);
  if (!set) return;
  const key = JSON.stringify([system.tokens, system.fonts]);
  if (shown.get(state) === key) return;
  shown.set(state, key);
  queueMicrotask(() => {
    for (const host of [...set]) {
      if (!host.isConnected) {
        set.delete(host);
        continue;
      }
      draw(host as HTMLElement, widths.get(host) ?? 390, { system, props });
    }
  });
}
