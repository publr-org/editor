// Icon block — span whose rich carrier holds inline SVG markup. Rotation
// and flips are island-canonical; the derived transform utilities compose
// (each sets its own transform channel), so a plain icon's rendering is
// untouched. noSplit: Enter inside SVG markup is never a block split.

import { escAttr, str } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";
import { LAYOUT_SUPPORTS } from "./supports";

const ROTATE_CLASS: Record<string, string> = {
  "90": "rotate-90",
  "180": "rotate-180",
  "270": "rotate-[270deg]",
};

const DEFAULT_SVG =
  '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5"><circle cx="10" cy="10" r="8"></circle></svg>';

export const type = "icon";

export const definition: BlockDefinition = {
  label: "Icon",
  category: "Media",
  icon: "icon",
  description: "Display an inline SVG icon.",
  supports: LAYOUT_SUPPORTS,
  noSplit: ["svg"],
  allowedFormats: [],
  toolbar: [
    {
      control: "text",
      label: "Accessible label",
      setting: "ariaLabel",
      role: "content",
    },
    {
      control: "setting-options",
      label: "Change rotation",
      setting: "rotation",
      options: [
        { value: "0", label: "0°" },
        { value: "90", label: "90°" },
        { value: "180", label: "180°" },
        { value: "270", label: "270°" },
      ],
      role: "design",
    },
    {
      control: "toggle-setting",
      label: "Flip horizontally",
      setting: "flipHorizontal",
      role: "design",
    },
    {
      control: "toggle-setting",
      label: "Flip vertically",
      setting: "flipVertical",
      role: "design",
    },
  ],
  settings: [
    {
      control: "text",
      label: "Accessible label",
      setting: "ariaLabel",
      default: "",
      role: "content",
      help: "Describe the icon when it communicates meaning. Leave empty for decorative icons.",
    },
    {
      control: "select",
      label: "Rotation",
      setting: "rotation",
      default: "0",
      role: "design",
      options: [
        { value: "0", label: "0°" },
        { value: "90", label: "90°" },
        { value: "180", label: "180°" },
        { value: "270", label: "270°" },
      ],
    },
    {
      control: "toggle",
      label: "Flip horizontally",
      setting: "flipHorizontal",
      default: false,
      role: "design",
    },
    {
      control: "toggle",
      label: "Flip vertically",
      setting: "flipVertical",
      default: false,
      role: "design",
    },
  ],
  render(fields: Fields, settings?: Settings) {
    // Baseline `inline-block` (so rotation/flip transforms apply): an
    // authored display utility (`flex` on the fixture's icon badges) EVICTS
    // it at downcast (style.ts evictConflictingBaseline) — the wire never
    // carries two display owners, so no cascade-order roulette.
    const classes = [
      "inline-block",
      ROTATE_CLASS[String(settings?.rotation)] ?? "",
      settings?.flipHorizontal === true ? "-scale-x-100" : "",
      settings?.flipVertical === true ? "-scale-y-100" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const cls = classes ? ` class="${classes}"` : "";
    const label = typeof settings?.ariaLabel === "string" ? settings.ariaLabel.trim() : "";
    const accessibility = label
      ? ` role="img" aria-label="${escAttr(label)}"`
      : ` aria-hidden="true"`;
    return `<span data-pb-block="icon" data-pb-rich="svg"${accessibility}${cls}>${fields.svg === undefined ? DEFAULT_SVG : str(fields.svg)}</span>`;
  },
};
