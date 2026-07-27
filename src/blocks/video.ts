// Video block — figure root wrapping the <video> with an
// always-present figcaption. The video element reuses the `image` carrier
// (src/alt/width/height) — zero new carrier vocabulary; the alt="" it
// implies is non-standard on <video> but inert. Playback facts (controls,
// autoplay, loop, muted, playsInline, preload, poster) are island-canonical;
// the attributes are derived presentation, regenerated every render. Legacy
// bare-video-root markup still ingests permissively.
//
// Deliberately not modeled: blob/id (media library), tracks
// (subtitle list, deferred).

import { escAttr, str } from "../carriers";
import type { ImageValue } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";
import { MEDIA_SUPPORTS } from "./supports";

const PRELOAD = ["auto", "metadata", "none"];

export const type = "video";

export const definition: BlockDefinition = {
  label: "Video",
  category: "Media",
  icon: "video",
  placeholder: "Add caption",
  description: "Embed a video from your media library or upload a new one.",
  supports: MEDIA_SUPPORTS,
  toolbar: [
    { control: "replace", label: "Replace", field: "video" },
    { control: "caption", label: "Caption", field: "caption", setting: "showCaption" },
  ],
  settings: [
    { control: "media", label: "Video", field: "video", role: "content" },
    {
      control: "toggle",
      label: "Caption",
      setting: "showCaption",
      default: false,
      role: "content",
    },
    {
      control: "toggle",
      label: "Playback controls",
      setting: "controls",
      default: true,
      help: "Show the browser's playback controls.",
    },
    {
      control: "toggle",
      label: "Autoplay",
      setting: "autoplay",
      default: false,
      help: "Browsers generally require autoplaying video to be muted.",
    },
    { control: "toggle", label: "Loop", setting: "loop", default: false },
    { control: "toggle", label: "Muted", setting: "muted", default: false },
    { control: "toggle", label: "Play inline", setting: "playsInline", default: false },
    {
      control: "select",
      label: "Preload",
      setting: "preload",
      default: "metadata",
      options: [
        { value: "auto", label: "Auto" },
        { value: "metadata", label: "Metadata" },
        { value: "none", label: "None" },
      ],
    },
    {
      control: "text",
      label: "Poster image URL",
      setting: "poster",
      default: "",
      placeholder: "https://…/poster.jpg",
      help: "Displayed before playback begins.",
    },
  ],
  render(fields: Fields, settings?: Settings) {
    const v = (fields.video ?? {}) as Partial<ImageValue>;
    const dims =
      (v.width ? ` width="${escAttr(v.width)}"` : "") +
      (v.height ? ` height="${escAttr(v.height)}"` : "");
    let attrs = settings?.controls === false ? "" : " controls";
    const autoplay = settings?.autoplay === true;
    if (autoplay) attrs += " autoplay";
    if (settings?.loop === true) attrs += " loop";
    if (settings?.muted === true || autoplay) attrs += " muted";
    if (settings?.playsInline === true || autoplay) attrs += " playsinline";
    const preload = String(settings?.preload);
    if (PRELOAD.includes(preload) && preload !== "metadata") attrs += ` preload="${preload}"`;
    const poster =
      typeof settings?.poster === "string" && settings.poster.trim()
        ? ` poster="${escAttr(settings.poster.trim())}"`
        : "";
    const caption = str(fields.caption);
    const showCaption =
      settings === undefined || settings.showCaption === true || caption.trim() !== "";
    const figcaption = showCaption
      ? `<figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-muted-foreground">${caption}</figcaption>`
      : "";
    return `<figure data-pb-block="video"><video data-pb-image="video" src="${escAttr(v.src ?? "")}" alt="${escAttr(v.alt ?? "")}"${dims}${attrs}${poster} class="block w-full"></video>${figcaption}</figure>`;
  },
};
