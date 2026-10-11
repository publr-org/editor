// Figma frames as moodboard references. A pasted figma.com link names a file (and
// usually a node); with the author's personal access token the REST API gives back a
// rendered PNG of that frame and the colors and fonts it uses, so a builder reads the
// frame as an image and as data. No token: the link stays a link. The token never
// leaves the author's browser for anywhere but Figma.

import { Publr } from "publr-jsx";

export interface FigmaRef {
  fileKey: string;
  /** API form (`12:34`); links carry `12-34`. Absent = the file's first page. */
  nodeId?: string;
}

/** What a frame contributes to the board. */
export interface FigmaFrame {
  title: string;
  /** Rendered PNG (a signed, time-limited Figma URL). */
  thumbnail?: string;
  /** Solid fills ranked by covered area, as 6-digit hex. */
  colors: string[];
  /** Families used by text layers, most used first. */
  fonts: string[];
}

const FIGMA_URL =
  /^https?:\/\/(?:www\.)?figma\.com\/(?:file|design|proto|board|slides)\/([A-Za-z0-9]+)(?:\/[^?#]*)?(?:\?([^#]*))?/i;

export function parseFigmaUrl(url: string): FigmaRef | null {
  const match = FIGMA_URL.exec(url.trim());
  if (!match) return null;
  const params = new URLSearchParams(match[2] ?? "");
  const nodeId = params.get("node-id")?.replace(/-/g, ":") || undefined;
  return { fileKey: match[1], nodeId };
}

export const isFigmaUrl = (url: string): boolean => parseFigmaUrl(url) !== null;

type FigmaColor = { r: number; g: number; b: number; a?: number };
interface FigmaNode {
  id: string;
  name?: string;
  type?: string;
  visible?: boolean;
  opacity?: number;
  fills?: { type?: string; visible?: boolean; opacity?: number; color?: FigmaColor }[];
  strokes?: { type?: string; visible?: boolean; color?: FigmaColor }[];
  absoluteBoundingBox?: { width: number; height: number } | null;
  style?: { fontFamily?: string; fontWeight?: number };
  children?: FigmaNode[];
}

const hex = (c: FigmaColor): string =>
  `#${[c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** Rank the frame's solid fills by area and its text families by use. */
export function summarizeFigmaNode(
  root: FigmaNode,
  limit = 8,
): Pick<FigmaFrame, "colors" | "fonts"> {
  const area = new Map<string, number>();
  const fonts = new Map<string, number>();
  const walk = (node: FigmaNode) => {
    if (node.visible === false) return;
    const box = node.absoluteBoundingBox;
    const size = box ? Math.max(1, box.width * box.height) : 1;
    for (const fill of node.fills ?? []) {
      if (fill.type !== "SOLID" || fill.visible === false || !fill.color) continue;
      if ((fill.color.a ?? 1) < 0.5 || (fill.opacity ?? 1) < 0.5) continue;
      const key = hex(fill.color);
      area.set(key, (area.get(key) ?? 0) + size);
    }
    for (const stroke of node.strokes ?? []) {
      if (stroke.type !== "SOLID" || stroke.visible === false || !stroke.color) continue;
      const key = hex(stroke.color);
      area.set(key, (area.get(key) ?? 0) + size * 0.05);
    }
    if (node.type === "TEXT" && node.style?.fontFamily) {
      fonts.set(node.style.fontFamily, (fonts.get(node.style.fontFamily) ?? 0) + 1);
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  const rank = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  return { colors: rank(area).slice(0, limit), fonts: rank(fonts).slice(0, 4) };
}

/** Pull one frame: its render, colors and fonts. Throws with a readable
 * message on auth or access failures. */
export async function fetchFigmaFrame(
  ref: FigmaRef,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FigmaFrame> {
  const api = async <T>(path: string): Promise<T> => {
    const response = await fetchImpl(`https://api.figma.com/v1${path}`, {
      headers: { "X-Figma-Token": token },
    });
    if (response.status === 403) throw new Error(Publr.t("Figma rejected the token for this file."));
    if (response.status === 404) throw new Error(Publr.t("Figma can't find that file or frame."));
    if (!response.ok) throw new Error(Publr.t("Figma answered {status}.", { status: response.status }));
    return (await response.json()) as T;
  };
  let node: FigmaNode;
  let nodeId = ref.nodeId;
  let title: string;
  if (nodeId) {
    const body = await api<{
      name: string;
      nodes: Record<string, { document: FigmaNode } | null>;
    }>(`/files/${ref.fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`);
    const entry = body.nodes[nodeId];
    if (!entry) throw new Error(Publr.t("Figma can't find that frame."));
    node = entry.document;
    title = node.name ? `${node.name} · ${body.name}` : body.name;
  } else {
    const body = await api<{ name: string; document: FigmaNode }>(`/files/${ref.fileKey}?depth=2`);
    const page = body.document.children?.[0];
    node = page?.children?.[0] ?? page ?? body.document;
    nodeId = node.id;
    title = body.name;
  }
  const summary = summarizeFigmaNode(node);
  let thumbnail: string | undefined;
  try {
    const images = await api<{ images: Record<string, string | null> }>(
      `/images/${ref.fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`,
    );
    thumbnail = images.images[nodeId] ?? undefined;
  } catch {
    // The frame still counts by its colors and fonts.
  }
  return { title, thumbnail, ...summary };
}
