// The moodboard as data: the site's design references as a board. One free canvas where
// the author drops what the site should feel like (links, screenshots, photos, colors,
// notes, font files, Figma frames), moves them around and annotates them, so a design
// system builder (its Build, or an agent) reads intent before it fills the theme. The
// board is the site's data, its own app's; nothing here reaches a published page. Pure:
// no DOM, no store.

type Base = {
  id: string;
  /** Board position, in board units: a 1:1 pixel grid at zoom 1. */
  x: number;
  y: number;
  /** Card width in board units; the height follows the content, except an image's,
   * which keeps `h` so the layout holds before it loads. */
  w: number;
  h?: number;
  /** Why this reference matters ("this warmth", "the headline weight, not the colors"). */
  note?: string;
};

/** A written reference: a brand statement, a mood word list, a constraint. */
export type MoodboardNote = Base & { kind: "note"; text: string };

/** A site or page the author admires; `title` is display only. */
export type MoodboardLink = Base & { kind: "link"; url: string; title?: string };

/** A screenshot or photo, stored in the media library or given by URL. */
export type MoodboardImage = Base & { kind: "image"; src: string; alt?: string };

/** One color the author picked or pasted: any CSS color literal. */
export type MoodboardColor = Base & { kind: "color"; value: string };

/** A Figma frame (figma.ts): its link and, once pulled with the author's token, its
 * render, colors and fonts. `status` tracks the pull. */
export type MoodboardFigma = Base & {
  kind: "figma";
  url: string;
  title?: string;
  thumbnail?: string;
  colors?: string[];
  fonts?: string[];
  status?: "pending" | "ready" | "error";
  error?: string;
};

/** A font file dropped on the board: a typeface the site should use, stored like an
 * image. The facts come from the file (font-file.ts); `file` is its original name. A
 * variable font's weights run from `weight` to `weight_max`. */
export type MoodboardFont = Base & {
  kind: "font";
  src: string;
  family: string;
  weight?: number;
  weight_max?: number;
  italic?: boolean;
  file?: string;
};

export type MoodboardItem =
  | MoodboardNote
  | MoodboardLink
  | MoodboardImage
  | MoodboardColor
  | MoodboardFigma
  | MoodboardFont;

export type MoodboardItemKind = MoodboardItem["kind"];

/** A point on the board, in board units. */
export type BoardPoint = { x: number; y: number };

export const MOODBOARD_KIND_LABELS: Record<MoodboardItemKind, string> = {
  note: "Note",
  link: "Link",
  image: "Image",
  color: "Color",
  figma: "Figma",
  font: "Font",
};

/** Default card widths per kind, in board units. */
export const MOODBOARD_DEFAULT_WIDTH: Record<MoodboardItemKind, number> = {
  note: 260,
  link: 280,
  image: 320,
  color: 180,
  figma: 320,
  font: 300,
};

/** The color a new color card starts from. */
export const MOODBOARD_DEFAULT_COLOR = "#a45332";

let sequence = 0;

export function moodboardItemId(): string {
  sequence += 1;
  return `mb-${Date.now().toString(36)}-${sequence.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const FIGMA_LINK = /^https?:\/\/(?:www\.)?figma\.com\/(?:file|design|proto|board|slides)\//i;
export const isFigmaLink = (url: string): boolean => FIGMA_LINK.test(url.trim());

const COLOR_LITERAL = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl|oklch|oklab|lab|lch)a?\([^)]*\))$/i;
export const isColorLiteral = (value: string): boolean => COLOR_LITERAL.test(value.trim());

const IMAGE_URL = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?\S*)?$/i;

/** One line of pasted or dropped text as a card: an image URL an image, a Figma link a
 * Figma frame (to pull), any other URL a link, a CSS color literal a color, anything
 * else a note. */
export function moodboardItemFromText(text: string, at: BoardPoint): MoodboardItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const base = { id: moodboardItemId(), x: at.x, y: at.y };
  if (IMAGE_URL.test(trimmed)) return { ...base, kind: "image", src: trimmed, w: MOODBOARD_DEFAULT_WIDTH.image };
  if (isFigmaLink(trimmed)) return { ...base, kind: "figma", url: trimmed, status: "pending", w: MOODBOARD_DEFAULT_WIDTH.figma };
  if (/^https?:\/\/\S+$/i.test(trimmed)) return { ...base, kind: "link", url: trimmed, w: MOODBOARD_DEFAULT_WIDTH.link };
  if (isColorLiteral(trimmed)) return { ...base, kind: "color", value: trimmed, w: MOODBOARD_DEFAULT_WIDTH.color };
  return { ...base, kind: "note", text: trimmed, w: MOODBOARD_DEFAULT_WIDTH.note };
}

/** A whole paste: one reference per line; consecutive plain lines join into one note and
 * a blank line ends it. Cards cascade down-right from `at` so none lands on another. */
export function moodboardItemsFromText(text: string, at: BoardPoint): MoodboardItem[] {
  const items: MoodboardItem[] = [];
  let noteLines: string[] = [];
  const next = (): BoardPoint => ({ x: at.x + items.length * 32, y: at.y + items.length * 32 });
  const flush = () => {
    const joined = noteLines.join("\n").trim();
    const item = joined ? moodboardItemFromText(joined, next()) : null;
    if (item) items.push(item);
    noteLines = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const probe = moodboardItemFromText(line, at);
    if (!probe) flush();
    else if (probe.kind === "note") noteLines.push(line.trim());
    else {
      flush();
      items.push({ ...probe, ...next() });
    }
  }
  flush();
  return items;
}

/** The smallest rectangle holding every card, in board units; null for an empty board.
 * A card without a height of its own counts as tall as it is wide, up to 200. */
export function moodboardBounds(items: readonly MoodboardItem[]): { x: number; y: number; w: number; h: number } | null {
  if (!items.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const item of items) {
    left = Math.min(left, item.x);
    top = Math.min(top, item.y);
    right = Math.max(right, item.x + item.w);
    bottom = Math.max(bottom, item.y + (item.h ?? Math.min(item.w, 200)));
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

/** One face in words: "Bold 700", "Light 300 Italic", "Variable 100–900". */
export function fontFaceLabel(item: Pick<MoodboardFont, "weight" | "weight_max" | "italic">): string {
  const weight = item.weight ?? 400;
  const face = item.weight_max !== undefined && item.weight_max !== weight ? `Variable ${weight}–${item.weight_max}` : `${WEIGHT_NAMES[weight] ?? ""} ${weight}`.trim();
  return item.italic ? `${face} Italic` : face;
}

/** A card in one prompt-ready line, its annotation last. */
export function describeMoodboardItem(item: MoodboardItem): string {
  const note = item.note?.trim() ? ` — ${item.note.trim()}` : "";
  switch (item.kind) {
    case "note":
      return `Note: ${item.text.trim()}${note}`;
    case "link":
      return `Link: ${item.url}${item.title ? ` (${item.title})` : ""}${note}`;
    case "image":
      return `Image: ${item.alt?.trim() || item.src}${note}`;
    case "color":
      return `Color: ${item.value}${note}`;
    case "font":
      return `Font: ${item.family} ${fontFaceLabel(item)}${note}`;
    case "figma": {
      const facts = [item.colors?.length ? `colors ${item.colors.join(", ")}` : "", item.fonts?.length ? `fonts ${item.fonts.join(", ")}` : ""].filter(Boolean).join("; ");
      return `Figma frame: ${item.title || item.url}${facts ? ` (${facts})` : ""}${note}`;
    }
  }
}

/** What the design system builder's Build hands an AI: every card on the board with
 * why it is there, then the colors and typefaces pinned on it. Empty for an empty board. */
export function buildPrompt(items: readonly MoodboardItem[], site = "the site"): string {
  if (items.length === 0) return "";
  const colors = items.flatMap((item) => (item.kind === "color" ? [item.value] : item.kind === "figma" ? (item.colors ?? []) : []));
  const fonts = items.flatMap((item) => (item.kind === "font" ? [item.family] : item.kind === "figma" ? (item.fonts ?? []) : []));
  return [
    `Build a design system for ${site} from its moodboard. Each line is one reference, its annotation after the dash.`,
    "",
    ...items.map((item) => `- ${describeMoodboardItem(item)}`),
    "",
    colors.length ? `Every pinned color belongs in the palette with its exact value: ${[...new Set(colors)].join(", ")}.` : "Choose a palette that fits the references.",
    fonts.length ? `Use these typefaces: ${[...new Set(fonts)].join(", ")}.` : "Choose typefaces that fit the references.",
    "Give semantic roles (surface, foreground, muted, primary, accent, border), a type scale, spacing, radii and container widths, as Tailwind v4 @theme tokens.",
  ].join("\n");
}

/** A copy of every card, so no caller shares the board's objects. */
export const copyItems = (items: readonly MoodboardItem[]): MoodboardItem[] => items.map((item) => ({ ...item }) as MoodboardItem);
