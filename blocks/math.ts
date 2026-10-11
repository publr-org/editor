// Math: a MathML root whose one rich `math` carrier holds the formula markup. Enter
// never splits a formula. No settings.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";
import { str } from "./values";

const EMPTY_MATH = "<mrow><msup><mi>x</mi><mn>2</mn></msup></mrow>";

export const definition: BlockDefinition = {
  label: Publr.t("Math"),
  icon: "math",
  category: "text",
  description: Publr.t("Display mathematical notation written in MathML."),
  render(fields) {
    const math = fields.math === undefined ? EMPTY_MATH : str(fields.math);
    return `<math data-pb-block="math" data-pb-rich="math" display="block" class="block py-2 text-center">${math}</math>`;
  },
  carriers: { math: { split: false } },
};
