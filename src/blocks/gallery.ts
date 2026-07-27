// Gallery block — a grid of image blocks (images are inner blocks, not a
// queried attribute array), plus a gallery
// caption. Columns/crop are island-canonical; the classes derived from them
// sit on the inner grid (whitelisted tokens, regenerated every render).
//
// Deliberately not modeled: images + ids (a legacy
// attribute-array model — the slot IS the model), shortCodeTransforms,
// randomOrder, fixedHeight, linkTo/linkTarget (per-image concerns live on
// the image block), sizeSlug, allowResize, aspectRatio (crop covers v0).

import { str } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";

const COL_CLASS: Record<string, string> = {
  "1": "grid-cols-1",
  "2": "grid-cols-2",
  "3": "grid-cols-3",
  "4": "grid-cols-4",
  "5": "grid-cols-5",
  "6": "grid-cols-6",
  "7": "grid-cols-7",
  "8": "grid-cols-8",
};
const RATIO_CLASS: Record<string, string> = {
  square: "[&_img]:aspect-square",
  "4-3": "[&_img]:aspect-[4/3]",
  "3-2": "[&_img]:aspect-[3/2]",
  "16-9": "[&_img]:aspect-video",
};

export const type = "gallery";

export const definition: BlockDefinition = {
  label: "Gallery",
  category: "Media",
  icon: "gallery",
  placeholder: "Add caption",
  description: "Display multiple images in a rich gallery.",
  supports: {
    spacing: { padding: true, margin: true },
    dimensions: { width: { default: false } },
    layout: { gap: true },
    border: { width: true, color: true, radius: true, style: { default: false } },
  },
  classTarget: "[data-pb-children]",
  toolbar: [
    { control: "add-child", label: "Add image", type: "image" },
    { control: "caption", label: "Caption", field: "caption", setting: "showCaption" },
    {
      control: "setting-options",
      label: "Change image aspect ratio",
      setting: "aspectRatio",
      role: "design",
      options: [
        { value: "square", label: "Square" },
        { value: "4-3", label: "4:3" },
        { value: "3-2", label: "3:2" },
        { value: "16-9", label: "16:9" },
      ],
    },
  ],
  allowedChildren: ["image"],
  childTemplate: ["image"],
  settings: [
    {
      control: "toggle",
      label: "Caption",
      setting: "showCaption",
      default: false,
      role: "content",
    },
    {
      control: "number",
      label: "Columns",
      setting: "columns",
      default: 3,
      min: 1,
      max: 8,
      step: 1,
      role: "structure",
    },
    {
      control: "toggle",
      label: "Crop images to fit",
      setting: "imageCrop",
      default: true,
      role: "design",
    },
    {
      control: "select",
      label: "Image aspect ratio",
      setting: "aspectRatio",
      default: "square",
      role: "design",
      when: { setting: "imageCrop", equals: true },
      options: [
        { value: "square", label: "Square (1:1)" },
        { value: "4-3", label: "Standard (4:3)" },
        { value: "3-2", label: "Classic (3:2)" },
        { value: "16-9", label: "Wide (16:9)" },
      ],
    },
  ],
  render(fields: Fields, settings?: Settings) {
    const cols = COL_CLASS[String(settings?.columns)] ?? "grid-cols-3";
    const crop =
      settings?.imageCrop === false
        ? ""
        : ` ${RATIO_CLASS[String(settings?.aspectRatio)] ?? RATIO_CLASS.square} [&_img]:w-full [&_img]:object-cover`;
    const caption = str(fields.caption);
    const showCaption =
      settings === undefined || settings.showCaption === true || caption.trim() !== "";
    const figcaption = showCaption
      ? `<figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-muted-foreground">${caption}</figcaption>`
      : "";
    return `<figure data-pb-block="gallery"><div data-pb-children class="grid gap-3 ${cols}${crop}"></div>${figcaption}</figure>`;
  },
};
