// Accordion item: one native details/summary section with a rich `title` and a children
// slot. Internal: created inside an accordion. "Open by default" (`openByDefault`) is
// island-canonical; the `open` attribute is derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";

export const definition: BlockDefinition = {
  label: Publr.t("Accordion item"),
  icon: "details",
  category: "design",
  description: Publr.t("One collapsible section of an accordion."),
  internal: true,
  render(fields, settings) {
    return (
      `<details data-pb-block="accordion-item" class="border border-neutral-300 px-4 py-3"${settings.openByDefault === true ? " open" : ""}>` +
      `<summary data-pb-rich="title" class="cursor-pointer font-semibold">${str(fields.title)}</summary>` +
      `<div data-pb-children class="mt-2"></div></details>`
    );
  },
  settings: [{ control: "toggle", label: Publr.t("Open by default"), setting: "openByDefault", default: false, role: "structure" }],
  carriers: { title: { placeholder: Publr.t("Accordion title"), split: false } },
  template: { children: ["paragraph"] },
  toolbar: [
    { control: "toggle-setting", label: Publr.t("Open by default"), setting: "openByDefault", role: "structure" },
  ],
};
