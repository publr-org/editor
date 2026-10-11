// Embed: an iframe whose `media` image carrier holds the embed URL and size, plus an
// always-present caption. There is no oEmbed lookup: the field is the embed URL itself.
// `responsive` is island-canonical; the 16:9 aspect classes are derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { captionOf, figcaption, mediaAttrs } from "./values";
import { MEDIA } from "./supports";

export const definition: BlockDefinition = {
  label: Publr.t("Embed"),
  supports: MEDIA,
  icon: "globe",
  category: "widgets",
  description: Publr.t("Embed videos, maps or posts by their embed URL."),
  render(fields, settings) {
    const responsive = settings.responsive === false ? "" : ` class="aspect-video w-full"`;
    return `<figure data-pb-block="embed"><iframe data-pb-image="media" ${mediaAttrs(fields.media)}${responsive} loading="lazy" allowfullscreen></iframe>${captionOf(fields.caption, settings.showCaption)}</figure>`;
  },
  settings: [
    { control: "media", label: Publr.t("Embed"), field: "media", role: "content" },
    { control: "toggle", label: Publr.t("Caption"), setting: "showCaption", default: true, role: "content", clears: "caption" },
    { control: "toggle", label: Publr.t("Responsive (16:9)"), setting: "responsive", default: true, role: "design" },
  ],
  carriers: { caption: { placeholder: Publr.t("Add caption") } },
  selectOnClick: true,
  toolbar: [
    { control: "replace", label: Publr.t("Replace"), field: "media" },
    { control: "caption", label: Publr.t("Caption"), field: "caption", setting: "showCaption" },
  ],
};
