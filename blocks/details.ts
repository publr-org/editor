// Details: a native disclosure, a rich `summary` carrier plus a children slot.
// "Open by default" (`open`) and "Accordion group name" (`name`) are island-canonical;
// the `open` and `name` attributes are derived.
import { Publr } from "publr-jsx";
import { escapeAttr } from "../model/carriers";
import type { BlockDefinition } from "../model/registry";
import { str, trimmed } from "./values";
import { TEXT } from "./supports";

export const definition: BlockDefinition = {
  label: Publr.t("Details"),
  supports: TEXT,
  icon: "details",
  category: "text",
  description: Publr.t("Hide extra content behind a summary the visitor opens."),
  render(fields, settings) {
    const name = trimmed(settings.name);
    const attrs = (settings.open === true ? " open" : "") + (name ? ` name="${escapeAttr(name)}"` : "");
    return (
      `<details data-pb-block="details" class="rounded-sm border px-4 py-2"${attrs}>` +
      `<summary data-pb-rich="summary" class="cursor-pointer font-semibold">${str(fields.summary)}</summary>` +
      `<div data-pb-children class="mt-2"></div></details>`
    );
  },
  settings: [
    { control: "toggle", label: Publr.t("Open by default"), setting: "open", default: false, role: "structure" },
    {
      control: "text",
      label: Publr.t("Accordion group name"),
      setting: "name",
      default: "",
      placeholder: Publr.t("group name"),
      role: "advanced",
      help: Publr.t("Details blocks sharing a name open one at a time."),
    },
  ],
  carriers: { summary: { placeholder: Publr.t("Write summary…"), split: false } },
  template: { children: ["paragraph"] },
  toolbar: [
    { control: "toggle-setting", label: Publr.t("Open by default"), setting: "open", role: "structure" },
  ],
};
