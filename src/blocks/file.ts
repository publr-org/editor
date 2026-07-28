// File block — a link to a downloadable file: main
// anchor carrying the filename (rich) + href (link carrier), and a
// download-button anchor whose label is a text field. The button anchor is
// ALWAYS emitted (its label is a field — a carrier must always exist);
// `showDownloadButton` hides it with a derived class on the button itself.
// Its href mirrors the link field as derived output, regenerated every
// render, ignored on upcast.
//
// Deliberately not modeled: id/blob (media library), fileId
// (aria-describedby plumbing), textLinkHref/textLinkTarget (one href serves
// both anchors), displayPreview/previewHeight (inline PDF embed, deferred).

import { escAttr, escHtml, str } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";
import { MEDIA_SUPPORTS } from "./supports";

export const type = "file";

export const definition: BlockDefinition = {
  label: "File",
  category: "Media",
  icon: "file",
  placeholder: "File name…",
  description: "Add a link to a downloadable file.",
  supports: MEDIA_SUPPORTS,
  toolbar: [
    {
      control: "link",
      label: "Link",
      field: "href",
      targetSetting: "linkTarget",
      role: "content",
    },
    { control: "copy", label: "Copy URL", field: "href", role: "content" },
    {
      control: "toggle-setting",
      label: "Download button",
      setting: "showDownloadButton",
      role: "design",
    },
  ],
  settings: [
    {
      control: "text",
      label: "File URL",
      field: "href",
      placeholder: "https://…/file.pdf",
      role: "content",
    },
    {
      control: "toggle",
      label: "Show download button",
      setting: "showDownloadButton",
      default: true,
      role: "design",
    },
    {
      control: "text",
      label: "Download button text",
      field: "downloadLabel",
      role: "content",
      when: { setting: "showDownloadButton", equals: true },
    },
    {
      control: "select",
      label: "Open in",
      setting: "linkTarget",
      default: "none",
      role: "content",
      options: [
        { value: "none", label: "Same tab" },
        { value: "_blank", label: "New tab" },
      ],
    },
  ],
  render(fields: Fields, settings?: Settings) {
    const href = escAttr(str(fields.href));
    const hideBtn = settings?.showDownloadButton === false ? " hidden" : "";
    const target = settings?.linkTarget === "_blank" ? ` target="_blank" rel="noopener"` : "";
    return (
      `<div data-pb-block="file" class="flex items-center justify-between gap-4 rounded-sm bg-muted-surface px-4 py-3">` +
      `<a data-pb-rich="name" data-pb-link="href" href="${href}"${target} class="min-w-0 font-semibold [overflow-wrap:anywhere] text-inherit no-underline">${str(fields.name)}</a>` +
      `<a href="${href}" download data-pb-text="downloadLabel" class="flex-none rounded-sm bg-accent-surface px-3.5 py-1.5 text-[13px] font-semibold text-accent-foreground no-underline${hideBtn}">${escHtml(fields.downloadLabel === undefined ? "Download" : str(fields.downloadLabel))}</a></div>`
    );
  },
};
