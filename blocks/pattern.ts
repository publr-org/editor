// The pattern root: the editor-side identity of a stamped pattern copy. It is a real node
// while editing (a list-view row, a sidebar card naming the pattern, the target of Edit
// pattern) and nothing at all in the data pipeline, which publishes its children in its
// place. Its provenance rides on `data-pb-pattern`; copies are decoupled, never synced.
import { Publr } from "publr-jsx";
import type { BlockDefinition } from "../model/registry";

export const definition: BlockDefinition = {
  label: Publr.t("Pattern"),
  icon: "pattern",
  category: "design",
  description: Publr.t("A copy of a pattern: edit it freely, the library design never changes it."),
  phantom: true,
  render() {
    return `<div data-pb-block="pattern" data-pb-children></div>`;
  },
};
