// PublrEditor UI icon adapter.
//
// Canonical artwork lives in @publr/icons. This thin wrapper preserves the
// editor's established sprite ids (`#pbe-i-*`) so hosts and serialized chrome
// do not change when the shared package is updated.

import {
  ICONS as SHARED_ICONS,
  ICON_VIEWBOX,
  iconRef as sharedIconRef,
  mountIconSprite as mountSharedIconSprite,
} from "@publr/icons";

// These three icons are already canonical in publr-icons. Keep this small
// bridge until the editor's git-pinned package revision advances to that
// release; consumers can use them immediately without changing sprite ids.
const RESPONSIVE_DEVICE_ICONS = {
  "device-desktop":
    '<path d="M5.5 6.5H18.5C19.3284 6.5 20 7.17157 20 8V16.5H4V8C4 7.17157 4.67157 6.5 5.5 6.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>\n  <path d="M2.5 18.5H21.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n  <path d="M9.5 18.5H14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  "device-tablet":
    '<rect x="6" y="3" width="12" height="18" rx="1.75" stroke="currentColor" stroke-width="1.5"/>\n  <path d="M10.5 18H13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  "device-mobile":
    '<rect x="7.25" y="3" width="9.5" height="18" rx="1.75" stroke="currentColor" stroke-width="1.5"/>\n  <path d="M10.75 18H13.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
} as const;

const SHELL_ICONS = {
  palette:
    '<path d="M12 3.75a8.25 8.25 0 1 0 0 16.5h1.25a1.75 1.75 0 0 0 0-3.5h-.65a1.6 1.6 0 0 1 0-3.2h2.9A4.75 4.75 0 0 0 20.25 8.8 5.05 5.05 0 0 0 15.2 3.75H12Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="9" r=".8" fill="currentColor"/><circle cx="11" cy="6.8" r=".8" fill="currentColor"/><circle cx="15" cy="7.3" r=".8" fill="currentColor"/>',
  "sidebar-right":
    '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M15.5 4.5v15"/></g>',
  "viewport-fit":
    '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><rect x="8" y="8" width="8" height="8" rx="1.5"/></g>',
  "viewport-compare":
    '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.75" y="5.5" width="5.5" height="13" rx="1.25"/><rect x="9.25" y="4" width="5.5" height="16" rx="1.25"/><rect x="15.75" y="2.5" width="5.5" height="19" rx="1.25"/></g>',
} as const;

const strokeGroup = (body: string): string =>
  `<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
const distributedItems = (guide: string, items: readonly [number, number][], width = 3): string =>
  `<path d="${guide}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
  `<g fill="currentColor">${items
    .map(
      ([x, height]) =>
        `<rect x="${x}" y="${12 - height / 2}" width="${width}" height="${height}" rx="1"/>`,
    )
    .join("")}</g>`;

// Canonical sources live in ../publr-icons. Keep this bridge only until the
// editor's git-pinned package revision includes the container-control wave.
const CONTAINER_CONTROL_ICONS = {
  "container-width":
    '<path d="M8 5H16M8 19H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="5" y="9" width="14" height="6" rx="1" fill="currentColor"/>',
  "bleed-none":
    '<path d="M3 5H21M3 19H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="7" y="8" width="10" height="8" rx="1.25" fill="currentColor"/>',
  "bleed-left":
    '<path d="M3 5H21M3 19H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3 8H17V16H3V8Z" fill="currentColor"/>',
  "bleed-right":
    '<path d="M3 5H21M3 19H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7 8H21V16H7V8Z" fill="currentColor"/>',
  "bleed-both":
    '<path d="M3 5H21M3 19H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3 8H21V16H3V8Z" fill="currentColor"/>',
  "justify-start": distributedItems("M3.5 5v14", [
    [5, 7],
    [9.5, 7],
    [14, 7],
  ]),
  "justify-center": distributedItems("M3.5 5v14M20.5 5v14", [
    [6.75, 7],
    [10.5, 7],
    [14.25, 7],
  ]),
  "justify-end": distributedItems("M20.5 5v14", [
    [7, 7],
    [11.5, 7],
    [16, 7],
  ]),
  "justify-between": distributedItems("M3.5 5v14M20.5 5v14", [
    [4.5, 7],
    [10.5, 7],
    [16.5, 7],
  ]),
  "justify-around": distributedItems("M3.5 5v14M20.5 5v14", [
    [5.25, 7],
    [10.5, 7],
    [15.75, 7],
  ]),
  "justify-evenly": distributedItems(
    "M3.5 5v14M20.5 5v14",
    [
      [5.75, 7],
      [10.75, 7],
      [15.75, 7],
    ],
    2.5,
  ),
  "align-start":
    '<path d="M3.5 4.5H20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="7" y="6.5" width="2.5" height="10" rx="1" fill="currentColor"/><rect x="14.5" y="6.5" width="2.5" height="6" rx="1" fill="currentColor"/>',
  "align-center":
    '<path d="M3.5 12H20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="7" y="7" width="2.5" height="10" rx="1" fill="currentColor"/><rect x="14.5" y="9" width="2.5" height="6" rx="1" fill="currentColor"/>',
  "align-end":
    '<path d="M3.5 19.5H20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="7" y="7.5" width="2.5" height="10" rx="1" fill="currentColor"/><rect x="14.5" y="11.5" width="2.5" height="6" rx="1" fill="currentColor"/>',
  "align-stretch":
    '<path d="M3.5 4.5H20.5M3.5 19.5H20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="7" y="6.5" width="2.5" height="11" rx="1" fill="currentColor"/><rect x="14.5" y="6.5" width="2.5" height="11" rx="1" fill="currentColor"/>',
  "align-baseline":
    '<path d="M3.5 17.5H20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="7" y="6" width="2.5" height="10" rx="1" fill="currentColor"/><rect x="14.5" y="10" width="2.5" height="6" rx="1" fill="currentColor"/>',
  "wrap-none": strokeGroup(
    '<rect x="3" y="5" width="6" height="14" rx="2"/><rect x="10.5" y="5" width="6" height="14" rx="2"/><path d="M18.5 5H21L18.75 9.5 21 12 18.75 14.5 21 19H18.5"/>',
  ),
  wrap: strokeGroup(
    '<rect x="3" y="3.5" width="6.5" height="6.5" rx="2"/><rect x="11.5" y="3.5" width="6.5" height="6.5" rx="2"/><rect x="3" y="12.5" width="6.5" height="6.5" rx="2"/><path d="M19.5 10.5V14C19.5 16.75 17.25 19 14.5 19H11M13.5 16.5 11 19l2.5 2.5"/>',
  ),
  "wrap-reverse": strokeGroup(
    '<rect x="3" y="3.5" width="6.5" height="6.5" rx="2"/><rect x="3" y="12.5" width="6.5" height="6.5" rx="2"/><rect x="11.5" y="12.5" width="6.5" height="6.5" rx="2"/><path d="M19.5 13.5V10C19.5 7.25 17.25 5 14.5 5H11M13.5 2.5 11 5l2.5 2.5"/>',
  ),
} as const;

type SpacingEdge = "top" | "right" | "bottom" | "left";
const SPACING_EDGE_PATHS: Record<SpacingEdge, string> = {
  top: "M8 4H16",
  right: "M20 8V16",
  bottom: "M8 20H16",
  left: "M4 8V16",
};
const spacingSidesIcon = (selected: readonly SpacingEdge[]): string => {
  const base = Object.values(SPACING_EDGE_PATHS).join("");
  const active = selected.map((side) => SPACING_EDGE_PATHS[side]).join("");
  return (
    `<path d="${base}" stroke="#666666" stroke-width="2" stroke-linecap="square"/>` +
    (active
      ? `<path d="${active}" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>`
      : "")
  );
};
const SPACING_SIDE_SELECTIONS: Record<string, readonly SpacingEdge[]> = {
  "spacing-sides-top": ["top"],
  "spacing-sides-right": ["right"],
  "spacing-sides-bottom": ["bottom"],
  "spacing-sides-left": ["left"],
};
const SPACING_CONTROL_ICONS = {
  ...Object.fromEntries(
    Object.entries(SPACING_SIDE_SELECTIONS).map(([name, sides]) => [name, spacingSidesIcon(sides)]),
  ),
  "spacing-sync-top-bottom":
    '<path d="M7.5 3.5H16.5M7.5 20.5H16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 7V17M9.5 9.5L12 7L14.5 9.5M9.5 14.5L12 17L14.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  "spacing-sync-left-right":
    '<path d="M3.5 7.5V16.5M20.5 7.5V16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7 12H17M9.5 9.5L7 12L9.5 14.5M14.5 9.5L17 12L14.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  "border-radius-corner":
    '<path d="M4 16V11C4 7.13401 7.13401 4 11 4H16" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  "border-radius-top-left":
    '<path d="M4 10V8C4 5.79086 5.79086 4 8 4H10M14 4H16C18.2091 4 20 5.79086 20 8V10M20 14V16C20 18.2091 18.2091 20 16 20H14M10 20H8C5.79086 20 4 18.2091 4 16V14" stroke="#666666" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10V8C4 5.79086 5.79086 4 8 4H10" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>',
  "border-radius-top-right":
    '<path d="M4 10V8C4 5.79086 5.79086 4 8 4H10M14 4H16C18.2091 4 20 5.79086 20 8V10M20 14V16C20 18.2091 18.2091 20 16 20H14M10 20H8C5.79086 20 4 18.2091 4 16V14" stroke="#666666" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 4H16C18.2091 4 20 5.79086 20 8V10" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>',
  "border-radius-bottom-right":
    '<path d="M4 10V8C4 5.79086 5.79086 4 8 4H10M14 4H16C18.2091 4 20 5.79086 20 8V10M20 14V16C20 18.2091 18.2091 20 16 20H14M10 20H8C5.79086 20 4 18.2091 4 16V14" stroke="#666666" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 14V16C20 18.2091 18.2091 20 16 20H14" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>',
  "border-radius-bottom-left":
    '<path d="M4 10V8C4 5.79086 5.79086 4 8 4H10M14 4H16C18.2091 4 20 5.79086 20 8V10M20 14V16C20 18.2091 18.2091 20 16 20H14M10 20H8C5.79086 20 4 18.2091 4 16V14" stroke="#666666" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 20H8C5.79086 20 4 18.2091 4 16V14" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>',
} as const;

const BRIDGED_ICONS = {
  ...RESPONSIVE_DEVICE_ICONS,
  ...SHELL_ICONS,
  ...CONTAINER_CONTROL_ICONS,
  ...SPACING_CONTROL_ICONS,
} as const;

export const ICONS = { ...SHARED_ICONS, ...BRIDGED_ICONS } as const;
export { ICON_VIEWBOX };

/** Preserve the editor's established default size while sharing the artwork. */
export const iconSvg = (name: string, className = "h-6 w-6"): string =>
  name in ICONS
    ? `<svg class="${className}" viewBox="${ICON_VIEWBOX}" fill="none" aria-hidden="true">${ICONS[
        name as keyof typeof ICONS
      ].replaceAll('stroke-width="2"', 'stroke-width="1.5"')}</svg>`
    : "";

/** Mount the shared UI sprite under the editor's backwards-compatible ids. */
export function mountIconSprite(doc: Document = document): void {
  const sprite = mountSharedIconSprite(doc, "pbe-i");
  for (const [name, body] of Object.entries(BRIDGED_ICONS)) {
    if (doc.getElementById(`pbe-i-${name}`)) continue;
    const symbol = doc.createElementNS("http://www.w3.org/2000/svg", "symbol");
    symbol.id = `pbe-i-${name}`;
    symbol.setAttribute("viewBox", ICON_VIEWBOX);
    symbol.setAttribute("fill", "none");
    symbol.innerHTML = body;
    sprite.appendChild(symbol);
  }
  // Keep outline artwork outline-only when rendered through <use>. SVG's
  // default fill otherwise closes open path geometry in the browser.
  sprite.querySelectorAll("symbol").forEach((symbol) => {
    if (!symbol.hasAttribute("fill")) symbol.setAttribute("fill", "none");
  });
  sprite.querySelectorAll('[stroke-width="2"]').forEach((shape) => {
    shape.setAttribute("stroke-width", "1.5");
  });
}

/** Sprite reference for a known UI icon, or an empty fallback. */
export const iconRef = (name: string | undefined): string =>
  name && name in BRIDGED_ICONS ? `#pbe-i-${name}` : sharedIconRef(name, "pbe-i");
