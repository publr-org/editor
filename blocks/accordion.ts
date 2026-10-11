// Accordion: a vertical stack of collapsible sections, a children slot that takes
// accordion items only. No settings.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { LAYOUT } from "./supports";

const NO_ICONS = "[&_summary]:list-none [&_summary::-webkit-details-marker]:hidden";
const ICONS_END = "[&_summary]:flex [&_summary]:list-none [&_summary]:justify-between [&_summary::-webkit-details-marker]:hidden [&_summary]:after:content-['+'] [&_details[open]>summary]:after:content-['−']";

export const definition: BlockDefinition = {
  label: Publr.t("Accordion"),
  supports: LAYOUT,
  icon: "accordion",
  category: "design",
  description: Publr.t("A vertically stacked set of collapsible sections."),
  render(_fields, settings) {
    const icons = settings.showIcon === false ? " " + NO_ICONS : settings.iconPosition === "end" ? " " + ICONS_END : "";
    return `<div data-pb-block="accordion" data-pb-children class="flex flex-col [&>details+details]:border-t-0${icons}"></div>`;
  },
  allow: { children: ["accordion-item"] },
  template: { children: ["accordion-item"] },
  settings: [
    { control: "toggle", label: Publr.t("Show icons"), setting: "showIcon", default: true, role: "design" },
    {
      control: "toggle-group",
      label: Publr.t("Icon position"),
      setting: "iconPosition",
      default: "start",
      role: "design",
      when: (settings) => settings.showIcon !== false,
      options: [
        { value: "start", label: Publr.t("Start") },
        { value: "end", label: Publr.t("End") },
      ],
    },
  ],
  toolbar: [
    { control: "toggle-setting", label: Publr.t("Show icons"), setting: "showIcon", role: "design" },
    { control: "setting-options", label: Publr.t("Change icon position"), setting: "iconPosition", role: "design", options: [{ value: "start", label: Publr.t("Start") }, { value: "end", label: Publr.t("End") }] },
    { control: "add-child", label: Publr.t("Add item"), type: "accordion-item" },
  ],
};
