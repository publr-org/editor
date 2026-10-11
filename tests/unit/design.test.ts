// The design system builder's model: the document Publr keeps (saved.ts) and every edit
// the builder's pages make to it, invalid input included.
import { fromSaved, savedFonts, toSaved } from "../../design/model/saved";
import type { SavedSystem } from "../../design/model/saved";
import {
  DEFAULT_TYPE_SCALE,
  SEMANTIC_COLOR_ROLES,
  completeSystem,
  cssLengthPx,
  fontCss,
  fontRoles,
  fontStack,
  fontStylesheets,
  googleFontStylesheetUrl,
  linkSemanticColorsToPalette,
  paletteTokens,
  resolveValue,
  roleToken,
  setToken,
  starterSystem,
  systemFromAppTokens,
  tokenValue,
} from "../../design/model/system";
import type { DesignSystem, FilesFont, GoogleFont } from "../../design/model/system";
import { addContext, addRole, keyFrom, removeContext, removeRole, renameContext, updateRole } from "../../design/model/roles";
import { addStyle, literalLength, removeStyle, scaleValue, styleCss, styleKey, updateStyle } from "../../design/model/typescale";
import { colorFamilies, familyTokens, generatedColorScale, mainShade, parseColorToOklch, sortShades } from "../../design/model/colors";
import { applyImport, fontsFromCssText, themeFromCssText, themeToCssText } from "../../design/model/transfer";
import { fontFallbackFor, fontTokenName, putFont, removeFont, renameFont, setFontRole, toggleWeight } from "../../design/model/fonts";
import { fontFactsFromFilename } from "../../design/model/font-file";
import { findAllUsages, findUsages, retarget, rewriteHtml, rewriteTokens, rewriteTypeScale, usageSources } from "../../design/model/usage";
import { addIcons, iconLabel, iconNameFrom, sanitizeSvgIcon } from "../../design/model/icons";
import { equal, excludes, includes, ok, same, test } from "./harness";

/** A small, readable system every test starts from. */
function base(): DesignSystem {
  return completeSystem({
    tokens: [
      { name: "text-sm", value: "0.875rem" },
      { name: "text-lg", value: "1.125rem" },
      { name: "leading-tight", value: "1.25" },
      { name: "tracking-wide", value: "0.025em" },
      { name: "font-sans", value: "ui-sans-serif, system-ui, sans-serif" },
      { name: "font-serif", value: "Georgia, serif" },
      { name: "font-heading", value: "var(--font-serif)" },
      { name: "font-body", value: "var(--font-sans)" },
      { name: "color-palette-ink", value: "#18181b" },
      { name: "color-palette-paper", value: "#ffffff" },
      { name: "color-palette-ocean", value: "#3858e9" },
      { name: "color-palette-ocean-100", value: "#dfe5fc" },
      { name: "color-palette-ocean-900", value: "#10215c" },
      { name: "color-surface", value: "var(--color-palette-paper)" },
      { name: "color-foreground", value: "var(--color-palette-ink)" },
    ],
    roles: [
      { key: "surface", label: "Surface", description: "Backgrounds", value: "#ffffff" },
      { key: "foreground", label: "Foreground", description: "Text", value: "#18181b" },
    ],
    contexts: [{ key: "default", label: "Default" }],
    typeScale: [{ key: "body-1", label: "Body 1", fontRole: "body", weight: 400, size: "sm", lineHeight: "tight", letterSpacing: "wide", textTransform: "", description: "Reading" }],
    icons: [],
  });
}

/** What design.save_system accepts, as the server checks it (src/model/design/system.zig
 * and src/operations/design/system.zig): the saved document must pass these. */
function serverAccepts(saved: ReturnType<typeof toSaved>): string {
  const key = /^[a-z][a-z0-9-]*$/;
  for (const token of saved.tokens) {
    if (!key.test(token.name) || token.name.length > 64) return `token name ${token.name}`;
    if (!token.value || token.value.length > 512 || /[;{}\r\n<]/.test(token.value)) return `token value ${token.name}`;
  }
  for (const font of saved.fonts) {
    if (!font.faces?.length && !font.url.startsWith("https://")) return `font url ${font.family}`;
    for (const face of font.faces ?? []) if (!(face.src.startsWith("/") || face.src.startsWith("https://")) || face.weight_min > face.weight_max) return `face ${face.src}`;
  }
  const structure = saved.system;
  for (const role of structure.roles) if (!key.test(role.key)) return `role ${role.key}`;
  for (const context of structure.contexts) if (!key.test(context.key)) return `context ${context.key}`;
  for (const style of structure.type_scale) {
    if (!key.test(style.key) || style.weight < 100 || style.weight > 900) return `style ${style.key}`;
    if (!["", "uppercase", "lowercase", "capitalize"].includes(style.text_transform ?? "")) return `transform ${style.key}`;
  }
  for (const font of structure.fonts) if (!["google", "files", "system"].includes(font.provider)) return `provider ${font.provider}`;
  for (const icon of structure.icons) if (!icon.svg.trim().startsWith("<svg") || /<script|javascript:|\son/i.test(icon.svg)) return `icon ${icon.name}`;
  return "";
}

// ── the saved document ──────────────────────────────────────────────────

test("design saved: what Publish sends reads back as the same document", () => {
  const google: GoogleFont = { token: "font-inter", family: "Inter", fallback: "sans-serif", provider: "google", weights: [400, 700], italic: true, availableWeights: [100, 400, 700, 900], availableItalic: true };
  const files: FilesFont = { token: "font-inferi", family: "Inferi", fallback: "serif", provider: "files", faces: [{ weight: 400, italic: false, src: "/media/inferi.woff2" }, { weight: [100, 900], italic: true, src: "/media/inferi-italic.woff2" }] };
  const system: DesignSystem = {
    ...base(),
    tokens: [...base().tokens, { name: "font-inter", value: '"Inter", sans-serif' }, { name: "font-inferi", value: '"Inferi", serif' }],
    fonts: [google, files],
    icons: [{ name: "check", label: "Check", category: "General", svg: '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>' }],
    managedColorTokens: ["color-red-500"],
    blockDefaults: { paragraph: '<p data-pb-block="paragraph" data-pb-rich="body">Hello</p>' },
  };
  const saved = toSaved(system);
  equal(serverAccepts(saved), "", "the server takes it");
  const read: SavedSystem = { tokens: saved.tokens, fonts: saved.fonts, system: JSON.parse(JSON.stringify(saved.system)), saved: true };
  const back = fromSaved(read);
  same({ ...back, roles: back.roles.map(({ value: _value, ...role }) => role) }, { ...system, roles: system.roles.map(({ value: _value, ...role }) => role) }, "the round trip is lossless");
  same(back.roles.map((role) => role.value), ["var(--color-palette-paper)", "var(--color-palette-ink)"], "a role's color is its token's, not a saved copy");
});

test("design saved: the fonts pages load are stylesheets for Google, faces for hosted files, nothing for device fonts", () => {
  const system: DesignSystem = {
    ...base(),
    fonts: [
      { token: "font-inter", family: "Inter", fallback: "sans-serif", provider: "google", weights: [700, 400], italic: false, availableWeights: [400, 700], availableItalic: false },
      { token: "font-inferi", family: "Inferi", fallback: "serif", provider: "files", faces: [{ weight: [100, 900], italic: true, src: "/media/a.woff2" }] },
      { token: "font-empty", family: "Empty", fallback: "serif", provider: "files", faces: [] },
      { token: "font-sans", family: "System", fallback: "sans-serif", provider: "system", weights: [400], italic: false },
    ],
  };
  same(savedFonts(system), [
    { family: "Inter", url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" },
    { family: "Inferi", url: "", faces: [{ weight_min: 100, weight_max: 900, italic: true, src: "/media/a.woff2" }] },
  ]);
});

test("design saved: an app that never saved a system opens on the starter with its own tokens kept", () => {
  const read: SavedSystem = { tokens: [{ name: "color-brand", value: "#2f5d54" }, { name: "text-sm", value: "13px" }], fonts: [], system: null, saved: false };
  const system = fromSaved(read);
  equal(tokenValue(system, "color-palette-brand"), "#2f5d54", "the app's color is kept, in the palette");
  equal(tokenValue(system, "color-brand"), "var(--color-palette-brand)", "its utility names the palette entry");
  equal(tokenValue(system, "text-sm"), "13px", "a starter token the app overrides takes the app's value");
  equal(system.roles.length, SEMANTIC_COLOR_ROLES.length, "the starter roles");
  equal(system.typeScale.length, DEFAULT_TYPE_SCALE.length, "the starter type scale");
  ok(system.icons.length > 40, "the starter icons");
  equal(serverAccepts(toSaved(system)), "", "and the server takes the starter as it is");
});

test("design saved: a sparse structure is completed, never lost", () => {
  const read = { tokens: [{ name: "color-surface", value: "#fafafa" }], fonts: [], system: { roles: [{ key: "surface", label: "Surface", description: "" }], contexts: [], fonts: [], type_scale: [{ key: "x", label: "X", font_role: "body", weight: 500, size: "12px" }], icons: [], managed_color_tokens: [], block_defaults: [] }, saved: true } as unknown as SavedSystem;
  const system = fromSaved(read);
  equal(system.roles[0].value, "#fafafa", "a role's value comes from its token");
  same(system.contexts, [{ key: "default", label: "Default" }], "no contexts falls back to Default");
  same(system.typeScale[0], { key: "x", label: "X", fontRole: "body", weight: 500, size: "12px", lineHeight: "", letterSpacing: "", textTransform: "", description: "" }, "missing fields take their defaults");
  same(system.blockDefaults, {}, "no block defaults");
});

test("design saved: what the server refuses is caught by its rules", () => {
  const broken = toSaved(setToken(base(), "Bad Name", "red"));
  includes(serverAccepts(broken), "token name", "a token name with spaces");
  includes(serverAccepts(toSaved(setToken(base(), "color-x", "red; }"))), "token value", "a value ending the declaration");
  includes(serverAccepts(toSaved({ ...base(), typeScale: [{ ...base().typeScale[0], weight: 950 }] })), "style", "a weight past 900");
  includes(serverAccepts(toSaved({ ...base(), icons: [{ name: "x", label: "X", category: "C", svg: "<svg onload='x()'/>" }] })), "icon", "a scripted icon");
  includes(serverAccepts(toSaved({ ...base(), fonts: [{ token: "font-a", family: "A", fallback: "serif", provider: "files", faces: [{ weight: 400, italic: false, src: "relative.woff2" }] }] })), "face", "a face from nowhere");
});

// ── tokens and values ───────────────────────────────────────────────────

test("design tokens: set in place, append, remove; references resolve, cycles stop", () => {
  let system = base();
  system = setToken(system, "text-sm", "14px");
  equal(system.tokens.findIndex((token) => token.name === "text-sm"), 0, "set in place keeps the order");
  system = setToken(system, "radius-huge", "3rem");
  equal(system.tokens[system.tokens.length - 1].name, "radius-huge", "a new token is appended");
  system = setToken(system, "radius-huge", null);
  equal(tokenValue(system, "radius-huge"), undefined, "removed");
  equal(resolveValue(system, "var(--color-surface)"), "#ffffff", "a chain resolves");
  equal(resolveValue(system, "var(--missing, #123456)"), "#123456", "a missing token takes its fallback");
  equal(resolveValue(system, "calc(1px + 2px)"), "calc(1px + 2px)", "other CSS is left alone");
  const looped = setToken(setToken(system, "color-a", "var(--color-b)"), "color-b", "var(--color-a)");
  equal(resolveValue(looped, "var(--color-a)"), "var(--color-a)", "a cycle stops");
  equal(cssLengthPx("2rem"), 32);
  equal(cssLengthPx("12px"), 12);
  equal(cssLengthPx("auto"), null);
});

test("design tokens: a literal role that is a palette color points at it", () => {
  const linked = linkSemanticColorsToPalette(setToken(base(), "color-surface", "#FFFFFF"));
  equal(tokenValue(linked, "color-surface"), "var(--color-palette-paper)", "matched case-insensitively");
  const literal = linkSemanticColorsToPalette(setToken(base(), "color-surface", "#abcdef"));
  equal(tokenValue(literal, "color-surface"), "#abcdef", "a color the palette lacks stays literal");
  equal(paletteTokens(base()).length, 5, "the palette is color-palette-* only");
});

// ── roles and contexts ──────────────────────────────────────────────────

test("design roles: contexts add with copied colors, rename, and remove what they own", () => {
  const added = addContext(base(), "Night sky", "", "default");
  ok(added.system, added.error);
  const system = added.system!;
  same(system.contexts.map((context) => context.key), ["default", "night-sky"], "the key comes from the name");
  equal(tokenValue(system, "color-night-sky-surface"), "var(--color-palette-paper)", "a new context copies its source's colors");
  equal(renameContext(system, "night-sky", "  Midnight ").contexts[1].label, "Midnight", "renamed, trimmed");
  equal(renameContext(system, "night-sky", "   ").contexts[1].label, "Night sky", "an empty name is ignored");
  const removed = removeContext(system, "night-sky");
  equal(removed.contexts.length, 1, "removed");
  ok(!removed.tokens.some((token) => token.name.startsWith("color-night-sky-")), "with every token it owned");
  equal(removeContext(system, "default").contexts.length, 2, "Default never goes");
});

test("design roles: invalid contexts are refused with the old copy", () => {
  equal(addContext(base(), "   ", "", "default").error, "Give the context a name.");
  equal(addContext(base(), "!!!", "", "default").error, "Give the context a name.", "no key can be made");
  equal(addContext(base(), "Default", "", "default").error, "A “default” context already exists.");
  const once = addContext(base(), "Brand", "", "default").system!;
  equal(addContext(once, "Brand again", "brand", "default").error, "A “brand” context already exists.");
  equal(keyFrom("  Slate Blue!! "), "slate-blue");
});

test("design roles: roles add in every context, update, and remove their tokens", () => {
  const withContext = addContext(base(), "Brand", "", "default").system!;
  const added = addRole(withContext, "Accent Surface", "");
  ok(added.system, added.error);
  const system = added.system!;
  equal(tokenValue(system, roleToken("default", "accent-surface")), "var(--color-palette-ink)", "points at the first palette color");
  equal(tokenValue(system, roleToken("brand", "accent-surface")), "var(--color-palette-ink)", "in every context");
  equal(updateRole(system, "accent-surface", "description", "Buttons").roles.find((role) => role.key === "accent-surface")!.description, "Buttons");
  equal(updateRole(system, "accent-surface", "label", " ").roles.find((role) => role.key === "accent-surface")!.label, "Accent Surface", "blank is ignored");
  const removed = removeRole(system, "accent-surface");
  ok(!removed.roles.some((role) => role.key === "accent-surface"), "the role goes");
  ok(!removed.tokens.some((token) => token.name.endsWith("accent-surface")), "and its color in every context");
  equal(addRole(system, "Accent surface", "").error, "A “accent-surface” role already exists.");
  equal(addRole(system, "", "").error, "Give the semantic role a name.");
});

// ── the type scale ──────────────────────────────────────────────────────

test("design type scale: add, refuse, update, remove", () => {
  const added = addStyle(base(), "  Display Héro ");
  ok(typeof added !== "string", String(added));
  const system = added as DesignSystem;
  same(system.typeScale[1], { key: "display-hero", label: "Display Héro", fontRole: "body", weight: 400, size: "16px", lineHeight: "", letterSpacing: "", textTransform: "", description: "" });
  equal(addStyle(system, "display hero"), "A style named “display hero” already exists.");
  equal(addStyle(system, " - "), "Give the style a name.");
  equal(updateStyle(system, "display-hero", { weight: 700 }).typeScale[1].weight, 700);
  equal(updateStyle(system, "nope", { weight: 700 }).typeScale.length, 2, "an unknown key changes nothing");
  equal(removeStyle(system, "display-hero").typeScale.length, 1);
  equal(styleKey("Ünïcode  Title"), "unicode-title");
});

test("design type scale: values are literals or token keys; the sample's CSS follows", () => {
  same(literalLength("93px"), { value: 93, unit: "px" });
  same(literalLength("-0.02em"), { value: -0.02, unit: "em" });
  equal(literalLength("lg"), null);
  equal(scaleValue(base(), "lg", "text-"), "1.125rem", "a key reads its token");
  equal(scaleValue(base(), "1.16", "leading-"), "1.16", "a bare number is a literal");
  equal(scaleValue(base(), "nope", "text-"), "", "a missing token is nothing");
  equal(scaleValue(base(), "", "text-"), "");
  const css = styleCss(base(), { ...base().typeScale[0], textTransform: "uppercase" }, "Georgia");
  equal(css, "font-family: Georgia; font-weight: 400; font-size: 0.875rem; line-height: 1.25; letter-spacing: 0.025em; text-transform: uppercase");
  includes(styleCss(base(), { ...base().typeScale[0], lineHeight: "" }, "x"), "line-height: 1.15", "no line height is the old default");
});

// ── families and shades ─────────────────────────────────────────────────

test("design colors: the palette groups into families with their shades in order", () => {
  const families = colorFamilies(base());
  same(families.map((family) => [family.key, family.shades.map((shade) => shade.label)]), [
    ["ink", ["Base"]],
    ["paper", ["Base"]],
    ["ocean", ["Base", "100", "900"]],
  ]);
  const ocean = families.find((family) => family.key === "ocean")!;
  equal(ocean.isRamp, true);
  equal(ocean.mainValue, "#3858e9", "a family is shown by its base");
  equal(ocean.sourceLabel, "Theme");
  same(sortShades([{ key: "soft" }, { key: "900" }, { key: "" }, { key: "50" }]).map((shade) => shade.key), ["", "50", "900", "soft"]);
  equal(mainShade([{ key: "100" }, { key: "500" }, { key: "900" }])!.key, "500");
  same(familyTokens("color-palette", "sea", [{ key: "", value: "#0af" }, { key: "100", value: "#eef" }]), [{ name: "color-palette-sea", value: "#0af" }, { name: "color-palette-sea-100", value: "#eef" }]);
});

test("design colors: a 50–950 scale from any readable color; unreadable ones refused", () => {
  const scale = generatedColorScale("#3858e9")!;
  same(scale.map((step) => step.key), ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]);
  equal(scale[5].value, "#3858e9", "the color itself is the 500");
  const lightness = scale.map((step) => (step.key === "500" ? parseColorToOklch(step.value)!.l : Number(/oklch\(([\d.]+)%/.exec(step.value)![1]) / 100));
  ok(lightness.every((value, index) => index === 0 || value <= lightness[index - 1] + 1e-9), "lighter to darker");
  ok(parseColorToOklch("rgb(56 88 233)"), "rgb()");
  ok(parseColorToOklch("hsl(229 80% 57%)"), "hsl()");
  ok(parseColorToOklch("oklch(55% 0.2 260)"), "oklch()");
  equal(parseColorToOklch("not a color", false), null);
  equal(generatedColorScale("definitely not a color"), null);
});

// ── import and export ───────────────────────────────────────────────────

test("design transfer: @theme imports tokens and fonts; export writes them back", () => {
  const css = `@import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400;1,700&display=swap");
@font-face { font-family: "Inferi"; font-weight: 100 900; font-style: italic; src: url("/media/inferi.woff2"); }
@theme { /* the brand */ --color-palette-brand: #c0392b; --font-display: "Fraunces", serif; --font-inferi: "Inferi", serif; --color-red-500: red; }`;
  const imported = themeFromCssText(css)!;
  same(imported.tokens.map((token) => token.name), ["color-palette-brand", "font-display", "font-inferi", "color-red-500"]);
  same(imported.managedColorTokens, ["color-palette-brand", "color-red-500"]);
  same(imported.fonts.map((font) => [font.token, font.provider]), [["font-display", "google"], ["font-inferi", "files"]]);
  same((imported.fonts[0] as GoogleFont).weights, [400, 700]);
  equal((imported.fonts[0] as GoogleFont).italic, true);
  same((imported.fonts[1] as FilesFont).faces, [{ weight: [100, 900], italic: true, src: "/media/inferi.woff2" }]);
  const system = applyImport(base(), imported);
  equal(tokenValue(system, "color-palette-brand"), "#c0392b");
  equal(tokenValue(system, "text-sm"), "0.875rem", "tokens the import does not name stay");
  const exported = themeToCssText(system);
  includes(exported, '@import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400;1,700&display=swap");', "fonts lead");
  includes(exported, "@font-face {", "hosted faces too");
  includes(exported, "  --color-red-500: red;", "an imported Tailwind color is the theme's");
  same(themeFromCssText(exported)!.tokens.length, system.tokens.length, "export reads back whole");
});

test("design transfer: nothing to import, and fonts nobody claims, are refused", () => {
  equal(themeFromCssText(":root { --color-a: red; }"), null, "custom properties outside @theme are not tokens");
  equal(themeFromCssText(""), null);
  equal(themeFromCssText("@theme { }"), null);
  same(fontsFromCssText('@import url("https://fonts.googleapis.com/css2?family=Lora");', () => null), [], "an unclaimed family is dropped");
  same(fontsFromCssText('@import url("https://example.com/x.css");', () => "font-x"), [], "not a Google stylesheet");
  same(fontsFromCssText("@font-face { font-family: X; }", () => "font-x"), [], "a face without a source");
  excludes(themeToCssText(setToken(base(), "color-red-500", "red")), "--color-red-500", "Tailwind's ramp the palette did not take in stays out");
});

// ── fonts and faces ─────────────────────────────────────────────────────

test("design fonts: stacks, Google URLs and hosted faces as CSS", () => {
  equal(fontStack({ family: "Inter", fallback: "sans-serif" }), "Inter, sans-serif");
  equal(fontStack({ family: "Source Serif 4", fallback: "serif" }), '"Source Serif 4", serif');
  equal(googleFontStylesheetUrl({ family: "Open Sans", weights: [700, 400, 400], italic: false }), "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap");
  equal(googleFontStylesheetUrl({ family: "Lora", weights: [400], italic: true }), "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;1,400&display=swap");
  const css = fontCss({ token: "font-a", family: "A", fallback: "serif", provider: "files", faces: [{ weight: [100, 900], italic: true, src: "/media/a.woff2" }] });
  includes(css, 'font-family: "A";');
  includes(css, "font-weight: 100 900;");
  includes(css, "font-style: italic;");
  includes(css, 'src: url("/media/a.woff2");');
  equal(fontCss({ token: "font-b", family: "B", fallback: "serif", provider: "system", weights: [400], italic: false }), "", "a device font loads nothing");
  equal(fontStylesheets({ ...base(), fonts: [{ token: "font-a", family: "A", fallback: "serif", provider: "files", faces: [{ weight: 400, italic: false, src: "/a.woff2" }] }] })[0].slice(0, 22), "data:text/css;charset=");
});

test("design fonts: put, rename, retarget roles and remove with a fallback", () => {
  equal(fontTokenName("Söhne Breit"), "font-sohne-breit");
  equal(fontTokenName("!!!"), "");
  let system = putFont(base(), "font-inter", "Inter, sans-serif", null) as DesignSystem;
  equal(putFont(system, "font-heading", "X", null), "“heading” is a font role name.", "a role name is refused");
  system = setFontRole(system, "font-body", "font-inter");
  equal(tokenValue(system, "font-body"), "var(--font-inter)");
  equal(setFontRole(system, "font-body", "font-missing"), system, "an unknown target changes nothing");
  const renamed = renameFont(system, "font-inter", "Inter Display") as DesignSystem;
  equal(tokenValue(renamed, "font-body"), "var(--font-inter-display)", "references follow a rename");
  equal(renameFont(system, "font-inter", "Serif"), "A family named “Serif” already exists.");
  equal(renameFont(system, "font-inter", "Heading"), "“Heading” is a font role name.");
  equal(renameFont(system, "font-inter", "  "), "Give the family a name.");
  equal(fontFallbackFor(renamed, "font-inter-display"), "font-sans");
  const removed = removeFont(renamed, "font-inter-display", "font-sans");
  equal(tokenValue(removed, "font-body"), "var(--font-sans)", "what used it falls back");
  equal(tokenValue(removed, "font-inter-display"), undefined);
  same(fontRoles(removed).map((role) => role.key), ["heading", "body"]);
});

test("design fonts: weights toggle within what is offered, never to none; file names read as faces", () => {
  const google: GoogleFont = { token: "font-a", family: "A", fallback: "serif", provider: "google", weights: [400], italic: false, availableWeights: [400, 700], availableItalic: false };
  same((toggleWeight(google, 700) as GoogleFont).weights, [400, 700]);
  equal(toggleWeight(google, 900), google, "a weight Google does not serve");
  equal(toggleWeight(google, 400), google, "the last weight stays");
  same(fontFactsFromFilename("Inter-SemiBoldItalic.woff2"), { family: "Inter", weight: 600, italic: true });
  same(fontFactsFromFilename("Fraunces[wght].ttf").weight, [100, 900], "a variable file");
  same(fontFactsFromFilename("plain.otf"), { family: "plain", weight: 400, italic: false });
});

// ── the removal guard ───────────────────────────────────────────────────

test("design removal: usages are found in tokens, the type scale and documents", () => {
  const library = {
    patterns: [{ name: "hero", label: "Hero", category: "Heroes", html: '<div class="bg-surface md:text-lg"><p class="text-brand-foreground">x</p></div>' }],
    templates: [],
    parts: [],
    savePattern: () => null,
  };
  const sources = usageSources(base(), library);
  same(findUsages({ kind: "token", key: "color-palette-paper" }, sources), [{ id: "theme", label: "Other theme settings", count: 1, rewritable: true }], "a palette color behind a role");
  same(findUsages({ kind: "token", key: "text-sm" }, sources).map((hit) => hit.id), ["type-scale"], "a size the type scale names");
  same(findUsages({ kind: "token", key: "text-lg" }, sources), [{ id: "pattern:hero", label: "Pattern · Hero", count: 1, rewritable: true }], "a utility in a pattern, behind a variant");
  same(findUsages({ kind: "semanticRole", key: "surface", contexts: ["default"] }, sources).map((hit) => hit.id), ["pattern:hero"]);
  same(findUsages({ kind: "colorContext", key: "brand" }, sources).map((hit) => hit.id), ["pattern:hero"]);
  same(findUsages({ kind: "token", key: "radius-none" }, sources), [], "nothing uses it");
  equal(findAllUsages([{ kind: "token", key: "text-sm" }, { kind: "token", key: "leading-tight" }], sources)[0].count, 2, "hits merge per source");
});

test("design removal: switching moves every usage onto the replacement", () => {
  equal(rewriteHtml({ kind: "token", key: "text-lg" }, "text-sm", '<p class="md:text-lg x">'), '<p class="md:text-sm x">');
  equal(rewriteHtml({ kind: "colorContext", key: "brand" }, "default", '<p class="bg-brand-surface">'), '<p class="bg-surface">');
  equal(rewriteHtml({ kind: "colorContext", key: "brand" }, "night", '{"colorContext":"brand"}'), '{"colorContext":"night"}');
  equal(rewriteHtml({ kind: "semanticRole", key: "surface" }, "muted-surface", '<p class="bg-surface">'), '<p class="bg-muted-surface">');
  equal(rewriteHtml({ kind: "breakpoint", key: "md" }, "base", '<p class="md:p-4 lg:p-8">'), '<p class="p-4 lg:p-8">');
  same(rewriteTokens({ kind: "token", key: "color-palette-paper" }, "color-palette-ink", base().tokens).find((token) => token.name === "color-surface"), { name: "color-surface", value: "var(--color-palette-ink)" });
  same(rewriteTypeScale({ kind: "token", key: "text-sm" }, "text-lg", base().typeScale)[0].size, "lg");
  same(rewriteTypeScale({ kind: "token", key: "text-sm" }, "leading-tight", base().typeScale)[0].size, "sm", "a replacement of another namespace changes nothing");
  const moved = retarget(base(), [{ kind: "token", key: "font-serif" }], "font-sans");
  equal(tokenValue(moved, "font-heading"), "var(--font-sans)");
  equal(new Set(moved.tokens.map((token) => token.name)).size, moved.tokens.length, "no token twice");
});

// ── icons ───────────────────────────────────────────────────────────────

test("design icons: SVG is cleaned; names and labels; invalid icons refused", () => {
  const clean = sanitizeSvgIcon('<svg width="20" height="10" onload="x()" class="a"><script>x()</script><a href="javascript:x()"><path d="M0 0"/></a></svg>')!;
  excludes(clean, "script");
  excludes(clean, "onload");
  excludes(clean, "javascript:");
  includes(clean, 'viewBox="0 0 20 10"', "the size becomes a viewBox");
  excludes(clean, 'width="20"');
  equal(sanitizeSvgIcon("<div>not svg</div>"), null);
  equal(sanitizeSvgIcon("<svg><path></svg"), null, "broken markup");
  equal(iconNameFrom("Arrow Right.SVG"), "arrow-right");
  equal(iconLabel("arrow-right"), "Arrow right");
  const added = addIcons(base(), [{ name: "Star", svg: '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>' }]);
  equal(added.error, "");
  equal(added.system.icons[0].name, "star");
  equal(added.system.icons[0].category, "Custom");
  ok(addIcons(base(), [{ name: "", svg: "<svg/>" }]).error, "a nameless icon");
  ok(addIcons(base(), [{ name: "x", svg: "<p/>" }]).error, "not an SVG");
});

test("design starter: every role has a token in Default and the scale fonts exist", () => {
  const system = starterSystem();
  for (const role of system.roles) ok(tokenValue(system, roleToken("default", role.key)), `the ${role.key} token`);
  same(fontRoles(system).map((role) => role.key), ["heading", "body", "code"]);
  ok(system.tokens.some((token) => token.name === "text-base"), "the jit's scales");
  ok(!system.tokens.some((token) => token.name === "color-red-500"), "no Tailwind ramps");
  equal(systemFromAppTokens([]).tokens.length, system.tokens.length);
});

test("an app's own colors join the palette when it opens the builder for the first time", () => {
  const system = systemFromAppTokens([
    { name: "color-brand", value: "#2f5d54" },
    { name: "color-ink", value: "#111111" },
    { name: "color-accent-surface", value: "#ff0000" },
    { name: "color-linked", value: "var(--color-palette-ink)" },
    { name: "radius-lg", value: "1rem" },
  ]);
  const value = (name: string) => system.tokens.find((token) => token.name === name)?.value;
  equal(value("color-palette-brand"), "#2f5d54", "replaces the starter's brand");
  equal(value("color-brand"), "var(--color-palette-brand)", "the utility names the palette entry");
  equal(value("color-palette-ink"), "#111111");
  equal(value("color-accent-surface"), "#ff0000", "a role keeps its value");
  equal(value("color-linked"), "var(--color-palette-ink)", "a reference stays one");
  equal(value("color-palette-linked"), undefined);
  equal(value("radius-lg"), "1rem", "other tokens as they are");
});
