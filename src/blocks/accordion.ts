// Accordion block — a stack of accordion-item disclosures. DELIBERATE
// CONTRACT-LEVEL DIVERGENCE (story #370, recorded in epic #333): the
// conventional block-library model is a 4-block family — accordion /
// accordion-item / accordion-heading / accordion-panel — because markup
// built from heading + panel divs + scripted toggling has no native
// disclosure to lean on. Publr's wire contract prefers platform semantics,
// so the family collapses to 2 blocks on details/summary (the pattern the
// details block established): the summary IS the heading, the details body
// IS the panel — no JS, works published as-is. The attributes that exist
// to serve that markup are dropped one by one:
// - autoclose: DEFERRED, not rejected — native exclusive grouping (details
//   name="…") needs a per-instance unique name the render cannot mint (it
//   sees only fields/settings, never the block id).
// - headingLevel: no heading element exists here; the summary is the
//   disclosure's label, not an outline entry.
// - iconPosition/showIcon: the marker is ::marker/::details-content
//   territory — styling covered by authored classes.

import type { BlockDefinition } from "../registry";
import { LAYOUT_SUPPORTS } from "./supports";

export const type = "accordion";

export const definition: BlockDefinition = {
  label: "Accordion",
  category: "Design",
  icon: "accordion",
  description: "A vertically stacked set of collapsible content sections.",
  supports: LAYOUT_SUPPORTS,
  toolbar: [
    {
      control: "toggle-setting",
      label: "Show icons",
      setting: "showIcon",
      role: "design",
    },
    {
      control: "setting-options",
      label: "Change icon position",
      setting: "iconPosition",
      role: "design",
      options: [
        { value: "start", label: "Start" },
        { value: "end", label: "End" },
      ],
    },
    { control: "add-child", label: "Add item", type: "accordion-item" },
  ],
  settings: [
    {
      control: "toggle",
      label: "Show icons",
      setting: "showIcon",
      default: true,
      role: "design",
    },
    {
      control: "toggle-group",
      label: "Icon position",
      setting: "iconPosition",
      default: "start",
      role: "design",
      when: { setting: "showIcon", equals: true },
      options: [
        { value: "start", label: "Start" },
        { value: "end", label: "End" },
      ],
    },
  ],
  allowedChildren: ["accordion-item"],
  childTemplate: ["accordion-item"],
  render(_fields, settings) {
    const icon =
      settings?.showIcon === false
        ? ""
        : settings?.iconPosition === "end"
          ? " pbe-accordion--icons-end"
          : " pbe-accordion--icons-start";
    return `<div data-pb-block="accordion" data-pb-children class="flex flex-col [&>details+details]:border-t-0${icon}"></div>`;
  },
};
