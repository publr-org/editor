// Paragraph block — one rich body. dropCap and
// direction are island-canonical; the first-letter classes and the dir
// attribute the render emits are derived presentation.

import { str } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";
import { TEXT_SUPPORTS } from "./supports";

export const type = "paragraph";

export const definition: BlockDefinition = {
  label: "Paragraph",
  category: "Text",
  icon: "paragraph",
  description: "Start with the basic building block of all narrative.",
  supports: TEXT_SUPPORTS,
  variants: [
    {
      name: "display",
      label: "Display",
      styles: { fontSize: "3xl", fontWeight: "bold", lineHeight: "tight" },
    },
    {
      name: "subtitle",
      label: "Subtitle",
      styles: { fontSize: "lg", textColor: "muted-foreground" },
    },
    {
      name: "annotation",
      label: "Annotation",
      styles: { fontSize: "sm", textColor: "muted-foreground", fontStyle: "italic" },
    },
  ],
  toolbar: [{ control: "text-align", label: "Align text" }],
  settings: [
    {
      control: "toggle",
      label: "Drop cap",
      setting: "dropCap",
      default: false,
      role: "design",
    },
    {
      control: "toggle-group",
      label: "Text direction",
      setting: "direction",
      default: "auto",
      role: "advanced",
      options: [
        { value: "auto", label: "Auto" },
        { value: "ltr", label: "LTR" },
        { value: "rtl", label: "RTL" },
      ],
    },
  ],
  render(fields: Fields, settings?: Settings) {
    const dir =
      settings?.direction === "ltr" || settings?.direction === "rtl"
        ? ` dir="${settings.direction}"`
        : "";
    const drop =
      settings?.dropCap === true
        ? ` class="first-letter:float-left first-letter:pr-2 first-letter:text-[3.4em] first-letter:leading-[0.85] first-letter:font-bold"`
        : "";
    return `<p data-pb-block="paragraph" data-pb-rich="body"${dir}${drop}>${str(fields.body)}</p>`;
  },
};
