// Image block — figure root, img with all four image-carrier attributes,
// always-present figcaption. The link wrapper is a
// SETTING, not a field: a field's carrier must always be emitted, but the
// <a> exists only when `href` is set — the render derives it (escaped) and
// upcast reads it from the island, never the anchor. Aspect ratio uses
// "/"-free tokens (square, 4-3, 16-9…). Legacy bare <img data-pb-block>
// roots still ingest permissively (carriers found on the root itself);
// downcast normalizes them to the figure form.
//
// Deliberately not modeled: blob/id/sizeSlug (media library),
// lightbox (interactivity runtime), title, rel/linkClass/linkDestination,
// focalPoint (lens/JIT territory).

import { escAttr, str } from "../carriers";
import type { ImageValue } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";
import { MEDIA_SUPPORTS } from "./supports";

// ratio token → utility classes on the root, scoped to the img (inner
// derived classes regenerate every render; only ROOT classes join the
// authored-classes baseline)
const RATIO_CLASS: Record<string, string> = {
  square: "[&_img]:aspect-square [&_img]:w-full",
  "4-3": "[&_img]:aspect-[4/3] [&_img]:w-full",
  "3-2": "[&_img]:aspect-[3/2] [&_img]:w-full",
  "16-9": "[&_img]:aspect-video [&_img]:w-full",
};

export const type = "image";

export const definition: BlockDefinition = {
  label: "Image",
  category: "Media",
  icon: "image",
  placeholder: "Add caption",
  description: "Insert an image to make a visual statement.",
  supports: MEDIA_SUPPORTS,
  // Authored classes size the IMG, not the caption <figure> that wraps it — a
  // pasted `<img class="h-11">` (real-world templates put sizing on the img)
  // must render as a 44px image, never a 44px figure with an overflowing img.
  classTarget: "img",
  // Toolbar controls (the floating strip, story #3xx): the image swaps the
  // generic align/format segment for its own — swap the media, link the whole
  // image, toggle the caption. Each reuses a setting/field declared below.
  toolbar: [
    { control: "replace", label: "Replace", field: "image", icon: "replace" },
    { control: "link", label: "Link", setting: "href", targetSetting: "linkTarget" },
    { control: "caption", label: "Caption", field: "caption", setting: "showCaption" },
    {
      control: "toggle-setting",
      label: "Decorative",
      setting: "isDecorative",
      icon: "decorative",
      role: "content",
    },
  ],
  settings: [
    { control: "media", label: "Image", field: "image", role: "content" },
    {
      control: "toggle",
      label: "Decorative image",
      setting: "isDecorative",
      default: false,
      role: "content",
      help: "Mark the image as presentational so assistive technology skips it without discarding its saved description.",
    },
    {
      control: "text",
      label: "Link URL",
      setting: "href",
      default: "",
      placeholder: "https://…",
      role: "content",
    },
    // Caption visibility — the toolbar's caption toggle writes this; the render
    // shows the figcaption when it is true (or the caption already has content).
    {
      control: "toggle",
      label: "Caption",
      setting: "showCaption",
      default: false,
      role: "content",
    },
    {
      control: "select",
      label: "Open in",
      setting: "linkTarget",
      default: "none",
      role: "content",
      when: { setting: "href", notEquals: "" },
      options: [
        { value: "none", label: "Same tab" },
        { value: "_blank", label: "New tab" },
      ],
    },
    {
      control: "text",
      label: "Link rel",
      setting: "rel",
      default: "",
      role: "advanced",
      when: { setting: "href", notEquals: "" },
      help: "Space-separated relationship values such as nofollow or sponsored.",
    },
    {
      control: "text",
      label: "Title attribute",
      setting: "title",
      default: "",
      role: "advanced",
    },
    {
      control: "select",
      label: "Aspect ratio",
      setting: "aspectRatio",
      default: "auto",
      role: "design",
      options: [
        { value: "auto", label: "Original" },
        { value: "square", label: "Square (1:1)" },
        { value: "4-3", label: "Standard (4:3)" },
        { value: "3-2", label: "Classic (3:2)" },
        { value: "16-9", label: "Wide (16:9)" },
      ],
    },
    {
      control: "select",
      label: "Scale",
      setting: "scale",
      default: "cover",
      role: "design",
      when: { setting: "aspectRatio", notEquals: "auto" },
      help: "Choose how the image fits inside the selected aspect ratio.",
      options: [
        { value: "cover", label: "Cover" },
        { value: "contain", label: "Contain" },
      ],
    },
  ],
  render(fields: Fields, settings?: Settings) {
    const img = (fields.image ?? {}) as Partial<ImageValue>;
    const dims =
      (img.width ? ` width="${escAttr(img.width)}"` : "") +
      (img.height ? ` height="${escAttr(img.height)}"` : "");
    // `block max-w-full` = a responsive default; height is left UNSET (the
    // img's natural default) so an authored height utility (h-11, h-64…) on
    // the classTarget wins without fighting a baseline `h-auto`.
    const decorative =
      settings?.isDecorative === true ? ` role="presentation" aria-hidden="true"` : "";
    const imgTag = `<img data-pb-image="image" src="${escAttr(img.src ?? "")}" alt="${escAttr(img.alt ?? "")}"${dims}${decorative} class="block max-w-full">`;
    const href = typeof settings?.href === "string" ? settings.href.trim() : "";
    const authoredRel = typeof settings?.rel === "string" ? settings.rel.trim() : "";
    const rel = [settings?.linkTarget === "_blank" ? "noopener" : "", authoredRel]
      .filter(Boolean)
      .join(" ");
    const linkAttrs =
      (settings?.linkTarget === "_blank" ? ` target="_blank"` : "") +
      (rel ? ` rel="${escAttr(rel)}"` : "") +
      (typeof settings?.title === "string" && settings.title.trim()
        ? ` title="${escAttr(settings.title.trim())}"`
        : "");
    const media = href ? `<a href="${escAttr(href)}"${linkAttrs}>${imgTag}</a>` : imgTag;
    const ratio = RATIO_CLASS[String(settings?.aspectRatio)] ?? "";
    const scale = ratio
      ? settings?.scale === "contain"
        ? " [&_img]:object-contain"
        : " [&_img]:object-cover"
      : "";
    // The caption is shown when toggled on OR already carries content (an
    // authored caption never vanishes). `settings === undefined` is the
    // registration probe — always emit the carrier there so the `caption`
    // FIELD is discovered; real renders (settings always filled for this type)
    // honor the toggle.
    const caption = str(fields.caption);
    const showCaption =
      settings === undefined || settings.showCaption === true || caption.trim() !== "";
    const figcaption = showCaption
      ? `<figcaption data-pb-rich="caption" class="mt-1.5 text-center text-sm text-muted-foreground">${caption}</figcaption>`
      : "";
    return `<figure data-pb-block="image"${ratio ? ` class="${ratio}${scale}"` : ""}>${media}${figcaption}</figure>`;
  },
};
