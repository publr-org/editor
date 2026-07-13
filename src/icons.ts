// PublrEditor UI icon adapter.
//
// Canonical artwork lives in @publr/icons. This thin wrapper preserves the
// editor's established sprite ids (`#pbe-i-*`) so hosts and serialized chrome
// do not change when the shared package is updated. Social/brand artwork is
// intentionally separate in blocks/social-icons.ts.

import {
  ICONS,
  ICON_VIEWBOX,
  iconRef as sharedIconRef,
  mountIconSprite as mountSharedIconSprite,
} from "@publr/icons";

export { ICONS, ICON_VIEWBOX };

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
export const iconRef = (name: string | undefined): string => sharedIconRef(name, "pbe-i");
