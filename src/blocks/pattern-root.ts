// Pattern root — the PHANTOM block a pattern stamp wraps its blocks in
// (thoughts/011, story #397). It gives the instance a real node: the tree
// shows the pattern (not "just a group"), identity and future template-only
// options hang off it, and chrome anchors Reset/Edit original to it. In the
// PUBLISHED output it does not exist — phantom: the data pipeline unwraps
// it, its children take its place.
//
// internal: never offered by inserters — instances are created by stamping
// (editor.insertPattern / replaceWithPattern), nothing else.

import type { BlockDefinition } from "../registry";

export const type = "pattern";

export const definition: BlockDefinition = {
  label: "Pattern",
  icon: "pattern",
  description: "A pattern instance. Edits here never change the original design.",
  internal: true,
  phantom: true,
  settings: [
    {
      control: "text",
      label: "Color style",
      setting: "colorContext",
      default: "",
      role: "design",
    },
    {
      control: "text",
      label: "Pattern variant",
      setting: "variant",
      default: "",
      role: "design",
    },
  ],
  render() {
    return `<div data-pb-block="pattern" data-pb-children></div>`;
  },
};
