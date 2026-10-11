// Separator: a bare horizontal rule between sections. No carriers, no settings.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { MEDIA } from "./supports";

export const definition: BlockDefinition = {
  label: Publr.t("Separator"),
  supports: MEDIA,
  icon: "separator",
  category: "design",
  description: Publr.t("Break between ideas or sections with a horizontal line."),
  render() {
    return `<hr data-pb-block="separator" class="border-0 border-t border-neutral-300">`;
  },
  selectOnClick: true,
};
