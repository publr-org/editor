import { describe, expect, test } from "vitest";
import { wasmCssEngine } from "../src/wasm-engine";
import { themeFromTokens } from "../src/theme";

describe("browser CSS engine", () => {
  test("compiles runtime theme tokens and arbitrary values in the JIT", async () => {
    const theme = themeFromTokens({
      "text-hero": "4.5rem",
      "color-brand": "#123456",
      "radius-card": "1.25rem",
      "breakpoint-lg": "77rem",
    });
    const result = await wasmCssEngine().compile(
      [
        "text-hero",
        "bg-brand",
        "border-r-brand",
        "border-b-[color:#abcdef]",
        "border-[length:178px]",
        "rounded-tl-card",
        "lg:bg-brand",
        "[mask-image:linear-gradient(black,transparent)]",
      ],
      theme,
    );

    expect(result.css).toContain("--text-hero:4.5rem");
    expect(result.css).toContain("--color-brand:#123456");
    expect(result.css).toContain("--radius-card:1.25rem");
    expect(result.css).toContain("font-size:var(--text-hero)");
    expect(result.css).toContain("background-color:var(--color-brand)");
    expect(result.css).toContain("border-right-color:var(--color-brand)");
    expect(result.css).toContain("border-bottom-color:#abcdef");
    expect(result.css).toContain("border-width:178px");
    expect(result.css).toContain("border-top-left-radius:var(--radius-card)");
    expect(result.css).toContain("@media (min-width: 77rem)");
    expect(result.css).toContain("mask-image:linear-gradient(black,transparent)");
  });
});
