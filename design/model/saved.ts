// The design system as Publr keeps it, and back. The tokens and the fonts pages load go
// into the app's `app.zon` (`.tokens`, `.fonts`); the structure over them into its
// `design/system.zon` (`design.save_system`, read back by `design.system`).
import { completeSystem, googleFontStylesheetUrl, SEMANTIC_COLOR_ROLES, systemFromAppTokens, tokenValue } from "./system";
import type { DesignSystem, FontDefinition, Token, TypeScaleEntry } from "./system";

/** A font as `app.zon` holds it: a stylesheet, or the files the site hosts. */
export type SavedFont = {
  family: string;
  url: string;
  faces?: { weight_min: number; weight_max: number; italic: boolean; src: string }[];
};

type SavedDefinition = {
  token: string;
  family: string;
  fallback: string;
  provider: string;
  weights?: number[];
  italic?: boolean;
  available_weights?: number[];
  available_italic?: boolean;
  faces?: { weight_min: number; weight_max: number; italic?: boolean; src: string }[];
};

type SavedStyle = {
  key: string;
  label: string;
  font_role: string;
  weight: number;
  size: string;
  line_height?: string;
  letter_spacing?: string;
  text_transform?: string;
  description?: string;
};

/** `design/system.zon`, as `design.system` answers and `design.save_system` takes it. */
export type SavedStructure = {
  roles: { key: string; label: string; description: string }[];
  contexts: { key: string; label: string }[];
  fonts: SavedDefinition[];
  type_scale: SavedStyle[];
  icons: { name: string; label: string; category: string; svg: string }[];
  managed_color_tokens: string[];
  block_defaults: { block: string; html: string }[];
};

/** What `design.system` answers. */
export type SavedSystem = { tokens: Token[]; fonts: SavedFont[]; system: SavedStructure | null; saved: boolean };

function definitionFrom(saved: SavedDefinition): FontDefinition {
  const base = { token: saved.token, family: saved.family, fallback: saved.fallback as FontDefinition["fallback"] };
  if (saved.provider === "files") {
    return { ...base, provider: "files", faces: (saved.faces ?? []).map((face) => ({ weight: face.weight_min === face.weight_max ? face.weight_min : [face.weight_min, face.weight_max], italic: !!face.italic, src: face.src })) };
  }
  if (saved.provider === "google") {
    return { ...base, provider: "google", weights: saved.weights ?? [400], italic: !!saved.italic, availableWeights: saved.available_weights ?? saved.weights ?? [400], availableItalic: !!saved.available_italic };
  }
  return { ...base, provider: "system", weights: saved.weights ?? [400], italic: !!saved.italic };
}

function definitionTo(font: FontDefinition): SavedDefinition {
  const base = { token: font.token, family: font.family, fallback: font.fallback, provider: font.provider };
  if (font.provider === "files") {
    return { ...base, faces: font.faces.map((face) => ({ weight_min: Array.isArray(face.weight) ? face.weight[0] : face.weight, weight_max: Array.isArray(face.weight) ? face.weight[1] : face.weight, italic: face.italic, src: face.src })) };
  }
  if (font.provider === "google") {
    return { ...base, weights: font.weights, italic: font.italic, available_weights: font.availableWeights, available_italic: font.availableItalic };
  }
  return { ...base, weights: font.weights, italic: font.italic };
}

const styleFrom = (saved: SavedStyle): TypeScaleEntry => ({
  key: saved.key,
  label: saved.label,
  fontRole: saved.font_role,
  weight: saved.weight,
  size: saved.size,
  lineHeight: saved.line_height ?? "",
  letterSpacing: saved.letter_spacing ?? "",
  textTransform: (saved.text_transform ?? "") as TypeScaleEntry["textTransform"],
  description: saved.description ?? "",
});

const styleTo = (entry: TypeScaleEntry): SavedStyle => ({
  key: entry.key,
  label: entry.label,
  font_role: entry.fontRole,
  weight: entry.weight,
  size: entry.size,
  line_height: entry.lineHeight,
  letter_spacing: entry.letterSpacing,
  text_transform: entry.textTransform,
  description: entry.description,
});

/** The document the builder opens on: the saved one, or, for an app that never saved
 * one, the starter with the app's own tokens laid over it. */
export function fromSaved(saved: SavedSystem): DesignSystem {
  if (!saved.system) return systemFromAppTokens(saved.tokens);
  const structure = saved.system;
  const tokens = saved.tokens.map((token) => ({ ...token }));
  const document = { tokens } as DesignSystem;
  return completeSystem({
    tokens,
    fonts: structure.fonts.map(definitionFrom),
    roles: structure.roles.map((role) => ({ ...role, value: tokenValue(document, `color-${role.key}`) ?? SEMANTIC_COLOR_ROLES.find((starter) => starter.key === role.key)?.value ?? "#000000" })),
    contexts: structure.contexts,
    typeScale: structure.type_scale.map(styleFrom),
    icons: structure.icons,
    managedColorTokens: structure.managed_color_tokens,
    blockDefaults: Object.fromEntries(structure.block_defaults.map((entry) => [entry.block, entry.html])),
  });
}

/** The fonts pages load, as `app.zon` holds them. */
export function savedFonts(system: DesignSystem): SavedFont[] {
  return system.fonts.flatMap((font): SavedFont[] => {
    if (font.provider === "google") return [{ family: font.family, url: googleFontStylesheetUrl(font) }];
    if (font.provider === "files" && font.faces.length) return [{ family: font.family, url: "", faces: definitionTo(font).faces!.map((face) => ({ ...face, italic: !!face.italic })) }];
    return [];
  });
}

/** What `design.save_system` takes for an app. */
export function toSaved(system: DesignSystem): { tokens: Token[]; fonts: SavedFont[]; system: SavedStructure } {
  return {
    tokens: system.tokens.map((token) => ({ name: token.name, value: token.value })),
    fonts: savedFonts(system),
    system: {
      roles: system.roles.map((role) => ({ key: role.key, label: role.label, description: role.description })),
      contexts: system.contexts.map((context) => ({ key: context.key, label: context.label })),
      fonts: system.fonts.map(definitionTo),
      type_scale: system.typeScale.map(styleTo),
      icons: system.icons.map((icon) => ({ name: icon.name, label: icon.label, category: icon.category, svg: icon.svg })),
      managed_color_tokens: [...system.managedColorTokens],
      block_defaults: Object.entries(system.blockDefaults).map(([block, html]) => ({ block, html })),
    },
  };
}
