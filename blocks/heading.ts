// Heading: h1–h6 with one rich `text` carrier. The level is the tag itself
// (`data-pb-tag="level"`), so the "Level" control is field-bound; there is no island.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";
import { HEADING } from "./supports";

const LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6"];

export const definition: BlockDefinition = {
  label: Publr.t("Heading"),
  supports: HEADING,
  icon: "heading",
  category: "text",
  description: Publr.t("Introduce a new section and give the page its structure."),
  render(fields) {
    const tag = LEVELS.includes(str(fields.level)) ? str(fields.level) : "h2";
    return `<${tag} data-pb-block="heading" data-pb-tag="level" data-pb-rich="text">${str(fields.text)}</${tag}>`;
  },
  settings: [
    {
      control: "toggle-group",
      label: Publr.t("Level"),
      field: "level",
      role: "structure",
      options: LEVELS.map((tag, index) => ({ value: tag, label: tag.toUpperCase(), icon: `heading-level-${index + 1}` })),
    },
  ],
  carriers: { text: { placeholder: Publr.t("Heading") } },
  transforms: ["paragraph", "quote", "pullquote"],
  toolbar: [
    { control: "field-options", label: Publr.t("Change heading level"), field: "level", options: LEVELS.map((tag, index) => ({ value: tag, label: tag.toUpperCase(), icon: `heading-level-${index + 1}` })) },
    { control: "text-align", label: Publr.t("Align text") },
  ],
};
