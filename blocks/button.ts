// Button: a button-style link, an anchor root carrying the rich `label` and the `url`
// link. `style`, `linkTarget`, `rel` and `title` are island-canonical; the class list
// and the `target`, `rel` and `title` attributes are derived.
import { Publr } from "publr-jsx";
import { escapeAttr } from "../model/carriers";
import type { BlockDefinition } from "../model/registry";
import { LINK_TARGETS, linkAttrs, pick, str } from "./values";
import { TEXT } from "./supports";

const STYLE: Record<string, string> = {
  solid: "inline-block rounded-sm bg-[var(--color-accent,#3858e9)] px-4 py-2 font-medium text-white no-underline",
  outline: "inline-block rounded-sm border border-current px-4 py-2 font-medium text-[var(--color-accent,#3858e9)] no-underline",
  link: "inline-block no-underline",
};

export const definition: BlockDefinition = {
  label: Publr.t("Button"),
  supports: TEXT,
  icon: "button",
  category: "design",
  description: Publr.t("Prompt visitors to take action with a button-style link."),
  render(fields, settings) {
    const attrs = linkAttrs(settings.linkTarget, settings.rel, settings.title);
    return `<a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="${escapeAttr(str(fields.url))}"${attrs} class="${pick(STYLE, settings.style, STYLE.solid)}">${str(fields.label)}</a>`;
  },
  settings: [
    {
      control: "toggle-group",
      label: Publr.t("Style"),
      setting: "style",
      default: "solid",
      role: "design",
      options: [
        { value: "solid", label: Publr.t("Solid") },
        { value: "outline", label: Publr.t("Outline") },
        { value: "link", label: Publr.t("Link") },
      ],
    },
    { control: "text", label: Publr.t("Link URL"), field: "url", placeholder: "https://…", role: "content" },
    { control: "select", label: Publr.t("Open in"), setting: "linkTarget", default: "none", role: "content", options: LINK_TARGETS },
    { control: "text", label: Publr.t("Link rel"), setting: "rel", default: "", placeholder: Publr.t("e.g. nofollow"), role: "advanced" },
    { control: "text", label: Publr.t("Title attribute"), setting: "title", default: "", role: "advanced" },
  ],
  carriers: { label: { placeholder: Publr.t("Add text…") } },
  toolbar: [
    { control: "link", label: Publr.t("Link"), field: "url", targetSetting: "linkTarget", role: "content" },
  ],
};
