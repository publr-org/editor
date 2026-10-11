// Columns: a horizontal row whose children slot takes columns only; a fresh one starts
// with two. `valign`, `gap` and `stackOnMobile` are island-canonical; the `items-*`,
// `gap-*` and `max-md:flex-col` classes are derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { pick } from "./values";
import { LAYOUT } from "./supports";

const VALIGN: Record<string, string> = { top: "items-start", center: "items-center", bottom: "items-end" };

const GAP: Record<string, string> = { none: "gap-0", sm: "gap-2.5", md: "gap-5", lg: "gap-10" };

export const definition: BlockDefinition = {
  label: Publr.t("Columns"),
  supports: LAYOUT,
  icon: "columns",
  category: "design",
  description: Publr.t("Display content in several columns."),
  render(_fields, settings) {
    const stack = settings.stackOnMobile === false ? "" : " max-md:flex-col";
    return `<div data-pb-block="columns" data-pb-children class="flex ${pick(VALIGN, settings.valign, VALIGN.top)} ${pick(GAP, settings.gap, GAP.md)}${stack}"></div>`;
  },
  settings: [
    {
      control: "toggle-group",
      label: Publr.t("Vertical alignment"),
      setting: "valign",
      default: "top",
      role: "design",
      options: [
        { value: "top", label: Publr.t("Top"), icon: "align-start" },
        { value: "center", label: Publr.t("Center"), icon: "align-center" },
        { value: "bottom", label: Publr.t("Bottom"), icon: "align-end" },
      ],
    },
    {
      control: "toggle-group",
      label: Publr.t("Gap"),
      setting: "gap",
      default: "md",
      role: "design",
      options: [
        { value: "none", label: Publr.t("None") },
        { value: "sm", label: Publr.t("Small") },
        { value: "md", label: Publr.t("Medium") },
        { value: "lg", label: Publr.t("Large") },
      ],
    },
    { control: "toggle", label: Publr.t("Stack on mobile"), setting: "stackOnMobile", default: true, role: "structure" },
  ],
  allow: { children: ["column"] },
  template: { children: ["column", "column"] },
  toolbar: [
    { control: "setting-options", label: Publr.t("Change vertical alignment"), setting: "valign", role: "design", options: [{ value: "top", label: Publr.t("Top") }, { value: "center", label: Publr.t("Center") }, { value: "bottom", label: Publr.t("Bottom") }] },
    { control: "add-child", label: Publr.t("Add column"), type: "column" },
  ],
};
