// Container sizes: every container as a band on a canvas drawn with the editor's blocks,
// the selected one in the inspector (label, max width, the box at a breakpoint).
import { Publr } from "publr-jsx";
import { styleBreakpoints } from "../model/breakpoints";
import { containerValue, containers } from "../model/containers";
import type { Container, ContainerProp } from "../model/containers";
import { resolveValue } from "../model/system";
import type { DesignSystem } from "../model/system";
import type { BuilderProps, State } from "../state";
import { redrawCanvas } from "./canvas";

export type ContainerRow = { key: string; label: string; maxWidth: string; title: string; selected: boolean };
type Side = { part: string; label: string; title: string; display: string; pressed: boolean };
type Ring = Side[];

const SIDES = ["top", "right", "bottom", "left"];
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
const emptyRing = (): Ring => [];

export const initial = () => ({
  containerRows: [] as ContainerRow[],
  containerSelected: "",
  containerLabel: "",
  containerMaxWidth: "",
  containerRemovable: false,
  containerBreakpoint: "base",
  containerBreakpoints: [] as { key: string; label: string; current: boolean }[],
  containerMargin: emptyRing(),
  containerBorder: emptyRing(),
  containerPadding: emptyRing(),
  containerRadius: emptyRing(),
  /** The picked side, `ring:side`, its name and its value at the breakpoint. */
  containerPart: "",
  containerPartLabel: "",
  containerPartValue: "",
  containerCanvasHtml: "",
  containerError: "",
  /** The site's surface color, the canvas around the frame. */
  containerSurface: "#ffffff",
});

/** Which container prop each ring's side edits; left and right margins are the
 * container's centring, not a setting. */
export const SIDE_PROPS: Record<string, ContainerProp | null> = {
  "margin:top": "marginTop",
  "margin:bottom": "marginBottom",
  "margin:left": null,
  "margin:right": null,
  "border:top": "borderWidth",
  "border:right": "borderWidth",
  "border:bottom": "borderWidth",
  "border:left": "borderWidth",
  "padding:top": "paddingTop",
  "padding:bottom": "paddingBottom",
  "padding:left": "padding",
  "padding:right": "padding",
  "radius:top-left": "borderRadius",
  "radius:top-right": "borderRadius",
  "radius:bottom-right": "borderRadius",
  "radius:bottom-left": "borderRadius",
};

const RING_LABELS: Record<string, string> = { margin: Publr.t("Margin"), border: Publr.t("Border"), padding: Publr.t("Padding"), radius: Publr.t("Radius") };

const RING_TITLES: Record<string, string> = { margin: Publr.t("Margin"), border: Publr.t("Border width"), padding: Publr.t("Padding"), radius: Publr.t("Corner radius") };

function ring(container: Container, name: string, parts: string[], breakpoints: string[], breakpoint: string, picked: string): Ring {
  return parts.map((part) => {
    const prop = SIDE_PROPS[`${name}:${part}`];
    const value = prop ? containerValue(container, prop, breakpoints, breakpoint).value : "";
    return { part, label: `${RING_TITLES[name]} ${part.replace("-", " ")}`, title: prop ? RING_TITLES[name] : Publr.t("Containers centre themselves"), display: value, pressed: picked === `${name}:${part}` };
  });
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** The canvas: one Group block per container, its width and box at the breakpoint. */
function canvasHtml(list: Container[], selected: string, breakpoints: string[], breakpoint: string): string {
  return list
    .map((container) => {
      const value = (prop: ContainerProp) => containerValue(container, prop, breakpoints, breakpoint).value;
      const style = [
        `max-width:calc(${container.maxWidth} + 2 * ${value("padding") || "0px"})`,
        `padding-inline:${value("padding") || "0"}`,
        container.key === selected && "outline:2px solid #5b5bd6",
        value("paddingTop") && `padding-top:${value("paddingTop")}`,
        value("paddingBottom") && `padding-bottom:${value("paddingBottom")}`,
        value("marginTop") && `margin-top:${value("marginTop")}`,
        value("marginBottom") && `margin-bottom:${value("marginBottom")}`,
        value("borderWidth") && `border:${value("borderWidth")} ${value("borderStyle") || "solid"} ${value("borderColor") || "currentColor"}`,
        value("borderRadius") && `border-radius:${value("borderRadius")}`,
      ]
        .filter(Boolean)
        .join(";");
      return `<div data-pb-block="group" data-pb-tag="tag" data-pb-children data-container="${container.key}" class="mx-auto my-8 flex min-h-32 cursor-pointer items-center justify-center bg-muted-surface" style="${style}"><p data-pb-block="paragraph" data-pb-rich="body" class="w-full rounded-md bg-surface px-4 py-10 text-center text-sm text-muted-foreground">${escape(Publr.t("{name} · max {width}", { name: container.label, width: container.maxWidth }))}</p></div>`;
    })
    .join("");
}

const wrap = (inner: string) => `<div data-pb-block="group" data-pb-tag="tag" data-pb-children class="bg-surface py-px font-body">${inner}</div>`;

export function view(system: DesignSystem, state: State, _props: BuilderProps): Partial<State> {
  const list = containers(system);
  const selected = list.find((container) => container.key === state.containerSelected) ?? list[0];
  const breakpoints = styleBreakpoints(system).map((breakpoint) => breakpoint.key);
  const breakpoint = breakpoints.includes(state.containerBreakpoint) ? state.containerBreakpoint : "base";
  const part = SIDE_PROPS[state.containerPart] ? state.containerPart : "";
  const html = wrap(canvasHtml(list, selected?.key ?? "", breakpoints, breakpoint));
  if (state.page === "containers") redrawCanvas(state, html, system);
  return {
    containerRows: list.map((container) => ({ key: container.key, label: container.label, maxWidth: container.maxWidth, title: Publr.t("{name} · max {width}", { name: container.label, width: container.maxWidth }), selected: container.key === selected?.key })),
    containerSelected: selected?.key ?? "",
    containerLabel: selected?.label ?? "",
    containerMaxWidth: selected?.maxWidth ?? "",
    containerRemovable: list.length > 1,
    containerBreakpoint: breakpoint,
    containerBreakpoints: styleBreakpoints(system).map((entry) => ({ key: entry.key, label: entry.key === "base" ? Publr.t("Base") : entry.key, current: entry.key === breakpoint })),
    containerMargin: selected ? ring(selected, "margin", SIDES, breakpoints, breakpoint, part) : emptyRing(),
    containerBorder: selected ? ring(selected, "border", SIDES, breakpoints, breakpoint, part) : emptyRing(),
    containerPadding: selected ? ring(selected, "padding", SIDES, breakpoints, breakpoint, part) : emptyRing(),
    containerRadius: selected ? ring(selected, "radius", CORNERS, breakpoints, breakpoint, part) : emptyRing(),
    containerPart: part,
    containerPartLabel: part ? `${RING_LABELS[part.split(":")[0]]} ${part.split(":")[1].replace("-", " ")} · ${breakpoint === "base" ? Publr.t("Base") : breakpoint}` : "",
    containerPartValue: part && selected ? containerValue(selected, SIDE_PROPS[part]!, breakpoints, breakpoint).value : "",
    containerCanvasHtml: html,
    containerSurface: resolveValue(system, "var(--color-surface)") || "#ffffff",
  };
}
