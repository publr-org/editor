// The moodboard on its admin page (/admin/design/moodboard). The page carries the app's
// cards as JSON on the element the board fills; every change saves the whole board
// through `design.save_moodboard`, one save at a time, and the board keeps the record
// ids the answer gives its new cards. Files go to the media library; the Figma token
// stays in this browser.
import { mount } from "publr/dom";
import { component } from "publr-jsx";
import { send } from "publr/operations";
import { Moodboard } from "../moodboard/Moodboard.ptsx";
import type { MoodboardItem } from "../moodboard/model";
import { adoptIds, currentItems, retryFigma } from "../moodboard/store";
import { adminMedia } from "./MediaPicker.ptsx";

const FIGMA_TOKEN = "publr-editor.figma-token";
const SAVE_DELAY = 300;

function items(element: HTMLElement): MoodboardItem[] {
  try {
    const parsed: unknown = JSON.parse(element.getAttribute("data-items") ?? "[]");
    return Array.isArray(parsed) ? (parsed as MoodboardItem[]) : [];
  } catch {
    return [];
  }
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Saves the board a moment after it changes. A change while a save is out waits for
 * its answer, so a new card is created once and every later save names its record. */
function saver(app: string): () => void {
  let timer = 0;
  let saving = false;
  let again = false;
  const save = async (): Promise<void> => {
    if (saving) {
      again = true;
      return;
    }
    saving = true;
    const board = currentItems();
    try {
      const answer = (await send("design.save_moodboard", { app, items: board })) as { items: MoodboardItem[] };
      const renamed = new Map<string, string>();
      board.forEach((item, index) => {
        const saved = answer.items[index];
        if (saved && saved.id !== item.id) renamed.set(item.id, saved.id);
      });
      adoptIds(renamed);
    } catch (error) {
      console.warn(`[publr-editor] moodboard: ${reason(error)}`);
    } finally {
      saving = false;
      if (again) {
        again = false;
        void save();
      }
    }
  };
  return () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void save(), SAVE_DELAY);
  };
}

export function mountMoodboard(element: HTMLElement): void {
  element.setAttribute("data-app-mounted", "");
  const app = element.getAttribute("data-moodboard") ?? "";
  const media = adminMedia();
  const changed = saver(app);
  // A token added in another tab (the design system's settings) pulls the failed frames.
  window.addEventListener("storage", (event) => event.key === FIGMA_TOKEN && retryFigma());
  mount(
    element,
    () =>
      component(Moodboard, {
        items: items(element),
        editorHref: "/admin/design/templates",
        designHref: `/admin/design/system?app=${encodeURIComponent(app)}`,
        onChange: () => changed(),
        upload: (file: File) => media.upload(file).then((picked) => ({ src: picked.src, alt: picked.alt || undefined })),
        figmaToken: () => {
          try {
            return localStorage.getItem(FIGMA_TOKEN) ?? "";
          } catch {
            return "";
          }
        },
      }),
    {},
  );
}
