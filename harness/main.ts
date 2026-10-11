// The demo editor: the full shell over a sample document, the way a host mounts it.
import { mount } from "publr/dom";
import { component } from "publr-jsx";
import { registerCoreBlocks } from "../blocks/index";
import { registerCorePatterns } from "../blocks/patterns";
import { EditorShell } from "../shell/Shell.ptsx";
import type { DocumentHost } from "../shell/session";
import type { Session } from "../shell/session";
import { canvasStylesheet, hearthStyles, startChrome } from "./chrome";
import { HEARTH_THEME } from "./hearth";
import { DEMO_TEXT_STYLES, DEMO_THEME } from "./demo-theme";
import { demoTemplates } from "./templates";
import { HOME_PATTERNS, registerHomePatterns, stampedDocument } from "./home-patterns";

registerCoreBlocks();
registerCorePatterns();
registerHomePatterns();
await startChrome();

const STORAGE = "publr-editor.demo.hearth";
let saved: string | null = null;
try {
  saved = localStorage.getItem(STORAGE);
} catch {
  saved = null;
}

// The demo's document as a host presents it: its name, View and Rename, a featured image.
const META = "publr-editor.demo.document";
type Meta = { title: string; featured: { src: string; alt: string; width: string; height: string } | null };
const readMeta = (): Meta => {
  try {
    return { title: "Homepage", featured: null, ...JSON.parse(localStorage.getItem(META) ?? "{}") };
  } catch {
    return { title: "Homepage", featured: null };
  }
};
let meta = readMeta();
const writeMeta = (next: Meta) => {
  meta = next;
  try {
    localStorage.setItem(META, JSON.stringify(meta));
  } catch {
    // Kept for this page only.
  }
  changed.forEach((listener) => listener());
};
const changed = new Set<() => void>();
let current: Session | null = null;
/** View: the page as it publishes, in a new tab. */
const view = () => {
  const page = window.open("", "_blank");
  if (!page || !current) return;
  const styles = hearthStyles.map((href) => `<link rel="stylesheet" href="${href}">`).join("");
  page.document.write(`<!doctype html><meta charset="utf-8"><title>${meta.title}</title>${styles}<body>${current.previewHtml()}</body>`);
  page.document.close();
};
const demoDocument: DocumentHost = {
  title: () => meta.title,
  actions: () => [
    { id: "view", label: "View" },
    { id: "rename", label: "Rename" },
  ],
  run(id) {
    if (id === "view") view();
    if (id === "rename") {
      const title = window.prompt("Rename", meta.title)?.trim();
      if (title) writeMeta({ ...meta, title });
    }
  },
  featuredImage: () => meta.featured,
  setFeaturedImage: (value) => writeMeta({ ...meta, featured: value && value.src ? value : null }),
  onChange(listener) {
    changed.add(listener);
    return () => changed.delete(listener);
  },
};

const app = document.getElementById("app")!;
app.className = "h-screen";
mount(
  app,
  () =>
    component(EditorShell, {
      content: saved ?? stampedDocument(HOME_PATTERNS),
      canvasStylesheet,
      siteStyles: hearthStyles,
      wide: true,
      theme: HEARTH_THEME,
      textStyles: DEMO_TEXT_STYLES,
      templates: demoTemplates(() => meta.title),
      document: demoDocument,
      apps: { design: () => location.assign("./design.html"), moodboard: () => location.assign("./moodboard.html") },
      onChange: (html: string) => {
        try {
          localStorage.setItem(STORAGE, html);
        } catch {
          // Storage is a convenience here; the demo works without it.
        }
      },
      onReady: (session: Session) => {
        current = session;
        (window as unknown as { editorSession: Session }).editorSession = session;
      },
    }),
  {},
);
document.documentElement.setAttribute("data-editor-ready", "");
