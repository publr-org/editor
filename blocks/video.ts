// Video: a figure with a `<video>` reusing the image carrier (`video` field) and an
// always-present caption. Every playback fact (controls, autoplay, loop, muted, play
// inline, preload, poster) is island-canonical; the `<video>` attributes are derived.
import { Publr } from "publr-jsx";
import { escapeAttr } from "../model/carriers";
import type { BlockDefinition } from "../model/registry";
import { captionOf, figcaption, mediaAttrs, pick, trimmed } from "./values";
import { MEDIA } from "./supports";

const PRELOAD: Record<string, string> = { auto: ` preload="auto"`, none: ` preload="none"` };

export const definition: BlockDefinition = {
  label: Publr.t("Video"),
  supports: MEDIA,
  icon: "video",
  category: "media",
  description: Publr.t("Embed a video file with a player."),
  render(fields, settings) {
    // Browsers only autoplay muted, inline video, so autoplay implies both.
    const autoplay = settings.autoplay === true;
    const poster = trimmed(settings.poster);
    const attrs =
      (settings.controls === false ? "" : " controls") +
      (autoplay ? " autoplay" : "") +
      (settings.loop === true ? " loop" : "") +
      (settings.muted === true || autoplay ? " muted" : "") +
      (settings.playsInline === true || autoplay ? " playsinline" : "") +
      pick(PRELOAD, settings.preload, "") +
      (poster ? ` poster="${escapeAttr(poster)}"` : "");
    return `<figure data-pb-block="video"><video data-pb-image="video" ${mediaAttrs(fields.video)}${attrs} class="block w-full"></video>${captionOf(fields.caption, settings.showCaption)}</figure>`;
  },
  settings: [
    { control: "media", label: Publr.t("Video"), field: "video", role: "content" },
    { control: "toggle", label: Publr.t("Caption"), setting: "showCaption", default: true, role: "content", clears: "caption" },
    { control: "toggle", label: Publr.t("Playback controls"), setting: "controls", default: true },
    { control: "toggle", label: Publr.t("Autoplay"), setting: "autoplay", default: false, help: Publr.t("Autoplaying video plays muted and inline.") },
    { control: "toggle", label: Publr.t("Loop"), setting: "loop", default: false },
    { control: "toggle", label: Publr.t("Muted"), setting: "muted", default: false },
    { control: "toggle", label: Publr.t("Play inline"), setting: "playsInline", default: false },
    {
      control: "select",
      label: Publr.t("Preload"),
      setting: "preload",
      default: "metadata",
      options: [
        { value: "auto", label: Publr.t("Auto") },
        { value: "metadata", label: Publr.t("Metadata") },
        { value: "none", label: Publr.t("None") },
      ],
    },
    { control: "url", label: Publr.t("Poster image URL"), setting: "poster", default: "", placeholder: "https://…/poster.jpg" },
  ],
  carriers: { caption: { placeholder: Publr.t("Add caption") } },
  selectOnClick: true,
  toolbar: [
    { control: "replace", label: Publr.t("Replace"), field: "video" },
    { control: "caption", label: Publr.t("Caption"), field: "caption", setting: "showCaption" },
  ],
};
