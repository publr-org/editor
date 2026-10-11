// The portable form of a design system: Tailwind v4's CSS-first `@theme` block, with the
// web fonts it loads ahead of it (`@import` for Google, `@font-face` for hosted files).
// Import reads exactly those blocks; export writes one back, so the document stays
// interchangeable with any Tailwind-compatible toolchain.
import { firstFamily, fontsCss, isFontFamilyToken, isTailwindCompatibilityColor } from "./system";
import type { DesignSystem, FilesFont, FontDefinition, FontFace, Token } from "./system";

export type ImportedTheme = { tokens: Token[]; fonts: FontDefinition[]; managedColorTokens: string[] };

/** Google stylesheets and `@font-face` blocks back into definitions; `tokenFor` maps a
 * family to the token that names it (null: no token claims it, dropped). */
export function fontsFromCssText(css: string, tokenFor: (family: string) => string | null): FontDefinition[] {
  const fonts: FontDefinition[] = [];
  for (const rule of css.matchAll(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;/gi)) {
    const match = /fonts\.googleapis\.com\/css2\?family=([^:&]+)(?::([^&]+))?/.exec(rule[1]);
    if (!match) continue;
    const family = decodeURIComponent(match[1].replace(/\+/g, " "));
    const token = tokenFor(family);
    if (!token) continue;
    const axes = match[2] ?? "";
    const italic = axes.startsWith("ital");
    const weights = [...new Set([...axes.matchAll(/(?:^|[@;])(?:[01],)?(\d{3})(?![\d.])/g)].map((found) => Number(found[1])))].sort((a, b) => a - b);
    const offered = weights.length ? weights : [400];
    fonts.push({ token, family, fallback: "sans-serif", provider: "google", weights: offered, italic, availableWeights: offered, availableItalic: italic });
  }
  const byFamily = new Map<string, FilesFont>();
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const declaration = (name: string) => new RegExp(`${name}\\s*:\\s*([^;]+)`, "i").exec(block[1])?.[1].trim() ?? "";
    const family = declaration("font-family").replace(/^['"]|['"]$/g, "");
    const src = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(declaration("src"))?.[1];
    if (!family || !src) continue;
    const range = declaration("font-weight").split(/\s+/).map(Number).filter(Number.isFinite);
    const weight: FontFace["weight"] = range.length > 1 ? [range[0], range[1]] : (range[0] ?? 400);
    let font = byFamily.get(family);
    if (!font) {
      const token = tokenFor(family);
      if (!token) continue;
      font = { token, family, fallback: "sans-serif", provider: "files", faces: [] };
      byFamily.set(family, font);
      fonts.push(font);
    }
    font.faces.push({ weight, italic: /italic|oblique/i.test(declaration("font-style")), src });
  }
  return fonts;
}

/** The `@theme` blocks of a CSS text; null when there are none. */
export function themeFromCssText(css: string): ImportedTheme | null {
  const tokens = new Map<string, string>();
  for (const block of css.matchAll(/@theme\b[^{]*\{([^}]*)\}/gi)) {
    const body = block[1].replace(/\/\*[\s\S]*?\*\//g, "");
    for (const declaration of body.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;]+?)(?:;|$)/g)) {
      const value = declaration[2].trim();
      if (value) tokens.set(declaration[1], value);
    }
  }
  if (!tokens.size) return null;
  const fonts = fontsFromCssText(css, (family) => {
    for (const [name, value] of tokens) {
      if (isFontFamilyToken(name) && firstFamily(value).toLowerCase() === family.toLowerCase()) return name;
    }
    return null;
  });
  return {
    tokens: [...tokens].map(([name, value]) => ({ name, value })),
    fonts,
    managedColorTokens: [...tokens.keys()].filter((name) => name.startsWith("color-")),
  };
}

/** The system as v4 CSS: its web fonts, then one `@theme` block. Tailwind's ramps the
 * palette did not take in are the compiler's, not the theme's, and stay out. */
export function themeToCssText(system: DesignSystem): string {
  const managed = new Set(system.managedColorTokens);
  const tokens = system.tokens.filter((token) => !isTailwindCompatibilityColor(token.name) || managed.has(token.name));
  const fonts = fontsCss(system);
  return `${fonts ? `${fonts}\n` : ""}@theme {\n${tokens.map((token) => `  --${token.name}: ${token.value};`).join("\n")}\n}`;
}

/** An import laid over the system: new tokens added, matching names updated, the
 * semantic mappings and everything else kept. */
export function applyImport(system: DesignSystem, imported: ImportedTheme): DesignSystem {
  const names = new Set(imported.tokens.map((token) => token.name));
  const fontTokens = new Set(imported.fonts.map((font) => font.token));
  return {
    ...system,
    tokens: [...system.tokens.filter((token) => !names.has(token.name)), ...imported.tokens],
    fonts: [...system.fonts.filter((font) => !fontTokens.has(font.token)), ...imported.fonts],
    managedColorTokens: [...new Set([...system.managedColorTokens, ...imported.managedColorTokens])],
  };
}
