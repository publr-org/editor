// Where each top-level node of an HTML string starts and ends, so markup the editor does
// not understand can be kept byte for byte: a parse would normalize its quoting, casing
// and implied tags. A small scanner, not a parser: callers check its element count
// against a real parse and fall back to the parse when the two disagree.

export type Segment = { start: number; end: number; kind: "element" | "text" | "comment" };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp"]);

function tagName(source: string, from: number): { name: string; end: number } {
  let end = from;
  while (end < source.length && /[A-Za-z0-9:-]/.test(source[end])) end++;
  return { name: source.slice(from, end).toLowerCase(), end };
}

/** The end of a tag starting at `from` (just past its `>`), honoring quoted attribute values. */
function tagEnd(source: string, from: number): number {
  let quote = "";
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return i + 1;
    }
  }
  return source.length;
}

export function topLevelSegments(source: string): Segment[] {
  const segments: Segment[] = [];
  let depth = 0;
  let start = -1;
  let text = -1;
  let i = 0;
  const closeText = (at: number) => {
    if (text >= 0) segments.push({ start: text, end: at, kind: "text" });
    text = -1;
  };
  while (i < source.length) {
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      const stop = end < 0 ? source.length : end + 3;
      if (depth === 0) {
        closeText(i);
        segments.push({ start: i, end: stop, kind: "comment" });
      }
      i = stop;
      continue;
    }
    if (source[i] === "<" && source[i + 1] === "/") {
      const end = tagEnd(source, i);
      if (depth > 0) {
        depth--;
        if (depth === 0) segments.push({ start, end, kind: "element" });
      }
      i = end;
      continue;
    }
    if (source[i] === "<" && /[A-Za-z]/.test(source[i + 1] ?? "")) {
      const { name } = tagName(source, i + 1);
      let end = tagEnd(source, i);
      const selfClosing = source[end - 2] === "/";
      if (depth === 0) {
        closeText(i);
        start = i;
      }
      if (RAW_TEXT.has(name)) {
        const close = source.toLowerCase().indexOf(`</${name}`, end);
        end = close < 0 ? source.length : tagEnd(source, close);
        if (depth === 0) segments.push({ start, end, kind: "element" });
      } else if (VOID.has(name) || selfClosing) {
        if (depth === 0) segments.push({ start, end, kind: "element" });
      } else {
        depth++;
      }
      i = end;
      continue;
    }
    if (depth === 0 && text < 0) text = i;
    i++;
  }
  closeText(source.length);
  if (depth > 0 && start >= 0) segments.push({ start, end: source.length, kind: "element" });
  return segments;
}
