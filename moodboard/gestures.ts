// Every gesture on the board and the view it moves: pan, zoom and fit; moving and
// resizing cards (drawn through the store on every frame, committed once on release);
// the keyboard; paste and drop; and the toolbar's adds.
import { MOODBOARD_DEFAULT_COLOR, MOODBOARD_DEFAULT_WIDTH, moodboardBounds, moodboardItemId, moodboardItemsFromText } from "./model";
import type { BoardPoint, MoodboardItem, MoodboardItemKind } from "./model";
import { addItems, boardRect, boardRoot, growTexts, removeItem, select, state, updateItem, uploadFiles } from "./store";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const MIN_WIDTH = 120;
const STEP = 1.2;

type Drag = {
  kind: "pan" | "move" | "resize";
  pointer: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  /** The card being moved or resized, as it was when the drag began. */
  item?: MoodboardItem;
  moved: boolean;
};

let drag: Drag | null = null;
let fitted = false;

const editable = (target: EventTarget | null): boolean => target instanceof Element && !!target.closest("input, textarea, select, button, a, label, [contenteditable=true]");

function setView(x: number, y: number, z: number): void {
  state.view = { x, y, z };
}

/** The author moved the view: from now on the board keeps it. */
function moveView(x: number, y: number, z: number): void {
  following = false;
  setView(x, y, z);
}

/** A viewport point in board units. */
function toBoard(clientX: number, clientY: number): BoardPoint {
  const box = boardRect();
  const { x, y, z } = state.view;
  return { x: (clientX - box.left - x) / z, y: (clientY - box.top - y) / z };
}

/** Where a new card lands: around the viewport's centre, stepping down-right with each
 * card already on the board so successive adds never stack. */
function centre(width = MOODBOARD_DEFAULT_WIDTH.note): BoardPoint {
  const box = boardRect();
  const point = toBoard(box.left + box.width / 2, box.top + box.height / 2);
  const step = (state.items.length % 8) * 36;
  return { x: Math.round(point.x - width / 2 + step), y: Math.round(point.y - 120 + step) };
}

/** Zoom by `factor` around a viewport point (its centre by default). */
export function zoomAt(factor: number, clientX?: number, clientY?: number): void {
  const box = boardRect();
  const px = clientX === undefined ? box.width / 2 : clientX - box.left;
  const py = clientY === undefined ? box.height / 2 : clientY - box.top;
  const { x, y, z } = state.view;
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
  moveView(px - ((px - x) * next) / z, py - ((py - y) * next) / z, next);
}

export const zoomIn = (): void => zoomAt(STEP);
export const zoomOut = (): void => zoomAt(1 / STEP);

/** Every card in view, centred, at most 150%; an empty board puts its origin a third
 * of the way down the middle. */
export function fit(): void {
  const bounds = moodboardBounds(state.items);
  const box = boardRect();
  if (!bounds) return setView(box.width / 2, box.height / 3, 1);
  const pad = 80;
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((box.width - pad * 2) / bounds.w, (box.height - pad * 2) / bounds.h, 1.5)));
  setView((box.width - bounds.w * z) / 2 - bounds.x * z, (box.height - bounds.h * z) / 2 - bounds.y * z, z);
}

/** Until the author moves the view, the board keeps everything in view as it takes its
 * size (the first show, a resized window); after that it keeps the author's view. */
let following = true;

export function show(): void {
  requestAnimationFrame(() => {
    const element = root();
    if (!element) return;
    if (!fitted) {
      fitted = true;
      fit();
      // The board's size and its type can arrive after the first frame: fit and grow again.
      new ResizeObserver(() => {
        if (following) fit();
        growTexts();
      }).observe(element);
      void document.fonts?.ready.then(growTexts);
    }
    element.querySelector<HTMLElement>("[data-part='board-viewport']")?.focus({ preventScroll: true });
  });
}

const root = (): HTMLElement | null => boardRoot.current as HTMLElement | null;

/** A drag drawn through the store: the card's place or width as it would be now. */
function dragged(item: MoodboardItem, dx: number, dy: number, kind: Drag["kind"]): Partial<MoodboardItem> {
  const z = state.view.z;
  if (kind === "move") return { x: Math.round(item.x + dx / z), y: Math.round(item.y + dy / z) };
  const w = Math.max(MIN_WIDTH, Math.round(item.w + dx / z));
  return item.kind === "image" && item.h ? { w, h: Math.round((item.h * w) / item.w) } : { w };
}

function draw(id: string, patch: Partial<MoodboardItem>): void {
  state.items = state.items.map((item) => (item.id === id ? ({ ...item, ...patch } as MoodboardItem) : item));
}

export function pointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const target = event.target as Element;
  const card = target.closest<HTMLElement>("[data-part='board-card']");
  const item = card ? state.items.find((entry) => entry.id === card.dataset.id) : undefined;
  const base = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
  if (card && item && target.closest("[data-part='board-resize']")) {
    drag = { ...base, kind: "resize", originX: item.w, originY: item.h ?? 0, item: { ...item } };
  } else if (card) {
    if (item) select(item.id);
    if (editable(target) || !item) return;
    drag = { ...base, kind: "move", originX: item.x, originY: item.y, item: { ...item } };
  } else {
    if (editable(target)) return;
    drag = { ...base, kind: "pan", originX: state.view.x, originY: state.view.y };
    state.grabbing = true;
  }
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  event.preventDefault();
  (event.currentTarget as HTMLElement).focus({ preventScroll: true });
}

export function pointerMove(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointer) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
  if (drag.kind === "pan") moveView(drag.originX + dx, drag.originY + dy, state.view.z);
  else if (drag.item) draw(drag.item.id, dragged(drag.item, dx, dy, drag.kind));
}

export function pointerUp(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointer) return;
  const done = drag;
  drag = null;
  state.grabbing = false;
  const viewport = event.currentTarget as HTMLElement;
  if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  if (done.kind === "pan") {
    if (!done.moved) select("");
    return;
  }
  if (!done.moved || !done.item) return;
  updateItem(done.item.id, dragged(done.item, event.clientX - done.startX, event.clientY - done.startY, done.kind));
  select(done.item.id);
}

export function wheel(event: WheelEvent): void {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) return zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
  moveView(state.view.x - event.deltaX, state.view.y - event.deltaY, state.view.z);
}

export function keyDown(event: KeyboardEvent): void {
  if (editable(event.target)) return;
  const mod = event.metaKey || event.ctrlKey;
  if ((event.key === "Delete" || event.key === "Backspace") && state.selected) {
    event.preventDefault();
    removeItem(state.selected);
  } else if (event.key === "Escape") select("");
  else if (mod && (event.key === "=" || event.key === "+")) {
    event.preventDefault();
    zoomIn();
  } else if (mod && event.key === "-") {
    event.preventDefault();
    zoomOut();
  } else if (mod && event.key === "0") {
    event.preventDefault();
    fit();
  }
}

const addText = (text: string, at: BoardPoint): void => addItems(moodboardItemsFromText(text, at));

/** Images and font files; the store sorts them, and says so when a file is neither. */
const addFiles = (files: File[], at: BoardPoint): void => {
  if (files.length) void uploadFiles(files, at);
};

export function paste(event: ClipboardEvent): void {
  if (editable(event.target) || !root()?.isConnected) return;
  const data = event.clipboardData;
  if (!data) return;
  const files = [...data.files];
  if (files.length) {
    event.preventDefault();
    return addFiles(files, centre(MOODBOARD_DEFAULT_WIDTH.image));
  }
  const text = data.getData("text/plain");
  if (text.trim()) {
    event.preventDefault();
    addText(text, centre());
  }
}

export function dragOver(event: DragEvent): void {
  event.preventDefault();
  state.dropping = true;
}

export function dragLeave(): void {
  state.dropping = false;
}

type DroppedEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (resolve: (file: File) => void, reject: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (resolve: (entries: DroppedEntry[]) => void, reject: (error: unknown) => void) => void };
};

async function walk(entry: DroppedEntry): Promise<File[]> {
  if (entry.isFile && entry.file) return [await new Promise<File>((resolve, reject) => entry.file!(resolve, reject))];
  if (!entry.isDirectory || !entry.createReader) return [];
  const reader = entry.createReader();
  const found: File[] = [];
  // readEntries hands back a batch at a time; an empty one means done.
  for (;;) {
    const batch = await new Promise<DroppedEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const child of batch) found.push(...(await walk(child)));
  }
  return found;
}

/** Every file in a drop, folders opened; the housekeeping files a folder carries are not
 * the author's references. The entries must be taken while the drop is handled. */
async function droppedFiles(data: DataTransfer): Promise<File[]> {
  const entries = [...data.items]
    .filter((item) => item.kind === "file")
    .map((item) => ({ entry: (item as { webkitGetAsEntry?: () => DroppedEntry | null }).webkitGetAsEntry?.() ?? null, file: item.getAsFile() }));
  const files: File[] = [];
  for (const { entry, file } of entries) {
    if (entry?.isDirectory) files.push(...(await walk(entry).catch(() => [])));
    else if (file) files.push(file);
  }
  return files.filter((file) => !file.name.startsWith("."));
}

export function drop(event: DragEvent): void {
  event.preventDefault();
  state.dropping = false;
  const data = event.dataTransfer;
  if (!data) return;
  const at = toBoard(event.clientX, event.clientY);
  if (data.files.length) {
    void droppedFiles(data).then((files) => addFiles(files, at));
    return;
  }
  const text = data.getData("text/uri-list") || data.getData("text/plain");
  if (text.trim()) addText(text, at);
}

/** The toolbar's empty cards: a note, a link and a Figma frame take the caret. */
export function addCard(kind: Extract<MoodboardItemKind, "note" | "link" | "figma" | "color">): void {
  const w = MOODBOARD_DEFAULT_WIDTH[kind];
  const base = { id: moodboardItemId(), w, ...centre(w) };
  if (kind === "note") addItems([{ ...base, kind, text: "" }], true);
  else if (kind === "link") addItems([{ ...base, kind, url: "" }], true);
  else if (kind === "figma") addItems([{ ...base, kind, url: "" }], true);
  else addItems([{ ...base, kind, value: MOODBOARD_DEFAULT_COLOR }]);
}

/** The file picker's choice, at the centre. */
export function picked(event: Event): void {
  const input = event.target as HTMLInputElement;
  addFiles([...(input.files ?? [])], centre(MOODBOARD_DEFAULT_WIDTH.image));
  input.value = "";
}

let listening = false;

/** Paste reaches the board from anywhere on the page but a field. */
export function listen(): void {
  if (listening) return;
  listening = true;
  document.addEventListener("paste", paste);
}
