// jit-bridge.mjs — dev-server bridge to the native Publr JIT (E3, css-engine
// thoughts). POST /__jit with { classes, tokens } JSON → text/css compiled by
// ../jit/zig-out/bin/jit. A plain whitespace class list remains accepted for
// older callers.
// Production uses jit_wasm.wasm behind the same CssEngine interface; this
// bridge is the dev/native path. Plain .mjs: the project tsconfig is DOM-only
// (no @types/node) — types ride in jit-bridge.d.ts.
//
// The bridge materializes the supplied portable theme as a temporary ZON
// layer and passes it through the JIT's --theme seam. This is required for
// literal media-query breakpoint values.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const JIT = process.env.PUBLR_JIT ?? join(here, "..", "..", "jit", "zig-out", "bin", "jit");
const PREFLIGHT = join(here, "..", "..", "jit", "src", "preflight.css");

export function jitBridge() {
  return {
    name: "publr-jit-bridge",
    configureServer(server) {
      server.middlewares.use("/__jit", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 404;
          res.end();
          return;
        }
        if (!existsSync(JIT)) {
          res.statusCode = 503;
          res.end("jit binary not built — cd ../jit && zig build");
          return;
        }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          void (async () => {
            let classes = body;
            let tokens = [];
            try {
              const payload = JSON.parse(body);
              if (Array.isArray(payload.classes)) classes = payload.classes.join(" ");
              if (Array.isArray(payload.tokens)) tokens = payload.tokens;
            } catch {
              // Backwards-compatible plain class manifest.
            }
            const manifest = join(
              tmpdir(),
              `pbe-jit-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
            );
            const themePath = tokens.length
              ? join(
                  tmpdir(),
                  `pbe-jit-theme-${Date.now()}-${Math.random().toString(36).slice(2)}.zon`,
                )
              : null;
            await writeFile(manifest, classes);
            if (themePath) {
              const rows = tokens
                .filter(
                  (token) =>
                    token && typeof token.name === "string" && typeof token.value === "string",
                )
                .map(
                  (token) =>
                    `        .{ .name = ${JSON.stringify(token.name)}, .value = ${JSON.stringify(token.value)} },`,
                )
                .join("\n");
              await writeFile(themePath, `.{\n    .tokens = .{\n${rows}\n    },\n}\n`);
            }
            const args = [];
            // The demo page ships Tailwind preflight already — callers opt in
            // via ?preflight=1 (published-page previews would want it).
            if (req.url?.includes("preflight=1") && existsSync(PREFLIGHT))
              args.push(`--prepend=${PREFLIGHT}`);
            if (themePath) args.push(`--theme=${themePath}`);
            args.push(manifest);
            const proc = spawn(JIT, args);
            let out = "";
            let err = "";
            proc.stdout.on("data", (c) => (out += c));
            proc.stderr.on("data", (c) => (err += c));
            proc.on("close", (code) => {
              void unlink(manifest).catch(() => {});
              if (themePath) void unlink(themePath).catch(() => {});
              if (code !== 0) {
                res.statusCode = 500;
                res.end(err || "jit failed");
                return;
              }
              res.setHeader("Content-Type", "text/css");
              res.end(out);
            });
          })();
        });
      });
    },
  };
}
