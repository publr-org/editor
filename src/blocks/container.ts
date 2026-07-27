// Group is the one container block. Row / Stack / Grid are responsive visual
// layouts of that same block — never separate model types. The active layout
// is carried by ordinary display/direction utility classes through the
// universal style lens, so a Group can stack on Mobile and become a Row on
// Desktop without changing identity or disturbing its children.

import type { BlockDefinition, Fields, SettingSpec } from "../registry";
import { ALIGN_ITEMS, JUSTIFY_CONTENT } from "../style";
import { LAYOUT_SUPPORTS } from "./supports";

export const CONTAINER_LAYOUT: SettingSpec = {
  control: "toggle-group",
  label: "Layout",
  style: "layoutMode",
  default: "group",
  role: "structure",
  options: [
    { value: "group", label: "Group", icon: "group" },
    { value: "row", label: "Row", icon: "row" },
    { value: "stack", label: "Stack", icon: "stack" },
    { value: "grid", label: "Grid", icon: "grid" },
  ],
};

const TAGS = ["div", "header", "main", "section", "article", "aside", "footer", "nav", "dl"];

const CONTAINER_TAG: SettingSpec = {
  control: "select",
  label: "HTML element",
  field: "tag",
  role: "structure",
  options: TAGS.map((t) => ({ value: t, label: t })),
};

const IS_CONTAINER: SettingSpec = {
  control: "toggle",
  label: "Container",
  style: "containerEnabled",
  default: "false",
  role: "structure",
  help: "Constrain this Group itself to one of the site’s semantic container widths.",
};

const CONTAINER_WIDTH_OPTIONS = [
  { value: "content", label: "Content width", icon: "container-width" },
  { value: "wide", label: "Wide width", icon: "container-width" },
] as const;

const CONTAINER_WIDTH: SettingSpec = {
  control: "select",
  label: "Container width",
  style: "containerWidth",
  default: "wide",
  role: "structure",
  options: CONTAINER_WIDTH_OPTIONS,
  help: "Uses the semantic widths configured in the site’s Design System.",
  when: { style: "containerEnabled", equals: "true" },
};

const CONTAINER_BLEED_OPTIONS = [
  { value: "none", label: "No bleed", icon: "bleed-none" },
  { value: "left", label: "Bleed left", icon: "bleed-left" },
  { value: "right", label: "Bleed right", icon: "bleed-right" },
  { value: "both", label: "Bleed both", icon: "bleed-both" },
] as const;

const CONTAINER_BLEED: SettingSpec = {
  control: "select",
  label: "Bleed",
  style: "containerBleed",
  default: "none",
  role: "structure",
  options: CONTAINER_BLEED_OPTIONS,
  help: "Keeps this Group’s layout on the selected container while extending its edge blocks to the viewport.",
  when: { style: "containerEnabled", equals: "true" },
};

export function containerDefinition(
  type: string,
  label: string,
  description: string,
  classes: string,
): BlockDefinition {
  return {
    label,
    category: "Design",
    icon: "group",
    description,
    supports: {
      ...LAYOUT_SUPPORTS,
      layout: {
        ...LAYOUT_SUPPORTS.layout,
        layoutMode: true,
        containerEnabled: true,
        containerWidth: true,
        containerBleed: true,
        flexWrap: true,
        gridColumns: {
          values: ["1", "2", "3", "4", "5", "6"],
          allowCustom: true,
        },
      },
    },
    toolbar: [
      {
        control: "style-options",
        label: "Container width",
        style: "containerWidth",
        options: CONTAINER_WIDTH_OPTIONS,
        role: "structure",
      },
      {
        control: "style-options",
        label: "Bleed",
        style: "containerBleed",
        options: CONTAINER_BLEED_OPTIONS,
        role: "structure",
      },
      {
        control: "style-options",
        label: "Change justification",
        icon: "justify-start",
        style: "justifyContent",
        options: JUSTIFY_CONTENT.map(({ key, label: optionLabel }) => ({
          value: key,
          label: optionLabel,
          icon: `justify-${key}`,
        })),
      },
      {
        control: "style-options",
        label: "Change vertical alignment",
        icon: "align-stretch",
        style: "alignItems",
        options: ALIGN_ITEMS.map(({ key, label: optionLabel }) => ({
          value: key,
          label: optionLabel,
          icon: `align-${key}`,
        })),
      },
      {
        control: "toggle-style",
        label: "Wrap",
        icon: "wrap-none",
        activeIcon: "wrap",
        style: "flexWrap",
        value: "wrap",
      },
    ],
    settings: [CONTAINER_LAYOUT, IS_CONTAINER, CONTAINER_WIDTH, CONTAINER_BLEED, CONTAINER_TAG],
    render(fields: Fields) {
      const tag = typeof fields.tag === "string" && TAGS.includes(fields.tag) ? fields.tag : "div";
      return `<${tag} data-pb-block="${type}" data-pb-tag="tag"${classes ? ` class="${classes}"` : ""} data-pb-children></${tag}>`;
    },
  };
}
