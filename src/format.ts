// format.ts — in-house inline formatting for rich carriers. No execCommand:
// formatting is a PURE MODEL TRANSFORM riding the machinery we already have
// (commit() history, rerenderBlock, the wire contract).
//
// The engine flattens a carrier's inline content into a sequence of ITEMS —
// one per text character, each carrying a Set of marks derived from its
// formatting ancestors (b/strong → bold, i/em → italic) — plus opaque ATOMS
// for any other inline element (span, a, svg, br, …), preserved verbatim
// with their surrounding marks. Toggling a mark over the selected span is
// then trivial set arithmetic, and serialization re-emits canonical, stably
// nested HTML (<b> outside <i>; strong/em normalize to b/i on the first edit
// of a field). Every overlap case — partial bold, un-bolding the middle of a
// run, italic across mixed content — is the same flatten → mark → rebuild.
//
// Atoms are units: a selection boundary inside one snaps to include it whole
// (splitting a link's text is a later refinement).

import { escAttr, escHtml } from "./carriers";

export type MarkName = "bold" | "italic";

export const MARKS: Record<MarkName, { tag: string; match: string[] }> = {
  bold: { tag: "b", match: ["b", "strong"] },
  italic: { tag: "i", match: ["i", "em"] },
};
const ORDER = Object.keys(MARKS) as MarkName[]; // canonical nesting: bold outermost

/**
 * The known inline formats — the vocabulary `allowedFormats` policy validates
 * against. "link" rides alongside the toggle MARKS: it is a VALUE-carrying
 * format (an <a> with an href), applied via applyLink/removeLink rather than
 * toggleMark, but a block still gates it through allowedFormats like any mark.
 */
export const MARK_NAMES: readonly string[] = [...ORDER, "link"];

function markOfTag(tag: string): MarkName | null {
  for (const name of ORDER) if (MARKS[name].match.includes(tag)) return name;
  return null;
}

// A link the tokenizer carries on the items under an <a>: its full open tag
// (rebuilt from the anchor's attributes, so pasted links keep class/rel/etc.
// verbatim) plus href/target pulled out for state read-back. `open` is the
// grouping key on emit — same open tag = one contiguous anchor.
interface LinkVal {
  open: string;
  href: string;
  target: string;
}

interface CharItem {
  ch: string;
  node: Text;
  off: number;
  marks: Set<MarkName>;
  link?: LinkVal;
  atom?: undefined;
}
interface AtomItem {
  atom: Element;
  marks: Set<MarkName>;
  link?: LinkVal;
  ch?: undefined;
  node?: undefined;
  off?: undefined;
}
type Item = CharItem | AtomItem;

// An <a> descends like a mark, but instead of a boolean it stamps its LinkVal
// onto every item underneath — canonical form is rebuilt from these on emit.
function linkOf(a: Element): LinkVal {
  const attrs = [...a.attributes].map((at) => `${at.name}="${escAttr(at.value)}"`).join(" ");
  return {
    open: `<a${attrs ? ` ${attrs}` : ""}>`,
    href: a.getAttribute("href") ?? "",
    target: a.getAttribute("target") ?? "",
  };
}

// The canonical open tag for a link the CHROME applies (href + optional
// new-tab): rel="noopener" rides _blank, matching the block-level link render.
function makeLink(href: string, target: string): LinkVal {
  const t = target === "_blank" ? ` target="_blank" rel="noopener"` : "";
  return { open: `<a href="${escAttr(href)}"${t}>`, href, target };
}

// Flatten the carrier: [{ ch, node, off, marks, link } | { atom, marks, link }, …]
function tokenize(carrier: Element): Item[] {
  const items: Item[] = [];
  (function walk(node: Node, marks: MarkName[], link: LinkVal | undefined) {
    for (const child of node.childNodes) {
      // DOM constructors are realm-specific. The editable document can live
      // in a same-origin iframe, so `child instanceof Text/Element` against
      // the host window silently rejects every canvas node. nodeType is the
      // realm-neutral contract here.
      if (child.nodeType === 3) {
        const text = child as Text;
        for (let off = 0; off < text.data.length; off++) {
          items.push({ ch: text.data[off], node: text, off, marks: new Set(marks), link });
        }
      } else if (child.nodeType === 1) {
        const element = child as Element;
        const tag = element.tagName.toLowerCase();
        const mark = markOfTag(tag);
        if (mark) walk(element, [...marks, mark], link);
        else if (tag === "a")
          walk(element, marks, linkOf(element)); // innermost anchor wins
        else items.push({ atom: element, marks: new Set(marks), link });
      }
    }
  })(carrier, [], undefined);
  return items;
}

// The contiguous [start, end) item span covered by a Range. Chars are in the
// span when their point sits inside the range (end boundary exclusive);
// atoms when the range intersects them at all (atoms are units).
function selectedSpan(items: Item[], range: Range): [number, number] | null {
  let start = -1;
  let end = -1;
  items.forEach((it, i) => {
    const inside =
      it.ch != null
        ? range.comparePoint(it.node, it.off) === 0 &&
          !(it.node === range.endContainer && it.off === range.endOffset)
        : range.intersectsNode(it.atom);
    if (inside) {
      if (start < 0) start = i;
      end = i + 1;
    }
  });
  return start < 0 ? null : [start, end];
}

// Below the marks, wrap maximal same-link runs in their <a> (link is the
// INNERMOST wrapper — `<b><a>…</a></b>`, so a bold run spanning a link never
// splits). Unlinked runs emit bare.
function emitLinks(items: Item[]): string {
  let out = "";
  let run: Item[] = [];
  let cur: LinkVal | undefined;
  let started = false;
  const flush = () => {
    if (!run.length) return;
    const inner = run.map((it) => (it.ch != null ? escHtml(it.ch) : it.atom.outerHTML)).join("");
    out += cur ? `${cur.open}${inner}</a>` : inner;
    run = [];
  };
  for (const it of items) {
    if (started && (it.link?.open ?? "") !== (cur?.open ?? "")) flush();
    cur = it.link;
    started = true;
    run.push(it);
  }
  flush();
  return out;
}

// Canonical serialization: recurse mark by mark, grouping maximal runs; the
// base level groups by link.
function emit(items: Item[], order: readonly MarkName[] = ORDER): string {
  if (!order.length) return emitLinks(items);
  const [mark, ...rest] = order;
  const t = MARKS[mark].tag;
  let out = "";
  let run: Item[] = [];
  let inMark: boolean | null = null;
  const flush = () => {
    if (!run.length) return;
    const inner = emit(run, rest);
    out += inMark ? `<${t}>${inner}</${t}>` : inner;
    run = [];
  };
  for (const it of items) {
    const has = it.marks.has(mark);
    if (inMark !== null && has !== inMark) flush();
    inMark = has;
    run.push(it);
  }
  flush();
  return out;
}

/** {bold, italic} for the given selection range — true when EVERY item in the span has the mark. */
export function formatState(carrier: Element | null, range: Range | null): Record<string, boolean> {
  const state: Record<string, boolean> = Object.fromEntries(ORDER.map((m) => [m, false]));
  if (!carrier || !range) return state;
  const items = tokenize(carrier);
  const span = selectedSpan(items, range);
  if (!span) return state;
  const slice = items.slice(span[0], span[1]);
  for (const mark of ORDER) state[mark] = slice.every((it) => it.marks.has(mark));
  return state;
}

/**
 * Toggle `mark` over the range. All-or-any semantics: if every item in the
 * span has the mark, remove it; otherwise add it to all. Returns the field's
 * new HTML plus the item span (indices survive the re-render — the item
 * count is unchanged), or null when there is nothing to format.
 */
export function toggleMark(
  carrier: Element,
  range: Range,
  mark: string,
): { html: string; start: number; end: number } | null {
  if (!(mark in MARKS)) return null;
  const m = mark as MarkName;
  const items = tokenize(carrier);
  const span = selectedSpan(items, range);
  if (!span) return null;
  const slice = items.slice(span[0], span[1]);
  const all = slice.every((it) => it.marks.has(m));
  for (const it of slice) {
    if (all) it.marks.delete(m);
    else it.marks.add(m);
  }
  return { html: emit(items), start: span[0], end: span[1] };
}

/**
 * The link covering the selection, or null when the span is unlinked or
 * straddles two different links (nothing shared to edit). Empty span → null.
 * Chrome prefills the link popover from this and lights its button when set.
 */
export function linkState(
  carrier: Element | null,
  range: Range | null,
): { href: string; target: string } | null {
  if (!carrier || !range) return null;
  const items = tokenize(carrier);
  const span = selectedSpan(items, range);
  if (!span) return null;
  const slice = items.slice(span[0], span[1]);
  const first = slice[0]?.link;
  if (!first || !slice.every((it) => it.link?.open === first.open)) return null;
  return { href: first.href, target: first.target };
}

/**
 * Stamp a link over the range (href + target — target "_blank" opens a new
 * tab). Every item in the span takes the same LinkVal, so a partial re-link
 * merges into one anchor. Returns the field's new HTML plus the item span (the
 * item count is unchanged — indices survive the re-render), or null when there
 * is nothing selected to link.
 */
export function applyLink(
  carrier: Element,
  range: Range,
  href: string,
  target: string,
): { html: string; start: number; end: number } | null {
  const items = tokenize(carrier);
  const span = selectedSpan(items, range);
  if (!span) return null;
  const link = makeLink(href, target);
  for (let i = span[0]; i < span[1]; i++) items[i].link = link;
  return { html: emit(items), start: span[0], end: span[1] };
}

/** Drop the link from every item in the range — the un-link half of applyLink. */
export function removeLink(
  carrier: Element,
  range: Range,
): { html: string; start: number; end: number } | null {
  const items = tokenize(carrier);
  const span = selectedSpan(items, range);
  if (!span) return null;
  for (let i = span[0]; i < span[1]; i++) items[i].link = undefined;
  return { html: emit(items), start: span[0], end: span[1] };
}

/** Re-select the item span [start, end) inside a (freshly re-rendered) carrier. */
export function selectItemRange(carrier: Element, start: number, end: number): void {
  const items = tokenize(carrier);
  const startIt = items[start];
  const endIt = items[end - 1];
  if (!startIt || !endIt) return;
  const ownerDocument = carrier.ownerDocument;
  const range = ownerDocument.createRange();
  if (startIt.ch != null) range.setStart(startIt.node, startIt.off);
  else range.setStartBefore(startIt.atom);
  if (endIt.ch != null) range.setEnd(endIt.node, endIt.off + 1);
  else range.setEndAfter(endIt.atom);
  const sel = ownerDocument.defaultView?.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
