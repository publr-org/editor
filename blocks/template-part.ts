// A template part: a synced region (header, footer) a template places by name. The
// template holds only the reference; the part's content lives in the part itself and
// is drawn in here read-only. Offered by the inserter only while editing a template.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { escapeAttr } from "../model/carriers";
import { trimmed } from "./values";

export const definition: BlockDefinition = {
  label: Publr.t("Template part"),
  icon: "components",
  category: "design",
  description: Publr.t("A part shared by every page that uses it; edit the original to change them all."),
  templateOnly: true,
  selectOnClick: true,
  settings: [{ control: "text", label: Publr.t("Part"), setting: "part", default: "header", role: "structure" }],
  render(_fields, settings) {
    const name = trimmed(settings.part) || "header";
    return `<div data-pb-block="template-part" data-publr-template-part="${escapeAttr(name)}"></div>`;
  },
};
