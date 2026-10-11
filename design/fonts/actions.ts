// What the Fonts library does: the toolbar, the Add font dialog's three sources, the
// Edit font dialog. Each action takes its builder instance first, so it stays valid
// across the awaits of a Google probe or an upload.
import { Publr } from "publr-jsx";
import { builder } from "../Builder.ptsx";
import { inspectFontFile, FONT_FILE_ACCEPT } from "../model/font-file";
import { googleFontFallback, probeGoogleFont } from "../model/google-fonts";
import type { GoogleFontCategory } from "../model/google-fonts";
import { SYSTEM_FONT_PRESETS, fontFallbackFor, fontTokenName, parseFaceWeight, putFont, removeFont, renameFont, toggleWeight, updateFont } from "../model/fonts";
import { FONT_WEIGHT_NAMES, fontStack } from "../model/system";
import type { DesignSystem, FontDefinition } from "../model/system";
import { requestRemoval } from "../removal/actions";
import type { BuilderInstance } from "../state";
import { GOOGLE_BROWSE_LIMIT } from "./view";
import type { UploadRow } from "./view";

/** Commit a document, or show why not. */
function commit(b: BuilderInstance, next: DesignSystem | string): boolean {
  if (typeof next === "string") {
    b.state.fontError = next;
    b.refresh();
    return false;
  }
  b.state.fontError = "";
  b.change(next);
  return true;
}

function resetForm(b: BuilderInstance): void {
  const state = b.state;
  state.fontAddOpen = false;
  state.fontError = "";
  state.fontBusy = false;
  state.fontBusyLabel = "";
  state.googleQuery = "";
  state.googleCategory = "";
  state.googleFocus = "";
  state.googleFocusCategory = "";
  state.googleFocusLoading = false;
  state.googleFocusServed = [];
  state.googleFocusChosen = [];
  state.googleFocusItalic = false;
  state.googleFocusItalicEnabled = false;
  state.googleLimit = GOOGLE_BROWSE_LIMIT;
  state.fontUploads = [];
  state.fontUploadFamily = "";
}

// ── the toolbar ─────────────────────────────────────────────────────────

export function setFontQuery(query: string): void {
  const b = builder();
  b.state.fontQuery = query;
  b.refresh();
}

export function setPreviewText(text: string): void {
  const b = builder();
  b.state.fontPreviewText = text;
  b.refresh();
}

export function setPreviewSize(value: string): void {
  const b = builder();
  const size = Number(value);
  if (!Number.isFinite(size)) return;
  b.state.fontPreviewSize = Math.min(96, Math.max(12, Math.round(size)));
  b.refresh();
}

export function toggleAddFont(): void {
  const b = builder();
  const open = !b.state.fontAddOpen;
  resetForm(b);
  b.state.fontAddOpen = open;
  b.state.modal = open;
  b.refresh();
}

export function setFontSource(source: "google" | "upload" | "system"): void {
  const b = builder();
  b.state.fontSource = source;
  b.state.fontError = "";
  b.refresh();
}

// ── system font stacks ──────────────────────────────────────────────────

export function setStackView(view: "grid" | "list"): void {
  const b = builder();
  b.state.stackView = view;
  b.refresh();
}

export function setStackSize(value: string): void {
  const b = builder();
  const size = Number(value);
  if (!Number.isFinite(size)) return;
  b.state.stackSize = Math.min(48, Math.max(14, Math.round(size)));
  b.refresh();
}

export function previewStackWeight(key: string, weight: number): void {
  const b = builder();
  b.state.stackWeights = { ...b.state.stackWeights, [key]: weight };
  b.refresh();
}

export function addSystemFont(key: string): void {
  const b = builder();
  const preset = SYSTEM_FONT_PRESETS.find((row) => row.key === key);
  if (!preset) return;
  if (!commit(b, putFont(b.system(), fontTokenName(preset.label), preset.stack, null))) return;
  resetForm(b);
  b.state.modal = false;
  b.refresh();
}

// ── Google Fonts ────────────────────────────────────────────────────────

export function searchGoogle(query: string): void {
  const b = builder();
  b.state.googleQuery = query;
  b.state.googleLimit = GOOGLE_BROWSE_LIMIT;
  b.state.fontError = "";
  b.refresh();
}

export function setGoogleCategory(category: string): void {
  const b = builder();
  b.state.googleCategory = category;
  b.state.googleLimit = GOOGLE_BROWSE_LIMIT;
  b.refresh();
}

/** The list grows by a page whenever it nears its bottom. */
export function googleScrolled(event: Event): void {
  const b = builder();
  const list = event.currentTarget as HTMLElement;
  if (list.scrollTop + list.clientHeight < list.scrollHeight - 160 || !b.state.googleHasMore) return;
  b.state.googleLimit += GOOGLE_BROWSE_LIMIT;
  b.refresh();
}

/** The reading weights a site uses, when Google serves them. */
const preferredWeights = (served: number[]) => {
  const reading = served.filter((weight) => weight >= 400 && weight <= 700);
  return reading.length ? reading : served;
};

/** The master list picks a family; the detail pane asks Google what it serves. */
export async function focusGoogle(family: string, category: string): Promise<void> {
  const b = builder();
  const state = b.state;
  state.googleFocus = family;
  state.googleFocusCategory = category || "sans-serif";
  state.googleFocusServed = [];
  state.googleFocusChosen = [];
  state.googleFocusItalic = false;
  state.googleFocusItalicEnabled = false;
  state.fontError = "";
  state.googleFocusLoading = true;
  b.refresh();
  const served = await probeGoogleFont(family);
  if (state.googleFocus !== family) return;
  state.googleFocusLoading = false;
  if (!served) {
    state.fontError = Publr.t("Google Fonts has no family called “{name}”.", { name: family });
    b.refresh();
    return;
  }
  state.googleFocusServed = served.weights;
  state.googleFocusChosen = preferredWeights(served.weights);
  state.googleFocusItalic = served.italic;
  b.refresh();
}

export function toggleGoogleWeight(weight: number): void {
  const b = builder();
  const chosen = b.state.googleFocusChosen;
  b.state.googleFocusChosen = chosen.includes(weight) ? chosen.filter((item) => item !== weight) : [...chosen, weight].sort((x, y) => x - y);
  b.refresh();
}

export function toggleGoogleItalic(): void {
  const b = builder();
  b.state.googleFocusItalicEnabled = !b.state.googleFocusItalicEnabled;
  b.refresh();
}

/** Add the focused family with its checked weights, or a typed one after a probe. */
export async function addGoogleFont(typed: boolean): Promise<void> {
  const b = builder();
  const state = b.state;
  const family = (typed ? state.googleQuery : state.googleFocus).trim();
  const category = (typed ? "sans-serif" : state.googleFocusCategory || "sans-serif") as GoogleFontCategory;
  const name = fontTokenName(family);
  if (!family || !name || state.fontBusy) return;
  let served: { weights: number[]; italic: boolean } | null;
  let chosen: number[];
  let italic = false;
  if (!typed && state.googleFocusServed.length) {
    served = { weights: state.googleFocusServed, italic: state.googleFocusItalic };
    chosen = state.googleFocusChosen.length ? state.googleFocusChosen : served.weights;
    italic = state.googleFocusItalicEnabled;
  } else {
    state.fontBusy = true;
    state.fontBusyLabel = Publr.t("Checking “{name}” on Google Fonts…", { name: family });
    state.fontError = "";
    b.refresh();
    served = await probeGoogleFont(family);
    state.fontBusy = false;
    state.fontBusyLabel = "";
    if (!served) {
      state.fontError = Publr.t("Google Fonts has no family called “{name}”.", { name: family });
      b.refresh();
      return;
    }
    chosen = preferredWeights(served.weights);
  }
  const definition: FontDefinition = {
    token: name,
    family,
    fallback: googleFontFallback(category),
    provider: "google",
    weights: chosen,
    italic,
    availableWeights: served.weights,
    availableItalic: served.italic,
  };
  if (!commit(b, putFont(b.system(), name, fontStack(definition), definition))) return;
  resetForm(b);
  state.modal = false;
  b.refresh();
}

// ── uploaded files ──────────────────────────────────────────────────────

async function stage(b: BuilderInstance, files: File[]): Promise<UploadRow[]> {
  const upload = b.props.media!.upload;
  return Promise.all(
    files.map(async (file) => {
      const [facts, stored] = await Promise.all([inspectFontFile(file), upload(file)]);
      return {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        file: file.name,
        src: stored.src,
        family: facts.family,
        weight: Array.isArray(facts.weight) ? "variable" : String(facts.weight),
        italic: facts.italic,
        choices: [],
        style: "",
      };
    }),
  );
}

const fontFiles = (list: FileList | null | undefined) => {
  const accepted = FONT_FILE_ACCEPT.split(",");
  return [...(list ?? [])].filter((file) => accepted.some((extension) => file.name.toLowerCase().endsWith(extension)));
};

/** Files from the picker or dropped on the zone: uploaded, then staged as faces. */
export async function pickFontFiles(list: FileList | null | undefined): Promise<void> {
  const b = builder();
  const state = b.state;
  const files = fontFiles(list);
  if (!files.length) return;
  if (!b.props.media) {
    state.fontError = Publr.t("This site has nowhere to store font files yet.");
    b.refresh();
    return;
  }
  state.fontBusy = true;
  state.fontBusyLabel = Publr.tn("Uploading {count} file…", "Uploading {count} files…", files.length);
  state.fontError = "";
  b.refresh();
  try {
    const staged = await stage(b, files);
    state.fontUploads = [...state.fontUploads, ...staged];
    if (!state.fontUploadFamily) state.fontUploadFamily = staged[0].family;
  } catch {
    state.fontError = Publr.t("Upload failed.");
  }
  state.fontBusy = false;
  state.fontBusyLabel = "";
  b.refresh();
}

export function chooseFontFiles(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  void pickFontFiles(files).then(() => (input.value = ""));
}

export function setUploadFamily(family: string): void {
  const b = builder();
  b.state.fontUploadFamily = family;
}

export function setUploadWeight(id: string, weight: string): void {
  const b = builder();
  b.state.fontUploads = b.state.fontUploads.map((row) => (row.id === id ? { ...row, weight } : row));
  b.refresh();
}

export function toggleUploadItalic(id: string): void {
  const b = builder();
  b.state.fontUploads = b.state.fontUploads.map((row) => (row.id === id ? { ...row, italic: !row.italic } : row));
  b.refresh();
}

export function removeUpload(id: string): void {
  const b = builder();
  b.state.fontUploads = b.state.fontUploads.filter((row) => row.id !== id);
  b.refresh();
}

export function commitUpload(): void {
  const b = builder();
  const state = b.state;
  const family = state.fontUploadFamily.trim();
  const name = fontTokenName(family);
  if (!state.fontUploads.length) return void commit(b, Publr.t("Pick at least one font file."));
  if (!name) return void commit(b, Publr.t("Give the family a name."));
  const definition: FontDefinition = {
    token: name,
    family,
    fallback: "sans-serif",
    provider: "files",
    faces: state.fontUploads.map((row) => ({ weight: parseFaceWeight(row.weight), italic: row.italic, src: row.src })),
  };
  if (!commit(b, putFont(b.system(), name, fontStack(definition), definition))) return;
  resetForm(b);
  state.modal = false;
  b.refresh();
}

// ── one family: edit, rename, remove ────────────────────────────────────

export async function editFont(name: string): Promise<void> {
  const b = builder();
  const state = b.state;
  state.fontEditing = name;
  state.fontEditName = b.system().fonts.find((font) => font.token === name)?.family ?? state.fontRows.find((row) => row.name === name)?.label ?? "";
  state.fontError = "";
  state.modal = true;
  b.refresh();
  // What a site saves records only what it loads: ask Google again, so the dialog offers
  // everything it serves (and the stored definition heals).
  const editing = b.system().fonts.find((font) => font.token === name);
  if (editing?.provider !== "google") return;
  const served = await probeGoogleFont(editing.family);
  if (!served || state.fontEditing !== name) return;
  b.change(updateFont(b.system(), name, (font) => (font.provider === "google" ? { ...font, weights: font.weights.filter((weight) => served.weights.includes(weight)), availableWeights: served.weights, availableItalic: served.italic } : font)));
}

export function setEditName(name: string): void {
  builder().state.fontEditName = name;
}

export function cancelFontEdit(): void {
  const b = builder();
  b.state.fontEditing = "";
  b.state.fontError = "";
  b.state.modal = false;
  b.refresh();
}

export function saveFont(): void {
  const b = builder();
  const previous = b.state.fontEditing;
  const result = renameFont(b.system(), previous, b.state.fontEditName.trim());
  if (typeof result === "string") return void commit(b, result);
  b.state.fontEditing = "";
  b.state.modal = false;
  commit(b, result);
}

/** Remove a family; whatever used it switches to another (asked first when in use). */
export function removeFamily(name: string): void {
  const b = builder();
  const fallback = fontFallbackFor(b.system(), name);
  b.state.fontEditing = "";
  b.state.modal = false;
  b.refresh();
  if (!fallback) return;
  const label = b.state.fontRows.find((row) => row.name === name)?.label ?? name;
  requestRemoval({
    title: Publr.t("Remove {name}?", { name: label }),
    tokens: [name],
    alternatives: b.state.fontRows.filter((row) => row.name !== name).map((row) => ({ key: row.name, label: row.label })),
    apply: (system, replacement) => removeFont(system, name, replacement || fallback),
  });
}

export function toggleFontWeight(name: string, weight: number): void {
  const b = builder();
  b.change(updateFont(b.system(), name, (font) => toggleWeight(font, weight)));
}

export function toggleFontItalic(name: string): void {
  const b = builder();
  b.change(updateFont(b.system(), name, (font) => (font.provider === "google" && font.availableItalic ? { ...font, italic: !font.italic } : font)));
}

export function toggleFaceItalic(name: string, index: number): void {
  const b = builder();
  b.change(updateFont(b.system(), name, (font) => (font.provider === "files" ? { ...font, faces: font.faces.map((face, at) => (at === index ? { ...face, italic: !face.italic } : face)) } : font)));
}

export function removeFace(name: string, index: number): void {
  const b = builder();
  b.change(updateFont(b.system(), name, (font) => (font.provider === "files" && font.faces.length > 1 ? { ...font, faces: font.faces.filter((_, at) => at !== index) } : font)));
}

/** More files for an uploaded family, from the Edit font dialog. */
export async function addFaces(name: string, event: Event): Promise<void> {
  const b = builder();
  const state = b.state;
  const input = event.target as HTMLInputElement;
  const files = fontFiles(input.files);
  input.value = "";
  if (!files.length) return;
  if (!b.props.media) {
    state.fontError = Publr.t("This site has nowhere to store font files yet.");
    b.refresh();
    return;
  }
  state.fontBusy = true;
  state.fontBusyLabel = Publr.tn("Uploading {count} file…", "Uploading {count} files…", files.length);
  b.refresh();
  try {
    const staged = await stage(b, files);
    b.change(updateFont(b.system(), name, (font) => (font.provider === "files" ? { ...font, faces: [...font.faces, ...staged.map((row) => ({ weight: parseFaceWeight(row.weight), italic: row.italic, src: row.src }))] } : font)));
  } catch {
    state.fontError = Publr.t("Upload failed.");
  }
  state.fontBusy = false;
  state.fontBusyLabel = "";
  b.refresh();
}

export const weightName = (weight: number) => FONT_WEIGHT_NAMES[weight] ?? String(weight);
