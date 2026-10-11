// Code: a pre with one plain-text `code` carrier. The carrier is a pre, so whitespace
// is content and Enter never splits, by derivation. No settings.
import { Publr } from "publr-jsx";
import { escapeHtml } from "../model/carriers";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";
import { TEXT } from "./supports";

export const definition: BlockDefinition = {
  label: Publr.t("Code"),
  supports: TEXT,
  icon: "code",
  category: "text",
  description: Publr.t("Display code snippets that respect your spacing and tabs."),
  render(fields) {
    return `<pre data-pb-block="code" data-pb-text="code">${escapeHtml(str(fields.code))}</pre>`;
  },
  carriers: { code: { placeholder: Publr.t("Write code…") } },
  transforms: ["preformatted", "paragraph"],
};
