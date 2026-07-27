import type { StyleSupports } from "../style";

export const TEXT_SUPPORTS: StyleSupports = {
  typography: {
    fontSize: true,
    lineHeight: true,
    letterSpacing: true,
    decoration: true,
    letterCase: true,
    textAlign: true,
    fontWeight: { default: false },
    fontStyle: { default: false },
  },
  color: { text: true, background: true },
  spacing: {
    padding: true,
    paddingInline: true,
    paddingBlock: true,
    paddingTop: { default: false },
    paddingRight: { default: false },
    paddingBottom: { default: false },
    paddingLeft: { default: false },
    margin: true,
    marginTop: { default: false },
    marginRight: { default: false },
    marginBottom: { default: false },
    marginLeft: { default: false },
  },
  dimensions: { width: { default: false }, minHeight: { default: false } },
  border: { width: true, color: true, radius: true, style: { default: false } },
};

export const LAYOUT_SUPPORTS: StyleSupports = {
  color: { text: true, background: true },
  spacing: {
    padding: true,
    paddingInline: true,
    paddingBlock: true,
    paddingTop: { default: false },
    paddingRight: { default: false },
    paddingBottom: { default: false },
    paddingLeft: { default: false },
    margin: true,
    marginTop: { default: false },
    marginRight: { default: false },
    marginBottom: { default: false },
    marginLeft: { default: false },
  },
  dimensions: {
    width: { default: false },
    height: { default: false },
    minHeight: { default: false },
    minWidth: { default: false },
  },
  layout: { gap: true, justifyContent: true, alignItems: true },
  border: { width: true, color: true, radius: true, style: { default: false } },
};

export const MEDIA_SUPPORTS: StyleSupports = {
  spacing: { padding: true, margin: true },
  dimensions: {
    width: { default: false },
    height: { default: false },
    aspectRatio: { default: false, values: ["auto", "square", "video"] },
  },
  border: { width: true, color: true, radius: true, style: { default: false } },
};
