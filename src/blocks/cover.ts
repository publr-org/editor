// Cover block — hero container: a background image,
// a dim overlay derived from `dimRatio`, and nested content blocks. The
// image is an always-present carrier (empty src when unset); the overlay
// span is pure derived presentation, regenerated every render from
// whitelisted tokens — never string-interpolated.
//
// Deliberately not modeled: useFeaturedImage, id, the color/
// gradient system (lens/JIT territory), focalPoint, backgroundType + poster
// (image backgrounds only), minHeightUnit (px only), tagName, sizeSlug,
// templateLock. `isRepeated` (tiled background) is inexpressible on an
// <img> carrier — dropped rather than carried inert.

import { escAttr } from "../carriers";
import type { ImageValue } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";
import { LAYOUT_SUPPORTS } from "./supports";

const DIM_CLASS: Record<string, string> = {
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

// 9-way content position → flex utilities on the inner slot column
const POS_CLASS: Record<string, string> = {
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
const TAGS = ["div", "section", "article", "header", "main"];

export const type = "cover";

export const definition: BlockDefinition = {
  label: "Cover",
  category: "Media",
  icon: "cover",
  description: "Add an image with a text overlay.",
  supports: {
    ...LAYOUT_SUPPORTS,
    dimensions: { ...LAYOUT_SUPPORTS.dimensions, minHeight: true },
  },
  toolbar: [
    { control: "replace", label: "Replace", field: "image" },
    {
      control: "setting-options",
      label: "Change content position",
      setting: "contentPosition",
      options: Object.keys(POS_CLASS).map((value) => ({
        value,
        label: value.replace("-", " "),
      })),
      role: "design",
    },
    {
      control: "toggle-setting",
      label: "Full height",
      setting: "fullHeight",
      role: "design",
    },
  ],
  settings: [
    { control: "media", label: "Background image", field: "image", role: "content" },
    {
      control: "number",
      label: "Overlay opacity",
      setting: "dimRatio",
      default: 50,
      min: 0,
      max: 100,
      step: 10,
      role: "design",
      help: "Control how strongly the overlay darkens the background image.",
    },
    {
      control: "toggle",
      label: "Full viewport height",
      setting: "fullHeight",
      default: false,
      role: "design",
    },
    {
      control: "toggle-group",
      label: "Content position",
      setting: "contentPosition",
      default: "center-center",
      role: "design",
      options: Object.keys(POS_CLASS).map((value) => ({
        value,
        label: value.replace("-", " "),
      })),
    },
    {
      control: "toggle",
      label: "Fixed background (parallax)",
      setting: "hasParallax",
      default: false,
      role: "design",
    },
    {
      control: "toggle-group",
      label: "HTML element",
      field: "tag",
      role: "structure",
      options: TAGS.map((tag) => ({ value: tag, label: tag })),
    },
  ],
  render(fields: Fields, settings?: Settings) {
    const img = (fields.image ?? {}) as Partial<ImageValue>;
    const dims =
      (img.width ? ` width="${escAttr(img.width)}"` : "") +
      (img.height ? ` height="${escAttr(img.height)}"` : "");
    const dim = DIM_CLASS[String(settings?.dimRatio)] ?? "opacity-50";
    const pos = POS_CLASS[String(settings?.contentPosition)] ?? POS_CLASS["center-center"];
    // parallax: a fixed img clipped to the cover box (img-element equivalent
    // of background-attachment: fixed)
    const parallax = settings?.hasParallax === true;
    const tag = typeof fields.tag === "string" && TAGS.includes(fields.tag) ? fields.tag : "div";
    const height = settings?.fullHeight === true ? " min-h-screen" : "";
    return (
      `<${tag} data-pb-block="cover" data-pb-tag="tag" class="pbe-cover relative isolate flex overflow-hidden p-4${height}${parallax ? " [clip-path:inset(0)]" : ""}">` +
      `<img data-pb-image="image" src="${escAttr(img.src ?? "")}" alt="${escAttr(img.alt ?? "")}"${dims} class="${parallax ? "fixed" : "absolute"} inset-0 -z-20 h-full w-full object-cover">` +
      `<span class="absolute inset-0 -z-10 bg-foreground ${dim}" aria-hidden="true"></span>` +
      `<div data-pb-children class="relative flex flex-1 flex-col gap-3 text-surface ${pos}"></div></${tag}>`
    );
  },
};
