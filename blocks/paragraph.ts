// Paragraph: the basic narrative block, one rich `body` carrier. `dropCap` and
// `direction` are island-canonical; the first-letter classes and `dir` are derived.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { pick, str } from "./values";
import { TEXT } from "./supports";

const DROP_CAP = "first-letter:float-left first-letter:pr-2 first-letter:text-[3.4em] first-letter:leading-[0.85] first-letter:font-bold";

const DIR: Record<string, string> = { ltr: ` dir="ltr"`, rtl: ` dir="rtl"` };

export const definition: BlockDefinition = {
  label: Publr.t("Paragraph"),
  supports: TEXT,
  variations: [
    { name: "display", label: Publr.t("Display"), classes: "text-3xl font-bold leading-tight" },
    { name: "subtitle", label: Publr.t("Subtitle"), classes: "text-lg text-muted-foreground" },
    { name: "annotation", label: Publr.t("Annotation"), classes: "text-sm italic text-muted-foreground" },
  ],
  icon: "paragraph",
  category: "text",
  description: Publr.t("Start with the basic building block of all narrative."),
  render(fields, settings) {
    const dir = pick(DIR, settings.direction, "");
    const drop = settings.dropCap === true ? ` class="${DROP_CAP}"` : "";
    return `<p data-pb-block="paragraph" data-pb-rich="body"${dir}${drop}>${str(fields.body)}</p>`;
  },
  settings: [
    { control: "toggle", label: Publr.t("Drop cap"), setting: "dropCap", default: false, role: "design" },
    {
      control: "toggle-group",
      label: Publr.t("Text direction"),
      setting: "direction",
      default: "auto",
      role: "advanced",
      options: [
        { value: "auto", label: Publr.t("Auto") },
        { value: "ltr", label: "LTR" },
        { value: "rtl", label: "RTL" },
      ],
    },
  ],
  carriers: { body: { placeholder: Publr.t("Type / to choose a block") } },
  transforms: ["heading", "quote", "pullquote", "preformatted", "verse", "code"],
  toolbar: [
    { control: "text-align", label: Publr.t("Align text") },
  ],
};
