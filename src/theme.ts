// theme.ts — the THEME DOCUMENT (css-engine thoughts, E1). A theme is a flat
// list of {name, value} tokens whose names follow Tailwind v4's @theme
// CSS-custom-property convention (jit THEME.md): `text-lg`, `color-red-500`,
// `radius-xl`, `spacing`, `text-lg--line-height` (a `--` modifier). The theme
// is SITE DATA. Numeric scales derive directly from it; colors have a stricter
// governance boundary: Publr's default color vocabulary is semantic. The
// vendored Tailwind palette is available only through the explicit
// compatibility theme; it is generated from the jit's default-theme.zon and
// is never hand-edited.

import { DEFAULT_THEME_TOKENS } from "../vendor/theme/default-theme";
import type { PatternDefinition } from "./patterns";
import type { TemplateDefinition, TemplatePartDefinition } from "./templates";

/** One theme token: a Tailwind v4 @theme custom property, sans leading `--`. */
export interface ThemeToken {
  name: string;
  value: string;
}

/** One author-defined semantic job. Tokens store the color assigned to the
 * role; this metadata supplies the vocabulary and editor copy. */
export interface SemanticColorRoleDefinition {
  key: string;
  label: string;
  description: string;
  value: string;
}

/** One named semantic palette. `default` uses `color-{role}` tokens; every
 * additional context uses `color-{context}-{role}`. */
export interface ColorContextDefinition {
  key: string;
  label: string;
}

/** A pattern bundled by a theme. It enters the same validated pattern
 * registry as host-registered definitions—there is no second pattern type. */
export interface ThemePatternDefinition extends PatternDefinition {
  name: string;
}

export interface ThemeTemplateDefinition extends TemplateDefinition {
  name: string;
}

export interface ThemeTemplatePartDefinition extends TemplatePartDefinition {
  name: string;
}

/** A theme document. Tokens remain the portable CSS value layer; semantic
 * definitions are theme-owned structure consumed by controls and previews.
 * Order is meaningful in every collection. */
export interface Theme {
  tokens: ThemeToken[];
  /** Raw Tailwind color tokens explicitly imported into the author-managed
   * palette. Compiler compatibility colors omit this provenance and remain
   * available to utilities without flooding the theme editor. */
  managedColorTokens?: string[];
  semanticColorRoles?: SemanticColorRoleDefinition[];
  colorContexts?: ColorContextDefinition[];
  patterns?: ThemePatternDefinition[];
  /** Page structures and their shared parts bundled by the active CMS theme. */
  templates?: ThemeTemplateDefinition[];
  templateParts?: ThemeTemplatePartDefinition[];
  /** Theme-owned annotated starter documents keyed by block type. */
  blockDefaults?: Record<string, string>;
}

/** A useful starter vocabulary, not a product-level closed enum. Themes may
 * replace, extend, rename, or remove these roles. */
export const SEMANTIC_COLOR_ROLES = [
  {
    key: "surface",
    label: "Surface",
    description: "Page and card backgrounds",
    value: "#ffffff",
  },
  {
    key: "foreground",
    label: "Foreground",
    description: "Primary text and strong icons",
    value: "#18181b",
  },
  {
    key: "border",
    label: "Border",
    description: "Dividers and outlines on Surface",
    value: "#e4e4e7",
  },
  {
    key: "accent-surface",
    label: "Accent Surface",
    description: "Action and emphasis backgrounds",
    value: "#3858e9",
  },
  {
    key: "accent-foreground",
    label: "Accent Foreground",
    description: "Content placed on Accent Surface",
    value: "#ffffff",
  },
  {
    key: "accent-border",
    label: "Accent Border",
    description: "Borders placed on Accent Surface",
    value: "#2947ce",
  },
  {
    key: "muted-surface",
    label: "Muted Surface",
    description: "Quiet panel and control backgrounds",
    value: "#f4f4f5",
  },
  {
    key: "muted-foreground",
    label: "Muted Foreground",
    description: "Content placed on Muted Surface",
    value: "#3f3f46",
  },
  {
    key: "muted-border",
    label: "Muted Border",
    description: "Borders placed on Muted Surface",
    value: "#d4d4d8",
  },
] as const;

export const DEFAULT_COLOR_CONTEXTS: ColorContextDefinition[] = [
  { key: "default", label: "Default" },
];

const DEFAULT_SEMANTIC_TOKENS: ThemeToken[] = SEMANTIC_COLOR_ROLES.map((role) => ({
  name: `color-${role.key}`,
  value: role.value,
}));

/** Rendering aliases for documents authored before semantic colors became
 * complete layers. They are intentionally absent from role metadata, so new
 * controls expose only the nine canonical roles. */
const LEGACY_SEMANTIC_ALIAS_TOKENS: ThemeToken[] = [
  { name: "color-accent", value: "var(--color-accent-surface)" },
  { name: "color-muted", value: "var(--color-muted-surface)" },
];

/** Reusable color inventory. Semantic roles may point at these tokens, while
 * blocks continue to consume only the semantic layer. */
const DEFAULT_PALETTE_TOKENS: ThemeToken[] = [
  { name: "color-palette-canvas", value: "#ffffff" },
  { name: "color-palette-ink", value: "#18181b" },
  { name: "color-palette-brand", value: "#3858e9" },
  { name: "color-palette-on-brand", value: "#ffffff" },
  { name: "color-palette-soft", value: "#f4f4f5" },
  { name: "color-palette-subtle", value: "#71717a" },
  { name: "color-palette-line", value: "#e4e4e7" },
  { name: "color-palette-slate", value: "#607f99" },
  { name: "color-palette-slate-soft", value: "#6f8da5" },
  { name: "color-palette-clay", value: "#a45332" },
  { name: "color-palette-clay-soft", value: "#bd6a45" },
  { name: "color-palette-clay-subtle", value: "#f7ddca" },
  { name: "color-palette-amber", value: "#f7dda4" },
  { name: "color-palette-umber", value: "#3b332b" },
  { name: "color-palette-warm-white", value: "#fff7e9" },
];

/** Semantic page-layout roles. Blocks store the role (`content` / `wide`),
 * while the site's theme owns the measurements. `full` is structural and
 * therefore has no token. */
export const CONTAINER_WIDTH_DEFAULTS = {
  content: "645px",
  wide: "1340px",
  gutter: "24px",
} as const;

const DEFAULT_CONTAINER_TOKENS: ThemeToken[] = [
  { name: "container-content", value: CONTAINER_WIDTH_DEFAULTS.content },
  { name: "container-wide", value: CONTAINER_WIDTH_DEFAULTS.wide },
  { name: "container-gutter", value: CONTAINER_WIDTH_DEFAULTS.gutter },
];

/** Site-wide element defaults. These are ordinary theme tokens so a site can
 * tune its baseline without writing classes into every block. Authored block
 * styles still win through the cascade (utilities and inline declarations sit
 * above the base layer generated by themeBaseCss()). */
export const SITE_TYPOGRAPHY_DEFAULTS = {
  bodyFontFamily: "var(--font-sans)",
  bodyFontSize: "1rem",
  bodyFontWeight: "400",
  bodyColor: "var(--color-foreground)",
  bodyLineHeight: "1.6",
  bodyLetterSpacing: "0em",
  bodyTextTransform: "none",
  paragraphSpacing: "1rem",
  headingFontFamily: "var(--font-sans)",
  headingFontWeight: "700",
  // Headings follow the nearest semantic context by default. A section such
  // as `text-brand-foreground` or `text-inverse-foreground` establishes that
  // context once on its wrapper; headings should not jump back to the root
  // Foreground role unless the theme author explicitly assigns that recipe.
  headingColor: "inherit",
  headingLineHeight: "1.2",
  headingLetterSpacing: "-0.02em",
  headingTextTransform: "none",
  headingSpacingBefore: "1.5em",
  headingSpacingAfter: "0.5em",
  heading1Size: "2.25rem",
  heading2Size: "1.75rem",
  heading3Size: "1.375rem",
  heading4Size: "1.125rem",
  listSpacing: "1rem",
  listItemSpacing: "0.375rem",
  definitionListSpacing: "1rem",
  definitionTermSpacing: "1rem",
  definitionDescriptionSpacing: "0.25rem",
  definitionTermWeight: "600",
  blockquoteSpacing: "1.5rem",
  ruleSpacing: "2rem",
  // Links live on the base surface by default. Accent Foreground is reserved
  // for content that actually sits on Accent Surface.
  linkColor: "var(--color-foreground)",
  linkFontFamily: "var(--font-sans)",
  linkFontSize: "1rem",
  linkFontWeight: "500",
  linkLineHeight: "1.6",
  linkLetterSpacing: "0em",
  linkTextTransform: "none",
  linkTextDecoration: "underline",
  captionFontFamily: "var(--font-sans)",
  captionFontSize: "0.875rem",
  captionFontWeight: "400",
  // The same layer rule applies to captions: a caption on the base surface
  // inherits Foreground; a muted panel establishes its own foreground.
  captionColor: "inherit",
  captionLineHeight: "1.4",
  captionLetterSpacing: "0em",
  captionTextTransform: "none",
  buttonFontFamily: "var(--font-sans)",
  buttonFontSize: "0.875rem",
  buttonFontWeight: "600",
  buttonColor: "var(--color-accent-foreground)",
  buttonLineHeight: "1.2",
  buttonLetterSpacing: "0em",
  buttonTextTransform: "none",
} as const;

const DEFAULT_SITE_TYPOGRAPHY_TOKENS: ThemeToken[] = [
  { name: "publr-body-font-family", value: SITE_TYPOGRAPHY_DEFAULTS.bodyFontFamily },
  { name: "publr-body-font-size", value: SITE_TYPOGRAPHY_DEFAULTS.bodyFontSize },
  { name: "publr-body-font-weight", value: SITE_TYPOGRAPHY_DEFAULTS.bodyFontWeight },
  { name: "publr-body-color", value: SITE_TYPOGRAPHY_DEFAULTS.bodyColor },
  { name: "publr-body-line-height", value: SITE_TYPOGRAPHY_DEFAULTS.bodyLineHeight },
  { name: "publr-body-letter-spacing", value: SITE_TYPOGRAPHY_DEFAULTS.bodyLetterSpacing },
  { name: "publr-body-text-transform", value: SITE_TYPOGRAPHY_DEFAULTS.bodyTextTransform },
  { name: "publr-paragraph-spacing", value: SITE_TYPOGRAPHY_DEFAULTS.paragraphSpacing },
  { name: "publr-heading-font-family", value: SITE_TYPOGRAPHY_DEFAULTS.headingFontFamily },
  { name: "publr-heading-font-weight", value: SITE_TYPOGRAPHY_DEFAULTS.headingFontWeight },
  { name: "publr-heading-color", value: SITE_TYPOGRAPHY_DEFAULTS.headingColor },
  { name: "publr-heading-line-height", value: SITE_TYPOGRAPHY_DEFAULTS.headingLineHeight },
  { name: "publr-heading-letter-spacing", value: SITE_TYPOGRAPHY_DEFAULTS.headingLetterSpacing },
  { name: "publr-heading-text-transform", value: SITE_TYPOGRAPHY_DEFAULTS.headingTextTransform },
  {
    name: "publr-heading-spacing-before",
    value: SITE_TYPOGRAPHY_DEFAULTS.headingSpacingBefore,
  },
  { name: "publr-heading-spacing-after", value: SITE_TYPOGRAPHY_DEFAULTS.headingSpacingAfter },
  { name: "publr-heading-1-size", value: SITE_TYPOGRAPHY_DEFAULTS.heading1Size },
  { name: "publr-heading-2-size", value: SITE_TYPOGRAPHY_DEFAULTS.heading2Size },
  { name: "publr-heading-3-size", value: SITE_TYPOGRAPHY_DEFAULTS.heading3Size },
  { name: "publr-heading-4-size", value: SITE_TYPOGRAPHY_DEFAULTS.heading4Size },
  { name: "publr-list-spacing", value: SITE_TYPOGRAPHY_DEFAULTS.listSpacing },
  { name: "publr-list-item-spacing", value: SITE_TYPOGRAPHY_DEFAULTS.listItemSpacing },
  {
    name: "publr-definition-list-spacing",
    value: SITE_TYPOGRAPHY_DEFAULTS.definitionListSpacing,
  },
  {
    name: "publr-definition-term-spacing",
    value: SITE_TYPOGRAPHY_DEFAULTS.definitionTermSpacing,
  },
  {
    name: "publr-definition-description-spacing",
    value: SITE_TYPOGRAPHY_DEFAULTS.definitionDescriptionSpacing,
  },
  {
    name: "publr-definition-term-weight",
    value: SITE_TYPOGRAPHY_DEFAULTS.definitionTermWeight,
  },
  { name: "publr-blockquote-spacing", value: SITE_TYPOGRAPHY_DEFAULTS.blockquoteSpacing },
  { name: "publr-rule-spacing", value: SITE_TYPOGRAPHY_DEFAULTS.ruleSpacing },
  { name: "publr-link-color", value: SITE_TYPOGRAPHY_DEFAULTS.linkColor },
  { name: "publr-link-font-family", value: SITE_TYPOGRAPHY_DEFAULTS.linkFontFamily },
  { name: "publr-link-font-size", value: SITE_TYPOGRAPHY_DEFAULTS.linkFontSize },
  { name: "publr-link-font-weight", value: SITE_TYPOGRAPHY_DEFAULTS.linkFontWeight },
  { name: "publr-link-line-height", value: SITE_TYPOGRAPHY_DEFAULTS.linkLineHeight },
  { name: "publr-link-letter-spacing", value: SITE_TYPOGRAPHY_DEFAULTS.linkLetterSpacing },
  { name: "publr-link-text-transform", value: SITE_TYPOGRAPHY_DEFAULTS.linkTextTransform },
  { name: "publr-link-text-decoration", value: SITE_TYPOGRAPHY_DEFAULTS.linkTextDecoration },
  { name: "publr-caption-font-family", value: SITE_TYPOGRAPHY_DEFAULTS.captionFontFamily },
  { name: "publr-caption-font-size", value: SITE_TYPOGRAPHY_DEFAULTS.captionFontSize },
  { name: "publr-caption-font-weight", value: SITE_TYPOGRAPHY_DEFAULTS.captionFontWeight },
  { name: "publr-caption-color", value: SITE_TYPOGRAPHY_DEFAULTS.captionColor },
  { name: "publr-caption-line-height", value: SITE_TYPOGRAPHY_DEFAULTS.captionLineHeight },
  { name: "publr-caption-letter-spacing", value: SITE_TYPOGRAPHY_DEFAULTS.captionLetterSpacing },
  { name: "publr-caption-text-transform", value: SITE_TYPOGRAPHY_DEFAULTS.captionTextTransform },
  { name: "publr-button-font-family", value: SITE_TYPOGRAPHY_DEFAULTS.buttonFontFamily },
  { name: "publr-button-font-size", value: SITE_TYPOGRAPHY_DEFAULTS.buttonFontSize },
  { name: "publr-button-font-weight", value: SITE_TYPOGRAPHY_DEFAULTS.buttonFontWeight },
  { name: "publr-button-color", value: SITE_TYPOGRAPHY_DEFAULTS.buttonColor },
  { name: "publr-button-line-height", value: SITE_TYPOGRAPHY_DEFAULTS.buttonLineHeight },
  { name: "publr-button-letter-spacing", value: SITE_TYPOGRAPHY_DEFAULTS.buttonLetterSpacing },
  { name: "publr-button-text-transform", value: SITE_TYPOGRAPHY_DEFAULTS.buttonTextTransform },
];

const DEFAULT_NON_COLOR_TOKENS = DEFAULT_THEME_TOKENS.filter(
  (token) => !token.name.startsWith("color-"),
);
/** A compact, semantic spacing scale for author-facing controls. `spacing`
 * remains Tailwind's numeric multiplier; these named values are the reusable
 * site-design decisions shown in the editor. */
export const DEFAULT_SPACING_TOKENS: readonly ThemeToken[] = [
  { name: "spacing-2xs", value: "0.25rem" },
  { name: "spacing-xs", value: "0.5rem" },
  { name: "spacing-s", value: "0.75rem" },
  { name: "spacing-m", value: "1rem" },
  { name: "spacing-l", value: "1.5rem" },
  { name: "spacing-xl", value: "2rem" },
  { name: "spacing-2xl", value: "3rem" },
];
const TAILWIND_COMPAT_COLOR_NAMES = new Set(
  DEFAULT_THEME_TOKENS.filter((token) => token.name.startsWith("color-")).map(
    (token) => token.name,
  ),
);

/** Whether a color token belongs to Tailwind's imported compatibility ramp.
 * Custom context roles (`color-brand-*`, `color-inverse-*`, etc.) return false
 * and remain portable site-theme data. */
export function isTailwindCompatibilityColor(name: string): boolean {
  return TAILWIND_COMPAT_COLOR_NAMES.has(name);
}

/** Publr's normal theme: useful non-color scales and semantic colors only. */
export const DEFAULT_THEME: Theme = {
  tokens: [
    ...DEFAULT_NON_COLOR_TOKENS,
    ...DEFAULT_SPACING_TOKENS,
    ...DEFAULT_PALETTE_TOKENS,
    ...DEFAULT_SEMANTIC_TOKENS,
    ...LEGACY_SEMANTIC_ALIAS_TOKENS,
    ...DEFAULT_CONTAINER_TOKENS,
    ...DEFAULT_SITE_TYPOGRAPHY_TOKENS,
  ],
  semanticColorRoles: SEMANTIC_COLOR_ROLES.map((role) => ({ ...role })),
  colorContexts: DEFAULT_COLOR_CONTEXTS.map((context) => ({ ...context })),
};

/** The curated starting system used by the full Hearth theme-editor POC.
 * Bare editor instances retain DEFAULT_THEME; the product shell uses this
 * preset when a host has not supplied its own site theme yet. */
const HEARTH_COLOR_VALUES: Record<string, string> = {
  "color-palette-canvas": "#fbf8ef",
  "color-palette-ink": "#29413d",
  "color-palette-brand": "#294b45",
  "color-palette-on-brand": "#fffaf0",
  "color-palette-soft": "#e2e9e1",
  "color-palette-subtle": "#66736e",
  "color-palette-line": "#d8d2c5",
  "color-palette-slate": "#607f99",
  "color-palette-slate-soft": "#6f8da5",
  "color-palette-clay": "#a45332",
  "color-palette-clay-soft": "#bd6a45",
  "color-palette-clay-subtle": "#f7ddca",
  "color-palette-amber": "#f7dda4",
  "color-palette-umber": "#3b332b",
  "color-palette-warm-white": "#fff7e9",
  "color-surface": "#fbf8ef",
  "color-foreground": "#29413d",
  "color-border": "#d8d2c5",
  "color-accent-surface": "#294b45",
  "color-accent-foreground": "#fffaf0",
  "color-accent-border": "#1f3934",
  "color-muted-surface": "#e2e9e1",
  "color-muted-foreground": "#29413d",
  "color-muted-border": "#cbd5cc",
};

export const HEARTH_THEME: Theme = {
  tokens: [
    ...DEFAULT_THEME.tokens.map((token) =>
      HEARTH_COLOR_VALUES[token.name]
        ? { ...token, value: HEARTH_COLOR_VALUES[token.name] }
        : token,
    ),
    { name: "color-brand-surface", value: "#607f99" },
    { name: "color-brand-foreground", value: "#fffaf0" },
    { name: "color-brand-border", value: "rgb(255 250 240 / 24%)" },
    { name: "color-brand-accent-surface", value: "#f7dda4" },
    { name: "color-brand-accent-foreground", value: "#29413d" },
    { name: "color-brand-accent-border", value: "#d9bb78" },
    { name: "color-brand-muted-surface", value: "#6f8da5" },
    { name: "color-brand-muted-foreground", value: "#e7eef1" },
    { name: "color-brand-muted-border", value: "rgb(255 250 240 / 18%)" },
    { name: "color-brand-accent", value: "var(--color-brand-accent-surface)" },
    { name: "color-brand-muted", value: "var(--color-brand-muted-surface)" },
    { name: "color-inverse-surface", value: "#a45332" },
    { name: "color-inverse-foreground", value: "#fff7e9" },
    { name: "color-inverse-border", value: "rgb(255 247 233 / 24%)" },
    { name: "color-inverse-accent-surface", value: "#f7dda4" },
    { name: "color-inverse-accent-foreground", value: "#3b332b" },
    { name: "color-inverse-accent-border", value: "#d9b86f" },
    { name: "color-inverse-muted-surface", value: "#bd6a45" },
    { name: "color-inverse-muted-foreground", value: "#f7ddca" },
    { name: "color-inverse-muted-border", value: "rgb(255 247 233 / 18%)" },
    { name: "color-inverse-accent", value: "var(--color-inverse-accent-surface)" },
    { name: "color-inverse-muted", value: "var(--color-inverse-muted-surface)" },
  ],
  semanticColorRoles: SEMANTIC_COLOR_ROLES.map((role) => ({ ...role })),
  colorContexts: [
    { key: "default", label: "Default" },
    { key: "inverse", label: "Terracotta" },
    { key: "brand", label: "Slate blue" },
  ],
};

/** Prepare a host-supplied theme for the Hearth workspace.
 *
 * The first POC persisted Publr's neutral seven-role starter palette. Hosts
 * legitimately pass that document back on the next boot, so merely changing
 * the shell fallback leaves existing sites stuck on the old blue/white
 * swatches. Treat unchanged legacy values as starter data and fill missing
 * tokens only for the roles and contexts the theme actually declares. Real
 * customized values and customized semantic vocabularies always win. */
export function withHearthDefaults(theme: Theme = HEARTH_THEME): Theme {
  const sourceValues = new Map(theme.tokens.map((token) => [token.name, token.value]));
  const legacyRoleKeys = [
    "surface",
    "foreground",
    "accent",
    "accent-foreground",
    "muted",
    "muted-foreground",
    "border",
  ];
  const authoredRoleKeys = theme.semanticColorRoles?.map((role) => role.key) ?? [];
  const usesLegacyVocabulary =
    authoredRoleKeys.length === legacyRoleKeys.length &&
    legacyRoleKeys.every((key, index) => authoredRoleKeys[index] === key);
  const declaredRoles = usesLegacyVocabulary
    ? SEMANTIC_COLOR_ROLES.map((role) => ({ ...role }))
    : semanticColorRoles(theme);
  const declaredContexts = colorContexts(theme);
  const legacy = new Map<string, string>([
    ...SEMANTIC_COLOR_ROLES.map((role) => [`color-${role.key}`, role.value] as const),
    ...DEFAULT_PALETTE_TOKENS.map((token) => [token.name, token.value] as const),
  ]);
  const hearth = new Map(HEARTH_THEME.tokens.map((token) => [token.name, token.value]));
  const tokens = theme.tokens.map((token) => {
    if (token.name === "publr-heading-color" && token.value === "var(--color-foreground)") {
      return { ...token, value: SITE_TYPOGRAPHY_DEFAULTS.headingColor };
    }
    return legacy.get(token.name) === token.value && HEARTH_COLOR_VALUES[token.name]
      ? { ...token, value: HEARTH_COLOR_VALUES[token.name] }
      : token;
  });
  if (usesLegacyVocabulary) {
    const values = new Map(tokens.map((token) => [token.name, token.value]));
    const legacyStarterValues = new Map<string, string>([
      ["surface", "#ffffff"],
      ["foreground", "#18181b"],
      ["border", "#e4e4e7"],
      ["accent", "#3858e9"],
      ["accent-foreground", "#ffffff"],
      ["muted", "#f4f4f5"],
      ["muted-foreground", "#71717a"],
    ]);
    for (const context of declaredContexts) {
      const prefix = context.key === "default" ? "" : `${context.key}-`;
      const copy = (legacyRole: string, canonicalRole: string, fallbackRole?: string) => {
        const canonicalName = `color-${prefix}${canonicalRole}`;
        if (values.has(canonicalName)) return;
        const legacyValue = sourceValues.get(`color-${prefix}${legacyRole}`);
        const unchangedStarter =
          context.key === "default" && legacyValue === legacyStarterValues.get(legacyRole);
        const value = unchangedStarter
          ? hearth.get(canonicalName)
          : (legacyValue ??
            (context.key === "default" ? hearth.get(canonicalName) : undefined) ??
            (fallbackRole ? values.get(`color-${prefix}${fallbackRole}`) : undefined));
        if (!value) return;
        tokens.push({ name: canonicalName, value });
        values.set(canonicalName, value);
      };
      copy("accent", "accent-surface");
      copy("accent-foreground", "accent-foreground");
      copy("border", "accent-border", "border");
      copy("muted", "muted-surface");
      copy("muted-foreground", "muted-foreground");
      copy("border", "muted-border", "border");
    }
  }
  const names = new Set(tokens.map((token) => token.name));
  const hasNamedSpacing = tokens.some((token) => token.name.startsWith("spacing-"));
  const governedColorNames = new Set(
    declaredContexts.flatMap((context) =>
      declaredRoles.map(
        (role) => `color-${context.key === "default" ? "" : `${context.key}-`}${role.key}`,
      ),
    ),
  );
  for (const [name, value] of hearth) {
    if (
      (governedColorNames.has(name) ||
        name.startsWith("color-palette-") ||
        name === "container-content" ||
        name === "container-wide" ||
        name === "container-gutter" ||
        (!hasNamedSpacing && name.startsWith("spacing-")) ||
        name.startsWith("publr-")) &&
      !names.has(name)
    ) {
      tokens.push({ name, value });
    }
  }
  const finalNames = new Set(tokens.map((token) => token.name));
  for (const context of declaredContexts) {
    const prefix = context.key === "default" ? "" : `${context.key}-`;
    for (const [legacyRole, canonicalRole] of [
      ["accent", "accent-surface"],
      ["muted", "muted-surface"],
    ] as const) {
      const legacyName = `color-${prefix}${legacyRole}`;
      const canonicalName = `color-${prefix}${canonicalRole}`;
      if (!finalNames.has(legacyName) && finalNames.has(canonicalName)) {
        tokens.push({ name: legacyName, value: `var(--${canonicalName})` });
        finalNames.add(legacyName);
      }
    }
  }
  return {
    ...theme,
    tokens,
    semanticColorRoles: usesLegacyVocabulary
      ? SEMANTIC_COLOR_ROLES.map((role) => ({ ...role }))
      : (theme.semanticColorRoles?.map((role) => ({ ...role })) ??
        DEFAULT_THEME.semanticColorRoles?.map((role) => ({ ...role }))),
    colorContexts:
      theme.colorContexts?.map((context) => ({ ...context })) ??
      colorContexts(theme).map((context) => ({ ...context })),
    patterns: theme.patterns?.map((pattern) => ({ ...pattern })),
    templates: theme.templates?.map((template) => ({ ...template })),
    templateParts: theme.templateParts?.map((part) => ({ ...part })),
  };
}

/** Explicit compatibility preset for imported Tailwind templates. Authoring
 * controls still expose only semantic colors; the palette exists so classes
 * already present in imported markup can compile. */
export const TAILWIND_COMPAT_THEME: Theme = {
  tokens: [
    ...DEFAULT_THEME_TOKENS,
    ...DEFAULT_SEMANTIC_TOKENS,
    ...LEGACY_SEMANTIC_ALIAS_TOKENS,
    ...DEFAULT_CONTAINER_TOKENS,
    ...DEFAULT_SITE_TYPOGRAPHY_TOKENS,
  ],
  semanticColorRoles: SEMANTIC_COLOR_ROLES.map((role) => ({ ...role })),
  colorContexts: DEFAULT_COLOR_CONTEXTS.map((context) => ({ ...context })),
};

/** Add Tailwind's compatibility tokens to a site theme without overwriting
 * any token the site owns (including its semantic roles). */
export function withTailwindCompatibility(theme: Theme = DEFAULT_THEME): Theme {
  const owned = new Set(theme.tokens.map((token) => token.name));
  return {
    ...theme,
    tokens: [...DEFAULT_THEME_TOKENS.filter((token) => !owned.has(token.name)), ...theme.tokens],
  };
}

// The PAGE-active theme. A theme is SITE data and a page is one site — every
// editor instance on a page (the PublrInlineEditor many-instances case)
// resolves against the same theme, so this is page-scoped by design, not an
// accident. createEditor({ theme }) sets it; E2's backend seam formalizes
// ownership.
let active: Theme = DEFAULT_THEME;

/** The theme style serialization + controls currently resolve against. */
export const activeTheme = (): Theme => active;

/** Install the site theme (undefined restores Publr's semantic default). */
export function setActiveTheme(theme: Theme | undefined): void {
  active = theme ?? DEFAULT_THEME;
}

// Lookup maps are cached per theme object — themes are replaced, not mutated
// (same convention as the frozen registry).
const maps = new WeakMap<Theme, Map<string, string>>();
function map(theme: Theme): Map<string, string> {
  let m = maps.get(theme);
  if (!m) {
    m = new Map(theme.tokens.map((t) => [t.name, t.value]));
    maps.set(theme, m);
  }
  return m;
}

/** Raw value of a token, or undefined. */
export function tokenValue(theme: Theme, name: string): string | undefined {
  return map(theme).get(name);
}

/** Resolve an exact `var(--theme-token)` reference for editor-chrome previews.
 * Site variables intentionally do not leak into the shell, so chrome swatches
 * must receive their concrete value. Published CSS keeps the original
 * reference. Cycles and non-token CSS expressions are returned unchanged. */
export function resolveThemeValue(theme: Theme, value: string): string {
  let resolved = value.trim();
  const visited = new Set<string>();
  for (let depth = 0; depth < 16; depth += 1) {
    const reference = /^var\(\s*--([a-zA-Z0-9_-]+)(?:\s*,\s*(.+))?\s*\)$/.exec(resolved);
    if (!reference) return resolved;
    const [, name, fallback] = reference;
    if (visited.has(name)) return resolved;
    visited.add(name);
    const next = tokenValue(theme, name);
    if (!next) return fallback?.trim() ?? resolved;
    resolved = next.trim();
  }
  return resolved;
}

export interface ContainerWidths {
  content: string;
  wide: string;
  gutter: string;
}

/** Resolve the fixed semantic container roles. Legacy themes that predate
 * these tokens receive usable defaults without mutating their document. */
export function containerWidths(theme: Theme = activeTheme()): ContainerWidths {
  return {
    content: tokenValue(theme, "container-content") ?? CONTAINER_WIDTH_DEFAULTS.content,
    wide: tokenValue(theme, "container-wide") ?? CONTAINER_WIDTH_DEFAULTS.wide,
    gutter: tokenValue(theme, "container-gutter") ?? CONTAINER_WIDTH_DEFAULTS.gutter,
  };
}

/** Base site CSS driven by the portable theme tokens above. It deliberately
 * lives in `@layer base`: a block's authored utility classes or inline style
 * remain the more specific, later override. The template-width selectors
 * constrain the canvas CONTENT without adding a Group/container to the model. */
export function themeBaseCss(): string {
  return `@layer base {
  :is(#canvas, .pbe-preview) {
    box-sizing: border-box;
    color: var(--publr-body-color, var(--color-foreground, #18181b));
    background: var(--color-surface, #ffffff);
    font-family: var(--publr-body-font-family, var(--font-sans, ui-sans-serif, system-ui, sans-serif));
    font-size: var(--publr-body-font-size, 1rem);
    font-weight: var(--publr-body-font-weight, 400);
    line-height: var(--publr-body-line-height, 1.6);
    letter-spacing: var(--publr-body-letter-spacing, 0);
    text-transform: var(--publr-body-text-transform, none);
  }
  #canvas[data-pbe-template-width="content"] {
    padding-inline: max(
      var(--container-gutter, ${CONTAINER_WIDTH_DEFAULTS.gutter}),
      calc((100% - var(--container-content, ${CONTAINER_WIDTH_DEFAULTS.content})) / 2)
    );
  }
  #canvas[data-pbe-template-width="wide"] {
    padding-inline: max(
      var(--container-gutter, ${CONTAINER_WIDTH_DEFAULTS.gutter}),
      calc((100% - var(--container-wide, ${CONTAINER_WIDTH_DEFAULTS.wide})) / 2)
    );
  }
  :where(#canvas, .pbe-preview) :where(h1, h2, h3, h4, h5, h6) {
    color: var(--publr-heading-color, inherit);
    margin-block: var(--publr-heading-spacing-before, 1.5em)
      var(--publr-heading-spacing-after, 0.5em);
    font-family: var(--publr-heading-font-family, var(--font-sans, ui-sans-serif, system-ui, sans-serif));
    font-weight: var(--publr-heading-font-weight, 700);
    line-height: var(--publr-heading-line-height, 1.2);
    letter-spacing: var(--publr-heading-letter-spacing, -0.02em);
    text-transform: var(--publr-heading-text-transform, none);
  }
  :where(#canvas, .pbe-preview) :where(h1) {
    font-size: var(--publr-heading-1-size, 2.25rem);
  }
  :where(#canvas, .pbe-preview) :where(h2) {
    font-size: var(--publr-heading-2-size, 1.75rem);
  }
  :where(#canvas, .pbe-preview) :where(h3) {
    font-size: var(--publr-heading-3-size, 1.375rem);
  }
  :where(#canvas, .pbe-preview) :where(h4) {
    font-size: var(--publr-heading-4-size, 1.125rem);
  }
  :where(#canvas, .pbe-preview) :where(p, [data-pb-block="paragraph"]) {
    margin-block: 0 var(--publr-paragraph-spacing, 1rem);
  }
  :where(#canvas, .pbe-preview) :where(ul, ol) {
    margin-block: 0 var(--publr-list-spacing, 1rem);
  }
  :where(#canvas, .pbe-preview) :where(li + li) {
    margin-block-start: var(--publr-list-item-spacing, 0.375rem);
  }
  :where(#canvas, .pbe-preview) :where(dl) {
    margin-block: 0 var(--publr-definition-list-spacing, 1rem);
  }
  :where(#canvas, .pbe-preview) :where(dt) {
    font-weight: var(--publr-definition-term-weight, 600);
  }
  :where(#canvas, .pbe-preview) :where(dd) {
    margin-inline-start: 0;
    margin-block-start: var(--publr-definition-description-spacing, 0.25rem);
  }
  :where(#canvas, .pbe-preview) :where(dd + dt) {
    margin-block-start: var(--publr-definition-term-spacing, 1rem);
  }
  :where(#canvas, .pbe-preview) :where(blockquote) {
    margin-block: 0 var(--publr-blockquote-spacing, 1.5rem);
  }
  :where(#canvas, .pbe-preview) :where(hr) {
    margin-block: var(--publr-rule-spacing, 2rem);
  }
  :where(#canvas, .pbe-preview) :where(a) {
    color: var(--publr-link-color, var(--color-foreground, currentColor));
    font-family: var(--publr-link-font-family, var(--publr-body-font-family));
    font-size: var(--publr-link-font-size, var(--publr-body-font-size));
    font-weight: var(--publr-link-font-weight, 500);
    line-height: var(--publr-link-line-height, var(--publr-body-line-height));
    letter-spacing: var(--publr-link-letter-spacing, 0);
    text-transform: var(--publr-link-text-transform, none);
    text-decoration: var(--publr-link-text-decoration, underline);
  }
  :where(#canvas, .pbe-preview) :where(figcaption, [data-pb-rich="caption"]) {
    color: var(--publr-caption-color, currentColor);
    font-family: var(--publr-caption-font-family, var(--publr-body-font-family));
    font-size: var(--publr-caption-font-size, 0.875rem);
    font-weight: var(--publr-caption-font-weight, 400);
    line-height: var(--publr-caption-line-height, 1.4);
    letter-spacing: var(--publr-caption-letter-spacing, 0);
    text-transform: var(--publr-caption-text-transform, none);
  }
  :where(#canvas, .pbe-preview) :where(button, [data-pb-block="button"]) {
    color: var(--publr-button-color, var(--color-accent-foreground, currentColor));
    font-family: var(--publr-button-font-family, var(--publr-body-font-family));
    font-size: var(--publr-button-font-size, 0.875rem);
    font-weight: var(--publr-button-font-weight, 600);
    line-height: var(--publr-button-line-height, 1.2);
    letter-spacing: var(--publr-button-letter-spacing, 0);
    text-transform: var(--publr-button-text-transform, none);
  }
  :where(#canvas, .pbe-preview) > :where(h1, h2, h3, h4, h5, h6):first-child {
    margin-block-start: 0;
  }
}`;
}

/** Whether the theme defines a token. */
export function hasToken(theme: Theme, name: string): boolean {
  return map(theme).has(name);
}

/** Build a theme from a name→value record (tests, curated site themes). */
export function themeFromTokens(tokens: Record<string, string>): Theme {
  return { tokens: Object.entries(tokens).map(([name, value]) => ({ name, value })) };
}

/** One option a scale control offers: the token KEY (= utility-class suffix,
 * what the model stores), and the raw value for previews/tooltips. */
export interface ScaleOption {
  key: string;
  value: string;
}

// A namespace scan: tokens named `<prefix><key>`, skipping `--` modifiers
// (they belong to their base token) and any longer namespace that shadows
// this prefix (e.g. `text-shadow-*` inside `text-*`).
function scale(theme: Theme, prefix: string, exclude: readonly string[] = []): ScaleOption[] {
  const out: ScaleOption[] = [];
  for (const t of theme.tokens) {
    if (!t.name.startsWith(prefix) || t.name.includes("--")) continue;
    if (exclude.some((e) => t.name.startsWith(e))) continue;
    out.push({ key: t.name.slice(prefix.length), value: t.value });
  }
  return out;
}

/** Font sizes: `text-*` tokens (default: xs…9xl). `text-shadow-*` shares the
 * prefix and is excluded; `--line-height` modifiers ride their base token. */
export const fontSizes = (theme: Theme): ScaleOption[] => scale(theme, "text-", ["text-shadow-"]);

/** A color swatch: key is the class suffix (`red-500`), family/step split out
 * for grid layouts (single-name colors like a curated `color-brand` have no step). */
export interface ColorOption extends ScaleOption {
  family: string;
  step?: string;
}

/** Palette: `color-*` tokens, family-and-step split per the v4 naming rule
 * (`color-<family>-<step>` where step is numeric; anything else is a bare name). */
export function colors(theme: Theme): ColorOption[] {
  const legacyAliases = new Set(
    colorContexts(theme).flatMap((context) => {
      const prefix = context.key === "default" ? "" : `${context.key}-`;
      return [`${prefix}accent`, `${prefix}muted`];
    }),
  );
  return scale(theme, "color-")
    .filter((o) => !o.key.startsWith("palette-") && !legacyAliases.has(o.key))
    .map((o) => {
      const m = /^(.+)-(\d+)$/.exec(o.key);
      return m ? { ...o, family: m[1], step: m[2] } : { ...o, family: o.key };
    });
}

export interface SemanticColorOption extends ColorOption {
  label: string;
}

const title = (value: string): string =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

/** The semantic vocabulary owned by a theme. Legacy token-only themes receive
 * the starter roles until they are saved with explicit definitions. */
export function semanticColorRoles(theme: Theme = activeTheme()): SemanticColorRoleDefinition[] {
  return (theme.semanticColorRoles?.length ? theme.semanticColorRoles : SEMANTIC_COLOR_ROLES).map(
    (role) => ({ ...role }),
  );
}

/** Named semantic palettes owned by a theme. Explicit metadata is
 * authoritative—even when it intentionally exposes only Default. Legacy
 * token-only documents infer contexts from `{context}-surface` tokens. */
export function colorContexts(theme: Theme = activeTheme()): ColorContextDefinition[] {
  if (theme.colorContexts?.length) return theme.colorContexts.map((context) => ({ ...context }));
  const roleKeys = semanticColorRoles(theme)
    .map((role) => role.key)
    .sort((left, right) => right.length - left.length);
  const inferred = theme.tokens
    .flatMap((token) => {
      const colorKey = token.name.startsWith("color-") ? token.name.slice("color-".length) : "";
      const role = roleKeys.find(
        (candidate) => colorKey === candidate || colorKey.endsWith(`-${candidate}`),
      );
      if (!role || colorKey === role) return [];
      return [colorKey.slice(0, -(role.length + 1))];
    })
    .filter((key, index, all) => !!key && all.indexOf(key) === index)
    .map((key) => ({ key, label: title(key) }));
  return [
    { key: "default", label: "Default" },
    ...inferred.filter((context) => context.key !== "default"),
  ];
}

/** Author-facing colors. Palette ramps remain private implementation material.
 * Roles and named contexts are both theme-owned; only their declared cartesian
 * product is exposed to block controls. */
export function semanticColors(theme: Theme): SemanticColorOption[] {
  return colorContexts(theme).flatMap((context) =>
    semanticColorRoles(theme).flatMap((role) => {
      const key = context.key === "default" ? role.key : `${context.key}-${role.key}`;
      const value = tokenValue(theme, `color-${key}`);
      return value
        ? [
            {
              key,
              family: context.label,
              value,
              label: context.key === "default" ? role.label : `${context.label} · ${role.label}`,
            },
          ]
        : [];
    }),
  );
}

/** Reusable author-facing colors. Publr-native values use the
 * `color-palette-*` namespace; explicitly imported Tailwind colors retain
 * their original `color-*` names for utility compatibility and are admitted
 * through `managedColorTokens`. Semantic role assignments remain a separate
 * layer and are intentionally excluded here. */
export function paletteTokens(theme: Theme): ThemeToken[] {
  const managed = new Set(theme.managedColorTokens ?? []);
  const semantic = new Set<string>();
  for (const context of colorContexts(theme)) {
    const prefix = context.key === "default" ? "" : `${context.key}-`;
    for (const role of semanticColorRoles(theme)) semantic.add(`color-${prefix}${role.key}`);
    semantic.add(`color-${prefix}accent`);
    semantic.add(`color-${prefix}muted`);
  }
  return theme.tokens.filter(
    (token) =>
      token.name.startsWith("color-palette-") ||
      (managed.has(token.name) && token.name.startsWith("color-") && !semantic.has(token.name)),
  );
}

/** Border radii: `radius-*` tokens (default: xs…4xl). */
export const radii = (theme: Theme): ScaleOption[] => scale(theme, "radius-");

/** Line heights: `leading-*` tokens (default: tight…loose). */
export const leadings = (theme: Theme): ScaleOption[] => scale(theme, "leading-");

/** Letter spacings: `tracking-*` tokens (default: tighter…widest). */
export const trackings = (theme: Theme): ScaleOption[] => scale(theme, "tracking-");

/** The v4 spacing MULTIPLIER (`--spacing`): `p-4` = 4 × this. */
export const spacingBase = (theme: Theme): string | undefined => tokenValue(theme, "spacing");

/** Named, reusable spacing decisions exposed by the active site theme. */
export const spacings = (theme: Theme): ScaleOption[] => scale(theme, "spacing-");

/** Backward-compatible numeric choices for themes that only define Tailwind's
 * base multiplier. New themes should expose named `spacing-*` tokens. */
export const SPACING_STEPS: readonly string[] = ["0", "1", "2", "4", "6", "8", "12", "16"];

/** Border-width steps — same status as SPACING_STEPS: v4 border widths are
 * fixed utilities (`border`, `border-2/4/8`), not theme tokens. "1" ⇒ `border`. */
export const BORDER_WIDTH_STEPS: readonly string[] = ["1", "2", "4", "8"];

// --- @theme CSS import/export (E4) -------------------------------------------
//
// Tailwind v4 config is CSS-first: a site's theme IS an `@theme { --token:
// value; }` block. Import parses exactly those blocks (custom properties
// anywhere else are NOT theme tokens); export writes one back — so a site's
// theme document stays interchangeable with any external Tailwind toolchain.

/** Parse the `@theme` blocks out of a CSS text → a Theme (null: none found). */
export function themeFromCssText(css: string): Theme | null {
  const tokens = new Map<string, string>();
  for (const block of css.matchAll(/@theme\b[^{]*\{([^}]*)\}/gi)) {
    const body = block[1].replace(/\/\*[\s\S]*?\*\//g, "");
    for (const decl of body.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;]+?)(?:;|$)/g)) {
      const value = decl[2].trim();
      if (value) tokens.set(decl[1], value);
    }
  }
  if (!tokens.size) return null;
  return {
    tokens: [...tokens].map(([name, value]) => ({ name, value })),
    managedColorTokens: [...tokens.keys()].filter((name) => name.startsWith("color-")),
  };
}

/** Serialize a theme as v4 `@theme` CSS (or a plain `:root` block for the
 * inline backend's published form). */
export function themeToCssText(theme: Theme, selector: "@theme" | ":root" = "@theme"): string {
  const body = theme.tokens.map((t) => `  --${t.name}: ${t.value};`).join("\n");
  return `${selector} {\n${body}\n}`;
}
