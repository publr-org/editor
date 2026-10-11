// What the library learns from an uploaded font file before it becomes a FontFace:
// family, weight (or variable range) and italic. TrueType/OpenType and WOFF carry that
// in their `OS/2`, `fvar` and `name` tables; WOFF2 is Brotli-packed, so only the file
// name can speak for it. Every guess stays editable in the library.
import type { FontFace } from "./system";

export interface FontFileFacts {
  family: string;
  weight: FontFace["weight"];
  italic: boolean;
}

export const FONT_FILE_ACCEPT = ".woff2,.woff,.ttf,.otf";

const WEIGHT_WORDS: [RegExp, number][] = [
  [/\b(?:thin|hairline)\b|(?<![\d.])100(?![\d.])/i, 100],
  [/\b(?:extra|ultra)[ _-]?light\b|(?<![\d.])200(?![\d.])/i, 200],
  [/\blight\b|(?<![\d.])300(?![\d.])/i, 300],
  [/\bmedium\b|(?<![\d.])500(?![\d.])/i, 500],
  [/\b(?:semi|demi)[ _-]?bold\b|(?<![\d.])600(?![\d.])/i, 600],
  [/\b(?:extra|ultra)[ _-]?bold\b|(?<![\d.])800(?![\d.])/i, 800],
  [/\b(?:black|heavy)\b|(?<![\d.])900(?![\d.])/i, 900],
  [/\bbold\b|(?<![\d.])700(?![\d.])/i, 700],
];
const STYLE_WORDS =
  /\b(?:thin|hairline|extra[ _-]?light|ultra[ _-]?light|light|regular|normal|book|medium|semi[ _-]?bold|demi[ _-]?bold|extra[ _-]?bold|ultra[ _-]?bold|bold|black|heavy|italic|oblique|variable|vf|web|webfont)\b/gi;

/** Facts read from the file NAME alone (`Inter-SemiBoldItalic.woff2`). */
export function fontFactsFromFilename(filename: string): FontFileFacts {
  const stem = filename.replace(/\.[a-z0-9]+$/i, "").replace(/\[[^\]]*\]/g, " ");
  const spaced = stem.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  const variable = /\bvariable\b|\bvf\b|\[wght\]/i.test(filename);
  const weight = WEIGHT_WORDS.find(([pattern]) => pattern.test(spaced))?.[1] ?? 400;
  const family = spaced
    .replace(STYLE_WORDS, " ")
    .replace(/\d{3}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    family: family || stem,
    weight: variable ? [100, 900] : weight,
    italic: /\b(?:italic|oblique)\b/i.test(spaced),
  };
}

const tag = (view: DataView, offset: number): string =>
  String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The sfnt tables of a TrueType/OpenType/WOFF file, by tag (null: not one). */
async function sfntTables(buffer: ArrayBuffer): Promise<Map<string, DataView> | null> {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) return null;
  const magic = tag(view, 0);
  const tables = new Map<string, DataView>();
  if (magic === "wOFF") {
    const count = view.getUint16(12);
    for (let i = 0; i < count; i++) {
      const entry = 44 + i * 20;
      if (entry + 20 > buffer.byteLength) return null;
      const offset = view.getUint32(entry + 4);
      const compressed = view.getUint32(entry + 8);
      const original = view.getUint32(entry + 12);
      if (offset + compressed > buffer.byteLength) return null;
      const raw = new Uint8Array(buffer, offset, compressed);
      const bytes = compressed < original ? await inflate(raw) : raw;
      tables.set(tag(view, entry), new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    }
    return tables;
  }
  if (magic !== "OTTO" && magic !== "true" && view.getUint32(0) !== 0x00010000) return null;
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16;
    if (entry + 16 > buffer.byteLength) return null;
    const offset = view.getUint32(entry + 8);
    const length = view.getUint32(entry + 12);
    if (offset + length > buffer.byteLength) return null;
    tables.set(tag(view, entry), new DataView(buffer, offset, length));
  }
  return tables;
}

/** The typographic (or legacy) family from the `name` table, if readable. */
function familyFromNameTable(name: DataView | undefined): string | null {
  if (!name || name.byteLength < 6) return null;
  const count = name.getUint16(2);
  const storage = name.getUint16(4);
  let legacy: string | null = null;
  for (let i = 0; i < count; i++) {
    const record = 6 + i * 12;
    if (record + 12 > name.byteLength) break;
    const platform = name.getUint16(record);
    const nameId = name.getUint16(record + 6);
    if (nameId !== 1 && nameId !== 16) continue;
    const length = name.getUint16(record + 8);
    const offset = storage + name.getUint16(record + 10);
    if (offset + length > name.byteLength) continue;
    const bytes = new Uint8Array(name.buffer, name.byteOffset + offset, length);
    const text =
      platform === 1
        ? new TextDecoder("macintosh", { fatal: false }).decode(bytes)
        : new TextDecoder("utf-16be").decode(bytes);
    if (!text.trim()) continue;
    if (nameId === 16) return text.trim();
    legacy ??= text.trim();
  }
  return legacy;
}

/** Facts read from the file itself, the file name filling whatever the
 * tables leave open. */
export async function inspectFontFile(file: File): Promise<FontFileFacts> {
  const guess = fontFactsFromFilename(file.name);
  let tables: Map<string, DataView> | null = null;
  try {
    tables = await sfntTables(await file.arrayBuffer());
  } catch {
    tables = null;
  }
  if (!tables) return guess;
  const facts: FontFileFacts = { ...guess };
  const os2 = tables.get("OS/2");
  if (os2 && os2.byteLength >= 64) {
    const weightClass = os2.getUint16(4);
    if (weightClass >= 1 && weightClass <= 1000)
      facts.weight = Math.min(900, Math.max(100, Math.round(weightClass / 100) * 100));
    facts.italic = (os2.getUint16(62) & 1) === 1;
  }
  const fvar = tables.get("fvar");
  if (fvar && fvar.byteLength >= 16) {
    const axesOffset = fvar.getUint16(4);
    const axisCount = fvar.getUint16(8);
    const axisSize = fvar.getUint16(10);
    for (let i = 0; i < axisCount; i++) {
      const axis = axesOffset + i * axisSize;
      if (axis + 16 > fvar.byteLength) break;
      if (tag(fvar, axis) !== "wght") continue;
      const min = fvar.getInt32(axis + 4) / 65536;
      const max = fvar.getInt32(axis + 12) / 65536;
      facts.weight = [Math.max(1, Math.round(min)), Math.min(1000, Math.round(max))];
    }
  }
  const family = familyFromNameTable(tables.get("name"));
  if (family) facts.family = family;
  return facts;
}
