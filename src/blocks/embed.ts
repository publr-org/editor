// Embed block — an iframe embed with caption (deliberately without
// oEmbed machinery: without a CMS there is no URL→embed resolution, so
// the field holds the EMBED url itself — what oEmbed would have resolved
// to). The iframe reuses the image carrier for src/dims (the video trick).
// Provider variations would be inserter presets over one block — variations
// machinery doesn't exist here yet, and the provider is derivable from the
// url anyway (documented scope decision). `responsive` derives the
// aspect-ratio classes.

import { escAttr, str } from "../carriers";
import type { ImageValue } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";
import { MEDIA_SUPPORTS } from "./supports";

export const type = "embed";

export const definition: BlockDefinition = {
  label: "Embed",
  category: "Widgets",
  icon: "globe",
  placeholder: "Add caption",
  description: "Embed external content — videos, maps, posts — via its embed URL.",
  supports: MEDIA_SUPPORTS,
  toolbar: [
    { control: "replace", label: "Replace", field: "media" },
    { control: "caption", label: "Caption", field: "caption", setting: "showCaption" },
  ],
  settings: [
    { control: "media", label: "Embed", field: "media", role: "content" },
    {
      control: "toggle",
      label: "Caption",
      setting: "showCaption",
      default: false,
      role: "content",
    },
    { control: "toggle", label: "Responsive (16:9)", setting: "responsive", default: true },
  ],
  render(fields: Fields, settings?: Settings) {
    const m = (fields.media ?? {}) as Partial<ImageValue>;
    const dims =
      (m.width ? ` width="${escAttr(m.width)}"` : "") +
      (m.height ? ` height="${escAttr(m.height)}"` : "");
    const responsive = settings?.responsive === false ? "" : ` class="aspect-video w-full"`;
    const caption = str(fields.caption);
    const showCaption =
      settings === undefined || settings.showCaption === true || caption.trim() !== "";
    const figcaption = showCaption
      ? `<figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-muted-foreground">${caption}</figcaption>`
      : "";
    return `<figure data-pb-block="embed"><iframe data-pb-image="media" src="${escAttr(m.src ?? "")}" alt="${escAttr(m.alt ?? "")}"${dims}${responsive} loading="lazy" allowfullscreen></iframe>${figcaption}</figure>`;
  },
};
