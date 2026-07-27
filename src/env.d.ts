// Side-effect asset imports the bundler handles (Tailwind entry).
declare module "*.css";

// Raw-text imports (vite ?raw) — markdown fixtures pulled into tests, and the
// vendored preflight CSS the Preview page prepends.
declare module "*.md?raw" {
  const text: string;
  export default text;
}
declare module "*.css?raw" {
  const text: string;
  export default text;
}
declare module "*.css?inline" {
  const text: string;
  export default text;
}
declare module "*.html?raw" {
  const text: string;
  export default text;
}

// URL asset imports (vite ?url) — the vendored JIT wasm engine, fetched by the
// css-engine worker. Bundler rewrites this to the emitted asset URL.
declare module "*.wasm?url" {
  const url: string;
  export default url;
}

// The one import.meta.glob shape the manual-test harness uses (raw + eager →
// path → file text). Declared here instead of pulling in vite/client — this
// tsconfig is deliberately DOM-only.
interface ImportMeta {
  glob(
    pattern: string,
    options: { query: "?raw"; import: "default"; eager: true },
  ): Record<string, string>;
}
