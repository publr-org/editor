// Media & Text: an image carrier (`media`) in one grid column, nested blocks in the
// other. `mediaPosition`, `mediaWidth`, `stackOnMobile`, `verticalAlignment` and
// `imageFill` are island-canonical; the grid template, order and fill classes are
// derived (the width snaps to 5% steps).
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { escapeAttr } from "../model/carriers";
import { LINK_TARGETS, clamp, linkAttrs, mediaAttrs, pick, trimmed } from "./values";
import { LAYOUT } from "./supports";

// Full literals, one per step, so every class the render can emit appears in source.
const MEDIA_LEFT: Record<string, string> = {
  "15": "grid-cols-[15%_1fr]",
  "20": "grid-cols-[20%_1fr]",
  "25": "grid-cols-[25%_1fr]",
  "30": "grid-cols-[30%_1fr]",
  "35": "grid-cols-[35%_1fr]",
  "40": "grid-cols-[40%_1fr]",
  "45": "grid-cols-[45%_1fr]",
  "50": "grid-cols-[50%_1fr]",
  "55": "grid-cols-[55%_1fr]",
  "60": "grid-cols-[60%_1fr]",
  "65": "grid-cols-[65%_1fr]",
  "70": "grid-cols-[70%_1fr]",
  "75": "grid-cols-[75%_1fr]",
  "80": "grid-cols-[80%_1fr]",
  "85": "grid-cols-[85%_1fr]",
};

const MEDIA_RIGHT: Record<string, string> = {
  "15": "grid-cols-[1fr_15%]",
  "20": "grid-cols-[1fr_20%]",
  "25": "grid-cols-[1fr_25%]",
  "30": "grid-cols-[1fr_30%]",
  "35": "grid-cols-[1fr_35%]",
  "40": "grid-cols-[1fr_40%]",
  "45": "grid-cols-[1fr_45%]",
  "50": "grid-cols-[1fr_50%]",
  "55": "grid-cols-[1fr_55%]",
  "60": "grid-cols-[1fr_60%]",
  "65": "grid-cols-[1fr_65%]",
  "70": "grid-cols-[1fr_70%]",
  "75": "grid-cols-[1fr_75%]",
  "80": "grid-cols-[1fr_80%]",
  "85": "grid-cols-[1fr_85%]",
};

const VALIGN: Record<string, string> = { top: "items-start", center: "items-center", bottom: "items-end" };

export const definition: BlockDefinition = {
  label: Publr.t("Media & Text"),
  supports: LAYOUT,
  icon: "media-text",
  category: "media",
  description: Publr.t("Set media and words side by side."),
  render(fields, settings) {
    const image = `<img data-pb-image="media" ${mediaAttrs(fields.media)} class="block h-auto max-w-full">`;
    const href = trimmed(settings.href);
    const linked = href ? `<a href="${escapeAttr(href)}"${linkAttrs(settings.linkTarget, "")}>${image}</a>` : image;
    const right = settings.mediaPosition === "right";
    const width = (right ? MEDIA_RIGHT : MEDIA_LEFT)[String(clamp(settings.mediaWidth, 50, 15, 85, 5))];
    const valign = pick(VALIGN, settings.verticalAlignment, "items-center");
    const stack = settings.stackOnMobile === false ? "" : " max-md:grid-cols-1";
    const media = "min-w-0" + (right ? " order-2" : "") + (settings.imageFill === true ? " [&_img]:h-full [&_img]:w-full [&_img]:object-cover" : "");
    return (
      `<div data-pb-block="media-text" class="grid gap-6 ${width} ${valign}${stack}">` +
      `<div class="${media}">${linked}</div>` +
      `<div data-pb-children class="min-w-0"></div></div>`
    );
  },
  settings: [
    { control: "media", label: Publr.t("Media"), field: "media", role: "content" },
    { control: "url", label: Publr.t("Media link URL"), setting: "href", default: "", placeholder: "https://…", role: "content" },
    { control: "select", label: Publr.t("Open media link in"), setting: "linkTarget", default: "none", role: "content", options: LINK_TARGETS, when: (settings) => trimmed(settings.href) !== "" },
    {
      control: "toggle-group",
      label: Publr.t("Media position"),
      setting: "mediaPosition",
      default: "left",
      role: "design",
      options: [
        { value: "left", label: Publr.t("Left") },
        { value: "right", label: Publr.t("Right") },
      ],
    },
    { control: "number", label: Publr.t("Media width (%)"), setting: "mediaWidth", default: 50, min: 15, max: 85, step: 5, role: "design" },
    { control: "toggle", label: Publr.t("Stack on mobile"), setting: "stackOnMobile", default: true, role: "structure" },
    {
      control: "toggle-group",
      label: Publr.t("Vertical alignment"),
      setting: "verticalAlignment",
      default: "center",
      role: "design",
      options: [
        { value: "top", label: Publr.t("Top"), icon: "align-start" },
        { value: "center", label: Publr.t("Center"), icon: "align-center" },
        { value: "bottom", label: Publr.t("Bottom"), icon: "align-end" },
      ],
    },
    { control: "toggle", label: Publr.t("Image fills the column"), setting: "imageFill", default: false, role: "design" },
  ],
  template: { children: ["paragraph"] },
  selectOnClick: true,
  toolbar: [
    { control: "replace", label: Publr.t("Replace"), field: "media" },
    { control: "link", label: Publr.t("Link media"), setting: "href", targetSetting: "linkTarget", role: "content" },
    { control: "setting-options", label: Publr.t("Change media position"), setting: "mediaPosition", role: "design", options: [{ value: "left", label: Publr.t("Left") }, { value: "right", label: Publr.t("Right") }] },
    { control: "setting-options", label: Publr.t("Change vertical alignment"), setting: "verticalAlignment", role: "design", options: [{ value: "top", label: Publr.t("Top") }, { value: "center", label: Publr.t("Center") }, { value: "bottom", label: Publr.t("Bottom") }] },
  ],
};
