// Gallery: a grid of image blocks (the children slot takes images only) plus a gallery
// caption. `columns`, `imageCrop` and `aspectRatio` are island-canonical; the grid and
// crop classes on the slot are derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { clamp, captionOf, figcaption, pick } from "./values";

const COLUMNS: Record<string, string> = {
  "1": "grid-cols-1",
  "2": "grid-cols-2",
  "3": "grid-cols-3",
  "4": "grid-cols-4",
  "5": "grid-cols-5",
  "6": "grid-cols-6",
  "7": "grid-cols-7",
  "8": "grid-cols-8",
};

const RATIO: Record<string, string> = {
  square: "[&_img]:aspect-square",
  "4-3": "[&_img]:aspect-[4/3]",
  "3-2": "[&_img]:aspect-[3/2]",
  "16-9": "[&_img]:aspect-video",
};

export const definition: BlockDefinition = {
  label: Publr.t("Gallery"),
  supports: {
    spacing: { padding: true, margin: true },
    dimensions: { width: { default: false } },
    layout: { gap: true },
    border: { width: true, color: true, radius: true, style: { default: false } },
  },
  icon: "gallery",
  category: "media",
  description: Publr.t("Display several images in a grid."),
  render(fields, settings) {
    const columns = COLUMNS[String(clamp(settings.columns, 3, 1, 8))];
    const crop = settings.imageCrop === false ? "" : ` ${pick(RATIO, settings.aspectRatio, RATIO.square)} [&_img]:w-full [&_img]:object-cover`;
    return `<figure data-pb-block="gallery"><div data-pb-children class="grid gap-3 ${columns}${crop}"></div>${captionOf(fields.caption, settings.showCaption)}</figure>`;
  },
  settings: [
    { control: "toggle", label: Publr.t("Caption"), setting: "showCaption", default: true, role: "content", clears: "caption" },
    { control: "number", label: Publr.t("Columns"), setting: "columns", default: 3, min: 1, max: 8, step: 1, role: "structure" },
    { control: "toggle", label: Publr.t("Crop images to fit"), setting: "imageCrop", default: true, role: "design" },
    {
      control: "select",
      label: Publr.t("Image aspect ratio"),
      setting: "aspectRatio",
      default: "square",
      role: "design",
      when: (settings) => settings.imageCrop !== false,
      options: [
        { value: "square", label: Publr.t("Square (1:1)") },
        { value: "4-3", label: Publr.t("Standard (4:3)") },
        { value: "3-2", label: Publr.t("Classic (3:2)") },
        { value: "16-9", label: Publr.t("Wide (16:9)") },
      ],
    },
  ],
  carriers: { caption: { placeholder: Publr.t("Add caption") } },
  allow: { children: ["image"] },
  template: { children: ["image"] },
  toolbar: [
    { control: "add-child", label: Publr.t("Add image"), type: "image" },
    { control: "caption", label: Publr.t("Caption"), field: "caption", setting: "showCaption" },
    { control: "setting-options", label: Publr.t("Change image aspect ratio"), setting: "aspectRatio", role: "design", options: [{ value: "square", label: Publr.t("Square") }, { value: "4-3", label: "4:3" }, { value: "3-2", label: "3:2" }, { value: "16-9", label: "16:9" }] },
  ],
};
