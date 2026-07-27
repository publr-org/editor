// Social links block — a row of social-link icons.
// Color/size treatments are lens/authored-class
// territory; the container just lays the icons out.

import type { BlockDefinition, Settings } from "../registry";
import { LAYOUT_SUPPORTS } from "./supports";

export const type = "social-links";

export const definition: BlockDefinition = {
  label: "Social links",
  category: "Widgets",
  icon: "share",
  description: "Display links to your social media profiles.",
  supports: LAYOUT_SUPPORTS,
  toolbar: [
    {
      control: "setting-options",
      label: "Change icon size",
      setting: "size",
      role: "design",
      options: [
        { value: "small", label: "Small" },
        { value: "normal", label: "Normal" },
        { value: "large", label: "Large" },
      ],
    },
    {
      control: "toggle-setting",
      label: "Show labels",
      setting: "showLabels",
      role: "design",
    },
    { control: "add-child", label: "Add social icon", type: "social-link" },
  ],
  variants: [
    { name: "logos", label: "Logos only", styles: { gap: "4" } },
    {
      name: "pill",
      label: "Pill",
      styles: {
        borderRadius: "9999px",
        backgroundColor: "muted",
        paddingTop: "2",
        paddingRight: "4",
        paddingBottom: "2",
        paddingLeft: "4",
      },
    },
  ],
  allowedChildren: ["social-link"],
  childTemplate: ["social-link"],
  settings: [
    {
      control: "toggle-group",
      label: "Icon size",
      setting: "size",
      default: "normal",
      role: "design",
      options: [
        { value: "small", label: "Small" },
        { value: "normal", label: "Normal" },
        { value: "large", label: "Large" },
      ],
    },
    {
      control: "toggle",
      label: "Show text labels",
      setting: "showLabels",
      default: false,
      role: "design",
      help: "Show each social icon's accessible label next to the icon.",
    },
  ],
  render(_fields, settings?: Settings) {
    const size =
      settings?.size === "small"
        ? "[&_svg]:size-5"
        : settings?.size === "large"
          ? "[&_svg]:size-8"
          : "[&_svg]:size-6";
    const labels = settings?.showLabels === true ? " pbe-social-links--show-labels" : "";
    return `<div data-pb-block="social-links" data-pb-children class="flex flex-wrap items-center gap-3 ${size}${labels}"></div>`;
  },
};
