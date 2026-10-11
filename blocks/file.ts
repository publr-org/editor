// File: a link to a downloadable file. The main anchor carries the rich `name` and the
// `href` link; the download button's label is the `downloadLabel` text field and its
// href mirrors `href`. `showDownloadButton` and `linkTarget` are island-canonical; the
// button's `hidden` class and the anchor's `target`/`rel` are derived.
import { Publr } from "publr-jsx";
import { escapeAttr, escapeHtml } from "../model/carriers";
import type { BlockDefinition } from "../model/registry";
import { LINK_TARGETS, linkAttrs, str } from "./values";
import { MEDIA } from "./supports";

export const definition: BlockDefinition = {
  label: Publr.t("File"),
  supports: MEDIA,
  icon: "file",
  category: "media",
  description: Publr.t("Add a link to a downloadable file."),
  render(fields, settings) {
    const href = escapeAttr(str(fields.href));
    const label = fields.downloadLabel === undefined ? "Download" : str(fields.downloadLabel);
    const hidden = settings.showDownloadButton === false ? " hidden" : "";
    return (
      `<div data-pb-block="file" class="flex items-center justify-between gap-4 rounded-sm bg-neutral-100 px-4 py-3">` +
      `<a data-pb-rich="name" data-pb-link="href" href="${href}"${linkAttrs(settings.linkTarget, "")} class="min-w-0 font-semibold [overflow-wrap:anywhere] text-inherit no-underline">${str(fields.name)}</a>` +
      `<a href="${href}" download data-pb-text="downloadLabel" class="flex-none rounded-sm bg-[var(--color-accent,#3858e9)] px-3.5 py-1.5 text-[13px] font-semibold text-white no-underline${hidden}">${escapeHtml(label)}</a></div>`
    );
  },
  settings: [
    { control: "url", label: Publr.t("File URL"), field: "href", placeholder: "https://…/file.pdf", role: "content" },
    { control: "toggle", label: Publr.t("Show download button"), setting: "showDownloadButton", default: true, role: "design" },
    { control: "text", label: Publr.t("Download button text"), field: "downloadLabel", role: "content", when: (settings) => settings.showDownloadButton !== false },
    { control: "select", label: Publr.t("Open in"), setting: "linkTarget", default: "none", role: "content", options: LINK_TARGETS },
  ],
  carriers: { name: { placeholder: Publr.t("File name…") }, downloadLabel: { split: false } },
  selectOnClick: true,
  toolbar: [
    { control: "link", label: Publr.t("Link"), field: "href", targetSetting: "linkTarget", role: "content" },
    { control: "copy", label: Publr.t("Copy URL"), field: "href", role: "content" },
    { control: "toggle-setting", label: Publr.t("Download button"), setting: "showDownloadButton", role: "design" },
  ],
};
