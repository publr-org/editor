// The Fonts library's slice of the store and its view of the document: one row per
// family (its specimen at the preview size, the weights or faces it loads), the Add font
// dialog's three sources, the Edit font dialog.
import { Publr } from "publr-jsx";
import { GOOGLE_FONTS, googleFontWeightsPreviewUrl, googleFontsPreviewUrl, searchGoogleFonts } from "../model/google-fonts";
import type { GoogleFontCategory } from "../model/google-fonts";
import { FONT_WEIGHT_CHOICES, SYSTEM_FONT_PRESETS, faceLabel, familyLabel } from "../model/fonts";
import { FONT_WEIGHT_NAMES, FONT_WEIGHT_STOPS, fontFamilyTokens, syncFontStylesheets } from "../model/system";
import type { DesignSystem, FontFace } from "../model/system";
import type { BuilderProps, State } from "../state";

export const GOOGLE_BROWSE_LIMIT = 24;
export const SPECIMEN = Publr.t("Sphinx of black quartz, judge my vow.");
const SPECIMEN_TEXT = `${SPECIMEN} 0123456789`;
const DEFAULT_PREVIEW = Publr.t("Make the complex feel clear.");

export type WeightRow = { weight: number; value: string; label: string; tag: string; enabled: boolean; italicTag: boolean; style: string };
export type FaceRow = { index: number; label: string; file: string; italic: boolean; removable: boolean; style: string };
export type FontRow = {
  name: string;
  label: string;
  value: string;
  provider: "google" | "files" | "system";
  sourceLabel: string;
  meta: string;
  weightsNote: string;
  weights: WeightRow[];
  italicShown: boolean;
  italic: boolean;
  faces: FaceRow[];
  removable: boolean;
  specimenStyle: string;
  editTitle: string;
  editDescription: string;
};
export type GoogleHit = { family: string; category: string; pressed: boolean; style: string };
export type UploadRow = { id: string; file: string; src: string; family: string; weight: string; italic: boolean; choices: { key: string; label: string; selected: boolean }[]; style: string };
export type StackCard = { key: string; label: string; stack: string; specimenStyle: string; familyStyle: string; weights: { weight: number; label: string; pressed: boolean; style: string }[] };

export const GOOGLE_CATEGORIES: readonly { key: string; label: string }[] = [
  { key: "", label: Publr.t("All") },
  { key: "sans-serif", label: Publr.t("Sans") },
  { key: "serif", label: Publr.t("Serif") },
  { key: "monospace", label: Publr.t("Mono") },
  { key: "display", label: Publr.t("Display") },
  { key: "handwriting", label: Publr.t("Script") },
];

export const initial = () => ({
  fontRows: [] as FontRow[],
  fontVisible: [] as FontRow[],
  fontQuery: "",
  fontPreviewText: "",
  fontSpecimenText: DEFAULT_PREVIEW,
  fontPreviewSize: 40,
  fontPreviewSizeLabel: "40px",
  fontCountLabel: "",
  fontAddOpen: false,
  fontSource: "system" as "google" | "upload" | "system",
  fontBusy: false,
  fontBusyLabel: "",
  fontError: "",
  fontCanUpload: false,
  fontEditing: "",
  fontEdit: null as FontRow | null,
  fontEditName: "",
  googleQuery: "",
  googleQueryTrimmed: "",
  googleAddTyped: "",
  googleCategory: "",
  googleCategories: [] as { key: string; label: string; pressed: boolean }[],
  googleLimit: GOOGLE_BROWSE_LIMIT,
  googleResults: [] as GoogleHit[],
  googleHasMore: false,
  googleFocus: "",
  googleFocusCategory: "",
  googleFocusMeta: "",
  googleFocusLoading: false,
  /** What Google serves for the focused family: every weight, and italics. */
  googleFocusServed: [] as number[],
  googleFocusChosen: [] as number[],
  googleFocusWeights: [] as WeightRow[],
  googleFocusItalic: false,
  googleFocusItalicEnabled: false,
  fontUploads: [] as UploadRow[],
  fontUploadFamily: "",
  stackView: "grid" as "grid" | "list",
  stackSize: 21,
  stackSizeLabel: "21px",
  /** The weight each system stack card previews at, by preset key. */
  stackWeights: {} as Record<string, number>,
  stackCards: [] as StackCard[],
});

const quoteFamily = (family: string) => `"${family}"`;

function faceRows(faces: FontFace[], stack: string): FaceRow[] {
  return faces.map((face, index) => {
    // A specimen must select this face: a variable range renders at its closest-to-reading weight.
    const weight = Array.isArray(face.weight) ? Math.min(Math.max(400, face.weight[0]), face.weight[1]) : face.weight;
    return {
      index,
      label: face.italic ? Publr.t("{face} Italic", { face: faceLabel(face.weight) }) : faceLabel(face.weight),
      file: face.src.split("/").pop() ?? face.src,
      italic: face.italic,
      removable: faces.length > 1,
      style: `font-family: ${stack}; font-weight: ${weight};${face.italic ? " font-style: italic;" : ""}`,
    };
  });
}

/** The library: every family token that is not a role, with what it loads. */
export function fontRows(system: DesignSystem, state: State): FontRow[] {
  const tokens = fontFamilyTokens(system);
  return tokens.map((token) => {
    const font = system.fonts.find((candidate) => candidate.token === token.name);
    const provider = font?.provider ?? "system";
    const offered = font?.provider === "google" ? font.availableWeights : provider === "system" ? FONT_WEIGHT_STOPS : [];
    const enabled = font && font.provider !== "files" ? font.weights : provider === "system" ? offered : [];
    const italic = font ? font.provider !== "files" && font.italic : provider === "system";
    const italicShown = font?.provider === "google" && font.availableItalic;
    const faces = faceRows(font?.provider === "files" ? font.faces : [], token.value);
    const sourceLabel = provider === "google" ? Publr.t("Google Fonts") : provider === "files" ? Publr.t("Uploaded files") : Publr.t("System fonts");
    const label = familyLabel(system, token);
    const styles = provider === "files" ? faces.length : enabled.length * (italicShown && italic ? 2 : 1);
    return {
      name: token.name,
      label,
      value: token.value,
      provider,
      sourceLabel,
      meta: Publr.tn("{source} · {count} style", "{source} · {count} styles", styles, { source: sourceLabel }),
      weightsNote: provider === "google" ? Publr.t("Weights the site loads and offers") : provider === "files" ? Publr.t("Uploaded faces") : Publr.t("Weights the site offers"),
      weights: offered.map((weight) => ({
        weight,
        value: String(weight),
        label: FONT_WEIGHT_NAMES[weight] ?? String(weight),
        tag: `${FONT_WEIGHT_NAMES[weight] ?? Publr.t("Weight")} ${weight}`,
        enabled: enabled.includes(weight),
        italicTag: !!italicShown && italic && enabled.includes(weight),
        style: `font-family: ${token.value}; font-weight: ${weight}`,
      })),
      italicShown: !!italicShown,
      italic,
      faces,
      removable: tokens.length > 1,
      specimenStyle: `font-family: ${token.value}; font-size: ${state.fontPreviewSize}px; font-weight: 600`,
      editTitle: Publr.t("Edit {name}", { name: label }),
      editDescription: Publr.t("{source} · the checked weights are the ones the site loads and offers.", { source: sourceLabel }),
    };
  });
}

function stackCards(state: State): StackCard[] {
  return SYSTEM_FONT_PRESETS.map((preset) => {
    const chosen = state.stackWeights[preset.key] ?? 400;
    return {
      ...preset,
      specimenStyle: `font-family: ${preset.stack}; font-size: ${state.stackSize}px; font-weight: ${chosen}`,
      familyStyle: `font-family: ${preset.stack}`,
      weights: FONT_WEIGHT_STOPS.map((weight) => ({ weight, label: String(weight), pressed: weight === chosen, style: `font-weight: ${weight}` })),
    };
  });
}

/** One stylesheet link kept at `id`, or none. */
function previewLink(id: string, href: string | null): void {
  if (typeof document === "undefined") return;
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!href) {
    link?.remove();
    return;
  }
  if (link?.getAttribute("href") === href) return;
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    document.head.append(link);
  }
  link.href = href;
}

/** The page renders specimens in their own faces: the system's web fonts, the Google
 * browser's families, the staged uploads. */
function loadPreviewFonts(system: DesignSystem, state: State, results: GoogleHit[]): void {
  if (typeof document === "undefined") return;
  syncFontStylesheets(document, system);
  const families = state.fontAddOpen ? [...new Set([...results.map((hit) => hit.family), state.googleFocus].filter(Boolean))] : [];
  previewLink("design-google-preview", families.length ? googleFontsPreviewUrl(families, [...new Set(families.join("") + SPECIMEN_TEXT)].join("")) : null);
  previewLink(
    "design-google-focus-preview",
    state.fontAddOpen && state.googleFocus && state.googleFocusServed.length ? googleFontWeightsPreviewUrl(state.googleFocus, state.googleFocusServed, [...new Set(state.googleFocus + SPECIMEN_TEXT)].join(""), state.googleFocusItalic) : null,
  );
  const editing = system.fonts.find((font) => font.token === state.fontEditing);
  previewLink("design-font-edit-preview", editing?.provider === "google" ? googleFontWeightsPreviewUrl(editing.family, editing.availableWeights, [...new Set(editing.family + SPECIMEN_TEXT)].join(""), editing.availableItalic) : null);
  let style = document.getElementById("design-upload-preview") as HTMLStyleElement | null;
  if (!state.fontUploads.length) {
    style?.remove();
    return;
  }
  const css = state.fontUploads.map((row) => `@font-face { font-family: "design-upload-${row.id}"; src: url("${row.src}"); }`).join("\n");
  if (!style) {
    style = document.createElement("style");
    style.id = "design-upload-preview";
    document.head.append(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

export function view(system: DesignSystem, state: State, props: BuilderProps): Partial<State> {
  const rows = fontRows(system, state);
  const query = state.fontQuery.trim().toLowerCase();
  const visible = query ? rows.filter((row) => row.label.toLowerCase().includes(query)) : rows;
  const preview = state.fontPreviewText.trim() || DEFAULT_PREVIEW;
  const category = (state.googleCategory as GoogleFontCategory) || undefined;
  const results = searchGoogleFonts(state.googleQuery, state.googleLimit, category).map((hit) => ({
    family: hit.family,
    category: hit.category,
    pressed: hit.family === state.googleFocus,
    style: `font-family: ${quoteFamily(hit.family)}`,
  }));
  loadPreviewFonts(system, state, results);
  const chosen = new Set(state.googleFocusChosen);
  const edit = rows.find((row) => row.name === state.fontEditing) ?? null;
  return {
    fontRows: rows,
    fontVisible: visible,
    fontSpecimenText: preview,
    fontPreviewSizeLabel: `${state.fontPreviewSize}px`,
    fontCountLabel: query ? Publr.tn("{shown} of {count} family", "{shown} of {count} families", rows.length, { shown: visible.length }) : Publr.tn("{count} family", "{count} families", visible.length),
    fontCanUpload: !!props.media,
    fontEdit: edit,
    fontEditing: edit ? state.fontEditing : "",
    googleQueryTrimmed: state.googleQuery.trim(),
    googleAddTyped: Publr.t("Add “{name}”", { name: state.googleQuery.trim() }),
    googleCategories: GOOGLE_CATEGORIES.map((entry) => ({ ...entry, pressed: entry.key === state.googleCategory })),
    googleResults: results,
    googleHasMore: searchGoogleFonts(state.googleQuery, state.googleLimit + 1, category).length > results.length,
    googleFocusMeta: Publr.t("Google Fonts · {category}", { category: state.googleFocusCategory }),
    googleFocusWeights: state.googleFocusServed.map((weight) => ({
      weight,
      value: String(weight),
      label: FONT_WEIGHT_NAMES[weight] ?? String(weight),
      tag: `${FONT_WEIGHT_NAMES[weight] ?? Publr.t("Weight")} ${weight}`,
      enabled: chosen.has(weight),
      italicTag: state.googleFocusItalicEnabled && chosen.has(weight),
      style: `font-family: ${quoteFamily(state.googleFocus)}; font-weight: ${weight}`,
    })),
    fontUploads: state.fontUploads.map((row) => ({
      ...row,
      choices: FONT_WEIGHT_CHOICES.map((choice) => ({ ...choice, selected: choice.key === row.weight })),
      style: `font-family: "design-upload-${row.id}"`,
    })),
    stackSizeLabel: `${state.stackSize}px`,
    stackCards: stackCards(state),
  };
}

/** Every family name Google is known to serve, for tests and the typed-add check. */
export const GOOGLE_CATALOG_SIZE = GOOGLE_FONTS.length;
