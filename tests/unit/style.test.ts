// Lenses over authored classes, and the theme they read their scales from.
import { BORDER_WIDTH, LENSES, PADDING, RADIUS, readBox, readLens, readVariation, writeBox, writeLens, writeVariation } from "../../model/style";
import { Theme } from "../../model/theme";
import { equal, same, test } from "./harness";

const theme = new Theme([
  { name: "text-sm", value: "0.875rem" },
  { name: "text-lg", value: "1.125rem" },
  { name: "text-xxxxl", value: "6rem" },
  { name: "color-brand", value: "#3858e9" },
  { name: "color-white", value: "#fff" },
  { name: "spacing-s", value: "0.75rem" },
  { name: "spacing-m", value: "1rem" },
  { name: "radius-lg", value: "0.5rem" },
]);

test("one prefix, three lenses: size, color, alignment never mix", () => {
  const classes = "text-lg text-brand text-center";
  same(readLens(classes, LENSES.fontSize, theme), { key: "lg" });
  same(readLens(classes, LENSES.textColor, theme), { key: "brand" });
  equal(writeLens(classes, LENSES.fontSize, theme, { key: "sm" }), "text-sm text-brand text-center");
  equal(writeLens(classes, LENSES.textColor, theme, null), "text-lg text-center");
});

test("a theme token grows the scale; an unknown size is not the lens's", () => {
  same(LENSES.fontSize.options(theme).map((option) => option.key), ["sm", "lg", "xxxxl"]);
  equal(readLens("text-9xl", LENSES.fontSize, theme), null);
});

test("arbitrary values route by what they are", () => {
  same(readLens("text-[13px]", LENSES.fontSize, theme), { custom: "13px" });
  same(readLens("text-[#ff0000]", LENSES.textColor, theme), { custom: "#ff0000" });
  equal(writeLens("p-4", LENSES.background, theme, { custom: "#ff0000" }), "p-4 bg-[#ff0000]");
});

test("variants and modifiers are never matched, and survive writes", () => {
  const classes = "md:text-lg bg-white/5 text-sm";
  same(readLens(classes, LENSES.fontSize, theme), { key: "sm" });
  equal(writeLens(classes, LENSES.fontSize, theme, { key: "lg" }), "md:text-lg bg-white/5 text-lg");
  same(readLens(classes, LENSES.fontSize, theme, "md:"), { key: "lg" });
});

test("padding sides read through shorthands and re-encode compactly", () => {
  same(readBox("px-m pt-s", PADDING, theme), { top: { key: "s" }, right: { key: "m" }, bottom: null, left: { key: "m" } });
  equal(writeBox("", PADDING, theme, ["top", "right", "bottom", "left"], { key: "m" }), "p-m");
  equal(writeBox("p-m", PADDING, theme, ["top"], { key: "s" }), "px-m pt-s pb-m");
  equal(writeBox("p-m", PADDING, theme, ["top", "bottom"], null), "px-m");
  equal(writeBox("text-lg p-m", PADDING, theme, ["left"], { custom: "12px" }), "text-lg py-m pr-m pl-[12px]");
});

test("border widths: bare border is one pixel", () => {
  same(readBox("border border-t-4", BORDER_WIDTH, theme).top, { key: "4" });
  same(readBox("border", BORDER_WIDTH, theme).left, { key: "1" });
  equal(writeBox("", BORDER_WIDTH, theme, ["top", "right", "bottom", "left"], { key: "1" }), "border");
  equal(writeBox("border border-brand", BORDER_WIDTH, theme, ["top"], { key: "2" }), "border-x border-t-2 border-b border-brand");
  same(readLens("border border-brand", LENSES.borderColor, theme), { key: "brand" });
});

test("radius corners", () => {
  equal(writeBox("", RADIUS, theme, ["tl", "tr", "br", "bl"], { key: "lg" }), "rounded-lg");
  equal(writeBox("rounded-lg", RADIUS, theme, ["tl"], { custom: "5px" }), "rounded-r-lg rounded-tl-[5px] rounded-bl-lg");
});

test("variations swap whole class sets", () => {
  const variations = [
    { name: "display", label: "Display", classes: "text-3xl font-bold" },
    { name: "subtitle", label: "Subtitle", classes: "text-lg text-muted-foreground" },
  ];
  const display = writeVariation("text-brand", variations, "display");
  equal(display, "text-brand text-3xl font-bold");
  equal(readVariation(display, variations), "display");
  equal(writeVariation(display, variations, "subtitle"), "text-brand text-lg text-muted-foreground");
  equal(writeVariation(display, variations, null), "text-brand");
});

test("theme css round-trips", () => {
  const css = theme.toCss();
  same(Theme.fromCss(css), theme.tokens);
  same(Theme.fromCss("@theme { --text-mega: 4rem; }"), [{ name: "text-mega", value: "4rem" }]);
});

test("group layout: per device, children never move, smaller sizes are inherited", async () => {
  const { readLayout, writeLayout } = await import("../../model/layout");
  let classes = writeLayout("", "mobile", { mode: "row" });
  equal(classes, "flex flex-row");
  classes = writeLayout(classes, "desktop", { mode: "stack" });
  equal(classes, "flex flex-row lg:flex lg:flex-col");
  equal(readLayout(classes, "mobile").mode, "row");
  equal(readLayout(classes, "tablet").mode, "row");
  equal(readLayout(classes, "desktop").mode, "stack");
  classes = writeLayout(classes, "desktop", { mode: "group" });
  equal(readLayout(classes, "desktop").mode, "group");
  equal(readLayout(classes, "mobile").mode, "row");
});

test("group container: width by variable, bleed per device", async () => {
  const { readLayout, writeLayout } = await import("../../model/layout");
  let classes = writeLayout("", "mobile", { container: true, width: "wide" });
  equal(classes, "mx-auto w-full max-w-[var(--container-wide)]");
  same(readLayout(classes, "mobile"), { mode: "group", columns: 2, wrap: false, container: true, width: "wide", bleed: "none" });
  classes = writeLayout("", "desktop", { container: true, width: "wide", bleed: "right" });
  equal(readLayout(classes, "mobile").container, false);
  equal(readLayout(classes, "desktop").bleed, "right");
  classes = writeLayout("mx-auto w-full max-w-[var(--container-content)]", "desktop", { container: false });
  equal(readLayout(classes, "desktop").container, false);
  equal(readLayout(classes, "mobile").container, true);
});
