// Caret positions as character offsets into a carrier's text, and back. Offsets count
// text characters only, the way the format engine does, so a caret survives any
// re-render of the carrier's markup.
import { isElement, isText } from "../model/carriers";

/** Text nodes under `root` in document order. */
export function textNodes(root: Node): Text[] {
  const found: Text[] = [];
  const visit = (node: Node) => {
    if (isText(node)) found.push(node);
    else for (const child of node.childNodes) visit(child);
  };
  visit(root);
  return found;
}

/** The offset of a DOM position (node, offset) within `carrier`'s text. */
export function offsetOf(carrier: Element, node: Node, offset: number): number {
  if (node !== carrier && !carrier.contains(node)) return 0;
  const range = carrier.ownerDocument.createRange();
  range.selectNodeContents(carrier);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** The DOM position at `offset` characters into `carrier`. */
export function positionAt(carrier: Element, offset: number): { node: Node; offset: number } {
  let left = Math.max(0, offset);
  const nodes = textNodes(carrier);
  for (const text of nodes) {
    if (left <= text.length) return { node: text, offset: left };
    left -= text.length;
  }
  const last = nodes[nodes.length - 1];
  return last ? { node: last, offset: last.length } : { node: carrier, offset: 0 };
}

export function textLengthOf(carrier: Element): number {
  return textNodes(carrier).reduce((total, text) => total + text.length, 0);
}

/** Places the selection over [start, end) of `carrier`. */
export function selectOffsets(carrier: Element, start: number, end: number): void {
  const doc = carrier.ownerDocument;
  const selection = doc.getSelection();
  if (!selection) return;
  const a = positionAt(carrier, start);
  const b = positionAt(carrier, end);
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Whether the element holds nothing a reader would see. */
export function visiblyEmpty(element: Element): boolean {
  if ((element.textContent ?? "") !== "") return false;
  return ![...element.querySelectorAll("*")].some((child) => isElement(child) && child.localName !== "br");
}
