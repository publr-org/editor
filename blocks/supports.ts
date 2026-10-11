// The style controls each kind of block offers. UI surface only, never data policy: a
// block that does not offer spacing still loads and keeps `mt-10`, it just shows no
// control for it. `{ default: false }` controls wait under the Styles tab's Advanced
// section until the author turns them on (or the block already carries a value).
import type { StyleSupports } from "../model/registry";

const OPTIONAL = { default: false } as const;

const SIDES = {
  padding: true,
  paddingInline: true,
  paddingBlock: true,
  paddingTop: OPTIONAL,
  paddingRight: OPTIONAL,
  paddingBottom: OPTIONAL,
  paddingLeft: OPTIONAL,
  margin: true,
  marginTop: OPTIONAL,
  marginRight: OPTIONAL,
  marginBottom: OPTIONAL,
  marginLeft: OPTIONAL,
} as const;

/** Narrative text: the full typography, both colors, spacing, borders. */
export const TEXT: StyleSupports = {
  typography: {
    fontFamily: true,
    fontSize: true,
    lineHeight: true,
    letterSpacing: true,
    decoration: true,
    letterCase: true,
    textAlign: true,
    fontWeight: OPTIONAL,
    fontStyle: OPTIONAL,
  },
  color: { text: true, background: true },
  spacing: SIDES,
  dimensions: { width: OPTIONAL, minHeight: OPTIONAL },
  border: { width: true, color: true, radius: true, style: OPTIONAL },
};

/** Headings take the full text set. */
export const HEADING: StyleSupports = TEXT;

/** Containers: color, spacing, borders, sizes, flex layout. */
export const LAYOUT: StyleSupports = {
  color: { text: true, background: true },
  spacing: SIDES,
  dimensions: { width: OPTIONAL, height: OPTIONAL, minHeight: OPTIONAL, minWidth: OPTIONAL, maxWidth: OPTIONAL },
  layout: { gap: true, justifyContent: true, alignItems: true },
  border: { width: true, color: true, radius: true, style: OPTIONAL },
};

export const MEDIA: StyleSupports = {
  spacing: { padding: true, margin: true },
  dimensions: { width: OPTIONAL, height: OPTIONAL, aspectRatio: { default: false, values: ["auto", "square", "video"] } },
  border: { width: true, color: true, radius: true, style: OPTIONAL },
};

/** The Group container: the layouts, wrapping and grid columns on top of LAYOUT. */
export const GROUP: StyleSupports = {
  ...LAYOUT,
  layout: { ...LAYOUT.layout, layoutMode: true, flexWrap: true, gridColumns: { values: ["1", "2", "3", "4", "5", "6"] } },
};
