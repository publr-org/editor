// Custom HTML: arbitrary markup in one rich `content` carrier, chosen on purpose from
// the inserter (unlike the reserved `raw-html` passthrough upcast mints). No settings.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";

export const definition: BlockDefinition = {
  label: Publr.t("Custom HTML"),
  icon: "html",
  category: "widgets",
  description: Publr.t("Add custom HTML markup."),
  render(fields) {
    return `<div data-pb-block="html" data-pb-rich="content">${str(fields.content)}</div>`;
  },
  carriers: { content: { placeholder: Publr.t("Write HTML…"), split: false } },
};
