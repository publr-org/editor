# CLAUDE.md — Publr Editor

Block editor for Publr CMS. TypeScript + Vite (vite-plus), Tailwind 4, vanilla DOM — no framework.

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
