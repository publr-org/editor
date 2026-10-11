// Icon: an inline span whose rich `svg` carrier holds SVG markup; Enter never splits it.
// `rotation`, `flipHorizontal`, `flipVertical` and `ariaLabel` are island-canonical; the
// transform classes and the `role`/`aria-label` attributes are derived.
import { Publr } from "publr-jsx";
import { escapeAttr } from "../model/carriers";
import type { BlockDefinition } from "../model/registry";
import { pick, str, trimmed } from "./values";
import { LAYOUT } from "./supports";

const ROTATION: Record<string, string> = { "90": " rotate-90", "180": " rotate-180", "270": " rotate-[270deg]" };

const EMPTY_SVG = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5"><circle cx="10" cy="10" r="8"></circle></svg>';

export const definition: BlockDefinition = {
  label: Publr.t("Icon"),
  supports: LAYOUT,
  icon: "icon",
  category: "media",
  description: Publr.t("Display an inline SVG icon."),
  render(fields, settings) {
    const label = trimmed(settings.ariaLabel);
    const a11y = label ? ` role="img" aria-label="${escapeAttr(label)}"` : "";
    const classes =
      "inline-block" +
      pick(ROTATION, settings.rotation, "") +
      (settings.flipHorizontal === true ? " -scale-x-100" : "") +
      (settings.flipVertical === true ? " -scale-y-100" : "");
    const svg = fields.svg === undefined ? EMPTY_SVG : str(fields.svg);
    return `<span data-pb-block="icon" data-pb-rich="svg"${a11y} class="${classes}">${svg}</span>`;
  },
  settings: [
    {
      control: "select",
      label: Publr.t("Rotation"),
      setting: "rotation",
      default: "0",
      role: "design",
      options: [
        { value: "0", label: "0°" },
        { value: "90", label: "90°" },
        { value: "180", label: "180°" },
        { value: "270", label: "270°" },
      ],
    },
    { control: "toggle", label: Publr.t("Flip horizontally"), setting: "flipHorizontal", default: false, role: "design" },
    { control: "toggle", label: Publr.t("Flip vertically"), setting: "flipVertical", default: false, role: "design" },
    {
      control: "text",
      label: Publr.t("Accessible label"),
      setting: "ariaLabel",
      default: "",
      role: "content",
      help: Publr.t("Describe the icon when it carries meaning; leave empty when it is decorative."),
    },
  ],
  carriers: { svg: { split: false } },
  selectOnClick: true,
  toolbar: [
    { control: "text", label: Publr.t("Accessible label"), setting: "ariaLabel", role: "content" },
    { control: "setting-options", label: Publr.t("Change rotation"), setting: "rotation", role: "design", options: [{ value: "0", label: "0°" }, { value: "90", label: "90°" }, { value: "180", label: "180°" }, { value: "270", label: "270°" }] },
    { control: "toggle-setting", label: Publr.t("Flip horizontally"), setting: "flipHorizontal", role: "design" },
    { control: "toggle-setting", label: Publr.t("Flip vertically"), setting: "flipVertical", role: "design" },
  ],
};
