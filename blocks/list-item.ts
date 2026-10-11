// List item: one li with a rich `content` carrier. Internal: created by its list's
// template and by Enter, which splits into a sibling item. No settings.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";
import { TEXT } from "./supports";

export const definition: BlockDefinition = {
  label: Publr.t("List item"),
  supports: TEXT,
  icon: "list-item",
  category: "text",
  description: Publr.t("One item of a list."),
  internal: true,
  render(fields) {
    return `<li data-pb-block="list-item" data-pb-rich="content">${str(fields.content)}</li>`;
  },
  carriers: { content: { placeholder: Publr.t("List item") } },
  splitSame: true,
};
