// Generate the CMS demo theme from the editor's canonical Hearth system.
// Bundle this file with Rolldown, then run the bundle with the CMS theme
// directory as argv[2]. Keeping generation here prevents the standalone demo
// and the CMS starter theme from becoming separate design systems.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOMEPAGE_PATTERNS } from "../src/blocks/homepage-patterns";
import { HEARTH_THEME } from "../src/theme";

const destination = process.argv[2];
if (!destination) throw new Error("usage: export-cms-theme <themes/demo>");

const patterns = HOMEPAGE_PATTERNS.map(([name, definition]) => ({ name, ...definition }));
const design = {
  ...HEARTH_THEME,
  patterns,
};

mkdirSync(join(destination, "public"), { recursive: true });
mkdirSync(join(destination, "content"), { recursive: true });
writeFileSync(
  join(destination, "public", "patterns.json"),
  `${JSON.stringify({ patterns }, null, 2)}\n`,
);
writeFileSync(join(destination, "public", "design.json"), `${JSON.stringify(design, null, 2)}\n`);

const home = [
  "<Base>",
  '<div data-pb-doc data-pb-contract="0">',
  ...patterns.map(
    (pattern) =>
      `<div data-pb-block="pattern" data-pb-pattern="${pattern.name}" data-pb-children>\n${pattern.content.trim()}\n</div>`,
  ),
  "</div>",
  "</Base>",
  "",
].join("\n");
writeFileSync(join(destination, "content", "index.publr"), home);

const zonEscape = (value) =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
const themeZon = [
  "// GENERATED from publr-editor HEARTH_THEME by scripts/export-cms-theme.mjs.",
  "// Edit the editor theme source, then run the workspace vendor script.",
  ".{",
  "    .tokens = .{",
  ...HEARTH_THEME.tokens.map(
    (token) =>
      `        .{ .name = "${zonEscape(token.name)}", .value = "${zonEscape(token.value)}" },`,
  ),
  "    },",
  "}",
  "",
].join("\n");
writeFileSync(join(destination, "theme.zon"), themeZon);
