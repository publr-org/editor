// Button block — anchor root with rich label + link url (multi-carrier
// root), style solid|outline|link. `link` is the
// chrome-free anchor look, fully styled by authored classes. linkTarget/
// rel/title are island-canonical; the attributes are derived (_blank
// always carries noopener, an authored rel merges in). A tagName
// a|button switch is not modeled — the anchor root stays: anchors navigate, and a
// submit-button belongs to a form family Publr deliberately doesn't ship
// (documented scope decision — story #370).

import { escAttr, str } from "../carriers";
import type { BlockDefinition, Fields, Settings } from "../registry";
import { TEXT_SUPPORTS } from "./supports";

// The style preset is a DEFEASIBLE semantic class, not a bundle of utilities:
// a pasted button that fully styles itself (`rounded-md bg-indigo-500
// px-3.5 …`, the Tailwind-template norm) would otherwise collide with peer
// utilities (`rounded-sm bg-[accent] px-4 …`) and the engine's cascade order
// picks a winner unpredictably. `.pbe-btn--*` rules live in @layer components
// (chrome.css / styles.css), so ANY authored utility (@layer utilities)
// cleanly overrides the default look. Fresh buttons get the preset; pasted
// ones keep exactly their authored classes.
const STYLE_CLASS: Record<string, string> = {
  solid: "pbe-btn pbe-btn--solid",
  outline: "pbe-btn pbe-btn--outline",
  link: "pbe-btn pbe-btn--link",
};

export const type = "button";

export const definition: BlockDefinition = {
  label: "Button",
  category: "Design",
  icon: "button",
  placeholder: "Add text…",
  description: "Prompt visitors to take action with a button-style link.",
  supports: TEXT_SUPPORTS,
  variants: [
    {
      name: "outline",
      label: "Outline",
      styles: {
        backgroundColor: "transparent",
        textColor: "accent-surface",
        borderColor: "accent-surface",
        borderWidth: "1",
      },
    },
    {
      name: "link",
      label: "Link",
      styles: {
        backgroundColor: "transparent",
        textColor: "accent-surface",
        padding: "0",
        decoration: "underline",
      },
    },
  ],
  toolbar: [
    {
      control: "link",
      label: "Link",
      field: "url",
      targetSetting: "linkTarget",
      role: "content",
    },
  ],
  settings: [
    {
      control: "toggle-group",
      label: "Style",
      setting: "style",
      default: "solid",
      role: "design",
      options: [
        { value: "solid", label: "Solid" },
        { value: "outline", label: "Outline" },
        { value: "link", label: "Link" },
      ],
    },
    {
      control: "text",
      label: "Link URL",
      field: "url",
      placeholder: "https://…",
      role: "content",
    },
    {
      control: "select",
      label: "Open in",
      setting: "linkTarget",
      default: "none",
      role: "content",
      options: [
        { value: "none", label: "Same tab" },
        { value: "_blank", label: "New tab" },
      ],
    },
    {
      control: "text",
      label: "Link rel",
      setting: "rel",
      default: "",
      placeholder: "e.g. nofollow",
    },
    { control: "text", label: "Title attribute", setting: "title", default: "" },
  ],
  render(fields: Fields, settings?: Settings) {
    const style = STYLE_CLASS[String(settings?.style)] ?? STYLE_CLASS.solid;
    const rel = [
      settings?.linkTarget === "_blank" ? "noopener" : "",
      typeof settings?.rel === "string" ? settings.rel.trim() : "",
    ]
      .filter(Boolean)
      .join(" ");
    const attrs =
      (settings?.linkTarget === "_blank" ? ` target="_blank"` : "") +
      (rel ? ` rel="${escAttr(rel)}"` : "") +
      (typeof settings?.title === "string" && settings.title.trim()
        ? ` title="${escAttr(settings.title.trim())}"`
        : "");
    return `<a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="${escAttr(fields.url === undefined ? "#" : str(fields.url))}"${attrs} class="${style}">${str(fields.label)}</a>`;
  },
};
