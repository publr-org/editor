// Quote: a left-bordered blockquote with a rich `body` (in its own div, so the root's
// read never swallows the cite) and a plain-text `citation`, hidden while Citation is off.
import { Publr } from "publr-jsx";
import { escapeHtml } from "../model/carriers";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";
import { TEXT } from "./supports";

export const definition: BlockDefinition = {
  label: Publr.t("Quote"),
  supports: TEXT,
  icon: "quote",
  category: "text",
  description: Publr.t("Give quoted text visual emphasis."),
  render(fields, settings) {
    return (
      `<blockquote data-pb-block="quote" class="border-l-2 pl-4"><div data-pb-rich="body">${str(fields.body)}</div>` +
      `${settings.showCitation === false && str(fields.citation).trim() === "" ? "" : `<cite data-pb-text="citation" class="mt-1 block text-sm not-italic">${escapeHtml(str(fields.citation))}</cite>`}</blockquote>`
    );
  },
  settings: [{ control: "toggle", label: Publr.t("Citation"), setting: "showCitation", default: true, role: "content", clears: "citation" }],
  carriers: { body: { placeholder: Publr.t("Quote") }, citation: { placeholder: Publr.t("Add citation") } },
  transforms: ["paragraph", "heading", "pullquote"],
  toolbar: [
    { control: "text-align", label: Publr.t("Align text") },
    { control: "toggle-setting", label: Publr.t("Citation"), setting: "showCitation", role: "content" },
  ],
};
