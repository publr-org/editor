// Pullquote: a centered figure between rules, one rich `value` in its own div inside
// the blockquote plus a plain-text `citation`, hidden while Citation is off.
import { Publr } from "publr-jsx";
import { escapeHtml } from "../model/carriers";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";
import { TEXT } from "./supports";

export const definition: BlockDefinition = {
  label: Publr.t("Pullquote"),
  supports: TEXT,
  icon: "pullquote",
  category: "text",
  description: Publr.t("Give special visual emphasis to a quote from your text."),
  render(fields, settings) {
    return (
      `<figure data-pb-block="pullquote" class="border-y py-6 text-center"><blockquote class="text-2xl"><div data-pb-rich="value">${str(fields.value)}</div></blockquote>` +
      `${settings.showCitation === false && str(fields.citation).trim() === "" ? "" : `<cite data-pb-text="citation" class="mt-2 block text-sm not-italic">${escapeHtml(str(fields.citation))}</cite>`}</figure>`
    );
  },
  settings: [{ control: "toggle", label: Publr.t("Citation"), setting: "showCitation", default: true, role: "content", clears: "citation" }],
  carriers: { value: { placeholder: Publr.t("Add quote…") }, citation: { placeholder: Publr.t("Add citation") } },
  transforms: ["quote", "paragraph"],
  toolbar: [
    { control: "text-align", label: Publr.t("Align text") },
    { control: "toggle-setting", label: Publr.t("Citation"), setting: "showCitation", role: "content" },
  ],
};
