// Audio: a figure with an `<audio>` reusing the image carrier (`audio` field) and an
// always-present caption. `controls` is always emitted; autoplay, loop and preload are
// island-canonical and their attributes derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { captionOf, figcaption, mediaAttrs, pick } from "./values";
import { MEDIA } from "./supports";

const PRELOAD: Record<string, string> = { auto: ` preload="auto"`, none: ` preload="none"` };

export const definition: BlockDefinition = {
  label: Publr.t("Audio"),
  supports: MEDIA,
  icon: "audio",
  category: "media",
  description: Publr.t("Embed a simple audio player."),
  render(fields, settings) {
    const attrs =
      " controls" + (settings.autoplay === true ? " autoplay" : "") + (settings.loop === true ? " loop" : "") + pick(PRELOAD, settings.preload, "");
    return `<figure data-pb-block="audio"><audio data-pb-image="audio" ${mediaAttrs(fields.audio)}${attrs} class="block w-full"></audio>${captionOf(fields.caption, settings.showCaption)}</figure>`;
  },
  settings: [
    { control: "media", label: Publr.t("Audio"), field: "audio", role: "content" },
    { control: "toggle", label: Publr.t("Caption"), setting: "showCaption", default: true, role: "content", clears: "caption" },
    { control: "toggle", label: Publr.t("Autoplay"), setting: "autoplay", default: false },
    { control: "toggle", label: Publr.t("Loop"), setting: "loop", default: false },
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
  ],
  carriers: { caption: { placeholder: Publr.t("Add caption") } },
  selectOnClick: true,
  toolbar: [
    { control: "replace", label: Publr.t("Replace"), field: "audio" },
    { control: "caption", label: Publr.t("Caption"), field: "caption", setting: "showCaption" },
  ],
};
