// Separator block — hr. Opacity and
// tagName div settings are skipped: authored classes / lenses cover both
// (documented scope decision on story #338).

import type { BlockDefinition } from "../registry";
import { MEDIA_SUPPORTS } from "./supports";

export const type = "separator";

export const definition: BlockDefinition = {
  label: "Separator",
  category: "Design",
  icon: "separator",
  description: "Create a break between ideas or sections with a horizontal separator.",
  supports: MEDIA_SUPPORTS,
  toolbar: [],
  variants: [
    {
      name: "wide",
      label: "Wide",
      styles: { width: "50%", marginLeft: "auto", marginRight: "auto" },
    },
    { name: "dots", label: "Dots", styles: { borderTopWidth: "4", borderStyle: "dotted" } },
  ],
  render() {
    return `<hr data-pb-block="separator" class="border-0 border-t border-border">`;
  },
};
