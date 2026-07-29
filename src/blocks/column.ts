// Column block — one column (width + self
// alignment). Internal: created through the columns block's template and
// tree UI, never the inserter. The root is the children slot.

import type { BlockDefinition, Fields, Settings } from "../registry";
import { LAYOUT_SUPPORTS } from "./supports";

// Widths are the flex SHORTHAND on purpose: it owns basis+grow+shrink as one
// atom, so an authored basis evicts the whole width baseline at downcast
// (style.ts evictConflictingBaseline) instead of leaving stray grow/shrink.
const WIDTH_CLASS: Record<string, string> = {
  auto: "flex-1",
  "25": "flex-[0_0_25%]",
  "33": "flex-[0_0_33.333333%]",
  "50": "flex-[0_0_50%]",
  "66": "flex-[0_0_66.666667%]",
  "75": "flex-[0_0_75%]",
};

const VALIGN_CLASS: Record<string, string> = {
  top: "self-start",
  center: "self-center",
  bottom: "self-end",
  stretch: "self-stretch",
};

export const type = "column";

export const definition: BlockDefinition = {
  label: "Column",
  category: "Design",
  icon: "column",
  internal: true,
  supports: {
    ...LAYOUT_SUPPORTS,
    dimensions: { minWidth: { default: false }, flexBasis: true },
  },
  toolbar: [
    {
      control: "style-options",
      label: "Change width",
      style: "flexBasis",
      options: [
        { value: "auto", label: "Auto" },
        { value: "25%", label: "25%" },
        { value: "33.333333%", label: "33%" },
        { value: "50%", label: "50%" },
        { value: "66.666667%", label: "66%" },
        { value: "75%", label: "75%" },
      ],
      role: "design",
    },
    {
      control: "setting-options",
      label: "Change vertical alignment",
      setting: "valign",
      options: [
        { value: "inherit", label: "Inherit" },
        { value: "top", label: "Top" },
        { value: "center", label: "Center" },
        { value: "bottom", label: "Bottom" },
        { value: "stretch", label: "Stretch" },
      ],
      role: "design",
    },
  ],
  settings: [
    {
      control: "toggle-group",
      label: "Width",
      setting: "width",
      default: "auto",
      role: "structure",
      options: [
        { value: "auto", label: "Auto" },
        { value: "25", label: "25%" },
        { value: "33", label: "33%" },
        { value: "50", label: "50%" },
        { value: "66", label: "66%" },
        { value: "75", label: "75%" },
      ],
    },
    {
      control: "toggle-group",
      label: "Vertical alignment",
      setting: "valign",
      default: "inherit",
      role: "design",
      options: [
        { value: "inherit", label: "Inherit" },
        { value: "top", label: "Top" },
        { value: "center", label: "Center" },
        { value: "bottom", label: "Bottom" },
        { value: "stretch", label: "Stretch" },
      ],
    },
  ],
  render(_fields: Fields, settings?: Settings) {
    const classes = ["min-w-0", WIDTH_CLASS[String(settings?.width)] ?? WIDTH_CLASS.auto];
    const valign = VALIGN_CLASS[String(settings?.valign)];
    if (valign) classes.push(valign);
    return `<div data-pb-block="column" data-pb-children class="${classes.join(" ")}"></div>`;
  },
};
