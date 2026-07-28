// demo-theme.ts — the Hearth theme, a DEMO/TEST FIXTURE, deliberately outside
// the library's public API.
//
// The editor ships no opinionated theme or web design (see CLAUDE.md — the
// integration law): it provides theme MACHINERY plus DEFAULT_THEME's generic
// sensible defaults, and integrators author their own compatible themes.
// Hearth exists only so the standalone demo, the manual fixtures, and the
// browser tests have a realistic curated system to exercise the style
// pipeline against. Consumed by demo.ts, tests, and the workspace's
// CMS demo-theme export (../scripts/export-cms-theme.mjs) — never by
// src/index.ts.

import { DEFAULT_THEME, SEMANTIC_COLOR_ROLES } from "./theme";
import type { Theme } from "./theme";

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
    { name: "color-inverse-surface", value: "#a45332" },
    { name: "color-inverse-foreground", value: "#fff7e9" },
    { name: "color-inverse-border", value: "rgb(255 247 233 / 24%)" },
    { name: "color-inverse-accent-surface", value: "#f7dda4" },
    { name: "color-inverse-accent-foreground", value: "#3b332b" },
    { name: "color-inverse-accent-border", value: "#d9b86f" },
    { name: "color-inverse-muted-surface", value: "#bd6a45" },
    { name: "color-inverse-muted-foreground", value: "#f7ddca" },
    { name: "color-inverse-muted-border", value: "rgb(255 247 233 / 18%)" },
  ],
  semanticColorRoles: SEMANTIC_COLOR_ROLES.map((role) => ({ ...role })),
  colorContexts: [
    { key: "default", label: "Default" },
    { key: "inverse", label: "Terracotta" },
    { key: "brand", label: "Slate blue" },
  ],
};
