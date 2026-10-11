// Buttons: a wrapping flex row whose children slot takes buttons only. `justify` and
// `gap` are island-canonical; the `justify-*` and `gap-*` classes are derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { pick } from "./values";
import { LAYOUT } from "./supports";

const JUSTIFY: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};

const GAP: Record<string, string> = { none: "gap-0", sm: "gap-2", md: "gap-4", lg: "gap-8" };

export const definition: BlockDefinition = {
  label: Publr.t("Buttons"),
  supports: LAYOUT,
  icon: "buttons",
  category: "design",
  description: Publr.t("Prompt visitors to take action with a row of buttons."),
  render(_fields, settings) {
    const classes = `flex ${settings.orientation === "column" ? "flex-col" : "flex-row flex-wrap"} items-center ${pick(JUSTIFY, settings.justify, JUSTIFY.start)} ${pick(GAP, settings.gap, GAP.sm)}`;
    return `<div data-pb-block="buttons" data-pb-children class="${classes}"></div>`;
  },
  settings: [
    {
      control: "toggle-group",
      label: Publr.t("Orientation"),
      setting: "orientation",
      default: "row",
      role: "design",
      options: [
        { value: "row", label: Publr.t("Horizontal") },
        { value: "column", label: Publr.t("Vertical") },
      ],
    },
    {
      control: "toggle-group",
      label: Publr.t("Justification"),
      setting: "justify",
      default: "start",
      role: "design",
      options: [
        { value: "start", label: Publr.t("Left"), icon: "justify-start" },
        { value: "center", label: Publr.t("Center"), icon: "justify-center" },
        { value: "end", label: Publr.t("Right"), icon: "justify-end" },
        { value: "between", label: Publr.t("Space between"), icon: "justify-between" },
      ],
    },
    {
      control: "toggle-group",
      label: Publr.t("Gap"),
      setting: "gap",
      default: "sm",
      role: "design",
      options: [
        { value: "none", label: Publr.t("None") },
        { value: "sm", label: Publr.t("Small") },
        { value: "md", label: Publr.t("Medium") },
        { value: "lg", label: Publr.t("Large") },
      ],
    },
  ],
  allow: { children: ["button"] },
  template: { children: ["button"] },
  toolbar: [
    { control: "setting-options", label: Publr.t("Change orientation"), setting: "orientation", role: "design", options: [{ value: "row", label: Publr.t("Horizontal") }, { value: "column", label: Publr.t("Vertical") }] },
    { control: "setting-options", label: Publr.t("Change justification"), setting: "justify", role: "design", options: [{ value: "start", label: Publr.t("Left") }, { value: "center", label: Publr.t("Center") }, { value: "end", label: Publr.t("Right") }, { value: "between", label: Publr.t("Space between") }] },
    { control: "add-child", label: Publr.t("Add button"), type: "button" },
  ],
};
