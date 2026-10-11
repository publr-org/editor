// Inline formatting over rich HTML, without execCommand. A rich value flattens into runs:
// text with the set of marks around it, or atoms (elements with no text, kept whole).
// Formatting is set arithmetic over a character range; serializing emits canonical
// nested HTML. Offsets count text characters only, as a caret does, so they survive
// any re-render. Elements the engine does not know (a `dl`, a classed `span`) are kept
// as structural marks with their own identity: two sibling `dt`s never merge.
import { escapeAttr, escapeHtml, isElement, isText, parseFragment } from "./carriers";
import { parsingDocument } from "./dom";

export type MarkName = "link" | "bold" | "italic" | "strikethrough" | "code" | "subscript" | "superscript" | "underline";

/** Known marks, outermost first: the order serialization nests them in. */
export const MARK_NAMES: readonly MarkName[] = ["link", "bold", "italic", "underline", "strikethrough", "code", "subscript", "superscript"];

const TAGS: Record<string, MarkName> = {
  a: "link",
  strong: "bold",
  b: "bold",
  em: "italic",
  i: "italic",
  u: "underline",
  s: "strikethrough",
  del: "strikethrough",
  strike: "strikethrough",
  code: "code",
  sub: "subscript",
  sup: "superscript",
};

const EMIT: Record<MarkName, string> = {
  link: "a",
  bold: "strong",
  italic: "em",
  underline: "u",
  strikethrough: "s",
  code: "code",
  subscript: "sub",
  superscript: "sup",
};

/** A mark: a known one (with its href for links), or a structural element by identity. */
export type Mark =
  | { kind: "known"; name: MarkName; href?: string; target?: string }
  | { kind: "element"; id: number; depth: number; open: string; tag: string };

export type Run = { text: string; marks: Mark[] } | { atom: string; marks: Mark[] };

let elementIds = 0;

const markKey = (mark: Mark) => (mark.kind === "known" ? `k:${mark.name}:${mark.href ?? ""}:${mark.target ?? ""}` : `e:${mark.id}`);

function openTag(element: Element): string {
  let tag = `<${element.localName}`;
  for (const attribute of element.attributes) tag += ` ${attribute.name}="${escapeAttr(attribute.value)}"`;
  return `${tag}>`;
}

/** A known mark only when the element is plain: a classed `strong` stays structural. */
function knownMark(element: Element): Mark | null {
  const name = TAGS[element.localName];
  if (!name) return null;
  const attributes = [...element.attributes].map((attribute) => attribute.name);
  if (name === "link") {
    // A link opening in a new tab carries `target="_blank"` and the `rel` that goes with it.
    if (attributes.some((attribute) => attribute !== "href" && attribute !== "target" && attribute !== "rel")) return null;
    const target = element.getAttribute("target") ?? "";
    const rel = element.getAttribute("rel");
    if (target && target !== "_blank") return null;
    if (rel !== null && !(target === "_blank" && rel === "noopener")) return null;
    if (target === "_blank" && rel === null) return null;
    return target ? { kind: "known", name, href: element.getAttribute("href") ?? "", target } : { kind: "known", name, href: element.getAttribute("href") ?? "" };
  }
  return attributes.length === 0 ? { kind: "known", name } : null;
}

export function flatten(html: string): Run[] {
  const runs: Run[] = [];
  const visit = (node: Node, marks: Mark[], depth: number) => {
    if (isText(node)) {
      if (node.data.length > 0) runs.push({ text: node.data, marks });
      return;
    }
    if (!isElement(node)) return;
    if ((node.textContent ?? "") === "") {
      const holder = node.ownerDocument.createElement("div");
      holder.append(node.cloneNode(true));
      runs.push({ atom: holder.innerHTML, marks });
      return;
    }
    const mark = knownMark(node) ?? { kind: "element" as const, id: ++elementIds, depth, open: openTag(node), tag: node.localName };
    const next = marks.some((existing) => markKey(existing) === markKey(mark)) ? marks : [...marks, mark];
    for (const child of node.childNodes) visit(child, next, depth + 1);
  };
  for (const node of parseFragment(parsingDocument(), html).childNodes) visit(node, [], 0);
  return runs;
}

/** Structural marks outermost by their original depth, then known marks in fixed order. */
function ordered(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => {
    if (a.kind === "element" && b.kind === "element") return a.depth - b.depth;
    if (a.kind === "element") return -1;
    if (b.kind === "element") return 1;
    return MARK_NAMES.indexOf(a.name) - MARK_NAMES.indexOf(b.name);
  });
}

const openOf = (mark: Mark) =>
  mark.kind === "element"
    ? mark.open
    : mark.name === "link"
      ? `<a href="${escapeAttr(mark.href ?? "")}"${mark.target === "_blank" ? ` target="_blank" rel="noopener"` : ""}>`
      : `<${EMIT[mark.name]}>`;

const closeOf = (mark: Mark) => `</${mark.kind === "element" ? mark.tag : EMIT[mark.name]}>`;

export function serialize(runs: Run[]): string {
  let out = "";
  const stack: Mark[] = [];
  for (const run of runs) {
    const wanted = ordered(run.marks);
    let keep = 0;
    while (keep < stack.length && keep < wanted.length && markKey(stack[keep]) === markKey(wanted[keep])) keep++;
    while (stack.length > keep) out += closeOf(stack.pop()!);
    for (const mark of wanted.slice(keep)) {
      out += openOf(mark);
      stack.push(mark);
    }
    out += "text" in run ? escapeHtml(run.text) : run.atom;
  }
  while (stack.length > 0) out += closeOf(stack.pop()!);
  return out;
}

export const runLength = (run: Run) => ("text" in run ? run.text.length : 0);

export function textLength(html: string): number {
  return flatten(html).reduce((total, run) => total + runLength(run), 0);
}

/** The runs split so that `start` and `end` fall on run boundaries. */
function cut(runs: Run[], start: number, end: number): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const run of runs) {
    if (!("text" in run)) {
      out.push(run);
      continue;
    }
    const from = at;
    const to = at + run.text.length;
    at = to;
    const points = [start, end].filter((point) => point > from && point < to).map((point) => point - from);
    let previous = 0;
    for (const point of [...new Set(points)].sort((a, b) => a - b)) {
      out.push({ text: run.text.slice(previous, point), marks: run.marks });
      previous = point;
    }
    out.push({ text: run.text.slice(previous), marks: run.marks });
  }
  return out;
}

/** Calls `each` with every text run inside [start, end), after cutting at the edges. */
function inRange(runs: Run[], start: number, end: number, each: (run: Run & { text: string }) => void): Run[] {
  const pieces = cut(runs, start, end);
  let at = 0;
  for (const run of pieces) {
    if (!("text" in run)) {
      // An atom strictly inside the range takes the range's marks, so `a<br>b` stays whole.
      if (at > start && at < end) each(run as Run & { text: string });
      continue;
    }
    const from = at;
    at += run.text.length;
    if (from >= start && at <= end && run.text.length > 0) each(run);
  }
  return pieces;
}

const hasMark = (run: Run, name: MarkName) => run.marks.some((mark) => mark.kind === "known" && mark.name === name);

/** The known marks every character in [start, end) carries (at a caret: the marks before it). */
export function marksIn(html: string, start: number, end: number): Set<MarkName> {
  const runs = flatten(html);
  if (start === end) {
    let at = 0;
    for (const run of runs) {
      at += runLength(run);
      if ("text" in run && at >= start && run.text.length > 0) {
        return new Set(run.marks.flatMap((mark) => (mark.kind === "known" ? [mark.name] : [])));
      }
    }
    return new Set();
  }
  let common: Set<MarkName> | null = null;
  inRange(runs, start, end, (run) => {
    const names = new Set(run.marks.flatMap((mark) => (mark.kind === "known" ? [mark.name] : [])));
    common = common ? new Set([...common].filter((name) => names.has(name))) : names;
  });
  return common ?? new Set();
}

/** The href of a link covering [start, end), if one does. */
export function linkIn(html: string, start: number, end: number): string | null {
  let href: string | null = null;
  inRange(flatten(html), start, Math.max(end, start + 1), (run) => {
    for (const mark of run.marks) if (mark.kind === "known" && mark.name === "link") href = mark.href ?? "";
  });
  return href;
}

/** The target of a link covering [start, end) ("_blank" opens a new tab; "" the same one). */
export function linkTargetIn(html: string, start: number, end: number): string {
  let target = "";
  inRange(flatten(html), start, Math.max(end, start + 1), (run) => {
    for (const mark of run.marks) if (mark.kind === "known" && mark.name === "link") target = mark.target ?? "";
  });
  return target;
}

/** Toggles `name` over [start, end): removed when every character has it, added otherwise. */
export function toggleMark(html: string, start: number, end: number, name: MarkName): string {
  if (start >= end) return html;
  const runs = flatten(html);
  let all = true;
  inRange(runs, start, end, (run) => {
    if (!hasMark(run, name)) all = false;
  });
  return applyMark(html, start, end, name, !all);
}

export function applyMark(html: string, start: number, end: number, name: MarkName, on: boolean, href?: string, target?: string): string {
  const pieces = inRange(flatten(html), start, end, (run) => {
    run.marks = run.marks.filter((mark) => !(mark.kind === "known" && mark.name === name));
    const link: Mark = target === "_blank" ? { kind: "known", name, href: href ?? "", target } : { kind: "known", name, href: href ?? "" };
    if (on) run.marks = [...run.marks, name === "link" ? link : { kind: "known", name }];
  });
  return serialize(pieces);
}

/** Sets (or with null removes) a link over [start, end); `target: "_blank"` opens it in a new tab. */
export function setLink(html: string, start: number, end: number, href: string | null, target = ""): string {
  return applyMark(html, start, end, "link", href !== null, href ?? undefined, target);
}

/** Every mark removed over [start, end); structure stays. */
export function clearMarks(html: string, start: number, end: number): string {
  const pieces = inRange(flatten(html), start, end, (run) => {
    run.marks = run.marks.filter((mark) => mark.kind === "element");
  });
  return serialize(pieces);
}

/** Splits rich HTML at a character offset; each half keeps its marks. */
export function splitAt(html: string, offset: number): [string, string] {
  const pieces = cut(flatten(html), offset, offset);
  const total = pieces.reduce((sum, run) => sum + runLength(run), 0);
  const left: Run[] = [];
  const right: Run[] = [];
  let at = 0;
  for (const run of pieces) {
    // An atom exactly at the split goes with what follows it, except at the very end.
    const goesLeft = at < offset || (runLength(run) === 0 && at === offset && offset === total);
    (goesLeft ? left : right).push(run);
    at += runLength(run);
  }
  return [serialize(left), serialize(right)];
}

/** The plain text of rich HTML. */
export function plainText(html: string): string {
  return flatten(html).map((run) => ("text" in run ? run.text : "")).join("");
}

/** Canonical rich HTML: adjacent runs with the same marks merge (`<em>a</em><em>b</em>` → `<em>ab</em>`). */
export function normalize(html: string): string {
  return serialize(flatten(html));
}
