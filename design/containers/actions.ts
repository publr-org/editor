// What Container sizes does: select, add, rename, resize, remove, and set the box.
import { Publr } from "publr-jsx";
import { builder } from "../Builder.ptsx";
import { addContainer as add, containerWidth, containers, removeContainer as remove, renameContainer as rename, setContainerProp, setContainerWidth } from "../model/containers";
import { requestRemoval } from "../removal/actions";
import type { BuilderInstance } from "../state";
import { mountCanvas } from "./canvas";
import { SIDE_PROPS } from "./view";

function selectWith(b: BuilderInstance, key: string): void {
  b.state.containerSelected = key;
  b.state.containerPart = "";
  b.refresh();
}

export function selectContainer(key: string): void {
  selectWith(builder(), key);
}

/** The canvas host's ref callback. */
export function canvasRef(host: Element | null): void {
  mountCanvas(host, builder(), selectWith);
}

export function addContainer(): void {
  const b = builder();
  const result = add(b.system());
  b.state.containerSelected = result.key;
  b.change(result.system);
}

export function renameContainer(label: string): void {
  const b = builder();
  b.change(rename(b.system(), b.state.containerSelected, label));
}

export function setMaxWidth(raw: string): void {
  const b = builder();
  const width = containerWidth(raw);
  if (!width) {
    b.refresh();
    return;
  }
  b.change(setContainerWidth(b.system(), b.state.containerSelected, width));
}

export function removeContainer(): void {
  const b = builder();
  const key = b.state.containerSelected;
  const list = containers(b.system());
  const container = list.find((candidate) => candidate.key === key);
  if (!container || list.length < 2) return;
  requestRemoval({
    title: Publr.t("Remove the {name} container?", { name: container.label }),
    refs: [{ kind: "container", key }],
    alternatives: list.filter((candidate) => candidate.key !== key).map((candidate) => ({ key: candidate.key, label: candidate.label })),
    apply: (system) => remove(system, key),
  });
}

export function setContainerBreakpoint(key: string): void {
  const b = builder();
  b.state.containerBreakpoint = key;
  b.refresh();
}

/** A part of the box model picked: its `data-box-part` is `<ring>:<side>`. */
export function pickPart(event: MouseEvent): void {
  const [ring, side] = ((event.currentTarget as HTMLElement | null)?.dataset.boxPart ?? "").split(":");
  if (ring && side) pickSide(ring, side);
}

export function pickSide(ring: string, side: string): void {
  const b = builder();
  const part = `${ring}:${side}`;
  b.state.containerPart = b.state.containerPart === part || !SIDE_PROPS[part] ? "" : part;
  b.refresh();
}

/** Writes the picked side's value; the gutter's left and right are one value. */
export function setSideValue(raw: string): void {
  const b = builder();
  const prop = SIDE_PROPS[b.state.containerPart];
  if (!prop) return;
  b.change(setContainerProp(b.system(), b.state.containerSelected, prop, b.state.containerBreakpoint, raw));
}

export function resetDimensions(): void {
  const b = builder();
  let system = b.system();
  for (const prop of ["paddingTop", "paddingBottom", "marginTop", "marginBottom", "borderWidth", "borderRadius"] as const) system = setContainerProp(system, b.state.containerSelected, prop, b.state.containerBreakpoint, "");
  if (b.state.containerBreakpoint !== "base") system = setContainerProp(system, b.state.containerSelected, "padding", b.state.containerBreakpoint, "");
  b.change(system);
}
