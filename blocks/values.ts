// Value helpers the core blocks share. A render sees whatever the model holds (the
// registry's probe passes no fields at all), so every field and setting is read
// defensively here, and no setting reaches markup without a whitelist or a clamp.
import { Publr } from "publr-jsx";
import { escapeAttr } from "../model/carriers";
import type { SettingOption } from "../model/registry";
import { isImageValue } from "../model/types";

/** A text, rich, link or tag field's string, or "" when absent. */
export const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** A free-text setting, trimmed; "" when absent. */
export const trimmed = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** `map[key]` when `key` names one of its own entries, else `fallback`. */
export function pick<T>(map: Readonly<Record<string, T>>, key: unknown, fallback: T): T {
  const name = typeof key === "number" ? String(key) : key;
  return typeof name === "string" && Object.hasOwn(map, name) ? map[name] : fallback;
}

/** A number setting clamped to [min, max] and snapped to `step`; `fallback` when not a number. */
export function clamp(value: unknown, fallback: number, min: number, max: number, step = 1): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number / step) * step));
}

/** An image-kind carrier's attributes: `src` and `alt` always, `width` and `height` when set. */
export function mediaAttrs(value: unknown): string {
  const media = isImageValue(value) ? value : null;
  const width = str(media?.width);
  const height = str(media?.height);
  return (
    `src="${escapeAttr(str(media?.src))}" alt="${escapeAttr(str(media?.alt))}"` +
    (width ? ` width="${escapeAttr(width)}"` : "") +
    (height ? ` height="${escapeAttr(height)}"` : "")
  );
}

/** The always-present caption under a media block. */
/** The caption, unless it is turned off and empty (turning it off clears it). */
export const captionOf = (value: unknown, shown: unknown) => (shown === false && str(value).trim() === "" ? "" : figcaption(value));

export const figcaption = (value: unknown) =>
  `<figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-neutral-500">${str(value)}</figcaption>`;

/** `target`, `rel` and `title` derived from link settings: a new tab always carries noopener. */
export function linkAttrs(target: unknown, rel: unknown, title?: unknown): string {
  const blank = target === "_blank";
  const rels = [blank ? "noopener" : "", trimmed(rel)].filter(Boolean).join(" ");
  const label = trimmed(title);
  return (blank ? ` target="_blank"` : "") + (rels ? ` rel="${escapeAttr(rels)}"` : "") + (label ? ` title="${escapeAttr(label)}"` : "");
}

/** The "Open in" choices every link-bearing block offers. */
export const LINK_TARGETS: readonly SettingOption[] = [
  { value: "none", label: Publr.t("Same tab") },
  { value: "_blank", label: Publr.t("New tab") },
];
