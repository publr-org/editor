// Image: a figure with one `image` carrier and an always-present caption. The link
// wrapper (`href`, `linkTarget`, `rel`), `aspectRatio` and `scale` are island-canonical;
// the anchor and the `[&_img]:…` root classes are derived.
import { Publr } from "publr-jsx";
import { escapeAttr } from "../model/carriers";
import type { BlockDefinition } from "../model/registry";
import { LINK_TARGETS, captionOf, figcaption, linkAttrs, mediaAttrs, pick, trimmed } from "./values";
import { MEDIA } from "./supports";

const RATIO: Record<string, string> = {
  square: "[&_img]:aspect-square [&_img]:w-full",
  "4-3": "[&_img]:aspect-[4/3] [&_img]:w-full",
  "3-2": "[&_img]:aspect-[3/2] [&_img]:w-full",
  "16-9": "[&_img]:aspect-video [&_img]:w-full",
};

export const definition: BlockDefinition = {
  label: Publr.t("Image"),
  supports: MEDIA,
  icon: "image",
  category: "media",
  description: Publr.t("Insert an image to make a visual statement."),
  render(fields, settings) {
    const decorative = settings.isDecorative === true ? ` role="presentation" aria-hidden="true"` : "";
    const img = `<img data-pb-image="image" ${mediaAttrs(fields.image)}${decorative} class="block h-auto max-w-full">`;
    const href = trimmed(settings.href);
    const media = href ? `<a href="${escapeAttr(href)}"${linkAttrs(settings.linkTarget, settings.rel)}>${img}</a>` : img;
    const ratio = pick(RATIO, settings.aspectRatio, "");
    const classes = ratio ? ` class="${ratio} ${settings.scale === "contain" ? "[&_img]:object-contain" : "[&_img]:object-cover"}"` : "";
    return `<figure data-pb-block="image"${classes}>${media}${captionOf(fields.caption, settings.showCaption)}</figure>`;
  },
  settings: [
    { control: "media", label: Publr.t("Image"), field: "image", role: "content" },
    { control: "toggle", label: Publr.t("Decorative image"), setting: "isDecorative", default: false, role: "content", help: Publr.t("Mark the image as presentational so assistive technology skips it without discarding its saved description.") },
    { control: "toggle", label: Publr.t("Caption"), setting: "showCaption", default: true, role: "content", clears: "caption" },
    { control: "url", label: Publr.t("Link URL"), setting: "href", default: "", placeholder: "https://…", role: "content" },
    { control: "select", label: Publr.t("Open in"), setting: "linkTarget", default: "none", role: "content", options: LINK_TARGETS, when: (settings) => trimmed(settings.href) !== "" },
    {
      control: "text",
      label: Publr.t("Link rel"),
      setting: "rel",
      default: "",
      placeholder: Publr.t("e.g. nofollow"),
      role: "advanced",
      when: (settings) => trimmed(settings.href) !== "",
    },
    {
      control: "select",
      label: Publr.t("Aspect ratio"),
      setting: "aspectRatio",
      default: "auto",
      role: "design",
      options: [
        { value: "auto", label: Publr.t("Original") },
        { value: "square", label: Publr.t("Square (1:1)") },
        { value: "4-3", label: Publr.t("Standard (4:3)") },
        { value: "3-2", label: Publr.t("Classic (3:2)") },
        { value: "16-9", label: Publr.t("Wide (16:9)") },
      ],
    },
    {
      control: "select",
      label: Publr.t("Scale"),
      setting: "scale",
      default: "cover",
      role: "design",
      when: (settings) => settings.aspectRatio !== "auto",
      options: [
        { value: "cover", label: Publr.t("Cover") },
        { value: "contain", label: Publr.t("Contain") },
      ],
    },
  ],
  carriers: { caption: { placeholder: Publr.t("Add caption") } },
  selectOnClick: true,
  toolbar: [
    { control: "replace", label: Publr.t("Replace"), field: "image", icon: "replace" },
    { control: "link", label: Publr.t("Link"), setting: "href", targetSetting: "linkTarget" },
    { control: "caption", label: Publr.t("Caption"), field: "caption", setting: "showCaption" },
    { control: "toggle-setting", label: Publr.t("Decorative"), setting: "isDecorative", icon: "decorative", role: "content" },
  ],
};
