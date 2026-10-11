// The block inspector's view of a block, as the old editor's inspector drew it: the
// card, the header settings, the Settings tab's sections and Layout, and the Styles
// tab's panels (Styles, Typography, Color, Dimensions, Border, Advanced). Each control's
// options come from the theme and its value is read through the lenses; every write is
// one setClasses (or setSetting) commit. Plain data the PTSX inspector renders.
import { Publr } from "publr-jsx";
import type { Editor } from "../model/editor";
import { DEVICE_VARIANT, readLayout, writeLayout } from "../model/layout";
import type { Device, Layout } from "../model/layout";
import { blockType } from "../model/registry";
import type { BlockType, SettingSpec, StyleSupport, StyleSupports, ToolbarSpec } from "../model/registry";
import { BORDER_WIDTH, CORNERS, FONT_WEIGHTS, LENSES, MARGIN, PADDING, RADIUS, SIDES, readBox, readLens, readVariation, writeBox, writeLens, writeVariation } from "../model/style";
import type { Corner, Lens, LensValue, Option, Side, Variant } from "../model/style";
import type { Theme } from "../model/theme";
import type { Block } from "../model/types";
import { isImageValue } from "../model/types";

// ── view types ──────────────────────────────────────────────────────────

export type ChoiceView = { value: string; label: string; icon: string; pressed: boolean };

/** One declared setting, joined with the block. */
export type SettingRow = {
  key: string;
  control: string;
  label: string;
  value: string;
  checked: boolean;
  number: number;
  options: ChoiceView[];
  placeholder: string;
  min: number;
  max: number;
  step: number;
  help: string;
  src: string;
  alt: string;
  addLabel: string;
  disabled: boolean;
};

export type SectionView = { key: string; role: string; label: string; open: boolean; rows: SettingRow[] };

export type OptionView = { key: string; label: string; icon: string; pressed: boolean };

/** A scale control: segmented up to eight options, a select above, a range for sizes. */
/** One breakpoint range of a responsive value: the breakpoints sharing it, its shade. */
export type ResponsiveRange = { key: string; span: number; color: string; changed: boolean; label: string };

/** One breakpoint's point under the track: where a value may change. */
export type ResponsivePoint = { key: string; device: string; viewport: string; active: boolean; changed: boolean; movable: boolean; label: string; color: string };

/** A value that differs across breakpoints: the "Responsive" pill and its track. */
export type ResponsiveView = { summary: string; changes: string; ranges: ResponsiveRange[]; points: ResponsivePoint[] };

export type ScaleRow = {
  prop: string;
  label: string;
  /** The value comes from a smaller breakpoint ("From Base"). */
  inherited: boolean;
  inheritedLabel: string;
  responsive: ResponsiveView | null;
  kind: "segmented" | "select" | "range";
  options: OptionView[];
  value: string;
  valueLabel: string;
  showCustom: boolean;
  /** The range: its step (0 is the empty value), the step count, and the custom value. */
  index: number;
  max: number;
  custom: boolean;
  customNumber: string;
  customUnit: string;
  customParsed: boolean;
  customMin: number;
  customMax: number;
  customStep: number;
  customRangeValue: number;
};

export type CardOption = { key: string; label: string; pressed: boolean; css: string };

export type SwatchView = { key: string; label: string; css: string; pressed: boolean };

export type ColorRow = { prop: string; label: string; valueLabel: string; css: string; empty: boolean; open: boolean; contextLabel: string; swatches: SwatchView[]; inherited: boolean; inheritedLabel: string; responsive: ResponsiveView | null };

export type BoxSideView = { part: string; label: string; title: string; display: string; pressed: boolean };

export type BoxModelView = {
  margin: BoxSideView[] | null;
  padding: BoxSideView[] | null;
  border: BoxSideView[] | null;
  radius: BoxSideView[] | null;
  /** The Margin and Padding layers draw even when their values are edited as rows below. */
  marginLayer: boolean;
  paddingLayer: boolean;
  responsive: ResponsiveView | null;
};

export type StylesView = {
  shown: boolean;
  disabled: boolean;
  variations: CardOption[];
  textStyles: CardOption[];
  fontFamily: { options: CardOption[]; valueLabel: string } | null;
  fontSize: ScaleRow | null;
  typography: ScaleRow[];
  typographyShown: boolean;
  colors: ColorRow[];
  textSpacing: boolean;
  box: BoxModelView | null;
  dimensions: ScaleRow[];
  borderStyles: OptionView[];
  optional: { prop: string; label: string; enabled: boolean }[];
};

export type PaneView = {
  open: boolean;
  kind: string;
  title: string;
  selection: string;
  corners: boolean;
  index: number;
  max: number;
  display: string;
  customNumber: string;
  customUnit: string;
  customRangeValue: number;
  customMin: number;
  customMax: number;
  customStep: number;
  /** Border width set on every picked side: the color tiers and their swatches. */
  borderColor: { tier: string; tiers: OptionView[]; swatches: SwatchView[]; custom: string; customHex: string } | null;
  top: number;
  left: number;
};

export type InspectorView = {
  label: string;
  icon: string;
  description: string;
  container: boolean;
  /** A Group constrained to a container: the card's chip. */
  containerOn: boolean;
  /** The block's authored classes, for the Advanced section's field. */
  classes: string;
  header: SettingRow[];
  tabsShown: boolean;
  hasStyles: boolean;
  sections: SectionView[];
  layout: ScaleRow[];
  styles: StylesView;
};

/** The inspector's own state: which tab, which sections are open, what is in custom mode. */
export type InspectorInputs = {
  tab: string;
  sections: Record<string, boolean>;
  customRows: string[];
  optional: string[];
  colorOpen: string;
  /** The device whose breakpoint the controls read and write ("mobile" is Base). */
  device: Device;
  paneKind: string;
  paneParts: string[];
  /** The border color picker's tier: recommended (Border), semantic, tokens, custom. */
  borderTier: string;
  paneTop: number;
  paneLeft: number;
};

// ── the style vocabulary ────────────────────────────────────────────────

/** A style prop at one breakpoint variant: `""` (Base), `md:` (Tablet), `lg:` (Desktop). */
type PropAt = {
  label: string;
  readAt(block: Block, theme: Theme, variant: Variant): LensValue;
  writeAt(block: Block, theme: Theme, variant: Variant, value: LensValue): string;
  options(theme: Theme): Option[];
};

/** A style prop as a device sees it: its own variant's value, else the nearest smaller one's. */
type Prop = PropAt & {
  read(block: Block, theme: Theme, device: Device): LensValue;
  write(block: Block, theme: Theme, device: Device, value: LensValue): string;
};

export const VARIANTS: readonly Variant[] = ["", "md:", "lg:"];

/** The variants a device reads, its own first. */
export const cascadeOf = (device: Device): Variant[] => VARIANTS.slice(0, VARIANTS.indexOf(DEVICE_VARIANT[device]) + 1).reverse();

/** A prop's value for a device and the variant it comes from (its own, or inherited). */
export function readFrom(prop: PropAt, block: Block, theme: Theme, device: Device): { value: LensValue; from: Variant } {
  for (const variant of cascadeOf(device)) {
    const value = prop.readAt(block, theme, variant);
    if (value !== null) return { value, from: variant };
  }
  return { value: null, from: DEVICE_VARIANT[device] };
}

const cascading = (prop: PropAt): Prop => ({
  ...prop,
  read: (block, theme, device) => readFrom(prop, block, theme, device).value,
  write: (block, theme, device, value) => prop.writeAt(block, theme, DEVICE_VARIANT[device], value),
});

const lensProp = (lens: Lens): Prop =>
  cascading({
    label: lens.label,
    readAt: (block, theme, variant) => readLens(block.classes, lens, theme, variant),
    writeAt: (block, theme, variant, value) => writeLens(block.classes, lens, theme, value, variant),
    options: (theme) => lens.options(theme),
  });

type BoxDef = typeof PADDING | typeof MARGIN;

const boxProp = (box: BoxDef, label: string, parts: readonly Side[]): Prop =>
  cascading({
    label,
    readAt(block, theme, variant) {
      const values = readBox(block.classes, box, theme, variant);
      const first = values[parts[0]];
      return parts.every((part) => JSON.stringify(values[part]) === JSON.stringify(first)) ? first : null;
    },
    writeAt: (block, theme, variant, value) => writeBox(block.classes, box, theme, parts, value, variant),
    options: (theme) => theme.spacing.map(({ key, value, label: name }) => ({ key, value, label: name })),
  });

const VARIANT_DEVICE: Record<string, Device> = { "": "mobile", "md:": "tablet", "lg:": "desktop" };

const GRID_COLUMNS: Prop = {
  label: Publr.t("Grid columns"),
  readAt: (block, theme, variant) => ({ key: String(readLayout(block.classes, VARIANT_DEVICE[variant], fallbackWidth(theme)).columns) }),
  writeAt: (block, _theme, variant, value) => writeLayout(block.classes, VARIANT_DEVICE[variant], { columns: value && "key" in value ? Number(value.key) : 2 }),
  read: (block, theme, device) => ({ key: String(readLayout(block.classes, device, fallbackWidth(theme)).columns) }),
  write: (block, _theme, device, value) => writeLayout(block.classes, device, { columns: value && "key" in value ? Number(value.key) : 2 }),
  options: () => ["1", "2", "3", "4", "5", "6"].map((key) => ({ key, label: key })),
};

/** The weights a font weight control offers: the classic four (the family's own are not known here). */
const DEFAULT_WEIGHT_OPTIONS = FONT_WEIGHTS.filter((option) => ["font-normal", "font-medium", "font-semibold", "font-bold"].includes(option.key));

const fallbackWidth = (theme: Theme) => theme.containers.at(-1)?.key ?? "wide";

export const PROPS: Record<string, Prop> = {
  fontFamily: lensProp(LENSES.fontFamily),
  fontSize: lensProp(LENSES.fontSize),
  lineHeight: lensProp(LENSES.lineHeight),
  letterSpacing: lensProp(LENSES.letterSpacing),
  decoration: lensProp(LENSES.decoration),
  letterCase: lensProp(LENSES.letterCase),
  textAlign: lensProp(LENSES.textAlign),
  fontWeight: { ...lensProp(LENSES.fontWeight), options: () => DEFAULT_WEIGHT_OPTIONS },
  fontStyle: lensProp(LENSES.fontStyle),
  textColor: lensProp(LENSES.textColor),
  backgroundColor: lensProp(LENSES.background),
  borderColor: lensProp(LENSES.borderColor),
  borderStyle: lensProp(LENSES.borderStyle),
  padding: boxProp(PADDING, Publr.t("Padding"), SIDES),
  paddingInline: boxProp(PADDING, Publr.t("Horizontal padding"), ["left", "right"]),
  paddingBlock: boxProp(PADDING, Publr.t("Vertical padding"), ["top", "bottom"]),
  paddingTop: boxProp(PADDING, Publr.t("Padding top"), ["top"]),
  paddingRight: boxProp(PADDING, Publr.t("Padding right"), ["right"]),
  paddingBottom: boxProp(PADDING, Publr.t("Padding bottom"), ["bottom"]),
  paddingLeft: boxProp(PADDING, Publr.t("Padding left"), ["left"]),
  margin: boxProp(MARGIN, Publr.t("Margin"), SIDES),
  marginTop: boxProp(MARGIN, Publr.t("Margin top"), ["top"]),
  marginRight: boxProp(MARGIN, Publr.t("Margin right"), ["right"]),
  marginBottom: boxProp(MARGIN, Publr.t("Margin bottom"), ["bottom"]),
  marginLeft: boxProp(MARGIN, Publr.t("Margin left"), ["left"]),
  width: lensProp(LENSES.width),
  height: lensProp(LENSES.height),
  minHeight: lensProp(LENSES.minHeight),
  minWidth: lensProp(LENSES.minWidth),
  maxWidth: lensProp(LENSES.maxWidth),
  flexBasis: lensProp(LENSES.flexBasis),
  aspectRatio: lensProp(LENSES.aspectRatio),
  gap: lensProp(LENSES.gap),
  rowGap: lensProp(LENSES.rowGap),
  columnGap: lensProp(LENSES.columnGap),
  justifyContent: lensProp(LENSES.justifyContent),
  alignItems: lensProp(LENSES.alignItems),
  flexWrap: lensProp(LENSES.flexWrap),
  gridColumns: GRID_COLUMNS,
};

/** Every style control in the order the inspector lists them, with where its support lives. */
const CAPABILITIES: readonly [string, string, (s: StyleSupports) => StyleSupport | undefined][] = [
  ["fontFamily", Publr.t("Font family"), (s) => s.typography?.fontFamily],
  ["fontSize", Publr.t("Font size"), (s) => s.typography?.fontSize],
  ["lineHeight", Publr.t("Line height"), (s) => s.typography?.lineHeight],
  ["letterSpacing", Publr.t("Letter spacing"), (s) => s.typography?.letterSpacing],
  ["decoration", Publr.t("Decoration"), (s) => s.typography?.decoration],
  ["letterCase", Publr.t("Letter case"), (s) => s.typography?.letterCase],
  ["textAlign", Publr.t("Text alignment"), (s) => s.typography?.textAlign],
  ["fontWeight", Publr.t("Font weight"), (s) => s.typography?.fontWeight],
  ["fontStyle", Publr.t("Font style"), (s) => s.typography?.fontStyle],
  ["textColor", Publr.t("Text color"), (s) => s.color?.text],
  ["backgroundColor", Publr.t("Background color"), (s) => s.color?.background],
  ["padding", Publr.t("Padding"), (s) => s.spacing?.padding],
  ["paddingInline", Publr.t("Horizontal padding"), (s) => s.spacing?.paddingInline],
  ["paddingBlock", Publr.t("Vertical padding"), (s) => s.spacing?.paddingBlock],
  ["paddingTop", Publr.t("Padding top"), (s) => s.spacing?.paddingTop],
  ["paddingRight", Publr.t("Padding right"), (s) => s.spacing?.paddingRight],
  ["paddingBottom", Publr.t("Padding bottom"), (s) => s.spacing?.paddingBottom],
  ["paddingLeft", Publr.t("Padding left"), (s) => s.spacing?.paddingLeft],
  ["margin", Publr.t("Margin"), (s) => s.spacing?.margin],
  ["marginTop", Publr.t("Margin top"), (s) => s.spacing?.marginTop],
  ["marginRight", Publr.t("Margin right"), (s) => s.spacing?.marginRight],
  ["marginBottom", Publr.t("Margin bottom"), (s) => s.spacing?.marginBottom],
  ["marginLeft", Publr.t("Margin left"), (s) => s.spacing?.marginLeft],
  ["width", Publr.t("Width"), (s) => s.dimensions?.width],
  ["height", Publr.t("Height"), (s) => s.dimensions?.height],
  ["minHeight", Publr.t("Minimum height"), (s) => s.dimensions?.minHeight],
  ["minWidth", Publr.t("Minimum width"), (s) => s.dimensions?.minWidth],
  ["maxWidth", Publr.t("Maximum width"), (s) => s.dimensions?.maxWidth],
  ["flexBasis", Publr.t("Flex basis"), (s) => s.dimensions?.flexBasis],
  ["aspectRatio", Publr.t("Aspect ratio"), (s) => s.dimensions?.aspectRatio],
  ["gap", Publr.t("Gap"), (s) => s.layout?.gap],
  ["rowGap", Publr.t("Row gap"), (s) => s.layout?.rowGap],
  ["columnGap", Publr.t("Column gap"), (s) => s.layout?.columnGap],
  ["justifyContent", Publr.t("Justification"), (s) => s.layout?.justifyContent],
  ["alignItems", Publr.t("Items alignment"), (s) => s.layout?.alignItems],
  ["flexWrap", Publr.t("Wrapping"), (s) => s.layout?.flexWrap],
  ["gridColumns", Publr.t("Grid columns"), (s) => s.layout?.gridColumns],
  ["borderWidth", Publr.t("Border width"), (s) => s.border?.width],
  ["borderColor", Publr.t("Border color"), (s) => s.border?.color],
  ["borderRadius", Publr.t("Border radius"), (s) => s.border?.radius],
  ["borderStyle", Publr.t("Border style"), (s) => s.border?.style],
];

const supportOf = (supports: StyleSupports, prop: string) => CAPABILITIES.find(([name]) => name === prop)?.[2](supports);
const enabled = (support: StyleSupport | undefined) => support === true || (!!support && typeof support === "object");
const optionalSupport = (support: StyleSupport | undefined) => !!support && typeof support === "object" && support.default === false;

/** The props whose control is a range over the scale (sizes), never a segmented group. */
const RANGE_PROPS = new Set([
  "padding", "paddingInline", "paddingBlock", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "width", "height", "minHeight", "minWidth", "maxWidth", "flexBasis",
  "gap", "rowGap", "columnGap", "gridColumns", "lineHeight", "letterSpacing",
]);

/** Keyword groups lead with a Default segment that clears the value. */
const KEYWORD_PROPS = new Set(["textAlign", "fontWeight", "fontStyle", "decoration", "letterCase", "justifyContent", "alignItems", "flexWrap"]);

const SEGMENTED_MAX = 8;

const CUSTOM_UNITS = ["px", "%", "em", "rem", "vw", "vh"];

const customScale = (unit: string) =>
  unit === "%" || unit === "vw" || unit === "vh" ? { min: 0, max: 100, step: 1 } : unit === "em" || unit === "rem" ? { min: 0, max: 10, step: 0.125 } : { min: 0, max: 200, step: 1 };

/** A value as number + unit for the custom editor; unparsed values fall back to a text field. */
function customParts(raw: string): { number: string; unit: string; parsed: boolean } {
  const match = /^(-?(?:\d+|\d*\.\d+))(px|%|em|rem|vw|vh)$/i.exec(raw.trim());
  if (match) return { number: match[1], unit: match[2].toLowerCase(), parsed: true };
  return { number: raw ? "" : "0", unit: "px", parsed: !raw };
}

const optionLabel = (option: Option) => option.label;

export const VARIANT_LABEL: Record<string, string> = { "": Publr.t("Base"), "md:": Publr.t("Tablet"), "lg:": Publr.t("Desktop") };
const VARIANT_VIEWPORT: Record<string, string> = { "": "390px", "md:": "768px", "lg:": "1024px" };

const encodeValue = (value: LensValue) => (value === null ? "" : "key" in value ? `k:${value.key}` : `c:${value.custom}`);

/**
 * The responsive view of a value: each breakpoint's own value (or null) carried up the
 * cascade; one range per run of equal values. Null while every breakpoint agrees.
 */
export function responsiveOf(own: (variant: Variant) => string | null, device: Device): ResponsiveView | null {
  let carried = "";
  const values = VARIANTS.map((variant) => {
    const value = own(variant);
    if (value !== null) carried = value;
    return { value: carried, explicit: value !== null };
  });
  const groups: { start: number; end: number; value: string; changed: boolean }[] = [];
  values.forEach((entry, index) => {
    const previous = groups.at(-1);
    if (previous && previous.value === entry.value) previous.end = index;
    else groups.push({ start: index, end: index, value: entry.value, changed: index > 0 && entry.explicit });
  });
  const variants = [...new Set(values.map((entry) => entry.value))];
  if (variants.length < 2) return null;
  const shade = (value: string) => `color-mix(in oklch, var(--primary) ${Math.round(32 + (variants.indexOf(value) / (variants.length - 1)) * 54)}%, var(--card))`;
  const active = VARIANTS.indexOf(DEVICE_VARIANT[device]);
  const ranges = groups.map((group) => {
    const start = VARIANTS[group.start];
    const label = group.start === group.end ? VARIANT_LABEL[start] : Publr.t("{from} through {to}", { from: VARIANT_LABEL[start], to: VARIANT_LABEL[VARIANTS[group.end]] });
    return { key: start, span: group.end - group.start + 1, color: shade(group.value), changed: group.changed, label: group.changed ? Publr.t("Reset changes from {viewport}", { viewport: VARIANT_VIEWPORT[start] }) : Publr.t("{label} base variant", { label }) };
  });
  const points = VARIANTS.map((variant, index) => {
    const changed = groups.some((group) => group.start === index && index > 0);
    const group = groups.find((candidate) => candidate.start === index);
    const movable = changed && !!group && (index > 1 || group.end > index || index < VARIANTS.length - 1);
    return {
      key: variant,
      device: VARIANT_DEVICE[variant],
      viewport: VARIANT_VIEWPORT[variant],
      active: index === active,
      changed,
      movable,
      label: changed ? Publr.t("{breakpoint}, {viewport}, field changes here; use the arrow keys to move the change", { breakpoint: VARIANT_LABEL[variant], viewport: VARIANT_VIEWPORT[variant] }) : `${VARIANT_LABEL[variant]}, ${VARIANT_VIEWPORT[variant]}`,
      color: shade(values[index].value),
    };
  });
  const changes = points.filter((point) => point.changed).map((point) => point.viewport);
  return { summary: Publr.tn("{count} variant", "{count} variants", variants.length), changes: Publr.t("Changes at {viewports}", { viewports: changes.join(", ") }), ranges, points };
}

/** A prop's responsive view (null when it is the same at every breakpoint). */
export function propResponsive(prop: string, block: Block, theme: Theme, device: Device): ResponsiveView | null {
  const def = PROPS[prop];
  if (!def || prop === "gridColumns") return null;
  return responsiveOf((variant) => {
    const value = def.readAt(block, theme, variant);
    return value === null ? null : encodeValue(value);
  }, device);
}

/** The box model's responsive view: every side and corner together. */
export function boxResponsive(block: Block, theme: Theme, device: Device): ResponsiveView | null {
  return responsiveOf((variant) => {
    const all = [PADDING, MARGIN, BORDER_WIDTH, RADIUS].map((box) => readBox(block.classes, box as never, theme, variant) as Record<string, LensValue>);
    return all.every((values) => Object.values(values).every((value) => value === null)) ? null : JSON.stringify(all);
  }, device);
}

export function scaleRow(block: Block, prop: string, theme: Theme, device: Device, inputs: InspectorInputs, label = PROPS[prop].label, allowCustom = true): ScaleRow {
  const def = PROPS[prop];
  const found = readFrom(def, block, theme, device);
  const value = found.value;
  const inherited = value !== null && found.from !== DEVICE_VARIANT[device];
  const current = value === null ? "" : "key" in value ? value.key : value.custom;
  const options = def.options(theme);
  const range = RANGE_PROPS.has(prop) && options.length > 1;
  const empty = prop.startsWith("padding") || prop.startsWith("margin") ? Publr.t("None") : Publr.t("Default");
  const views: OptionView[] = options.map((option) => ({ key: option.key, label: optionLabel(option), icon: option.icon ?? "", pressed: !!value && "key" in value && value.key === option.key }));
  if (KEYWORD_PROPS.has(prop) && !range) views.unshift({ key: "", label: Publr.t("Default"), icon: views.some((view) => view.icon) ? "reset" : "", pressed: value === null });
  const at = value && "key" in value ? options.findIndex((option) => option.key === value.key) : -1;
  const raw = value && "key" in value ? (options[at]?.value ?? value.key) : current;
  const parts = customParts(raw);
  const scale = customScale(parts.unit);
  const numeric = Number(parts.number);
  return {
    prop,
    label,
    inherited,
    inheritedLabel: inherited ? Publr.t("From {breakpoint}", { breakpoint: VARIANT_LABEL[found.from] }) : "",
    responsive: propResponsive(prop, block, theme, device),
    kind: range ? "range" : views.length > SEGMENTED_MAX ? "select" : "segmented",
    options: views,
    value: current,
    valueLabel: at >= 0 ? optionLabel(options[at]) : current ? Publr.t("Custom") : empty,
    showCustom: allowCustom && !range,
    index: at + 1,
    max: options.length,
    custom: inputs.customRows.includes(prop),
    customNumber: parts.number,
    customUnit: parts.unit,
    customParsed: parts.parsed,
    customMin: scale.min,
    customMax: scale.max,
    customStep: scale.step,
    customRangeValue: Math.min(scale.max, Math.max(scale.min, Number.isFinite(numeric) ? numeric : scale.min)),
  };
}

// ── style-bound settings (the Group's layout) ───────────────────────────

const LAYOUT_STYLES = new Set(["layoutMode", "containerEnabled", "containerWidth", "containerBleed"]);

export function readStyleSetting(block: Block, style: string, theme: Theme, device: Device): string {
  if (LAYOUT_STYLES.has(style)) {
    const layout = readLayout(block.classes, device, fallbackWidth(theme));
    if (style === "layoutMode") return layout.mode;
    if (style === "containerEnabled") return String(layout.container);
    if (style === "containerWidth") return layout.width;
    return layout.bleed;
  }
  const value = PROPS[style]?.read(block, theme, device) ?? null;
  return value === null ? "" : "key" in value ? value.key : value.custom;
}

export function writeStyleSetting(block: Block, style: string, value: string, theme: Theme, device: Device): string {
  if (style === "layoutMode") return writeLayout(block.classes, device, { mode: value as Layout["mode"] });
  if (style === "containerEnabled") return writeLayout(block.classes, device, { container: value === "true" });
  if (style === "containerWidth") return writeLayout(block.classes, device, { width: value });
  if (style === "containerBleed") return writeLayout(block.classes, device, { bleed: value as Layout["bleed"] });
  return PROPS[style] ? PROPS[style].write(block, theme, device, value ? { key: value } : null) : block.classes;
}

const containerOptions = (theme: Theme) =>
  theme.containers.map((entry) => ({ value: entry.key, label: `${entry.key[0].toUpperCase()}${entry.key.slice(1)} · Max ${entry.value}`, icon: "container-width" }));

/** A style-bound setting's or toolbar spec's options (container widths come from the theme). */
export function styleOptions(style: string, declared: readonly { value: string; label: string; icon?: string }[] | undefined, theme: Theme) {
  if (style === "containerWidth") return containerOptions(theme);
  return (declared ?? []).map((option) => ({ value: option.value, label: option.label, icon: option.icon ?? "" }));
}

// ── settings ────────────────────────────────────────────────────────────

const ROLE_RANK = { content: 0, structure: 1, design: 2, advanced: 3 } as const;
const ROLE_LABEL = { content: Publr.t("Content"), structure: Publr.t("Structure"), design: Publr.t("Appearance"), advanced: Publr.t("Advanced") } as const;

type Role = keyof typeof ROLE_RANK;

function roleOf(type: BlockType, spec: SettingSpec): Role {
  if (spec.role) return spec.role;
  const field = spec.field ? type.fields.find((candidate) => candidate.name === spec.field) : null;
  return spec.transform || field?.kind === "tag" ? "structure" : spec.field ? "content" : "advanced";
}

function visible(block: Block, type: BlockType, spec: SettingSpec, theme: Theme, device: Device): boolean {
  if (spec.when && !spec.when({ ...type.defaults, ...block.settings }, block.fields)) return false;
  if (spec.whenStyle && readStyleSetting(block, spec.whenStyle.style, theme, device) !== spec.whenStyle.equals) return false;
  return true;
}

function settingRow(block: Block, type: BlockType, spec: SettingSpec, index: number, theme: Theme, device: Device, locked: boolean): SettingRow {
  const settings = { ...type.defaults, ...block.settings };
  const raw =
    spec.style !== undefined
      ? readStyleSetting(block, spec.style, theme, device) || String(spec.default ?? "")
      : spec.setting !== undefined
        ? settings[spec.setting]
        : spec.field !== undefined
          ? block.fields[spec.field]
          : block.type;
  const value = isImageValue(raw) ? raw.src : raw === undefined || raw === null ? "" : String(raw);
  const media = isImageValue(raw) ? raw : null;
  const options = spec.style !== undefined ? styleOptions(spec.style, spec.options, theme) : (spec.options ?? []).map((option) => ({ value: option.value, label: option.label, icon: option.icon ?? "" }));
  return {
    key: String(index),
    control: spec.control,
    label: spec.label,
    value,
    checked: raw === true || raw === "true",
    number: typeof raw === "number" ? raw : Number(raw) || 0,
    options: options.map((option) => ({ ...option, pressed: option.value === value })),
    placeholder: spec.placeholder ?? "",
    min: spec.min ?? 0,
    max: spec.max ?? 100,
    step: spec.step ?? 1,
    help: spec.help ?? "",
    src: media?.src ?? "",
    alt: media?.alt ?? "",
    addLabel: Publr.t("Add {item}", { item: spec.label.toLowerCase() }),
    disabled: locked && spec.role !== "content",
  };
}

/** The block card: a Group names its layout ("Row layout. The block remains a Group…"). */
export function presentationOf(block: Block, theme: Theme, device: Device): string | null {
  if (block.type !== "group") return null;
  return readLayout(block.classes, device, fallbackWidth(theme)).mode;
}

export function inspectorView(editor: Editor, block: Block | null, theme: Theme, device: Device, inputs: InspectorInputs, path: Block[]): InspectorView {
  const empty: InspectorView = { label: "", icon: "", description: "", container: false, containerOn: false, classes: "", header: [], tabsShown: true, hasStyles: false, sections: [], layout: [], styles: emptyStyles() };
  const type = block ? blockType(block.type) : null;
  if (!block || !type) return empty;
  const locked = editor.policy.designLocked;
  const specs = (type.settings ?? [])
    .map((spec, index) => ({ spec, index, role: roleOf(type, spec) }))
    .filter(({ role }) => !locked || role === "content")
    .filter(({ spec }) => visible(block, type, spec, theme, device))
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.index - b.index);
  const header = specs.filter(({ spec }) => spec.control === "toggle-group" && spec.style === "layoutMode");
  const rest = specs.filter((entry) => !header.includes(entry));
  const sections: SectionView[] = [];
  for (const { spec, index, role } of rest) {
    let section = sections.find((candidate) => candidate.role === role);
    if (!section) {
      const key = `${block.id}:${role}`;
      section = { key, role, label: ROLE_LABEL[role], open: key in inputs.sections ? inputs.sections[key] : role !== "advanced", rows: [] };
      sections.push(section);
    }
    section.rows.push(settingRow(block, type, spec, index, theme, device, locked));
  }
  const mode = presentationOf(block, theme, device);
  const label = mode ? `${mode[0].toUpperCase()}${mode.slice(1)}` : type.label;
  const styles = locked ? emptyStyles() : stylesView(block, type, theme, device, inputs, path);
  return {
    label,
    icon: mode ?? type.icon ?? "components",
    description: mode ? Publr.t("{layout} layout. The block remains a Group at every breakpoint.", { layout: label }) : (type.description ?? ""),
    container: block.type === "group",
    containerOn: block.type === "group" && readStyleSetting(block, "containerEnabled", theme, device) === "true",
    classes: block.classes,
    header: header.map(({ spec, index }) => settingRow(block, type, spec, index, theme, device, locked)),
    tabsShown: true,
    hasStyles: styles.shown,
    sections,
    layout: locked ? [] : layoutRows(block, type, theme, device, inputs),
    styles,
  };
}

// ── styles ──────────────────────────────────────────────────────────────

const emptyStyles = (): StylesView => ({
  shown: false,
  disabled: false,
  variations: [],
  textStyles: [],
  fontFamily: null,
  fontSize: null,
  typography: [],
  typographyShown: false,
  colors: [],
  textSpacing: false,
  box: null,
  dimensions: [],
  borderStyles: [],
  optional: [],
});

/** Whether a style control shows: supported, and on by default, turned on, or already set. */
function shownFor(block: Block, type: BlockType, theme: Theme, device: Device, inputs: InspectorInputs) {
  const supports = type.supports ?? {};
  const mode = presentationOf(block, theme, device);
  return (prop: string): boolean => {
    const support = supportOf(supports, prop);
    if (!enabled(support)) return false;
    if (mode) {
      if (mode === "group" && ["gap", "rowGap", "columnGap", "justifyContent", "alignItems", "flexWrap", "gridColumns"].includes(prop)) return false;
      if (mode !== "grid" && prop === "gridColumns") return false;
      if (mode !== "row" && prop === "flexWrap") return false;
    }
    return !optionalSupport(support) || inputs.optional.includes(`${block.id}:${prop}`) || hasValue(block, prop, theme, device);
  };
}

function hasValue(block: Block, prop: string, theme: Theme, device: Device): boolean {
  if (prop === "borderWidth") return Object.values(readBox(block.classes, BORDER_WIDTH, theme)).some((value) => value !== null);
  if (prop === "borderRadius") return Object.values(readBox(block.classes, RADIUS, theme)).some((value) => value !== null);
  if (prop === "gridColumns") return false;
  return !!PROPS[prop] && PROPS[prop].read(block, theme, device) !== null;
}

function layoutRows(block: Block, type: BlockType, theme: Theme, device: Device, inputs: InspectorInputs): ScaleRow[] {
  const shown = shownFor(block, type, theme, device, inputs);
  return ["gap", "rowGap", "columnGap", "justifyContent", "alignItems", "flexWrap", "gridColumns"].filter(shown).map((prop) => scaleRow(block, prop, theme, device, inputs, CAPABILITIES.find(([name]) => name === prop)![1], !KEYWORD_PROPS.has(prop)));
}

const ALLOWED_ROLES: Record<string, Set<string>> = {
  textColor: new Set(["foreground", "accent", "accent-foreground", "muted-foreground"]),
  backgroundColor: new Set(["surface", "accent", "muted"]),
  borderColor: new Set(["border", "foreground", "accent"]),
};

/** The color context a block sits in: the nearest context-prefixed semantic color up its path. */
function contextOf(path: Block[], theme: Theme): string {
  const semantic = theme.semanticColors;
  for (const ancestor of [...path].reverse()) {
    for (const lens of [LENSES.textColor, LENSES.background, LENSES.borderColor]) {
      const value = readLens(ancestor.classes, lens, theme);
      const found = value && "key" in value ? semantic.find((color) => color.key === value.key) : null;
      if (found) return found.context;
    }
  }
  return "default";
}

const words = (key: string) => key.split("-").map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part)).join(" ");

/** The swatches a color control offers: the context's semantic colors for the job, or every color. */
export function swatchesFor(prop: string, block: Block, theme: Theme, path: Block[], device: Device = "mobile"): { swatches: SwatchView[]; contextLabel: string } {
  const value = PROPS[prop].read(block, theme, device);
  const key = value && "key" in value ? value.key : "";
  const semantic = theme.semanticColors;
  const context = contextOf(path, theme);
  const allowed = ALLOWED_ROLES[prop];
  const palette = semantic.length ? semantic.filter((color) => color.context === context && allowed.has(color.role)) : theme.colors.map((color) => ({ key: color.key, label: words(color.key), value: color.value }));
  return { swatches: palette.map((color) => ({ key: color.key, label: color.label, css: color.value, pressed: color.key === key })), contextLabel: `${words(context)} style` };
}

function colorRow(prop: string, label: string, block: Block, theme: Theme, inputs: InspectorInputs, path: Block[]): ColorRow {
  const found = readFrom(PROPS[prop], block, theme, inputs.device);
  const value = found.value;
  const inherited = value !== null && found.from !== DEVICE_VARIANT[inputs.device];
  const key = value === null ? "" : "key" in value ? value.key : value.custom;
  const named = theme.semanticColors.find((color) => color.key === key) ?? theme.colors.find((color) => color.key === key);
  const { swatches, contextLabel } = swatchesFor(prop, block, theme, path, inputs.device);
  return {
    prop,
    label,
    inherited,
    inheritedLabel: inherited ? Publr.t("From {breakpoint}", { breakpoint: VARIANT_LABEL[found.from] }) : "",
    responsive: propResponsive(prop, block, theme, inputs.device),
    valueLabel: named ? ("label" in named && named.label !== named.key ? named.label : words(named.key)) : key || Publr.t("Default"),
    css: named?.value ?? (value && "custom" in value ? value.custom : "transparent"),
    empty: !key,
    open: inputs.colorOpen === prop,
    contextLabel,
    swatches,
  };
}

const SIDE_LABEL: Record<string, string> = { top: Publr.t("top"), right: Publr.t("right"), bottom: Publr.t("bottom"), left: Publr.t("left") };
const CORNER_LABEL: Record<string, string> = { tl: Publr.t("top-left"), tr: Publr.t("top-right"), br: Publr.t("bottom-right"), bl: Publr.t("bottom-left") };

function boxDisplay(value: LensValue, theme: Theme, kind: string): string {
  if (!value) return "";
  if ("custom" in value) return value.custom;
  if (kind === "padding" || kind === "margin") return theme.spacing.find((entry) => entry.key === value.key)?.label ?? value.key;
  return value.key;
}

/** A box's values for a device: each part its own variant's value, else the nearest smaller one's. */
export function boxValuesFor(block: Block, theme: Theme, box: object, parts: readonly string[], device: Device): Record<string, LensValue> {
  const out: Record<string, LensValue> = Object.fromEntries(parts.map((part) => [part, null]));
  for (const variant of [...cascadeOf(device)].reverse()) {
    const values = readBox(block.classes, box as never, theme, variant) as Record<string, LensValue>;
    for (const part of parts) if (values[part] !== null) out[part] = values[part];
  }
  return out;
}

function boxSides(block: Block, theme: Theme, kind: "padding" | "margin" | "border", inputs: InspectorInputs): BoxSideView[] {
  const box = kind === "padding" ? PADDING : kind === "margin" ? MARGIN : BORDER_WIDTH;
  const values = boxValuesFor(block, theme, box, SIDES, inputs.device);
  return SIDES.map((side) => ({
    part: side,
    label: kind === "border" ? Publr.t("Edit border {side}", { side: SIDE_LABEL[side] }) : kind === "padding" ? Publr.t("Edit padding {side}", { side: SIDE_LABEL[side] }) : Publr.t("Edit margin {side}", { side: SIDE_LABEL[side] }),
    title: "",
    display: boxDisplay(values[side], theme, kind),
    pressed: inputs.paneKind === kind && inputs.paneParts.includes(side),
  }));
}

function radiusCorners(block: Block, theme: Theme, inputs: InspectorInputs): BoxSideView[] {
  const values = boxValuesFor(block, theme, RADIUS, CORNERS, inputs.device);
  return CORNERS.map((corner: Corner) => ({
    part: corner,
    label: Publr.t("Edit {corner} border radius", { corner: CORNER_LABEL[corner] }),
    title: Publr.t("{corner} radius", { corner: `${CORNER_LABEL[corner][0].toUpperCase()}${CORNER_LABEL[corner].slice(1)}` }),
    display: boxDisplay(values[corner], theme, "radius"),
    pressed: inputs.paneKind === "radius" && inputs.paneParts.includes(corner),
  }));
}

function stylesView(block: Block, type: BlockType, theme: Theme, device: Device, inputs: InspectorInputs, path: Block[]): StylesView {
  const supports = type.supports;
  const variants = type.variations ?? [];
  if (!supports && !variants.length) return emptyStyles();
  const all = supports ?? {};
  const shown = shownFor(block, type, theme, device, inputs);
  const current = readVariation(block.classes, variants);
  const variations: CardOption[] = variants.length
    ? [{ key: "default", label: Publr.t("Default"), pressed: !current, css: "" }, ...variants.map((variant) => ({ key: variant.name, label: variant.label, pressed: variant.name === current, css: "" }))]
    : [];
  const fontSize = shown("fontSize") ? scaleRow(block, "fontSize", theme, device, inputs) : null;
  const familyShown = shown("fontFamily") && theme.fontChoices.length > 0;
  const family = familyShown ? PROPS.fontFamily.read(block, theme, device) : null;
  const familyKey = family && "key" in family ? family.key : "";
  const fontFamily = familyShown
    ? {
        options: [{ key: "default", label: Publr.t("Default"), pressed: !family, css: "" }, ...theme.fontChoices.map((choice) => ({ key: choice.key, label: choice.label, pressed: choice.key === familyKey, css: choice.css }))],
        valueLabel: theme.fontChoices.find((choice) => choice.key === familyKey)?.label ?? (family ? Publr.t("Custom") : Publr.t("Default")),
      }
    : null;
  const preset = activeTextStyle(block, theme, device);
  const textStyles: CardOption[] =
    theme.textStyles.length && (familyShown || !!fontSize)
      ? [{ key: "default", label: Publr.t("Default"), pressed: !preset, css: "" }, ...theme.textStyles.map((style) => ({ key: style.key, label: style.label, pressed: style.key === preset, css: "" }))]
      : [];
  const typography = ["lineHeight", "textAlign", "fontWeight", "fontStyle", "letterSpacing", "decoration", "letterCase"].filter(shown).map((prop) => scaleRow(block, prop, theme, device, inputs, CAPABILITIES.find(([name]) => name === prop)![1].replace(/^Font weight$/, "Font weight")));
  const colors = [
    ["textColor", Publr.t("Text")],
    ["backgroundColor", Publr.t("Background")],
  ]
    .filter(([prop]) => shown(prop))
    .map(([prop, label]) => colorRow(prop, label, block, theme, inputs, path));
  const sides = (prefix: string) => ["Top", "Right", "Bottom", "Left"].every((side) => enabled(supportOf(all, `${prefix}${side}`)));
  const paddingLinked = enabled(supportOf(all, "padding")) && sides("padding");
  const marginLinked = enabled(supportOf(all, "margin")) && sides("margin");
  const borderShown = enabled(all.border?.width) || enabled(all.border?.color) || enabled(all.border?.radius);
  const spacingBox = paddingLinked || marginLinked || borderShown;
  const box: BoxModelView | null = spacingBox
    ? {
        margin: marginLinked ? boxSides(block, theme, "margin", inputs) : null,
        padding: paddingLinked ? boxSides(block, theme, "padding", inputs) : null,
        border: enabled(all.border?.width) ? boxSides(block, theme, "border", inputs) : null,
        radius: enabled(all.border?.radius) ? radiusCorners(block, theme, inputs) : null,
        marginLayer: true,
        paddingLayer: true,
        responsive: boxResponsive(block, theme, inputs.device),
      }
    : null;
  const dimensionProps = [
    ...(paddingLinked ? [] : ["padding"]),
    ...(paddingLinked ? [] : ["paddingInline", "paddingBlock"]),
    ...(paddingLinked ? [] : ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]),
    ...(marginLinked ? [] : ["margin", "marginTop", "marginRight", "marginBottom", "marginLeft"]),
    "width",
    "height",
    "minHeight",
    "minWidth",
    "maxWidth",
    "flexBasis",
    "aspectRatio",
  ].filter(shown);
  const dimensions = dimensionProps.map((prop) => scaleRow(block, prop, theme, device, inputs, CAPABILITIES.find(([name]) => name === prop)![1]));
  const borderStyles = shown("borderStyle") ? scaleRow(block, "borderStyle", theme, device, inputs).options.filter((option) => option.key !== "") : [];
  const optional = CAPABILITIES.filter(([prop, , support]) => optionalSupport(support(all)) && !(paddingLinked && /^padding[A-Z]/.test(prop) && prop !== "paddingInline" && prop !== "paddingBlock") && !(marginLinked && /^margin[A-Z]/.test(prop))).map(([prop, label]) => ({
    prop,
    label,
    enabled: inputs.optional.includes(`${block.id}:${prop}`) || hasValue(block, prop, theme, device),
  }));
  const typographyShown = !!fontSize || typography.length > 0 || !!fontFamily || textStyles.length > 0;
  return {
    shown: true,
    disabled: false,
    variations,
    textStyles,
    fontFamily,
    fontSize,
    typography,
    typographyShown,
    colors,
    textSpacing: type.category === "text" && spacingBox,
    box,
    dimensions,
    borderStyles,
    optional,
  };
}

// ── text styles ─────────────────────────────────────────────────────────

const TEXT_STYLE_PROPS = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"] as const;

const presetValue = (prop: (typeof TEXT_STYLE_PROPS)[number], key: string | undefined): LensValue => (key ? { key: prop === "fontWeight" ? `font-${key}` : key } : null);

function activeTextStyle(block: Block, theme: Theme, device: Device): string {
  return (
    theme.textStyles.find((style) =>
      TEXT_STYLE_PROPS.every((prop) => JSON.stringify(PROPS[prop].read(block, theme, device)) === JSON.stringify(presetValue(prop, style.styles[prop]))),
    )?.key ?? ""
  );
}

/** The classes with a text style's set written over the typography lenses ("default" clears them). */
export function withTextStyle(block: Block, theme: Theme, device: Device, key: string): string {
  const style = theme.textStyles.find((candidate) => candidate.key === key);
  let next = block;
  for (const prop of TEXT_STYLE_PROPS) next = { ...next, classes: PROPS[prop].write(next, theme, device, presetValue(prop, style?.styles[prop])) };
  return next.classes;
}


// ── writes ──────────────────────────────────────────────────────────────

/** Writes a style prop on the block ("" or null clears it). */
export function applyProp(editor: Editor, block: Block, theme: Theme, device: Device, prop: string, value: LensValue, key: string | null = null): void {
  if (!PROPS[prop]) return;
  editor.setClasses(block.id, PROPS[prop].write(block, theme, device, value), { key });
}

export function applyVariation(editor: Editor, block: Block, name: string): void {
  const variations = blockType(block.type)?.variations ?? [];
  editor.setClasses(block.id, writeVariation(block.classes, variations, name === "default" ? null : name));
}

/** The props each panel's Reset clears. */
export const PANEL_PROPS: Record<string, readonly string[]> = {
  typography: ["fontFamily", "fontSize", "lineHeight", "letterSpacing", "decoration", "letterCase", "textAlign", "fontWeight", "fontStyle"],
  color: ["textColor", "backgroundColor"],
  dimensions: ["padding", "margin", "width", "height", "minHeight", "minWidth", "maxWidth", "flexBasis", "aspectRatio"],
  border: ["borderStyle", "borderColor"],
  layout: ["gap", "rowGap", "columnGap", "justifyContent", "alignItems", "flexWrap"],
};

/** The classes with every prop of a panel cleared (Styles clears the variation). */
export function resetPanel(block: Block, theme: Theme, device: Device, panel: string): string {
  if (panel === "styles") return writeVariation(block.classes, blockType(block.type)?.variations ?? [], null);
  let next = block;
  for (const prop of PANEL_PROPS[panel] ?? []) next = { ...next, classes: PROPS[prop].write(next, theme, device, null) };
  if (panel === "border") {
    next = { ...next, classes: writeBox(next.classes, BORDER_WIDTH, theme, SIDES, null, DEVICE_VARIANT[device]) };
    next = { ...next, classes: writeBox(next.classes, RADIUS, theme, CORNERS, null, DEVICE_VARIANT[device]) };
  }
  return next.classes;
}

// ── the box control pane ────────────────────────────────────────────────

export type BoxKind = "padding" | "margin" | "border" | "radius";

const BOXES = { padding: PADDING, margin: MARGIN, border: BORDER_WIDTH, radius: RADIUS } as const;

const SIDE_NAMES: Record<string, string> = { top: "Top", right: "Right", bottom: "Bottom", left: "Left", tl: "Top Left", tr: "Top Right", br: "Bottom Right", bl: "Bottom Left" };

/** The pane's selection in the BoxControl's vocabulary: "Top", "Top, Bottom", "All sides". */
export function selectionLabel(kind: string, parts: string[]): string {
  const order = kind === "radius" ? CORNERS : SIDES;
  if (parts.length === order.length) return kind === "radius" ? "All corners" : "All sides";
  return (order as readonly string[]).filter((part) => parts.includes(part)).map((part) => SIDE_NAMES[part]).join(", ");
}

export function partsOf(kind: string, selection: string): string[] {
  if (selection === "All sides") return [...SIDES];
  if (selection === "All corners") return [...CORNERS];
  const names = selection.split(", ");
  return Object.entries(SIDE_NAMES)
    .filter(([part, name]) => names.includes(name) && (kind === "radius" ? part.length === 2 : part.length > 2))
    .map(([part]) => part);
}

/** The pane's discrete scale for a box kind: the theme's steps (the range's 0 is None). */
export function boxScale(theme: Theme, kind: BoxKind): { key: string; label: string; value: string }[] {
  if (kind === "padding" || kind === "margin") return theme.spacing.map((entry) => ({ key: entry.key, label: entry.label, value: entry.value }));
  if (kind === "border") return ["1", "2", "4", "8"].map((key) => ({ key, label: key, value: `${key}px` }));
  return theme.radii.map((entry) => ({ key: entry.key, label: entry.key, value: entry.value }));
}

/** The value a selection of parts shares, or null when mixed or unset. */
export function sharedValue(block: Block, theme: Theme, kind: BoxKind, parts: string[], device: Device = "mobile"): LensValue {
  const values = boxValuesFor(block, theme, BOXES[kind], kind === "radius" ? CORNERS : SIDES, device);
  const first = values[parts[0]];
  return parts.every((part) => JSON.stringify(values[part]) === JSON.stringify(first)) ? first : null;
}

const PANE_TITLES: Record<string, string> = { padding: Publr.t("Padding"), margin: Publr.t("Margin"), border: Publr.t("Border"), radius: Publr.t("Border Radius") };

export function paneView(block: Block | null, theme: Theme, inputs: InspectorInputs, path: Block[]): PaneView {
  const kind = inputs.paneKind as BoxKind;
  const closed: PaneView = { open: false, kind: "", title: "", selection: "Top", corners: false, index: 0, max: 1, display: "None", customNumber: "0", customUnit: "px", customRangeValue: 0, customMin: 0, customMax: 200, customStep: 1, borderColor: null, top: 0, left: 0 };
  if (!kind || !block || !inputs.paneParts.length) return closed;
  const scale = boxScale(theme, kind);
  const value = sharedValue(block, theme, kind, inputs.paneParts, inputs.device);
  const at = value && "key" in value ? scale.findIndex((step) => step.key === value.key) : -1;
  const raw = value === null ? "" : "key" in value ? (scale[at]?.value ?? value.key) : value.custom;
  const parts = customParts(raw);
  const range = customScale(parts.unit);
  const numeric = Number(parts.number);
  const widths = boxValuesFor(block, theme, BORDER_WIDTH, SIDES, inputs.device) as Record<Side, LensValue>;
  const colored = kind === "border" && inputs.paneParts.every((part) => widths[part as Side] !== null && !(widths[part as Side] && "key" in widths[part as Side]! && (widths[part as Side] as { key: string }).key === "0"));
  return {
    open: true,
    kind,
    title: PANE_TITLES[kind],
    selection: selectionLabel(kind, inputs.paneParts),
    corners: kind === "radius",
    index: at + 1,
    max: scale.length,
    display: at >= 0 ? scale[at].label : value ? Publr.t("Custom") : Publr.t("None"),
    customNumber: parts.number,
    customUnit: CUSTOM_UNITS.includes(parts.unit) ? parts.unit : "px",
    customRangeValue: Math.min(range.max, Math.max(range.min, Number.isFinite(numeric) ? numeric : 0)),
    customMin: range.min,
    customMax: range.max,
    customStep: range.step,
    borderColor: colored ? borderTier(block, theme, path, inputs) : null,
    top: inputs.paneTop,
    left: inputs.paneLeft,
  };
}

export function applyBox(editor: Editor, block: Block, theme: Theme, kind: BoxKind, parts: string[], value: LensValue, device: Device = "mobile"): void {
  editor.setClasses(block.id, writeBox(block.classes, BOXES[kind] as never, theme, parts as never, value, DEVICE_VARIANT[device]), { key: `${block.id}:box:${kind}` });
}

const TIERS = [
  ["recommended", Publr.t("Border")],
  ["semantic", Publr.t("Semantic")],
  ["tokens", Publr.t("Tokens")],
  ["custom", Publr.t("Custom")],
] as const;

/** The border color picker: a tier's swatches (Border roles in this context first), or a custom value. */
function borderTier(block: Block, theme: Theme, path: Block[], inputs: InspectorInputs): NonNullable<PaneView["borderColor"]> {
  const tier = inputs.borderTier || "recommended";
  const found = PROPS.borderColor.read(block, theme, inputs.device);
  const key = found === null ? "" : "key" in found ? found.key : "";
  const custom = found && "custom" in found ? found.custom : "";
  const semantic = theme.semanticColors;
  const context = contextOf(path, theme);
  const semanticKeys = new Set(semantic.map((color) => color.key));
  const palette =
    tier === "semantic"
      ? semantic.map((color) => ({ key: color.key, label: color.label, value: color.value }))
      : tier === "tokens"
        ? theme.colors.filter((color) => !semanticKeys.has(color.key)).map((color) => ({ key: color.key, label: words(color.key), value: color.value }))
        : tier === "custom"
          ? []
          : semantic.length
            ? semantic.filter((color) => color.role === "border").sort((a, b) => Number(b.context === context) - Number(a.context === context)).map((color) => ({ key: color.key, label: color.label, value: color.value }))
            : theme.colors.map((color) => ({ key: color.key, label: words(color.key), value: color.value }));
  const css = custom || semantic.find((color) => color.key === key)?.value || theme.colors.find((color) => color.key === key)?.value || "";
  const hex = /^#[\da-f]{6}$/i.test(css) ? css : /^#([\da-f])([\da-f])([\da-f])$/i.test(css) ? `#${css[1]}${css[1]}${css[2]}${css[2]}${css[3]}${css[3]}` : "#000000";
  return {
    tier,
    tiers: TIERS.map(([value, label]) => ({ key: value, label, icon: "", pressed: value === tier })),
    swatches: palette.map((color) => ({ key: color.key, label: color.label, css: color.value, pressed: color.key === key })),
    custom: custom || css,
    customHex: hex,
  };
}

export function applyLayout(editor: Editor, block: Block, device: Device, patch: Partial<Layout>): void {
  editor.setClasses(block.id, writeLayout(block.classes, device, patch));
}

// ── the toolbar's declared controls ─────────────────────────────────────

export type ToolbarControlView = {
  index: number;
  control: string;
  label: string;
  icon: string;
  text: string;
  pressed: boolean;
  disabled: boolean;
  options: ChoiceView[];
};

/** The block's declared toolbar controls joined with its values, as the toolbar draws them. */
export function toolbarControls(block: Block | null, theme: Theme, device: Device, locked: boolean): ToolbarControlView[] {
  const type = block ? blockType(block.type) : null;
  if (!block || !type) return [];
  const settings = { ...type.defaults, ...block.settings };
  return (type.toolbar ?? [])
    .map((spec, index) => ({ spec, index }))
    .filter(({ spec }) => !locked || spec.role === "content")
    .filter(({ spec }) => !((spec.style === "containerWidth" || spec.style === "containerBleed") && readStyleSetting(block, "containerEnabled", theme, device) !== "true"))
    .map(({ spec, index }) => toolbarControl(block, type, spec, index, settings, theme, device));
}

function toolbarControl(block: Block, type: BlockType, spec: ToolbarSpec, index: number, settings: Record<string, unknown>, theme: Theme, device: Device): ToolbarControlView {
  const declared = spec.options ?? (spec.setting ? type.settings?.find((candidate) => candidate.setting === spec.setting)?.options : undefined);
  const value =
    spec.control === "style-options" || spec.control === "toggle-style"
      ? readStyleSetting(block, spec.style ?? "", theme, device)
      : spec.control === "field-options"
        ? String(block.fields[spec.field ?? ""] ?? "")
        : spec.control === "text-align"
          ? (readLens(block.classes, LENSES.textAlign, theme) as { key: string } | null)?.key?.replace("text-", "") ?? ""
          : spec.setting
            ? settings[spec.setting]
            : spec.field
              ? block.fields[spec.field]
              : "";
  const options = (spec.style ? styleOptions(spec.style, declared, theme) : (declared ?? []).map((option) => ({ value: option.value, label: option.label, icon: option.icon ?? "" }))).map((option) => ({ ...option, pressed: option.value === value }));
  const active = options.find((option) => option.pressed);
  const href = typeof value === "string" ? value : "";
  const pressed =
    spec.control === "caption"
      ? settings[spec.setting ?? ""] !== false && (settings[spec.setting ?? ""] === true || String(block.fields[spec.field ?? ""] ?? "").trim() !== "" || type.defaults[spec.setting ?? ""] === true)
      : spec.control === "toggle-setting"
      ? value === true
      : spec.control === "toggle-style"
        ? value === spec.value
        : spec.control === "link"
          ? href.trim() !== ""
          : false;
  const icon =
    spec.control === "toggle-style"
      ? (pressed ? (spec.activeIcon ?? spec.icon) : spec.icon) ?? ""
      : spec.control === "link"
        ? "link"
        : spec.control === "text-align"
          ? `text-align-${value || "left"}`
          : spec.control === "caption"
            ? "caption"
          : (active?.icon || spec.icon) ?? "";
  return {
    index,
    control: spec.control,
    label: spec.label,
    icon,
    text: spec.control.endsWith("-options") && !icon ? (active?.label ?? spec.label) : spec.label,
    pressed,
    disabled: spec.control === "copy" && !(typeof value === "string" && value.trim()),
    options,
  };
}

// ── a pattern copy's color style ────────────────────────────────────────

export type PatternContextView = { key: string; label: string; surface: string; foreground: string; accent: string; pressed: boolean };

const CONTEXT_LENSES = [LENSES.textColor, LENSES.background, LENSES.borderColor];

function descendants(block: Block): Block[] {
  return Object.values(block.slots ?? {}).flatMap((children) => children.flatMap((child) => [child, ...descendants(child)]));
}

/** The theme's color contexts a copy can take, each with its surface, foreground and accent. */
export function patternContexts(root: Block, theme: Theme): PatternContextView[] {
  const semantic = theme.semanticColors;
  const keys = [...new Set(semantic.map((color) => color.context))];
  const active = contextOfBlocks(descendants(root), theme);
  const value = (context: string, role: string) => semantic.find((color) => color.context === context && color.role === role)?.value ?? "";
  const views = keys
    .map((key) => ({ key, label: key === "default" ? Publr.t("Default") : words(key), surface: value(key, "surface"), foreground: value(key, "foreground"), accent: value(key, "accent-surface"), pressed: key === active }))
    .filter((view) => view.surface && view.foreground && view.accent);
  return views.length > 1 ? views : [];
}

function contextOfBlocks(blocks: Block[], theme: Theme): string {
  const semantic = theme.semanticColors;
  for (const block of blocks) {
    for (const lens of CONTEXT_LENSES) {
      const value = readLens(block.classes, lens, theme);
      const found = value && "key" in value ? semantic.find((color) => color.key === value.key) : null;
      if (found) return found.context;
    }
  }
  return "default";
}

/** The copy's blocks with every semantic color moved to another context: `brand-surface` → `surface`. */
export function withPatternContext(root: Block, theme: Theme, context: string): { id: string; classes: string }[] {
  const semantic = theme.semanticColors;
  const out: { id: string; classes: string }[] = [];
  for (const block of [root, ...descendants(root)]) {
    let classes = block.classes;
    for (const lens of CONTEXT_LENSES) {
      const value = readLens(classes, lens, theme);
      const found = value && "key" in value ? semantic.find((color) => color.key === value.key) : null;
      const target = found ? semantic.find((color) => color.context === context && color.role === found.role) : null;
      if (target) classes = writeLens(classes, lens, theme, { key: target.key });
    }
    if (classes !== block.classes) out.push({ id: block.id, classes });
  }
  return out;
}

// ── responsive values: reset a breakpoint's change, move it ─────────────

/** The props a responsive control covers ("box" is the whole box model). */
const responsiveProps = (prop: string): string[] => (prop === "box" ? [] : [prop]);

/** The classes with the props' own values at one variant cleared (the box model: every side). */
export function clearAtVariant(block: Block, theme: Theme, prop: string, variant: Variant): string {
  let classes = block.classes;
  if (prop === "box") {
    for (const box of [PADDING, MARGIN, BORDER_WIDTH]) classes = writeBox(classes, box as never, theme, SIDES as never, null, variant);
    return writeBox(classes, RADIUS, theme, CORNERS, null, variant);
  }
  for (const name of responsiveProps(prop)) classes = PROPS[name].writeAt({ ...block, classes }, theme, variant, null);
  return classes;
}

/** The classes with a variant's own values moved to a neighbouring variant (a boundary moved). */
export function moveVariant(block: Block, theme: Theme, prop: string, from: Variant, to: Variant): string {
  if (from === to) return block.classes;
  let classes = block.classes;
  if (prop === "box") {
    for (const [box, parts] of [[PADDING, SIDES], [MARGIN, SIDES], [BORDER_WIDTH, SIDES], [RADIUS, CORNERS]] as const) {
      const values = readBox(classes, box as never, theme, from) as Record<string, LensValue>;
      for (const part of parts) {
        if (values[part] === null) continue;
        classes = writeBox(classes, box as never, theme, [part] as never, values[part], to);
        classes = writeBox(classes, box as never, theme, [part] as never, null, from);
      }
    }
    return classes;
  }
  for (const name of responsiveProps(prop)) {
    const value = PROPS[name].readAt({ ...block, classes }, theme, from);
    if (value === null) continue;
    classes = PROPS[name].writeAt({ ...block, classes }, theme, to, value);
    classes = PROPS[name].writeAt({ ...block, classes }, theme, from, null);
  }
  return classes;
}
