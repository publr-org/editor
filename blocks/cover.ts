// Cover: a hero container with a background `image` carrier, a dim overlay and a
// children slot. `dimRatio`, `contentPosition`, `fullHeight` and `hasParallax` are
// island-canonical; the overlay's opacity, the slot's alignment classes, `min-h-screen`
// and the fixed (parallax) image are derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { clamp, mediaAttrs, pick, str } from "./values";
import { LAYOUT } from "./supports";

const OPACITY: Record<string, string> = {
  "0": "opacity-0",
  "10": "opacity-10",
  "20": "opacity-20",
  "30": "opacity-30",
  "40": "opacity-40",
  "50": "opacity-50",
  "60": "opacity-60",
  "70": "opacity-70",
  "80": "opacity-80",
  "90": "opacity-90",
  "100": "opacity-100",
};

const TAGS = ["div", "section", "article", "header", "main"];

const POSITION: Record<string, string> = {
  "top-left": "justify-start items-start text-left",
  "top-center": "justify-start items-center text-center",
  "top-right": "justify-start items-end text-right",
  "center-left": "justify-center items-start text-left",
  "center-center": "justify-center items-center text-center",
  "center-right": "justify-center items-end text-right",
  "bottom-left": "justify-end items-start text-left",
  "bottom-center": "justify-end items-center text-center",
  "bottom-right": "justify-end items-end text-right",
};

const POSITION_LABEL: Record<string, string> = {
  "top-left": Publr.t("Top left"),
  "top-center": Publr.t("Top center"),
  "top-right": Publr.t("Top right"),
  "center-left": Publr.t("Center left"),
  "center-center": Publr.t("Center center"),
  "center-right": Publr.t("Center right"),
  "bottom-left": Publr.t("Bottom left"),
  "bottom-center": Publr.t("Bottom center"),
  "bottom-right": Publr.t("Bottom right"),
};

export const definition: BlockDefinition = {
  label: Publr.t("Cover"),
  supports: { ...LAYOUT, dimensions: { ...LAYOUT.dimensions, minHeight: true } },
  icon: "cover",
  category: "media",
  description: Publr.t("Add an image with content over it."),
  render(fields, settings) {
    const tag = TAGS.includes(str(fields.tag)) ? str(fields.tag) : "div";
    const parallax = settings.hasParallax === true;
    const root = "relative isolate flex overflow-hidden p-4" + (settings.fullHeight === true ? " min-h-screen" : "") + (parallax ? " [clip-path:inset(0)]" : "");
    const opacity = OPACITY[String(clamp(settings.dimRatio, 50, 0, 100, 10))];
    const position = pick(POSITION, settings.contentPosition, POSITION["center-center"]);
    return (
      `<${tag} data-pb-block="cover" data-pb-tag="tag" class="${root}">` +
      `<img data-pb-image="image" ${mediaAttrs(fields.image)} class="${parallax ? "fixed" : "absolute"} inset-0 -z-20 h-full w-full object-cover">` +
      `<span class="absolute inset-0 -z-10 bg-black ${opacity}" aria-hidden="true"></span>` +
      `<div data-pb-children class="relative flex flex-1 flex-col gap-3 text-white ${position}"></div></${tag}>`
    );
  },
  settings: [
    { control: "media", label: Publr.t("Background image"), field: "image", role: "content" },
    { control: "number", label: Publr.t("Overlay opacity"), setting: "dimRatio", default: 50, min: 0, max: 100, step: 10, role: "design" },
    {
      control: "toggle-group",
      label: Publr.t("Content position"),
      setting: "contentPosition",
      default: "center-center",
      role: "design",
      options: Object.keys(POSITION).map((value) => ({ value, label: POSITION_LABEL[value] })),
    },
    { control: "toggle", label: Publr.t("Full viewport height"), setting: "fullHeight", default: false, role: "design" },
    { control: "toggle", label: Publr.t("Fixed background (parallax)"), setting: "hasParallax", default: false, role: "design" },
    { control: "toggle-group", label: Publr.t("HTML element"), field: "tag", role: "structure", options: TAGS.map((tag) => ({ value: tag, label: tag })) },
  ],
  template: { children: ["paragraph"] },
  selectOnClick: true,
  toolbar: [
    { control: "replace", label: Publr.t("Replace"), field: "image" },
    { control: "setting-options", label: Publr.t("Change content position"), setting: "contentPosition", role: "design", options: Object.keys(POSITION).map((value) => ({ value, label: value.replace("-", " ") })) },
    { control: "toggle-setting", label: Publr.t("Full height"), setting: "fullHeight", role: "design" },
  ],
};
