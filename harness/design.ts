// The design system builder on its own, over the Hearth & Home demo. Publishing keeps the
// system in this browser; the draft is kept beside it until published or reset. Files
// (font faces, SVGs) stay in memory as object URLs.
import { mount } from "publr/dom";
import { component } from "publr-jsx";
import { registerCoreBlocks } from "../blocks/index";
import { registerCorePatterns } from "../blocks/patterns";
import { DesignSystemBuilder } from "../design/Builder.ptsx";
import { completeSystem } from "../design/model/system";
import type { DesignSystem } from "../design/model/system";
import { siteStyles, startChrome } from "./chrome";
import { DEMO_SYSTEM } from "./design-fixture";
import { DEMO_LIBRARY } from "./design-library";
import type { LibraryData } from "../design/library/host";

registerCoreBlocks();
registerCorePatterns();
await startChrome();

const PUBLISHED = "publr-editor.design";
const read = <T>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
};
const published = read<DesignSystem | null>(PUBLISHED, null);
const references = read<unknown[]>("publr-editor.moodboard", []);
// The library's edits are kept in this browser, the demo's documents under them.
const LIBRARY = "publr-editor.design.library";
const library: LibraryData = read<LibraryData | null>(LIBRARY, null) ?? structuredClone(DEMO_LIBRARY);
const keepLibrary = () => {
  try {
    localStorage.setItem(LIBRARY, JSON.stringify(library));
  } catch {
    // Privacy mode: the edits live until the page closes.
  }
  return null;
};

const app = document.getElementById("app")!;
app.className = "h-screen";
mount(
  app,
  () =>
    component(DesignSystemBuilder, {
      system: completeSystem(published ?? DEMO_SYSTEM),
      app: "demo",
      draftKey: "publr-editor.design.draft",
      siteStyles,
      moodboardCount: references.length,
      openMoodboard: () => window.location.assign("moodboard.html"),
      openEditor: () => window.location.assign("index.html"),
      agent: { site: window.location.origin },
      onReady: (instance: unknown) => {
        (window as unknown as { designBuilder: unknown }).designBuilder = instance;
      },
      library: { ...library, savePattern: keepLibrary, saveTemplate: keepLibrary, savePart: keepLibrary },
      media: { upload: async (file: File) => ({ src: URL.createObjectURL(file) }) },
      save: (system: DesignSystem) => {
        try {
          localStorage.setItem(PUBLISHED, JSON.stringify(system));
          return null;
        } catch {
          return "This browser keeps nothing; the system lives until the page closes.";
        }
      },
    }),
  {},
);
document.documentElement.setAttribute("data-editor-ready", "");
