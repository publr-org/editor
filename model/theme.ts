// The site's theme as the style controls see it: a flat token list in the jit's naming
// (`color-brand`, `text-lg`, `leading-relaxed`, `radius-lg`, `spacing-m`,
// `container-wide`). Every control's scale is a projection of these tokens, so a theme
// that grows a token grows the control. The same list compiles the canvas.

export type Token = { name: string; value: string };

export type ScaleEntry = { key: string; value: string; label: string };

/**
 * One named text style: a preset over the typography lenses. Each entry is a theme key
 * of its namespace (`fontFamily: "heading"`, `fontSize: "3xl"`, `fontWeight: "semibold"`);
 * applying it writes the matching classes, so removing the preset never breaks content.
 */
export type TextStyle = {
  key: string;
  label: string;
  styles: { fontFamily?: string; fontSize?: string; fontWeight?: string; lineHeight?: string; letterSpacing?: string };
};

/** One semantic job a color does: `color-<role>`, and `color-<context>-<role>` per context. */
export type ColorRole = { key: string; label: string };

/** The semantic roles the style controls understand. */
export const COLOR_ROLES: readonly ColorRole[] = [
  { key: "surface", label: "Surface" },
  { key: "foreground", label: "Foreground" },
  { key: "border", label: "Border" },
  { key: "accent-surface", label: "Accent Surface" },
  { key: "accent-foreground", label: "Accent Foreground" },
  { key: "accent-border", label: "Accent Border" },
  { key: "muted-surface", label: "Muted Surface" },
  { key: "muted-foreground", label: "Muted Foreground" },
  { key: "muted-border", label: "Muted Border" },
];

/** A semantic color the theme defines: `key` is the class suffix (`brand-surface`). */
export type SemanticColor = { key: string; role: string; context: string; label: string; value: string };

const words = (key: string) =>
  key
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");

/** Spacing keys read as sizes: `2xs` → `2XS`, `m` → `M`. */
const sizeLabel = (key: string) => (/^(\d*x[sl]|[smlx]|\d+xl)$/i.test(key) ? key.toUpperCase() : key);

export class Theme {
  readonly tokens: readonly Token[];
  readonly textStyles: readonly TextStyle[];

  constructor(tokens: readonly Token[] = [], textStyles: readonly TextStyle[] = []) {
    this.tokens = tokens;
    this.textStyles = textStyles;
  }

  /** Tokens `<prefix>-<key>` in theme order, sub-tokens (`text-lg--line-height`) left out. */
  scale(prefix: string): ScaleEntry[] {
    const head = `${prefix}-`;
    return this.tokens
      .filter((token) => token.name.startsWith(head) && !token.name.slice(head.length).includes("--"))
      .map((token) => {
        const key = token.name.slice(head.length);
        return { key, value: token.value, label: prefix === "spacing" ? sizeLabel(key) : key };
      });
  }

  has(prefix: string, key: string): boolean {
    return this.tokens.some((token) => token.name === `${prefix}-${key}`);
  }

  value(name: string): string | null {
    return this.tokens.find((token) => token.name === name)?.value ?? null;
  }

  get colors() {
    return this.scale("color");
  }

  get fontSizes() {
    return this.scale("text");
  }

  get lineHeights() {
    return this.scale("leading");
  }

  get letterSpacings() {
    return this.scale("tracking");
  }

  get radii() {
    return this.scale("radius");
  }

  get spacing() {
    return this.scale("spacing");
  }

  get containers() {
    return this.scale("container");
  }

  get fonts() {
    // `font-weight-*` tokens are weights, not families.
    return this.scale("font").filter((entry) => !entry.key.startsWith("weight-"));
  }

  /** The theme's `font-*` families as the typography control offers them: a role
   * (`font-heading: var(--font-serif)`) reads "Heading · Serif", a family its first name. */
  get fontChoices(): { key: string; label: string; css: string }[] {
    const familyOf = (value: string): string => {
      const role = /^var\(--font-([a-z0-9-]+)\)$/.exec(value.trim());
      if (role) {
        const target = this.value(`font-${role[1]}`);
        const first = target ? familyOf(target) : "";
        return first || words(role[1]);
      }
      const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
      return first && !/^(?:ui-|system-ui$|var\()/.test(first) ? first : "";
    };
    return this.fonts.map((font) => {
      const role = /^var\(--font-([a-z0-9-]+)\)$/.test(font.value.trim());
      const family = familyOf(font.value);
      return { key: font.key, label: role ? `${words(font.key)} · ${family}` : family || words(font.key), css: font.value };
    });
  }

  /** The theme's semantic colors: every `color-[<context>-]<role>` token, roles by specificity. */
  get semanticColors(): SemanticColor[] {
    const roles = [...COLOR_ROLES].sort((a, b) => b.key.length - a.key.length);
    const out: SemanticColor[] = [];
    for (const color of this.colors) {
      const role = roles.find((candidate) => color.key === candidate.key || color.key.endsWith(`-${candidate.key}`));
      if (!role) continue;
      const context = color.key === role.key ? "default" : color.key.slice(0, -(role.key.length + 1));
      out.push({ key: color.key, role: role.key, context, label: context === "default" ? role.label : `${words(context)} · ${role.label}`, value: color.value });
    }
    return out;
  }

  /** The theme with a token added or changed (or with `value` null, removed). */
  with(name: string, value: string | null): Theme {
    const rest = this.tokens.filter((token) => token.name !== name);
    return new Theme(value === null ? rest : [...rest, { name, value }], this.textStyles);
  }

  /** The theme as v4 `@theme` CSS. */
  toCss(): string {
    return `@theme {\n${this.tokens.map((token) => `  --${token.name}: ${token.value};`).join("\n")}\n}\n`;
  }

  /** Tokens read from `@theme { --name: value; }` blocks. */
  static fromCss(css: string): Token[] {
    const tokens: Token[] = [];
    for (const block of css.matchAll(/@theme[^{]*\{([^}]*)\}/g)) {
      for (const declaration of block[1].matchAll(/--([A-Za-z0-9_-]+)\s*:\s*([^;]+);?/g)) {
        tokens.push({ name: declaration[1], value: declaration[2].trim() });
      }
    }
    return tokens;
  }
}
