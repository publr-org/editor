import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";

// HOST build (`npm run build:host`): the same library, but the PublrJS
// runtime is NOT bundled — src/publr-runtime is aliased to the host-global
// delegate, so the editor uses the PublrJS instance the embedding page
// already loaded (window.Publr). For hosts that ship their own PublrJS
// (the Publr CMS admin loads /static/publr-core.js); standalone hosts use
// the default build instead.
//
//   dist/publr-editor.host.iife.js  (script tag; requires window.Publr)
//   dist/publr-editor.host.js       (ES module; same requirement)
//
// CSS is identical to the default build — the default `npm run build` owns
// dist/publr-editor.css; this config writes its own copy under a host name
// only to avoid clobbering timestamps when both builds run.
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      {
        find: /\.\/publr-runtime$/,
        replacement: new URL("./src/publr-runtime-host.ts", import.meta.url).pathname,
      },
    ],
  },
  build: {
    emptyOutDir: false, // sits next to the default build's artifacts
    lib: {
      entry: "src/index.ts",
      name: "Publr.Editor",
      formats: ["es", "iife"],
      fileName: (format) =>
        format === "iife" ? "publr-editor.host.iife.js" : "publr-editor.host.js",
      cssFileName: "publr-editor.host",
    },
  },
});
