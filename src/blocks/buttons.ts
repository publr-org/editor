// Buttons block — a flex row of button blocks.
// Justify/gap are island-canonical; the derived classes sit on the inner
// slot row (whitelisted tokens).

import type { BlockDefinition, Fields, Settings } from "../registry";
import { LAYOUT_SUPPORTS } from "./supports";

const JUSTIFY_CLASS: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};

const GAP_CLASS: Record<string, string> = {
  none: "gap-0",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-8",
};

export const type = "buttons";

export const definition: BlockDefinition = {
  label: "Buttons",
  category: "Design",
  icon: "buttons",
  description: "Prompt visitors to take action with a group of button-style links.",
  supports: LAYOUT_SUPPORTS,
  allowedChildren: ["button"],
  childTemplate: ["button"],
  toolbar: [
    {
      control: "setting-options",
      label: "Change orientation",
      setting: "orientation",
      options: [
        { value: "row", label: "Horizontal" },
        { value: "column", label: "Vertical" },
      ],
      role: "design",
    },
    {
      control: "setting-options",
      label: "Change justification",
      setting: "justify",
      options: [
        { value: "start", label: "Left" },
        { value: "center", label: "Center" },
        { value: "end", label: "Right" },
        { value: "between", label: "Space between" },
      ],
      role: "design",
    },
    { control: "add-child", label: "Add button", type: "button" },
  ],
  settings: [
    {
      control: "toggle-group",
      label: "Orientation",
      setting: "orientation",
      default: "row",
      role: "design",
      options: [
        { value: "row", label: "Horizontal" },
        { value: "column", label: "Vertical" },
      ],
    },
    {
      control: "toggle-group",
      label: "Justification",
      setting: "justify",
      default: "start",
      role: "design",
      options: [
        { value: "start", label: "Left" },
        { value: "center", label: "Center" },
        { value: "end", label: "Right" },
        { value: "between", label: "Space between" },
      ],
    },
    {
      control: "toggle-group",
      label: "Gap",
      setting: "gap",
      default: "sm",
      role: "design",
      options: [
        { value: "none", label: "None" },
        { value: "sm", label: "Small" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
      ],
    },
  ],
  render(_fields: Fields, settings?: Settings) {
    const justify = JUSTIFY_CLASS[String(settings?.justify)] ?? "justify-start";
    const gap = GAP_CLASS[String(settings?.gap)] ?? GAP_CLASS.sm;
    const orientation = settings?.orientation === "column" ? "flex-col" : "flex-row flex-wrap";
    return `<div data-pb-block="buttons" data-pb-children class="flex ${orientation} items-center ${justify} ${gap}"></div>`;
  },
};
