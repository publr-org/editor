// The core blocks. Importing registers nothing: a host calls `registerCoreBlocks()` once,
// and the order of `coreBlockTypes` is the inserter's order.
import type { BlockDefinition } from "../model/registry";
import { registerBlock } from "../model/registry";
import { definition as accordion } from "./accordion";
import { definition as accordionItem } from "./accordion-item";
import { definition as audio } from "./audio";
import { definition as button } from "./button";
import { definition as buttons } from "./buttons";
import { definition as code } from "./code";
import { definition as column } from "./column";
import { definition as columns } from "./columns";
import { definition as cover } from "./cover";
import { definition as details } from "./details";
import { definition as embed } from "./embed";
import { definition as file } from "./file";
import { definition as gallery } from "./gallery";
import { definition as group } from "./group";
import { definition as heading } from "./heading";
import { definition as html } from "./html";
import { definition as icon } from "./icon";
import { definition as image } from "./image";
import { definition as list } from "./list";
import { definition as listItem } from "./list-item";
import { definition as math } from "./math";
import { definition as mediaText } from "./media-text";
import { definition as paragraph } from "./paragraph";
import { definition as pattern } from "./pattern";
import { definition as preformatted } from "./preformatted";
import { definition as pullquote } from "./pullquote";
import { definition as quote } from "./quote";
import { definition as separator } from "./separator";
import { definition as spacer } from "./spacer";
import { definition as table } from "./table";
import { definition as templatePart } from "./template-part";
import { definition as templateSlot } from "./template-slot";
import { definition as verse } from "./verse";
import { definition as video } from "./video";

const CORE: readonly (readonly [string, BlockDefinition])[] = [
  ["heading", heading],
  ["paragraph", paragraph],
  ["list", list],
  ["list-item", listItem],
  ["quote", quote],
  ["pullquote", pullquote],
  ["code", code],
  ["preformatted", preformatted],
  ["verse", verse],
  ["table", table],
  ["details", details],
  ["math", math],
  ["image", image],
  ["video", video],
  ["audio", audio],
  ["cover", cover],
  ["gallery", gallery],
  ["file", file],
  ["media-text", mediaText],
  ["icon", icon],
  ["button", button],
  ["buttons", buttons],
  ["separator", separator],
  ["spacer", spacer],
  ["accordion", accordion],
  ["accordion-item", accordionItem],
  ["embed", embed],
  ["html", html],
  ["columns", columns],
  ["column", column],
  ["group", group],
  ["pattern", pattern],
  ["template-part", templatePart],
  ["template-slot", templateSlot],
];

export const coreBlockTypes: readonly string[] = CORE.map(([type]) => type);

export function registerCoreBlocks(): void {
  for (const [type, definition] of CORE) registerBlock(type, definition);
}
