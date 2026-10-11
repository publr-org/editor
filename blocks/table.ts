// Table: four rich carriers holding section markup directly (`caption`, `head`, `body`,
// `foot`), always emitted. Enter belongs to the cells, so no section splits.
// "Fixed width table cells" is island-canonical; `table-fixed` is derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";
import { TEXT } from "./supports";

const EMPTY_BODY = "<tr><td></td><td></td></tr><tr><td></td><td></td></tr>";

export const definition: BlockDefinition = {
  label: Publr.t("Table"),
  supports: TEXT,
  icon: "table",
  category: "text",
  description: Publr.t("Show information in rows and columns."),
  render(fields, settings) {
    const fixed = settings.fixedLayout === false ? "" : " table-fixed";
    const align = settings.cellAlignment === "center" ? " [&_:is(td,th)]:text-center" : settings.cellAlignment === "right" ? " [&_:is(td,th)]:text-right" : " [&_:is(td,th)]:text-left";
    const shown = (setting: unknown, value: unknown) => setting !== false || str(value).trim() !== "";
    const body = fields.body === undefined ? EMPTY_BODY : str(fields.body);
    return (
      `<table data-pb-block="table" class="w-full border-collapse${fixed}${align} [&_:is(td,th)]:border [&_:is(td,th)]:p-2">` +
      (shown(settings.showCaption, fields.caption) ? `<caption data-pb-rich="caption" class="caption-bottom text-sm">${str(fields.caption)}</caption>` : "") +
      (shown(settings.showHeader, fields.head) ? `<thead data-pb-rich="head" class="font-semibold">${str(fields.head)}</thead>` : "") +
      `<tbody data-pb-rich="body">${body}</tbody>` +
      (shown(settings.showFooter, fields.foot) ? `<tfoot data-pb-rich="foot">${str(fields.foot)}</tfoot>` : "") +
      `</table>`
    );
  },
  settings: [
    { control: "toggle", label: Publr.t("Caption"), setting: "showCaption", default: true, role: "content", clears: "caption" },
    { control: "toggle", label: Publr.t("Header section"), setting: "showHeader", default: true, role: "structure", clears: "head" },
    { control: "toggle", label: Publr.t("Footer section"), setting: "showFooter", default: true, role: "structure", clears: "foot" },
    { control: "toggle", label: Publr.t("Fixed width table cells"), setting: "fixedLayout", default: true, role: "design" },
    {
      control: "toggle-group",
      label: Publr.t("Cell text alignment"),
      setting: "cellAlignment",
      default: "left",
      role: "design",
      options: [
        { value: "left", label: Publr.t("Left") },
        { value: "center", label: Publr.t("Center") },
        { value: "right", label: Publr.t("Right") },
      ],
    },
  ],
  carriers: {
    caption: { placeholder: Publr.t("Add caption"), split: false },
    head: { split: false },
    body: { split: false },
    foot: { split: false },
  },
  toolbar: [
    { control: "caption", label: Publr.t("Caption"), field: "caption", setting: "showCaption" },
    { control: "toggle-setting", label: Publr.t("Header section"), setting: "showHeader", role: "structure" },
    { control: "toggle-setting", label: Publr.t("Footer section"), setting: "showFooter", role: "structure" },
    { control: "toggle-setting", label: Publr.t("Fixed width cells"), setting: "fixedLayout", role: "design" },
    { control: "setting-options", label: Publr.t("Align cells"), setting: "cellAlignment", role: "design", options: [{ value: "left", label: Publr.t("Left") }, { value: "center", label: Publr.t("Center") }, { value: "right", label: Publr.t("Right") }] },
  ],
};
