// The moodboard on a page of its own, the way any host would hold it: it hands over the
// stored cards, keeps what comes back and stores files, here all in this browser (a file
// becomes a data URL in its card). The Figma token is the author's, kept here too.
import { mount } from "publr/dom";
import { component } from "publr-jsx";
import { Moodboard } from "../moodboard/Moodboard.ptsx";
import type { MoodboardItem } from "../moodboard/model";
import { startChrome } from "./chrome";

const STORAGE = "publr-moodboard.items.v1";
const FIGMA_TOKEN = "publr-editor.figma-token";
const APPEARANCE = "publr.appearance";

const read = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

function stored(): MoodboardItem[] {
  try {
    const parsed: unknown = JSON.parse(read(STORAGE) || "[]");
    return Array.isArray(parsed) ? (parsed as MoodboardItem[]) : [];
  } catch {
    return [];
  }
}

const asDataUrl = (file: File): Promise<{ src: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve({ src: reader.result as string }));
    reader.addEventListener("error", () => reject(new Error("read failed")));
    reader.readAsDataURL(file);
  });

// Light or dark, the one preference every Publr app's page follows; dark until chosen.
document.documentElement.classList.toggle("dark", read(APPEARANCE) !== "light");

await startChrome();
const app = document.getElementById("app")!;
app.className = "h-screen";
mount(
  app,
  () =>
    component(Moodboard, {
      items: stored(),
      mark: true,
      editorHref: "./index.html",
      designHref: "./design.html",
      onChange: (items: MoodboardItem[]) => {
        try {
          localStorage.setItem(STORAGE, JSON.stringify(items));
        } catch {
          // Privacy mode or a full quota: the board keeps working for this session.
        }
      },
      upload: asDataUrl,
      figmaToken: () => read(FIGMA_TOKEN),
    }),
  {},
);
document.documentElement.setAttribute("data-editor-ready", "");
