// Spacer: an empty, aria-hidden gap between blocks. `height` (S, M, L, XL) is
// island-canonical; the `h-*` class is derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { pick } from "./values";

const HEIGHT: Record<string, string> = { sm: "h-3", md: "h-6", lg: "h-12", xl: "h-24" };

export const definition: BlockDefinition = {
  label: Publr.t("Spacer"),
  supports: { spacing: { margin: true }, dimensions: { width: { default: false }, height: true } },
  icon: "spacer",
  category: "design",
  description: Publr.t("Add white space between blocks."),
  render(_fields, settings) {
    return `<div data-pb-block="spacer" aria-hidden="true" class="block ${pick(HEIGHT, settings.height, HEIGHT.md)}"></div>`;
  },
  settings: [
    {
      control: "toggle-group",
      label: Publr.t("Height"),
      setting: "height",
      default: "md",
      role: "design",
      options: [
        { value: "sm", label: Publr.t("S") },
        { value: "md", label: Publr.t("M") },
        { value: "lg", label: Publr.t("L") },
        { value: "xl", label: Publr.t("XL") },
      ],
    },
  ],
  selectOnClick: true,
  toolbar: [
    { control: "setting-options", label: Publr.t("Change height"), setting: "height", role: "design", options: [{ value: "sm", label: Publr.t("S") }, { value: "md", label: Publr.t("M") }, { value: "lg", label: Publr.t("L") }, { value: "xl", label: Publr.t("XL") }] },
  ],
};
