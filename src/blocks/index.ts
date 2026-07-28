// Core block library — one file per block, each exporting { type, definition }.
// registerCoreBlocks/registerCorePatterns are re-exported from src/index.ts so
// the one-file library build is batteries-included (a CMS embedding the dist
// bundle needs the block set inside the artifact), but registration stays the
// host's explicit call: nothing registers as a side effect, and ESM consumers
// can still cherry-pick.
//
// Even these "core" blocks go through the public registration API — there is
// no privileged path: Publr core, plugins, and the devtools console all call
// registerBlock the same way.

import { registerBlock } from "../registry";
import type { BlockDefinition } from "../registry";

// text
import * as heading from "./heading";
import * as paragraph from "./paragraph";
import * as list from "./list";
import * as listItem from "./list-item";
import * as quote from "./quote";
import * as pullquote from "./pullquote";
import * as code from "./code";
import * as preformatted from "./preformatted";
import * as verse from "./verse";
import * as table from "./table";
import * as details from "./details";
import * as math from "./math";
// media
import * as image from "./image";
import * as video from "./video";
import * as audio from "./audio";
import * as cover from "./cover";
import * as gallery from "./gallery";
import * as file from "./file";
import * as mediaText from "./media-text";
import * as icon from "./icon";
// design
import * as button from "./button";
import * as buttons from "./buttons";
import * as separator from "./separator";
import * as spacer from "./spacer";
import * as accordion from "./accordion";
import * as accordionItem from "./accordion-item";
// widgets
import * as embed from "./embed";
import * as html from "./html";
// design (containers)
import * as patternRoot from "./pattern-root";
import * as templatePart from "./template-part";
import * as templateSlot from "./template-slot";
import * as columns from "./columns";
import * as column from "./column";
import * as group from "./group";

/** [type, definition] in registration (= inserter) order. */
export const coreBlocks: readonly (readonly [string, BlockDefinition])[] = [
  [heading.type, heading.definition],
  [paragraph.type, paragraph.definition],
  [list.type, list.definition],
  [listItem.type, listItem.definition],
  [quote.type, quote.definition],
  [pullquote.type, pullquote.definition],
  [code.type, code.definition],
  [preformatted.type, preformatted.definition],
  [verse.type, verse.definition],
  [table.type, table.definition],
  [details.type, details.definition],
  [math.type, math.definition],
  [image.type, image.definition],
  [video.type, video.definition],
  [audio.type, audio.definition],
  [cover.type, cover.definition],
  [gallery.type, gallery.definition],
  [file.type, file.definition],
  [mediaText.type, mediaText.definition],
  [icon.type, icon.definition],
  [button.type, button.definition],
  [buttons.type, buttons.definition],
  [separator.type, separator.definition],
  [spacer.type, spacer.definition],
  [accordion.type, accordion.definition],
  [accordionItem.type, accordionItem.definition],
  [embed.type, embed.definition],
  [html.type, html.definition],
  [columns.type, columns.definition],
  [column.type, column.definition],
  [group.type, group.definition],
  [patternRoot.type, patternRoot.definition],
  [templatePart.type, templatePart.definition],
  [templateSlot.type, templateSlot.definition],
];

/** Register the whole core set (idempotence is the caller's business — registerBlock throws on duplicates). */
export function registerCoreBlocks(): void {
  for (const [type, definition] of coreBlocks) registerBlock(type, definition);
}

// The core pattern set lives beside the blocks it composes (core-patterns.ts);
// registration validates against the block registry, so call it AFTER
// registerCoreBlocks().
export { CORE_PATTERNS, registerCorePatterns } from "./core-patterns";
