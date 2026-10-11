// The moodboard as data: what a paste or a drop becomes, the board's bounds, a font's face
// in words, a Figma frame's link and summary, a font file's facts, and the build prompt
// the design system builder hands an AI.
import { summarizeFigmaNode, parseFigmaUrl } from "../../moodboard/figma";
import { fontFactsFromFilename } from "../../moodboard/font-file";
import { buildPrompt, describeMoodboardItem, fontFaceLabel, isColorLiteral, moodboardBounds, moodboardItemFromText, moodboardItemsFromText } from "../../moodboard/model";
import type { MoodboardItem } from "../../moodboard/model";
import { equal, same, test } from "./harness";

const at = { x: 10, y: 20 };
const kindOf = (text: string) => moodboardItemFromText(text, at)?.kind ?? null;

test("one line of text becomes the card it names", () => {
  equal(kindOf("https://example.com/shot.PNG?x=1"), "image");
  equal(kindOf("https://www.figma.com/design/AbC/Site?node-id=1-2"), "figma");
  equal(kindOf("https://stripe.com"), "link");
  equal(kindOf("#1f6feb"), "color");
  equal(kindOf("oklch(0.7 0.1 250)"), "color");
  equal(kindOf("Calm, generous whitespace"), "note");
  equal(kindOf("   "), null);
  equal(isColorLiteral("#12"), false);
  const figma = moodboardItemFromText("https://figma.com/file/AbC/Site", at)!;
  same([figma.kind, figma.kind === "figma" && figma.status, figma.w], ["figma", "pending", 320]);
});

test("a paste is one card per line, plain lines join into one note, and the cards cascade", () => {
  const items = moodboardItemsFromText("https://stripe.com\n#1f6feb\nCalm, generous whitespace.\nEditorial headlines.\n\nSecond note", at);
  same(
    items.map((item) => item.kind),
    ["link", "color", "note", "note"],
  );
  equal(items[2].kind === "note" && items[2].text, "Calm, generous whitespace.\nEditorial headlines.");
  same([items[0].x, items[0].y, items[1].x, items[1].y, items[3].x], [10, 20, 42, 52, 106]);
});

test("the bounds hold every card; one without a height counts as tall as it is wide, up to 200", () => {
  equal(moodboardBounds([]), null);
  const items: MoodboardItem[] = [
    { id: "a", kind: "color", value: "#000", x: -20, y: 0, w: 180 },
    { id: "b", kind: "image", src: "/a.png", x: 300, y: 100, w: 320, h: 400 },
    { id: "c", kind: "note", text: "x", x: 0, y: 600, w: 260 },
  ];
  same(moodboardBounds(items), { x: -20, y: 0, w: 640, h: 800 });
});

test("a font's face reads as a weight name, a variable range, and italic", () => {
  equal(fontFaceLabel({ weight: 700 }), "Bold 700");
  equal(fontFaceLabel({}), "Regular 400");
  equal(fontFaceLabel({ weight: 300, italic: true }), "Light 300 Italic");
  equal(fontFaceLabel({ weight: 100, weight_max: 900 }), "Variable 100–900");
});

test("each card describes itself in one line, its annotation last", () => {
  equal(describeMoodboardItem({ id: "a", kind: "color", value: "#c2410c", note: " the warmth ", x: 0, y: 0, w: 1 }), "Color: #c2410c — the warmth");
  equal(describeMoodboardItem({ id: "b", kind: "font", src: "/f.woff2", family: "Fraunces", weight: 600, x: 0, y: 0, w: 1 }), "Font: Fraunces Semi Bold 600");
  equal(
    describeMoodboardItem({ id: "c", kind: "figma", url: "https://figma.com/file/x", title: "Home", colors: ["#000"], fonts: ["Inter"], x: 0, y: 0, w: 1 }),
    "Figma frame: Home (colors #000; fonts Inter)",
  );
});

test("the build prompt reads every card with its reason, and gathers colors and fonts", () => {
  const items: MoodboardItem[] = [
    { id: "a", kind: "note", text: "Warm and calm", x: 0, y: 0, w: 260 },
    { id: "b", kind: "color", value: "#c2410c", note: "the warmth", x: 0, y: 0, w: 180 },
    { id: "c", kind: "font", src: "/f.woff2", family: "Fraunces", x: 0, y: 0, w: 300 },
  ];
  const prompt = buildPrompt(items, "Hearth");
  equal(prompt.startsWith("Build a design system for Hearth"), true);
  equal(prompt.includes("- Color: #c2410c — the warmth"), true);
  equal(prompt.includes("exact value: #c2410c."), true);
  equal(prompt.includes("Use these typefaces: Fraunces."), true);
  equal(buildPrompt([]), "");
});

test("a Figma link gives its file and node, and a frame its colors by area and fonts by use", () => {
  same(parseFigmaUrl("https://www.figma.com/design/AbC123/Site?node-id=12-34&t=x"), { fileKey: "AbC123", nodeId: "12:34" });
  same(parseFigmaUrl("https://www.figma.com/file/AbC123/Site"), { fileKey: "AbC123", nodeId: undefined });
  equal(parseFigmaUrl("https://example.com"), null);
  const summary = summarizeFigmaNode({
    id: "1",
    absoluteBoundingBox: { width: 100, height: 100 },
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
    children: [
      { id: "2", type: "TEXT", style: { fontFamily: "Inter" }, absoluteBoundingBox: { width: 10, height: 10 }, fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }] },
      { id: "3", type: "TEXT", style: { fontFamily: "Inter" }, visible: false, fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] },
      { id: "4", fills: [{ type: "SOLID", color: { r: 0, g: 1, b: 0, a: 0.2 } }] },
    ],
  });
  same(summary, { colors: ["#ffffff", "#000000"], fonts: ["Inter"] });
});

test("a font file's name says its family, weight and style when its tables cannot", () => {
  same(fontFactsFromFilename("Inter-SemiBoldItalic.woff2"), { family: "Inter", weight: 600, italic: true });
  same(fontFactsFromFilename("SuisseWorks-Medium-WebS.woff2"), { family: "Suisse Works S", weight: 500, italic: false });
  same(fontFactsFromFilename("Roboto[wght].ttf"), { family: "Roboto", weight: [100, 900], italic: false });
});
