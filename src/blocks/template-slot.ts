import { escAttr } from "../carriers";
import type { BlockDefinition } from "../registry";
import { TEMPLATE_SLOTS } from "../templates";

export const type = "template-slot";

export const definition: BlockDefinition = {
  label: "Template slot",
  icon: "layout",
  category: "Template",
  description: "A value supplied by the document using this template.",
  templateOnly: true,
  toolbar: [],
  settings: [
    {
      control: "select",
      label: "Slot",
      setting: "name",
      default: "content",
      role: "structure",
      options: TEMPLATE_SLOTS.map((slot) => ({ value: slot.name, label: slot.label })),
    },
  ],
  render(_fields, settings) {
    const name =
      typeof settings?.name === "string" &&
      TEMPLATE_SLOTS.some((candidate) => candidate.name === settings.name)
        ? settings.name
        : "content";
    const label = TEMPLATE_SLOTS.find((candidate) => candidate.name === name)!.label;
    return `<div data-pb-block="template-slot" data-publr-slot="${escAttr(name)}" class="pbe-template-slot"><span aria-hidden="true">${label}</span></div>`;
  },
};
