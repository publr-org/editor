// A template slot: where a document's own values go in its template. `content` takes the
// document's blocks, `title` its title, `featured-image` its featured image. Offered
// only while editing a template.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { pick, str } from "./values";

const SLOTS: Record<string, string> = { content: "content", title: "title", "featured-image": "featured-image" };
// The element the slot is: a title slot is a heading, a content slot a section or a div.
const TAGS = ["div", "section", "article", "main", "header", "h1", "h2", "h3", "p", "figure"];

export const definition: BlockDefinition = {
  label: Publr.t("Template slot"),
  icon: "layout",
  category: "design",
  description: Publr.t("Where each page fills in its own content."),
  templateOnly: true,
  selectOnClick: true,
  settings: [
    { control: "select", label: Publr.t("HTML element"), field: "tag", role: "structure", options: TAGS.map((tag) => ({ value: tag, label: tag })) },
    {
      control: "select",
      label: Publr.t("Slot"),
      setting: "slot",
      default: "content",
      role: "structure",
      options: [
        { value: "content", label: Publr.t("Content") },
        { value: "title", label: Publr.t("Title") },
        { value: "featured-image", label: Publr.t("Featured image") },
      ],
    },
  ],
  render(fields, settings) {
    const tag = TAGS.includes(str(fields.tag)) ? str(fields.tag) : "div";
    return `<${tag} data-pb-block="template-slot" data-pb-tag="tag" data-publr-slot="${pick(SLOTS, settings.slot, "content")}"></${tag}>`;
  },
};
