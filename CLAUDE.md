# CLAUDE.md — Publr Editor

**Standalone, provider-agnostic block editor.** TypeScript + Vite (vite-plus), Tailwind 4, vanilla DOM — no framework. It integrates with ANY backend or CMS through its public entrypoints (`createEditor`, `createEditorShell`, `attachInlineChrome`) and adapter seams (`persistence`, `media`, `setCssEngine`, host actions/panels). Publr CMS is just one host among many.

## Standalone — the integration law

- Built-in browser persistence (localStorage documents, OPFS media) exists ONLY so the editor is self-contained out of the box. Real deployments supply adapters. Integration layers are the implementor's concern; first-party integrations may exist elsewhere — never promised, never special-cased here.
- **If integrating requires hacking around the editor, that is an editor bug: an API is missing.** Design the missing seam (after consideration) instead of accepting the workaround — in the host or in the editor.
- **No opinionated theme or web design.** The editor is harness + rendering machinery. `DEFAULT_THEME` provides generic sensible defaults and nothing more; integrators author their own compatible themes. The Hearth theme is a demo/test FIXTURE (`src/demo-theme.ts`) — never exported from `src/index.ts`, never in the library bundle, never the fill source for host themes (`withThemeDefaults` fills structural gaps from `DEFAULT_THEME` only).
- **NO provider-specific code in this codebase.** No CMS- or backend-specific branches, endpoints, or naming. Cross-repo glue (e.g. exporting the demo theme into the Publr CMS) lives in the parent workspace `../scripts/`, never here. This applies to all agents and subagents — no exceptions.

**CRITICAL: Pre-release software with zero users — NO backwards compatibility, NO legacy support, NO migrations, NO deprecation periods.** Never write legacy handlers, compatibility shims, or fallbacks for "old" formats/data/APIs, and never keep dead code paths "just in case." When changing a format or API, change it everywhere and delete the old path in the same change. This applies to all agents and subagents — no exceptions.

## Project Management

Work is tracked in **Shortcut** (source of truth) — see the `short` CLI cheatsheet in the parent [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md).

## Commands

```bash
npm run dev          # vite dev server (demo page)
npm run build        # library build
npm run build:host   # host shell build
npm run build:demo   # demo build
npm run test         # vitest (browser mode via playwright)
npm run check        # typecheck
npm run lint         # lint
npm run fmt          # format
```

Use the `/verify` skill to verify changes end-to-end against the demo page in real Chromium.

## Vendored Code

**CRITICAL: NEVER edit `vendor/theme/default-theme.ts` directly.** It is GENERATED from `../jit/src/default-theme.zon` via `node ../scripts/vendor-theme.mjs`. This applies to all agents and subagents — no exceptions.
