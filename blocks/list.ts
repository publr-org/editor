// List: a ul/ol root that is both the `tag` carrier and the children slot of list items.
// "Reverse order", "Start value" and "Numbering style" are island-canonical and apply to
// ol only; the `reversed`/`start`/`type` attributes and the list-style class are derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { clamp, pick } from "./values";
import { TEXT } from "./supports";

const MARKER: Record<string, string> = {
  "1": "list-decimal",
  a: "list-[lower-alpha]",
  A: "list-[upper-alpha]",
  i: "list-[lower-roman]",
  I: "list-[upper-roman]",
};

export const definition: BlockDefinition = {
  label: Publr.t("List"),
  supports: TEXT,
  icon: "list",
  category: "text",
  description: Publr.t("An organized collection of items, bulleted or numbered."),
  render(fields, settings) {
    if (fields.tag !== "ol") return `<ul data-pb-block="list" data-pb-tag="tag" data-pb-children class="list-disc pl-6"></ul>`;
    const type = pick(MARKER, settings.type, "") ? String(settings.type) : "1";
    const start = clamp(settings.start, 1, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    const attrs = (settings.reversed === true ? " reversed" : "") + (start !== 1 ? ` start="${start}"` : "") + (type !== "1" ? ` type="${type}"` : "");
    return `<ol data-pb-block="list" data-pb-tag="tag" data-pb-children class="${MARKER[type]} pl-6"${attrs}></ol>`;
  },
  settings: [
    {
      control: "toggle-group",
      label: Publr.t("List style"),
      field: "tag",
      role: "structure",
      options: [
        { value: "ul", label: Publr.t("Unordered"), icon: "list-unordered" },
        { value: "ol", label: Publr.t("Ordered"), icon: "list-ordered" },
      ],
    },
    { control: "toggle", label: Publr.t("Reverse order"), setting: "reversed", default: false, role: "structure", when: (_settings, fields) => fields.tag === "ol" },
    { control: "number", label: Publr.t("Start value"), setting: "start", default: 1, step: 1, role: "structure", when: (_settings, fields) => fields.tag === "ol" },
    {
      control: "select",
      label: Publr.t("Numbering style"),
      setting: "type",
      default: "1",
      role: "structure",
      when: (_settings, fields) => fields.tag === "ol",
      options: [
        { value: "1", label: Publr.t("Numbers (1 2 3)") },
        { value: "a", label: Publr.t("Lowercase letters (a b c)") },
        { value: "A", label: Publr.t("Uppercase letters (A B C)") },
        { value: "i", label: Publr.t("Lowercase Roman (i ii iii)") },
        { value: "I", label: Publr.t("Uppercase Roman (I II III)") },
      ],
    },
  ],
  allow: { children: ["list-item"] },
  template: { children: ["list-item"] },
  toolbar: [
    { control: "field-options", label: Publr.t("List style"), field: "tag", options: [{ value: "ul", label: Publr.t("Unordered"), icon: "list-unordered" }, { value: "ol", label: Publr.t("Ordered"), icon: "list-ordered" }] },
    { control: "add-child", label: Publr.t("Add list item"), type: "list-item" },
  ],
};
