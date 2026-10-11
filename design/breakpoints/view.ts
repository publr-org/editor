// Breakpoints: the document at every breakpoint, smallest first, and the sidebar's device
// groups of breakpoints with their minimum widths.
import { Publr } from "publr-jsx";
import { DEVICES, breakpointDevice, breakpointOrderValid, breakpointRange, styleBreakpoints } from "../model/breakpoints";
import type { Device } from "../model/breakpoints";
import { cssLengthPx, resolveValue } from "../model/system";
import type { DesignSystem } from "../model/system";
import type { BuilderProps, State } from "../state";
import { redrawFrames } from "./frames";

export type BreakpointRow = {
  key: string;
  label: string;
  token: string;
  numeric: string;
  mediaQuery: boolean;
  locked: boolean;
  movable: boolean;
  moveTarget: string;
  spacer: boolean;
  dragLabel: string;
  removeLabel: string;
  widthLabel: string;
};
export type DeviceGroup = { key: Device; label: string; icon: string; rows: BreakpointRow[]; adding: boolean; over: boolean };
export type BreakpointFrame = { deviceFirst: boolean; key: string; label: string; range: string; device: string; deviceIcon: string; width: number; scale: string; height: string; inner: string };

/** The width a frame is shown at, whatever the breakpoint's. */
export const FRAME_WIDTH = 360;
export const FRAME_HEIGHT = 675;

export const initial = () => ({
  breakpointDevices: [] as DeviceGroup[],
  breakpointFrames: [] as BreakpointFrame[],
  breakpointAdding: "",
  breakpointAddName: "",
  breakpointAddWidth: "",
  breakpointError: "",
  breakpointOrderValid: true,
  breakpointDragged: "",
  breakpointDragOver: "",
  /** The site's surface color, the canvas around the frames. */
  breakpointSurface: "#ffffff",
});

export function view(system: DesignSystem, state: State, props: BuilderProps): Partial<State> {
  const list = styleBreakpoints(system);
  const rows = list.map((breakpoint) => ({
    key: breakpoint.key,
    label: breakpoint.label,
    token: breakpoint.token,
    numeric: String(cssLengthPx(breakpoint.viewport) ?? 0),
    device: breakpointDevice(system, breakpoint.key),
    mediaQuery: breakpoint.key !== "base",
    locked: breakpoint.key === "base",
    movable: false,
    moveTarget: "",
    spacer: false,
    dragLabel: "",
    removeLabel: Publr.t("Remove {name} breakpoint", { name: breakpoint.label }),
    widthLabel: breakpoint.key === "base" ? Publr.t("Base preview width") : Publr.t("{name} minimum width", { name: breakpoint.label }),
  }));
  // A group's first row may move to the previous device, its last to the next.
  const devices = DEVICES.map((device, index) => {
    const own = rows.filter((row) => row.device === device.key);
    const previous = DEVICES[index - 1]?.key;
    const next = DEVICES[index + 1]?.key;
    own.forEach((row, at) => {
      if (row.locked) {
        row.spacer = true;
        return;
      }
      const target = at === 0 && previous ? previous : at === own.length - 1 && next ? next : "";
      row.moveTarget = target;
      row.movable = !!target;
      row.spacer = !target;
      row.dragLabel = target ? Publr.t("Move {name} to {device}", { name: row.label, device: DEVICES.find((candidate) => candidate.key === target)?.label ?? target }) : "";
    });
    return { key: device.key, label: device.label, icon: device.icon, rows: own.map(({ device: _device, ...row }) => row), adding: state.breakpointAdding === device.key, over: state.breakpointDragOver === device.key };
  });
  const frames = list.map((breakpoint, index) => {
    const width = Math.max(1, Math.round(cssLengthPx(breakpoint.viewport) ?? 390));
    const scale = FRAME_WIDTH / width;
    const device = DEVICES.find((candidate) => candidate.key === breakpointDevice(system, breakpoint.key))!;
    const before = index > 0 ? breakpointDevice(system, list[index - 1].key) : device.key;
    return { deviceFirst: before !== device.key, key: breakpoint.key, label: breakpoint.label, range: breakpointRange(list, index), device: device.label, deviceIcon: device.icon, width, scale: String(scale), height: `${Math.round(FRAME_HEIGHT / scale)}px`, inner: `${width}px` };
  });
  if (state.page === "breakpoints") redrawFrames(state, system, props);
  return { breakpointSurface: resolveValue(system, "var(--color-surface)") || "#ffffff", breakpointDevices: devices, breakpointFrames: frames, breakpointOrderValid: breakpointOrderValid(system) };
}
