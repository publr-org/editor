// Spacer block — vertical gap via a settings token. The setting maps to a
// height utility in the render's BASELINE; an authored height (h-[…] or a
// lens write) evicts it at downcast (style.ts evictConflictingBaseline), so
// the wire never carries two heights. Px resizing is skipped — authored
// classes / lenses cover it (documented scope decision).

import type { BlockDefinition, Fields, Settings } from "../registry";

const HEIGHT_CLASS: Record<string, string> = {
  sm: "h-3",
  md: "h-6",
  lg: "h-12",
  xl: "h-24",
};

export const type = "spacer";

export const definition: BlockDefinition = {
  label: "Spacer",
  category: "Design",
  icon: "spacer",
  description: "Add white space between blocks.",
  supports: {
    spacing: { margin: true },
    dimensions: { width: { default: false }, height: true },
  },
  toolbar: [
    {
      control: "setting-options",
      label: "Change height",
      setting: "height",
      options: [
        { value: "sm", label: "S" },
        { value: "md", label: "M" },
        { value: "lg", label: "L" },
        { value: "xl", label: "XL" },
      ],
      role: "design",
    },
  ],
  settings: [
    {
      control: "toggle-group",
      label: "Height",
      setting: "height",
      default: "md",
      role: "design",
      options: [
        { value: "sm", label: "S" },
        { value: "md", label: "M" },
        { value: "lg", label: "L" },
        { value: "xl", label: "XL" },
      ],
    },
  ],
  render(_fields: Fields, settings?: Settings) {
    const height = HEIGHT_CLASS[String(settings?.height)] ?? HEIGHT_CLASS.md;
    return `<div data-pb-block="spacer" aria-hidden="true" class="block ${height}"></div>`;
  },
};
