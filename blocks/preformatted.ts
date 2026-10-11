// Preformatted: a pre with one rich `content` carrier, whitespace kept like code but
// inline markup allowed. Enter never splits, by derivation from the pre. No settings.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";
import { TEXT } from "./supports";

export const definition: BlockDefinition = {
  label: Publr.t("Preformatted"),
  supports: TEXT,
  icon: "preformatted",
  category: "text",
  description: Publr.t("Add text that respects your spacing and tabs, and also allows styling."),
  render(fields) {
    return `<pre data-pb-block="preformatted" data-pb-rich="content" class="whitespace-pre-wrap">${str(fields.content)}</pre>`;
  },
  carriers: { content: { placeholder: Publr.t("Preformatted text…") } },
  transforms: ["code", "verse", "paragraph"],
  toolbar: [
    { control: "text-align", label: Publr.t("Align text") },
  ],
};
