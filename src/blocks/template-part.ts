import { escAttr } from "../carriers";
import type { BlockDefinition } from "../registry";

export const type = "template-part";

export const definition: BlockDefinition = {
  label: "Template part",
  icon: "pattern",
  category: "Template",
  description: "Shared structure used by every template that references it.",
  templateOnly: true,
  toolbar: [],
  settings: [
    {
      control: "text",
      label: "Part",
      setting: "name",
      default: "",
      role: "structure",
    },
  ],
  render(_fields, settings) {
    const name = typeof settings?.name === "string" ? settings.name : "";
    return `<div data-pb-block="template-part" data-pb-children data-publr-template-part="${escAttr(name)}"></div>`;
  },
};
