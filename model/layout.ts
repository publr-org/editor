// A Group's responsive layout as a lens over its classes. Group, Row, Stack and Grid are
// visual layouts of the one `group` block, never separate types: the layout rides
// display and direction utilities, per breakpoint (mobile is the base, tablet `md:`,
// desktop `lg:`), so a Group can stack on Mobile and be a Row on Desktop without its
// children moving. The Container toggle constrains the Group itself to one of the
// theme's container widths (`container-*` tokens, by CSS variable, so changing a width
// in the design system moves every Group using it), with optional bleed to the viewport.
import type { Variant } from "./style";

export type Device = "mobile" | "tablet" | "desktop";

export type LayoutMode = "group" | "row" | "stack" | "grid";

export type Bleed = "none" | "left" | "right" | "both";

export type Layout = {
  mode: LayoutMode;
  columns: number;
  wrap: boolean;
  container: boolean;
  width: string;
  bleed: Bleed;
};

export const DEVICE_VARIANT: Record<Device, Variant> = { mobile: "", tablet: "md:", desktop: "lg:" };

/** The variants a device reads, nearest first (desktop falls back to tablet, then the base). */
const CASCADE: Record<Device, Variant[]> = { mobile: [""], tablet: ["md:", ""], desktop: ["lg:", "md:", ""] };

const split = (classes: string) => classes.split(/\s+/).filter(Boolean);

const variantOf = (name: string) => {
  const match = /^(md:|lg:)/.exec(name);
  return { variant: (match?.[1] ?? "") as Variant, utility: match ? name.slice(match[1].length) : name };
};

const WIDTH = /^max-w-\[var\(--container-([a-z0-9-]+)\)\]$/;
const BLEED_LEFT = /^mr-\[max\(0px,calc\(\(100%-var\(--container-([a-z0-9-]+)\)\)\/2\)\)\]$/;
const BLEED_RIGHT = /^ml-\[max\(0px,calc\(\(100%-var\(--container-([a-z0-9-]+)\)\)\/2\)\)\]$/;

/** Utilities this lens owns. */
function owned(utility: string): boolean {
  return (
    ["block", "flex", "grid", "flex-row", "flex-col", "flex-wrap", "flex-nowrap", "mx-auto", "w-full", "max-w-none", "self-stretch"].includes(utility) ||
    /^grid-cols-\d+$/.test(utility) ||
    WIDTH.test(utility) ||
    BLEED_LEFT.test(utility) ||
    BLEED_RIGHT.test(utility)
  );
}

type Facts = Partial<Layout> & { display?: string };

/** The facts one variant's classes state on their own. */
function factsAt(classes: string, variant: Variant): Facts {
  const facts: Facts = {};
  let full = false;
  let bleed: Bleed | null = null;
  let width: string | null = null;
  let unconstrained = false;
  for (const name of split(classes)) {
    const { variant: at, utility } = variantOf(name);
    if (at !== variant) continue;
    if (utility === "block" || utility === "flex" || utility === "grid") facts.display = utility;
    if (utility === "flex-col") facts.mode = "stack";
    if (utility === "flex-row") facts.mode = "row";
    if (utility === "flex-wrap") facts.wrap = true;
    if (utility === "flex-nowrap") facts.wrap = false;
    const columns = /^grid-cols-(\d+)$/.exec(utility);
    if (columns) facts.columns = Number(columns[1]);
    if (utility === "w-full") full = true;
    if (utility === "max-w-none") unconstrained = true;
    const constrained = WIDTH.exec(utility);
    if (constrained) {
      width = constrained[1];
      bleed = bleed ?? "none";
    }
    const left = BLEED_LEFT.exec(utility);
    if (left) {
      width = left[1];
      bleed = "left";
    }
    const right = BLEED_RIGHT.exec(utility);
    if (right) {
      width = right[1];
      bleed = "right";
    }
  }
  if (facts.display === "grid") facts.mode = "grid";
  else if (facts.display === "block") facts.mode = "group";
  else if (facts.display === "flex" && !facts.mode) facts.mode = "row";
  if (width !== null) {
    facts.container = true;
    facts.width = width;
    facts.bleed = bleed ?? "none";
  } else if (full) {
    facts.container = true;
    facts.bleed = "both";
  } else if (unconstrained) {
    facts.container = false;
  }
  return facts;
}

/** The layout a device sees: its own variant's facts over the ones it inherits. */
export function readLayout(classes: string, device: Device, fallbackWidth = "wide"): Layout {
  const layout: Layout = { mode: "group", columns: 2, wrap: false, container: false, width: fallbackWidth, bleed: "none" };
  for (const variant of [...CASCADE[device]].reverse()) Object.assign(layout, factsAt(classes, variant));
  return layout;
}

/** The utilities a layout needs at one variant. */
function utilitiesFor(layout: Layout): string[] {
  const out: string[] = [];
  if (layout.mode === "row") out.push("flex", "flex-row", ...(layout.wrap ? ["flex-wrap"] : []));
  if (layout.mode === "stack") out.push("flex", "flex-col");
  if (layout.mode === "grid") out.push("grid", `grid-cols-${Math.max(1, Math.min(12, layout.columns))}`);
  if (layout.container) {
    const width = `(100%-var(--container-${layout.width}))/2`;
    if (layout.bleed === "none") out.push("mx-auto", "w-full", `max-w-[var(--container-${layout.width})]`);
    if (layout.bleed === "left") out.push(`mr-[max(0px,calc(${width}))]`);
    if (layout.bleed === "right") out.push(`ml-[max(0px,calc(${width}))]`);
    if (layout.bleed === "both") out.push("w-full");
  }
  return out;
}

/** The classes with a device's layout changed; other devices and other classes stay as they are. */
export function writeLayout(classes: string, device: Device, patch: Partial<Layout>): string {
  const variant = DEVICE_VARIANT[device];
  const inherited = device === "mobile" ? null : readLayout(stripVariant(classes, variant), device);
  const next: Layout = { ...readLayout(classes, device), ...patch };
  let utilities = utilitiesFor(next);
  if (inherited) {
    // Undo what the smaller sizes say when this size says otherwise.
    if (next.mode === "group" && inherited.mode !== "group") utilities = ["block", ...utilities];
    if (!next.container && inherited.container) utilities.push("mx-0", "max-w-none");
    if (next.mode === inherited.mode && next.columns === inherited.columns && next.wrap === inherited.wrap && next.container === inherited.container && next.width === inherited.width && next.bleed === inherited.bleed) utilities = [];
  }
  const kept = split(classes).filter((name) => {
    const parsed = variantOf(name);
    return parsed.variant !== variant || !(owned(parsed.utility) || parsed.utility === "mx-0");
  });
  return [...kept, ...utilities.map((utility) => variant + utility)].join(" ");
}

function stripVariant(classes: string, variant: Variant): string {
  return split(classes)
    .filter((name) => variantOf(name).variant !== variant)
    .join(" ");
}

export const LAYOUT_LABELS: Record<LayoutMode, string> = { group: "Group", row: "Row", stack: "Stack", grid: "Grid" };
