// Audio block — figure root, <audio> reusing the `image` carrier for src
// (same trick as video: the implied alt/width/height are non-standard on
// <audio> but inert), plus an always-present figcaption. `controls` is
// always emitted — deliberately not an attribute: the player always
// shows controls.
//
// Deliberately not modeled: blob/id (media library / upload state).

import { escAttr, str } from "../carriers";
import type { ImageValue } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";
import { MEDIA_SUPPORTS } from "./supports";

const PRELOAD = ["auto", "metadata", "none"];

export const type = "audio";

export const definition: BlockDefinition = {
  label: "Audio",
  category: "Media",
  icon: "audio",
  placeholder: "Add caption",
  description: "Embed a simple audio player.",
  supports: MEDIA_SUPPORTS,
  toolbar: [
    { control: "replace", label: "Replace", field: "audio" },
    { control: "caption", label: "Caption", field: "caption", setting: "showCaption" },
  ],
  settings: [
    { control: "media", label: "Audio", field: "audio", role: "content" },
    {
      control: "toggle",
      label: "Caption",
      setting: "showCaption",
      default: false,
      role: "content",
    },
    { control: "toggle", label: "Autoplay", setting: "autoplay", default: false },
    { control: "toggle", label: "Loop", setting: "loop", default: false },
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
  ],
  render(fields: Fields, settings?: Settings) {
    const a = (fields.audio ?? {}) as Partial<ImageValue>;
    const dims =
      (a.width ? ` width="${escAttr(a.width)}"` : "") +
      (a.height ? ` height="${escAttr(a.height)}"` : "");
    let attrs = " controls";
    if (settings?.autoplay === true) attrs += " autoplay";
    if (settings?.loop === true) attrs += " loop";
    const preload = String(settings?.preload);
    if (PRELOAD.includes(preload) && preload !== "metadata") attrs += ` preload="${preload}"`;
    const caption = str(fields.caption);
    const showCaption =
      settings === undefined || settings.showCaption === true || caption.trim() !== "";
    const figcaption = showCaption
      ? `<figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-muted-foreground">${caption}</figcaption>`
      : "";
    return `<figure data-pb-block="audio"><audio data-pb-image="audio" src="${escAttr(a.src ?? "")}" alt="${escAttr(a.alt ?? "")}"${dims}${attrs} class="block w-full"></audio>${figcaption}</figure>`;
  },
};
