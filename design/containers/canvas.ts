// The containers canvas: a live frame of Group blocks drawn with the site's styles and
// theme; a click on a band selects that container.
import { Publr } from "publr-jsx";
import { mountLivePreview } from "../../shell/preview";
import { fontStylesheets } from "../model/system";
import type { DesignSystem } from "../model/system";
import type { BuilderInstance, State } from "../state";

type Mounted = { host: HTMLElement; b: BuilderInstance; select: (b: BuilderInstance, key: string) => void };
const mounted = new WeakMap<object, Mounted>();
const wired = new WeakSet<Document>();

function draw(entry: Mounted, html: string, system: DesignSystem): void {
  if (!entry.host.isConnected) return;
  mountLivePreview(entry.host, html, [...(entry.b.props.siteStyles ?? []), ...fontStylesheets(system)], system.tokens);
  const frame = entry.host.querySelector("iframe");
  const doc = frame?.contentDocument;
  if (!frame || !doc) return;
  frame.style.pointerEvents = "auto";
  frame.removeAttribute("aria-hidden");
  frame.setAttribute("title", Publr.t("Containers"));
  if (wired.has(doc)) return;
  wired.add(doc);
  const owner = entry.b.state;
  doc.addEventListener("click", (event) => {
    const key = (event.target as Element | null)?.closest?.("[data-container]")?.getAttribute("data-container");
    const current = mounted.get(owner);
    if (key && current) current.select(current.b, key);
  });
}

/** A ref callback: the canvas host, drawn for the instance it renders under. */
export function mountCanvas(host: Element | null, b: BuilderInstance, select: (b: BuilderInstance, key: string) => void): void {
  if (!host) return;
  const entry: Mounted = { host: host as HTMLElement, b, select };
  mounted.set(b.state, entry);
  // The host is in the page once the render that made it is done.
  queueMicrotask(() => draw(entry, b.state.containerCanvasHtml, b.system()));
}

/** Redraws the canvas of the instance whose store this is, once the view is written. */
export function redrawCanvas(state: State, html: string, system: DesignSystem): void {
  const entry = mounted.get(state);
  if (entry) queueMicrotask(() => draw(entry, html, system));
}
