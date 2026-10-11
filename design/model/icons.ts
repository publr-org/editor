// The approved icon set: what the Icons library accepts as an icon (SVG markup, pasted or
// uploaded, reduced to a self-contained scriptless `<svg>` that sizes by its container),
// and the edits the library makes to the set.
import { Publr } from "publr-jsx";
import type { DesignSystem, IconDefinition } from "./system";

/** Sanitize SVG markup for the library; null when it is not an SVG document. Scripts,
 * foreign content, event handlers and script URLs are dropped; width and height give
 * way to a viewBox so the icon scales. */
export function sanitizeSvgIcon(markup: string): string | null {
  // The XML parser reports what it cannot read to the console (Firefox does), so markup
  // that is plainly not well formed is refused before it gets there.
  if (!wellFormed(markup.trim())) return null;
  const doc = new DOMParser().parseFromString(markup.trim(), "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return null;
  for (const node of Array.from(root.querySelectorAll("script, foreignObject"))) node.remove();
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const scriptUrl = (name === "href" || name === "xlink:href") && /^\s*(?:javascript|data):/i.test(attribute.value);
      if (name.startsWith("on") || scriptUrl) element.removeAttribute(attribute.name);
    }
  }
  if (!root.getAttribute("viewBox")) {
    const width = parseFloat(root.getAttribute("width") ?? "");
    const height = parseFloat(root.getAttribute("height") ?? "");
    if (width > 0 && height > 0) root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  for (const name of ["width", "height", "id", "class", "style"]) root.removeAttribute(name);
  root.setAttribute("aria-hidden", "true");
  return new XMLSerializer().serializeToString(root);
}

/** Whether the markup's tags nest and close, its attributes are quoted and nothing is
 * left open: what the XML parser would read without an error. */
function wellFormed(markup: string): boolean {
  const body = markup.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "");
  const open: string[] = [];
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/g;
  let at = 0;
  for (const match of body.matchAll(tag)) {
    if (body.slice(at, match.index).includes("<")) return false;
    at = match.index! + match[0].length;
    const [, closing, name, , self] = match;
    if (closing) {
      if (open.pop() !== name) return false;
    } else if (!self) open.push(name);
  }
  return !body.slice(at).includes("<") && open.length === 0 && /^\s*</.test(body);
}

/** A library name from a file name or a typed label: `Arrow Right.svg` → `arrow-right`. */
export function iconNameFrom(text: string): string {
  return text
    .replace(/\.svg$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A display label from a library name: `arrow-right` → `Arrow right`. */
export function iconLabel(name: string): string {
  const words = name.split("-").filter(Boolean);
  return words.length ? words[0][0].toUpperCase() + words[0].slice(1) + (words.length > 1 ? ` ${words.slice(1).join(" ")}` : "") : name;
}

/** The markup as an image source: icons draw in the text color they would inherit. */
export function iconImage(svg: string): string {
  const colored = svg.replace(/currentColor/g, "#0a0a0a");
  const sized = /\swidth=/.test(colored.slice(0, colored.indexOf(">"))) ? colored : colored.replace(/<svg\b/, '<svg width="24" height="24"');
  const namespaced = /xmlns=/.test(sized) ? sized : sized.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(namespaced)}`;
}

export type IconCandidate = { name: string; svg: string; category?: string };

/** The set with each candidate added (or replaced by name), or why the first was refused. */
export function addIcons(system: DesignSystem, candidates: readonly IconCandidate[]): { system: DesignSystem; error: string } {
  const icons = [...system.icons];
  for (const candidate of candidates) {
    const name = iconNameFrom(candidate.name);
    const svg = sanitizeSvgIcon(candidate.svg);
    if (!name) return { system, error: Publr.t("Give the icon a name.") };
    if (!svg) return { system, error: Publr.t("“{name}” is not an SVG.", { name: candidate.name }) };
    const icon: IconDefinition = { name, label: iconLabel(name), category: candidate.category ?? "Custom", svg };
    const at = icons.findIndex((item) => item.name === name);
    if (at >= 0) icons[at] = icon;
    else icons.push(icon);
  }
  return { system: { ...system, icons }, error: "" };
}

export function removeIcon(system: DesignSystem, name: string): DesignSystem {
  return { ...system, icons: system.icons.filter((icon) => icon.name !== name) };
}

/** Rename an icon and replace its markup, or why not. */
export function saveIcon(system: DesignSystem, previous: string, typedName: string, markup: string): { system: DesignSystem; error: string } {
  if (!system.icons.some((icon) => icon.name === previous)) return { system, error: "" };
  const name = iconNameFrom(typedName);
  const svg = sanitizeSvgIcon(markup);
  if (!name) return { system, error: Publr.t("Give the icon a name.") };
  if (name !== previous && system.icons.some((icon) => icon.name === name)) return { system, error: Publr.t("An icon named “{name}” already exists.", { name }) };
  if (!svg) return { system, error: Publr.t("That markup is not an SVG.") };
  return { system: { ...system, icons: system.icons.map((icon) => (icon.name === previous ? { ...icon, name, label: iconLabel(name), svg } : icon)) }, error: "" };
}
