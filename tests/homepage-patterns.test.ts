// The editorial-commerce homepage sliced into reusable section patterns.
// Each fragment must register, remain entirely typed/editable, and bring its
// own semantic background/context when previewed outside a complete page.

import { describe, expect, test } from "vitest";
import {
  blockSupportsStyle,
  getBlockType,
  getPattern,
  patchStyleClasses,
  readStyleClass,
  upcast,
} from "../src/index";
import { HEARTH_THEME } from "../src/demo-theme";
import type { Block, StyleBreakpoint } from "../src/index";
import { registerCoreBlocks } from "../src/blocks";
import { registerCorePatterns } from "../src/blocks/core-patterns";
import { HOMEPAGE_PATTERNS, registerHomepagePatterns } from "../src/blocks/homepage-patterns";

registerCoreBlocks();
registerCorePatterns();
registerHomepagePatterns();

function parse(html: string): Element {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp;
}
function census(blocks: Block[], c: Record<string, number> = {}): Record<string, number> {
  for (const b of blocks) {
    c[b.type] = (c[b.type] ?? 0) + 1;
    if (b.children) census(b.children, c);
  }
  return c;
}

describe("homepage section patterns", () => {
  test("all ten register (fragments validate to registered types)", () => {
    expect(HOMEPAGE_PATTERNS.map(([n]) => n)).toEqual([
      "home-header",
      "home-hero",
      "home-giveaway",
      "home-steps",
      "home-products",
      "home-categories",
      "home-community",
      "home-social-wall",
      "home-standards",
      "home-footer",
    ]);
    for (const [name] of HOMEPAGE_PATTERNS) {
      const p = getPattern(name)!;
      expect(p, name).toBeTruthy();
      expect(p.category, name).toBeTruthy();
      // The content upcasts to a single section root (typed, not raw-html).
      const blocks = upcast(parse(p.content)).blocks;
      expect(blocks.length, name).toBe(1);
      expect(blocks[0].type, name).toBe("group");
    }
  });

  test("every pattern root carries a background (self-contained, not transparent)", () => {
    // Standalone previews/edits cannot rely on a surrounding page background.
    for (const [name] of HOMEPAGE_PATTERNS) {
      const root = upcast(parse(getPattern(name)!.content)).blocks[0];
      expect(root.classes, name).toMatch(/\bbg-/);
    }
  });

  test("the library is a substantial, fully typed commerce composition", () => {
    const total: Record<string, number> = {};
    for (const [name] of HOMEPAGE_PATTERNS) {
      census(upcast(parse(getPattern(name)!.content)).blocks, total);
    }
    expect(total.group).toBeGreaterThanOrEqual(35);
    expect(total.grid).toBeUndefined();
    expect(total.paragraph).toBeGreaterThanOrEqual(25);
    expect(total.button).toBeGreaterThanOrEqual(12);
    expect(total.heading).toBeGreaterThanOrEqual(20);
    expect(total.image).toBeGreaterThanOrEqual(15);
    expect(total["raw-html"] ?? 0).toBe(0);
    expect(getPattern("home-hero")!.content).toContain("bg-brand-surface");
    expect(getPattern("home-giveaway")!.content).toContain("bg-inverse-surface");
  });

  test("shared page edges use semantic Wide containers instead of literal max widths", () => {
    let wideGroups = 0;
    const visit = (blocks: Block[]) => {
      for (const block of blocks) {
        if (
          block.type === "group" &&
          readStyleClass("containerEnabled", block.classes?.split(/\s+/) ?? []) === "true" &&
          readStyleClass("containerWidth", block.classes?.split(/\s+/) ?? []) === "wide"
        )
          wideGroups += 1;
        if (block.children) visit(block.children);
      }
    };
    for (const [name] of HOMEPAGE_PATTERNS) {
      const content = getPattern(name)!.content;
      expect(content, name).not.toContain("max-w-7xl");
      visit(upcast(parse(content)).blocks);
    }
    expect(wideGroups).toBeGreaterThanOrEqual(7);
  });

  test("the split hero aligns its grid to Wide and bleeds only the media edge", () => {
    const root = upcast(parse(getPattern("home-hero")!.content)).blocks[0];
    expect(root.classes?.split(/\s+/)).toContain("bg-brand-surface");
    const hero = root.children?.[0];
    if (!hero) throw new Error("home-hero is missing its inner layout container");
    const classes = hero.classes?.split(/\s+/) ?? [];
    expect(readStyleClass("containerEnabled", classes)).toBe("false");
    expect(readStyleClass("containerEnabled", classes, HEARTH_THEME, "lg")).toBe("true");
    expect(readStyleClass("containerWidth", classes)).toBe("wide");
    expect(readStyleClass("containerBleed", classes)).toBeUndefined();
    expect(readStyleClass("containerBleed", classes, HEARTH_THEME, "lg")).toBe("right");
    const copy = hero.children?.[0];
    const copyClasses = copy?.classes?.split(/\s+/) ?? [];
    expect(readStyleClass("containerEnabled", copyClasses)).toBe("true");
    expect(readStyleClass("containerEnabled", copyClasses, HEARTH_THEME, "lg")).toBe("false");
    expect(readStyleClass("containerBleed", copyClasses, HEARTH_THEME, "lg")).toBeUndefined();
    expect(copyClasses).not.toContain("px-8");
    expect(hero.children?.[1].type).toBe("image");
  });

  test("the prize banner is fully reproducible through native inspector controls", () => {
    const root = upcast(parse(getPattern("home-giveaway")!.content)).blocks[0];
    const classes = root.classes!.split(/\s+/);
    const values: readonly [string, string, StyleBreakpoint][] = [
      ["layoutMode", "grid", "base"],
      ["gridColumns", "1", "base"],
      ["alignItems", "center", "base"],
      ["gap", "8", "base"],
      ["backgroundColor", "inverse-surface", "base"],
      ["paddingInline", "8", "base"],
      ["paddingBlock", "10", "base"],
      ["textColor", "inverse-foreground", "base"],
      ["gridColumns", "1fr auto 1fr", "md"],
      ["paddingInline", "20", "lg"],
    ];

    expect(root.type).toBe("group");
    const supports = getBlockType("group")!.supports;
    for (const [prop, value, breakpoint] of values) {
      expect(blockSupportsStyle(supports, prop), prop).toBe(true);
      expect(readStyleClass(prop, classes, HEARTH_THEME, breakpoint), prop).toBe(value);
    }

    const rebuilt = values.reduce<string[]>(
      (owned, [prop, value, breakpoint]) =>
        patchStyleClasses(prop, value, owned, HEARTH_THEME, breakpoint),
      [],
    );
    expect(new Set(rebuilt)).toEqual(new Set(classes));
  });
});
