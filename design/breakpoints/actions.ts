// What the Breakpoints page does: widths, adding and removing, moving a breakpoint to the
// neighbouring device, and the reset to the starter five.
import { Publr } from "publr-jsx";
import { builder } from "../Builder.ptsx";
import { addBreakpoint as add, moveBreakpoint, removeBreakpoint as remove, resetBreakpoints as reset, setBreakpointWidth, styleBreakpoints } from "../model/breakpoints";
import type { Device } from "../model/breakpoints";
import { requestRemoval } from "../removal/actions";
import { mountBreakpointFrame } from "./frames";

export function frameRef(host: Element | null, width: number): void {
  mountBreakpointFrame(host, width, builder());
}

export function setWidth(key: string, raw: string): void {
  const b = builder();
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    b.refresh();
    return;
  }
  b.state.breakpointError = "";
  b.change(setBreakpointWidth(b.system(), key, amount));
}

export function startAdding(device: string): void {
  const b = builder();
  b.state.breakpointAdding = device;
  b.state.breakpointAddName = "";
  b.state.breakpointAddWidth = "";
  b.state.breakpointError = "";
  b.refresh();
}

export function cancelAdding(): void {
  const b = builder();
  b.state.breakpointAdding = "";
  b.state.breakpointError = "";
  b.refresh();
}

export function addBreakpoint(device: string): void {
  const b = builder();
  const result = add(b.system(), b.state.breakpointAddName, b.state.breakpointAddWidth, device as Device);
  b.state.breakpointError = result.error;
  if (result.error) return;
  b.state.breakpointAdding = "";
  b.state.breakpointAddName = "";
  b.state.breakpointAddWidth = "";
  b.change(result.system);
}

export function removeBreakpoint(key: string): void {
  const b = builder();
  const options = styleBreakpoints(b.system());
  const breakpoint = options.find((candidate) => candidate.key === key);
  if (!breakpoint || key === "base") return;
  requestRemoval({
    title: Publr.t("Remove the {name} breakpoint?", { name: breakpoint.label }),
    refs: [{ kind: "breakpoint", key }],
    alternatives: options.filter((candidate) => candidate.key !== key).map((candidate) => ({ key: candidate.key, label: candidate.key === "base" ? Publr.t("Base (no breakpoint)") : `${candidate.label} · ${candidate.viewport}` })),
    apply: (system) => remove(system, key),
  });
}

export function resetBreakpoints(): void {
  const b = builder();
  b.state.breakpointError = "";
  b.change(reset(b.system()));
}

export function dragStart(key: string, event: DragEvent): void {
  const b = builder();
  b.state.breakpointDragged = key;
  event.dataTransfer?.setData("text/plain", key);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

export function dragOver(device: string, event: DragEvent): void {
  const b = builder();
  if (!b.state.breakpointDragged) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  if (b.state.breakpointDragOver !== device) {
    b.state.breakpointDragOver = device;
    b.refresh();
  }
}

export function dragLeave(event: DragEvent): void {
  const b = builder();
  const target = event.currentTarget as HTMLElement;
  if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
  b.state.breakpointDragOver = "";
  b.refresh();
}

export function drop(device: string, event: DragEvent): void {
  const b = builder();
  event.preventDefault();
  const key = event.dataTransfer?.getData("text/plain") || b.state.breakpointDragged;
  b.state.breakpointDragged = "";
  b.state.breakpointDragOver = "";
  const row = b.state.breakpointDevices.flatMap((group) => group.rows).find((candidate) => candidate.key === key);
  if (!key || key === "base" || !row?.movable || row.moveTarget !== device) {
    b.refresh();
    return;
  }
  b.change(moveBreakpoint(b.system(), key, device as Device));
}

export function dragEnd(): void {
  const b = builder();
  b.state.breakpointDragged = "";
  b.state.breakpointDragOver = "";
  b.refresh();
}
