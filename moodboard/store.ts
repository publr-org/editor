// The moodboard's state and every way it changes: the cards (each commit hands the whole
// list to the host), the selection, the view (pan and zoom), uploads and Figma pulls.
// The board (Moodboard.ptsx) reads `state` and calls these actions; it computes nothing.
import { Publr } from "publr-jsx";
import { fetchFigmaFrame, parseFigmaUrl } from "./figma";
import { inspectFontFile } from "./font-file";
import { MOODBOARD_DEFAULT_WIDTH, copyItems, fontFaceLabel, moodboardItemId } from "./model";
import type { BoardPoint, MoodboardItem } from "./model";

/** Stores one file (an image or a font) and says where it lives. */
export type MoodboardUpload = (file: File) => Promise<{ src: string; alt?: string }>;

export type MoodboardOptions = {
  /** The cards the board starts from; copied, never changed. */
  items?: readonly MoodboardItem[];
  /** Every committed change: the whole list, the host's to keep. */
  onChange?: (items: MoodboardItem[]) => void;
  /** Where dropped, pasted and picked files go. Without it the board takes links,
   * colors and notes, and says it has nowhere to store files. */
  upload?: MoodboardUpload | null;
  /** The author's Figma access token, read each time a frame is pulled. */
  figmaToken?: () => string;
  /** What a Figma card says while there is no token. */
  figmaTokenMissing?: string;
};

/** A card as the board draws it: the item and what is shown of it. */
export type Card = MoodboardItem & {
  /** The row's key: the card's first id, kept when the server gives it another. */
  key: string;
  eyebrow: string;
  heading: string;
  face: string;
  swatch: number;
  pick: string;
};

const FONT_FILE = /\.(?:woff2?|ttf|otf)$/i;
const FONT_COLUMNS = 3;
const FONT_ROW = 190;

const isFontFile = (file: File): boolean => file.type.startsWith("font/") || FONT_FILE.test(file.name);
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const bare = (url: string): string => url.replace(/^https?:\/\/(www\.)?/, "");

/** The private family a font card's file is loaded under: one per file, so two files of
 * one family never fight over a weight and nothing reaches the host page's own fonts. */
function faceOf(src: string): string {
  let hash = 5381;
  for (let index = 0; index < src.length; index += 1) hash = ((hash << 5) + hash + src.charCodeAt(index)) | 0;
  return `pbe-moodboard-${(hash >>> 0).toString(36)}`;
}

const keys = new Map<string, string>();
/** Ids the server replaced, old to new, so a pull that started before still lands. */
const renames = new Map<string, string>();

function currentId(id: string): string {
  let at = id;
  while (renames.has(at)) at = renames.get(at)!;
  return at;
}

function cardOf(item: MoodboardItem): Card {
  const card = { ...item, key: keys.get(item.id) ?? item.id, eyebrow: "", heading: "", face: "", swatch: 0, pick: "#000000" } as Card;
  if (item.kind === "link" || item.kind === "figma") {
    card.eyebrow = item.kind === "link" ? hostOf(item.url) : "Figma";
    card.heading = item.title || bare(item.url);
  } else if (item.kind === "font") {
    card.eyebrow = Publr.t("Font · {face}", { face: fontFaceLabel(item) });
    card.face = `"${faceOf(item.src)}", ui-sans-serif, system-ui, sans-serif`;
  } else if (item.kind === "color") {
    card.swatch = Math.round(item.w * 0.72);
    card.pick = /^#[0-9a-f]{6}$/i.test(item.value) ? item.value : "#000000";
  }
  return card;
}

export const state = Publr.reactive({
  items: [] as MoodboardItem[],
  selected: "",
  busy: false,
  error: "",
  canUpload: false,
  /** Something is dragged over the board. */
  dropping: false,
  /** The canvas is being panned. */
  grabbing: false,
  /** Where the board's origin sits in the viewport, and the zoom. */
  view: { x: 0, y: 0, z: 1 },
  get cards(): Card[] {
    return state.items.map(cardOf);
  },
  get empty(): boolean {
    return state.items.length === 0;
  },
  get zoomLabel(): string {
    return `${Math.round(state.view.z * 100)}%`;
  },
  get uploadLabel(): string {
    return state.busy ? Publr.t("Uploading…") : Publr.t("Image or font");
  },
  get uploadTitle(): string {
    return state.canUpload ? Publr.t("Screenshots, photos, font files — or just drop them on the board") : Publr.t("This site has nowhere to store files yet");
  },
});

/** The element the board fills: its size is the viewport's. */
export const boardRoot = Publr.ref();

let options: MoodboardOptions = {};
let started = false;

const rect = (): DOMRect => (boardRoot.current as HTMLElement | null)?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);

/** Every change lands here: the store, the fonts, the host, then any Figma card that
 * now has a link to pull. */
function commit(items: MoodboardItem[]): void {
  state.items = items;
  loadFaces(items);
  options.onChange?.(copyItems(items));
  pullPending();
  growTexts();
}

export function updateItem(id: string, patch: Partial<MoodboardItem>): void {
  if (!state.items.some((item) => item.id === id)) return;
  commit(state.items.map((item) => (item.id === id ? ({ ...item, ...patch } as MoodboardItem) : item)));
}

export function removeItem(id: string): void {
  if (!state.items.some((item) => item.id === id)) return;
  commit(state.items.filter((item) => item.id !== id));
  if (state.selected === id) state.selected = "";
}

export function select(id: string): void {
  state.selected = id;
}

/** New cards join the board; the last is selected, and with `focus` its first field
 * takes the caret. */
export function addItems(items: MoodboardItem[], focus = false): void {
  if (!items.length) return;
  commit([...state.items, ...copyItems(items)]);
  const last = items[items.length - 1].id;
  state.selected = last;
  if (!focus) return;
  requestAnimationFrame(() => {
    const root = boardRoot.current as HTMLElement | null;
    root?.querySelector<HTMLElement>(`[data-id="${last}"] textarea, [data-id="${last}"] input`)?.focus();
  });
}

const specimens = new Set<string>();

/** A font card shows its own face: each file is registered once, from where it lives. */
function loadFaces(items: readonly MoodboardItem[]): void {
  if (typeof FontFace === "undefined") return;
  for (const item of items) {
    if (item.kind !== "font" || !item.src) continue;
    const face = faceOf(item.src);
    if (specimens.has(face)) continue;
    specimens.add(face);
    new FontFace(face, `url(${JSON.stringify(item.src)})`).load().then(
      (loaded) => document.fonts.add(loaded),
      () => specimens.delete(face),
    );
  }
}

/** A card's text fields stand as tall as their text. */
export function growText(area: HTMLTextAreaElement): void {
  area.style.height = "0px";
  area.style.height = `${area.scrollHeight}px`;
}

export const growInput = (event: Event): void => growText(event.target as HTMLTextAreaElement);

export function growTexts(): void {
  requestAnimationFrame(() => {
    const root = boardRoot.current as HTMLElement | null;
    for (const area of root?.querySelectorAll<HTMLTextAreaElement>("[data-part='board-card'] textarea") ?? []) growText(area);
  });
}

// Figma cards pull their frame once they have a link: render, colors, fonts. Without
// a token the card says where to add one.
const pulls = new Set<string>();

function pullPending(): void {
  for (const item of state.items) {
    if (item.kind === "figma" && item.url && item.status === "pending" && !pulls.has(item.id)) void pullFigma(item.id);
  }
}

async function pullFigma(id: string): Promise<void> {
  const item = state.items.find((entry) => entry.id === id);
  if (!item || item.kind !== "figma") return;
  const ref = parseFigmaUrl(item.url);
  if (!ref) return updateItem(id, { status: "error", error: Publr.t("That isn't a Figma file or frame link.") });
  const token = options.figmaToken?.().trim() ?? "";
  if (!token) return updateItem(id, { status: "error", error: options.figmaTokenMissing ?? Publr.t("Add a Figma access token to pull the frame.") });
  pulls.add(id);
  try {
    const frame = await fetchFigmaFrame(ref, token);
    updateItem(currentId(id), { status: "ready", error: undefined, title: frame.title, thumbnail: frame.thumbnail, colors: frame.colors, fonts: frame.fonts });
  } catch (error) {
    updateItem(currentId(id), { status: "error", error: error instanceof Error ? error.message : Publr.t("Figma failed.") });
  } finally {
    pulls.delete(id);
  }
}

/** Pull again every Figma card that failed (a token was just added). */
export function retryFigma(): void {
  const failed = (item: MoodboardItem) => item.kind === "figma" && item.status === "error" && !!item.url;
  if (!state.items.some(failed)) return;
  commit(state.items.map((item) => (failed(item) ? ({ ...item, status: "pending", error: undefined } as MoodboardItem) : item)));
}

/** Images and font files, dropped, pasted or picked. A family of fonts lands as a grid,
 * so every face reads at once. */
export async function uploadFiles(files: File[], at: BoardPoint): Promise<void> {
  const images = files.filter((file) => file.type.startsWith("image/"));
  const fonts = files.filter(isFontFile);
  if (!images.length && !fonts.length) {
    if (files.length) state.error = Publr.t("Only images and font files can go on the board.");
    return;
  }
  const store = options.upload;
  if (!store) {
    state.error = Publr.t("This site has nowhere to store files yet.");
    return;
  }
  state.busy = true;
  state.error = "";
  try {
    const uploaded = await Promise.all([
      ...images.map(async (file, index): Promise<MoodboardItem> => {
        const value = await store(file);
        const alt = value.alt ?? file.name.replace(/\.[a-z0-9]+$/i, "");
        return { id: moodboardItemId(), kind: "image", src: value.src, alt, x: Math.round(at.x + index * 40), y: Math.round(at.y + index * 40), w: MOODBOARD_DEFAULT_WIDTH.image };
      }),
      ...fonts.map(async (file, index): Promise<MoodboardItem> => {
        const [facts, value] = await Promise.all([inspectFontFile(file), store(file)]);
        const [weight, top] = Array.isArray(facts.weight) ? facts.weight : [facts.weight, undefined];
        const x = Math.round(at.x + (index % FONT_COLUMNS) * (MOODBOARD_DEFAULT_WIDTH.font + 24));
        const y = Math.round(at.y + Math.floor(index / FONT_COLUMNS) * FONT_ROW);
        const font: MoodboardItem = { id: moodboardItemId(), kind: "font", src: value.src, family: facts.family, weight, file: file.name, x, y, w: MOODBOARD_DEFAULT_WIDTH.font };
        if (top !== undefined) font.weight_max = top;
        if (facts.italic) font.italic = true;
        return font;
      }),
    ]);
    commit([...state.items, ...uploaded]);
  } catch (error) {
    console.error("[publr-moodboard] upload failed:", error);
    state.error = Publr.t("Upload failed.");
  } finally {
    state.busy = false;
  }
}

/** The board starts once, from the host's cards. */
export function start(next: MoodboardOptions): void {
  if (started) return;
  started = true;
  options = next;
  keys.clear();
  state.items = copyItems(next.items ?? []);
  state.canUpload = !!next.upload;
  loadFaces(state.items);
  growTexts();
  pullPending();
}

/** Replace the cards from outside (a load, a revert); no `onChange`. An echo of the
 * board's own last commit changes nothing. */
export function setItems(items: readonly MoodboardItem[]): void {
  if (JSON.stringify(items) === JSON.stringify(state.items)) return;
  state.items = copyItems(items);
  loadFaces(state.items);
  growTexts();
}

export function setUpload(upload: MoodboardUpload | null): void {
  options.upload = upload;
  state.canUpload = !!upload;
}

/** The server's ids for cards it just created: the board keeps them from now on, and the
 * cards keep their rows. */
export function adoptIds(renamed: ReadonlyMap<string, string>): void {
  if (renamed.size === 0) return;
  for (const [from, to] of renamed) {
    keys.set(to, keys.get(from) ?? from);
    renames.set(from, to);
  }
  state.items = state.items.map((item) => (renamed.has(item.id) ? ({ ...item, id: renamed.get(item.id)! } as MoodboardItem) : item));
  if (renamed.has(state.selected)) state.selected = renamed.get(state.selected)!;
}

export const currentItems = (): MoodboardItem[] => copyItems(state.items);

export { rect as boardRect };
