// What the Type scale page does: open a row, retune its props, add, rename, describe
// and remove styles.
import { builder } from "../Builder.ptsx";
import { addStyle, removeStyle, updateStyle } from "../model/typescale";
import type { TypeScaleEntry } from "../model/system";

export function toggleStyle(key: string): void {
  const b = builder();
  b.state.scaleOpen = b.state.scaleOpen === key ? "" : key;
  b.refresh();
}

/** The selects: font role, weight, text transform. */
export function setStyleProp(key: string, prop: "fontRole" | "weight" | "textTransform", event: Event): void {
  const b = builder();
  const raw = (event.target as HTMLSelectElement).value;
  if (prop === "weight" && !Number.isFinite(Number(raw))) return;
  const patch: Partial<TypeScaleEntry> = prop === "weight" ? { weight: Number(raw) } : prop === "fontRole" ? { fontRole: raw } : { textTransform: raw as TypeScaleEntry["textTransform"] };
  b.change(updateStyle(b.system(), key, patch));
}

/** A value control's commit: a token key ("" the default) or `[number, unit]`, a literal. */
export function setStyleValue(key: string, prop: "size" | "lineHeight" | "letterSpacing", value: string | readonly [number, string]): void {
  const b = builder();
  const literal = Array.isArray(value) ? `${value[0]}${value[1]}` : String(value);
  b.change(updateStyle(b.system(), key, { [prop]: literal }));
}

export function setNewStyle(label: string): void {
  builder().state.scaleNewLabel = label;
}

export function addNewStyle(): void {
  const b = builder();
  const next = addStyle(b.system(), b.state.scaleNewLabel);
  if (typeof next === "string") {
    b.state.scaleError = next;
    b.refresh();
    return;
  }
  b.state.scaleError = "";
  b.state.scaleNewLabel = "";
  b.state.scaleOpen = next.typeScale[next.typeScale.length - 1].key;
  b.change(next);
}

export function renameStyle(key: string, event: Event): void {
  const b = builder();
  const label = (event.target as HTMLInputElement).value.trim();
  if (label) b.change(updateStyle(b.system(), key, { label }));
}

export function describeStyle(key: string, event: Event): void {
  const b = builder();
  b.change(updateStyle(b.system(), key, { description: (event.target as HTMLInputElement).value.trim() }));
}

export function deleteStyle(key: string): void {
  const b = builder();
  if (b.state.scaleOpen === key) b.state.scaleOpen = "";
  b.change(removeStyle(b.system(), key));
}
