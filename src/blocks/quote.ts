// Quote block — rich body + citation (a nested-blocks body is
// deliberately not modeled — nested quote content is a later wave). The body sits
// in its own element: a root-level rich read would swallow the cite.

import { str } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";
import { TEXT_SUPPORTS } from "./supports";

export const type = "quote";

export const definition: BlockDefinition = {
  label: "Quote",
  category: "Text",
  icon: "quote",
  placeholder: "Quote",
  description: "Give quoted text visual emphasis.",
  supports: TEXT_SUPPORTS,
  toolbar: [
    { control: "text-align", label: "Align text" },
    { control: "toggle-setting", label: "Citation", setting: "showCitation", role: "content" },
  ],
  variants: [{ name: "plain", label: "Plain", styles: { borderLeftWidth: "0", paddingLeft: "0" } }],
  settings: [
    {
      control: "toggle",
      label: "Citation",
      setting: "showCitation",
      default: false,
      role: "content",
    },
  ],
  render(fields: Fields, settings?: Settings) {
    const citation = str(fields.citation);
    const showCitation =
      settings === undefined || settings.showCitation === true || citation.trim() !== "";
    const cite = showCitation
      ? `<cite data-pb-rich="citation" class="mt-1 block text-sm not-italic">${citation}</cite>`
      : "";
    return `<blockquote data-pb-block="quote" class="border-l-2 pl-4"><div data-pb-rich="body">${str(fields.body)}</div>${cite}</blockquote>`;
  },
};
