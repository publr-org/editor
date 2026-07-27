// Accordion item — one disclosure: rich summary title + nested content
// blocks (native details/summary, like the details block). Internal:
// created through the accordion's template and Enter-splitting. The
// closed-state canvas affordance (chrome.css ::details-content) applies
// here too.

import { str } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";

export const type = "accordion-item";

export const definition: BlockDefinition = {
  label: "Accordion item",
  category: "Design",
  icon: "details",
  internal: true,
  placeholder: "Accordion title",
  toolbar: [
    {
      control: "toggle-setting",
      label: "Open by default",
      setting: "openByDefault",
      role: "structure",
    },
  ],
  settings: [
    {
      control: "toggle",
      label: "Open by default",
      setting: "openByDefault",
      default: false,
      role: "structure",
      help: "Keep this item expanded when the page first loads.",
    },
  ],
  render(fields: Fields, settings?: Settings) {
    return `<details data-pb-block="accordion-item" class="border border-border px-4 py-3"${settings?.openByDefault === true ? " open" : ""}><summary data-pb-rich="title" class="cursor-pointer font-semibold">${str(fields.title)}</summary><div data-pb-children class="mt-2"></div></details>`;
  },
};
