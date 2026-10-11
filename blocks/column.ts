// Column: one column of a Columns row; its root is the children slot. Internal: created
// inside a Columns. `width` and `valign` are island-canonical; the basis and `self-*`
// classes are derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { pick } from "./values";
import { LAYOUT } from "./supports";

const WIDTH: Record<string, string> = {
  auto: "flex-1",
  "25": "shrink-0 basis-1/4",
  "33": "shrink-0 basis-1/3",
  "50": "shrink-0 basis-1/2",
  "66": "shrink-0 basis-2/3",
  "75": "shrink-0 basis-3/4",
};

const VALIGN: Record<string, string> = { top: " self-start", center: " self-center", bottom: " self-end", stretch: " self-stretch" };

export const definition: BlockDefinition = {
  label: Publr.t("Column"),
  supports: { ...LAYOUT, dimensions: { minWidth: { default: false }, flexBasis: true } },
  icon: "column",
  category: "design",
  description: Publr.t("One column of a Columns block."),
  internal: true,
  render(_fields, settings) {
    return `<div data-pb-block="column" data-pb-children class="min-w-0 ${pick(WIDTH, settings.width, WIDTH.auto)}${pick(VALIGN, settings.valign, "")}"></div>`;
  },
  settings: [
    {
      control: "toggle-group",
      label: Publr.t("Width"),
      setting: "width",
      default: "auto",
      role: "structure",
      options: [
        { value: "auto", label: Publr.t("Auto") },
        { value: "25", label: "25%" },
        { value: "33", label: "33%" },
        { value: "50", label: "50%" },
        { value: "66", label: "66%" },
        { value: "75", label: "75%" },
      ],
    },
    {
      control: "toggle-group",
      label: Publr.t("Vertical alignment"),
      setting: "valign",
      default: "inherit",
      role: "design",
      options: [
        { value: "inherit", label: Publr.t("Inherit") },
        { value: "top", label: Publr.t("Top"), icon: "align-start" },
        { value: "center", label: Publr.t("Center"), icon: "align-center" },
        { value: "bottom", label: Publr.t("Bottom"), icon: "align-end" },
        { value: "stretch", label: Publr.t("Stretch"), icon: "align-stretch" },
      ],
    },
  ],
  template: { children: ["paragraph"] },
  toolbar: [
    { control: "setting-options", label: Publr.t("Change width"), setting: "width", role: "design", options: [{ value: "auto", label: Publr.t("Auto") }, { value: "25", label: "25%" }, { value: "33", label: "33%" }, { value: "50", label: "50%" }, { value: "66", label: "66%" }, { value: "75", label: "75%" }] },
    { control: "setting-options", label: Publr.t("Change vertical alignment"), setting: "valign", role: "design", options: [{ value: "inherit", label: Publr.t("Inherit") }, { value: "top", label: Publr.t("Top") }, { value: "center", label: Publr.t("Center") }, { value: "bottom", label: Publr.t("Bottom") }, { value: "stretch", label: Publr.t("Stretch") }] },
  ],
};
