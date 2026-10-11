// Verse: poetry in a pre with one rich `content` carrier, keeping line breaks and
// indentation in the page's own font. Enter never splits, by derivation. No settings.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";
import { TEXT } from "./supports";

export const definition: BlockDefinition = {
  label: Publr.t("Verse"),
  supports: TEXT,
  icon: "verse",
  category: "text",
  description: Publr.t("Insert poetry or song lyrics with their own spacing."),
  render(fields) {
    return `<pre data-pb-block="verse" data-pb-rich="content" class="whitespace-pre-wrap [font-family:inherit] [font-size:inherit]">${str(fields.content)}</pre>`;
  },
  carriers: { content: { placeholder: Publr.t("Write poetry…") } },
  transforms: ["preformatted", "paragraph"],
  toolbar: [
    { control: "text-align", label: Publr.t("Align text") },
  ],
};
