// Group: the one layout container, a `tag` carrier that is also the children slot. Its
// element is field-bound; layout and container settings live with the style controls.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";
import { GROUP } from "./supports";

const TAGS = ["div", "header", "main", "section", "article", "aside", "footer", "nav"];

const BLEEDS = [
  { value: "none", label: Publr.t("No bleed"), icon: "bleed-none" },
  { value: "left", label: Publr.t("Bleed left"), icon: "bleed-left" },
  { value: "right", label: Publr.t("Bleed right"), icon: "bleed-right" },
  { value: "both", label: Publr.t("Bleed both"), icon: "bleed-both" },
];

const JUSTIFY = [
  ["start", Publr.t("Start")],
  ["center", Publr.t("Center")],
  ["end", Publr.t("End")],
  ["between", Publr.t("Between")],
  ["around", Publr.t("Around")],
  ["evenly", Publr.t("Evenly")],
] as const;

const ALIGN = [
  ["start", Publr.t("Start")],
  ["center", Publr.t("Center")],
  ["end", Publr.t("End")],
  ["stretch", Publr.t("Stretch")],
  ["baseline", Publr.t("Baseline")],
] as const;

export const definition: BlockDefinition = {
  label: Publr.t("Group"),
  supports: GROUP,
  icon: "group",
  category: "design",
  description: Publr.t("Gather blocks in a layout container."),
  render(fields) {
    const tag = TAGS.includes(str(fields.tag)) ? str(fields.tag) : "div";
    return `<${tag} data-pb-block="group" data-pb-tag="tag" data-pb-children></${tag}>`;
  },
  settings: [
    {
      control: "toggle-group",
      label: Publr.t("Layout"),
      style: "layoutMode",
      default: "group",
      role: "structure",
      options: [
        { value: "group", label: Publr.t("Group"), icon: "group" },
        { value: "row", label: Publr.t("Row"), icon: "row" },
        { value: "stack", label: Publr.t("Stack"), icon: "stack" },
        { value: "grid", label: Publr.t("Grid"), icon: "grid" },
      ],
    },
    {
      control: "toggle",
      label: Publr.t("Container"),
      style: "containerEnabled",
      default: "false",
      role: "structure",
      help: Publr.t("Constrain this Group itself to one of the site’s semantic container widths."),
    },
    {
      control: "select",
      label: Publr.t("Container width"),
      style: "containerWidth",
      default: "",
      role: "structure",
      help: Publr.t("Uses the containers configured in the site theme."),
      whenStyle: { style: "containerEnabled", equals: "true" },
    },
    {
      control: "select",
      label: Publr.t("Bleed"),
      style: "containerBleed",
      default: "none",
      role: "structure",
      options: BLEEDS,
      help: Publr.t("Keeps this Group’s layout on the selected container while extending its edge blocks to the viewport."),
      whenStyle: { style: "containerEnabled", equals: "true" },
    },
    { control: "select", label: Publr.t("HTML element"), field: "tag", role: "structure", options: TAGS.map((tag) => ({ value: tag, label: tag })) },
  ],
  toolbar: [
    { control: "style-options", label: Publr.t("Container width"), style: "containerWidth", role: "structure" },
    { control: "style-options", label: Publr.t("Bleed"), style: "containerBleed", options: BLEEDS, role: "structure" },
    {
      control: "style-options",
      label: Publr.t("Change justification"),
      icon: "justify-start",
      style: "justifyContent",
      options: JUSTIFY.map(([key, label]) => ({ value: `justify-${key}`, label, icon: `justify-${key}` })),
    },
    {
      control: "style-options",
      label: Publr.t("Change vertical alignment"),
      icon: "align-stretch",
      style: "alignItems",
      options: ALIGN.map(([key, label]) => ({ value: `items-${key}`, label, icon: `align-${key}` })),
    },
    { control: "toggle-style", label: Publr.t("Wrap"), icon: "wrap-none", activeIcon: "wrap", style: "flexWrap", value: "flex-wrap" },
  ],
};
