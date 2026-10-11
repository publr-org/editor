// What the token library does: edit, add and remove scale values; open, edit, save and
// delete a color family; import and export the portable `@theme` document.
import { Publr } from "publr-jsx";
import { builder } from "../Builder.ptsx";
import { familyTokens, generatedColorScale, mainShade, sortShades } from "../model/colors";
import { setToken } from "../model/system";
import { applyImport, themeFromCssText } from "../model/transfer";
import { retarget } from "../model/usage";
import type { PrimitiveRef } from "../model/usage";
import { requestRemoval } from "../removal/actions";
import type { ShadeDraft } from "./view";

const NAME_FIELD = "[data-design-color-family-name] input";

// ── scale values ────────────────────────────────────────────────────────

export function updateToken(name: string, raw: string): void {
  const b = builder();
  const value = raw.trim();
  if (!name || !value) return;
  b.change(setToken(b.system(), name, value));
}

export function removeToken(name: string): void {
  const b = builder();
  const namespace = name.slice(0, name.lastIndexOf("-") + 1);
  const system = b.system();
  requestRemoval({
    title: Publr.t("Remove {name}?", { name }),
    tokens: [name],
    // Siblings in the same namespace (text-lg for text-sm) can take over.
    alternatives: system.tokens.filter((token) => token.name !== name && token.name.startsWith(namespace) && !token.name.includes("--")).map((token) => ({ key: token.name, label: token.name })),
    // A token's `--` modifiers (text-lg--line-height) leave with it.
    apply: (next) => ({ ...next, tokens: next.tokens.filter((token) => token.name !== name && !token.name.startsWith(`${name}--`)) }),
  });
}

export function setDraft(ns: string, field: "name" | "value", value: string): void {
  const b = builder();
  const current = b.state.tokenDrafts[ns] ?? { name: "", value: "" };
  b.state.tokenDrafts = { ...b.state.tokenDrafts, [ns]: { ...current, [field]: value } };
}

export function addToken(ns: string): void {
  const b = builder();
  const draft = b.state.tokenDrafts[ns];
  const key = draft?.name.trim();
  const value = draft?.value.trim();
  if (!key || !value) return;
  b.state.tokenDrafts = { ...b.state.tokenDrafts, [ns]: { name: "", value: "" } };
  b.change(setToken(b.system(), `${ns}-${key}`, value));
}

// ── the color family editor ─────────────────────────────────────────────

function syncMain(shades: readonly ShadeDraft[]): string {
  return mainShade(shades)?.value || "#000000";
}

function focusName(): void {
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>(NAME_FIELD)?.focus({ preventScroll: true }));
}

export function openFamily(id: string): void {
  const b = builder();
  const family = b.state.familyRows.find((row) => row.id === id);
  if (!family) return;
  const namespace = id.startsWith("color-palette:") ? "color-palette" : "color";
  const key = id.slice(id.indexOf(":") + 1);
  const shades = family.swatches.map((swatch, index) => {
    const shadeKey = swatch.label === "Base" ? "" : swatch.label;
    return { index, originalName: `${namespace}-${key}${shadeKey ? `-${shadeKey}` : ""}`, key: shadeKey, value: swatch.value };
  });
  Object.assign(b.state, {
    familyId: id,
    familyNamespace: namespace,
    familyName: key,
    familyOriginalNames: shades.map((shade) => shade.originalName),
    familyShades: shades,
    familyMainValue: syncMain(shades),
    familyError: "",
    familyOpen: true,
    modal: true,
  });
  focusName();
}

export function newFamily(): void {
  const b = builder();
  const shades = [{ index: 0, originalName: "", key: "", value: "#3858e9" }];
  Object.assign(b.state, {
    familyId: "",
    familyNamespace: "color-palette",
    familyName: "",
    familyOriginalNames: [],
    familyShades: shades,
    familyMainValue: syncMain(shades),
    familyError: "",
    familyOpen: true,
    modal: true,
  });
  focusName();
}

export function closeFamily(): void {
  const b = builder();
  b.state.familyOpen = false;
  b.state.familyError = "";
  b.state.modal = false;
}

export function setFamilyName(value: string): void {
  const b = builder();
  b.state.familyName = value.trim();
  b.state.familyError = "";
}

export function updateShade(index: number, field: "key" | "value", raw: string): void {
  const b = builder();
  const value = raw.trim();
  const shades = b.state.familyShades.map((shade) => (shade.index === index ? { ...shade, [field]: value } : shade));
  b.state.familyShades = shades;
  b.state.familyMainValue = syncMain(shades);
  b.state.familyError = "";
}

export function addShade(): void {
  const b = builder();
  const numeric = b.state.familyShades.map((shade) => Number(shade.key)).filter((value) => Number.isFinite(value) && value > 0);
  const suggested = numeric.length ? String(Math.max(...numeric) + 100) : "100";
  const index = Math.max(-1, ...b.state.familyShades.map((shade) => shade.index)) + 1;
  b.state.familyShades = [...b.state.familyShades, { index, originalName: "", key: suggested, value: b.state.familyMainValue }];
}

export function generateScale(): void {
  const b = builder();
  const shades = b.state.familyShades;
  const source = mainShade(shades);
  if (!source) {
    b.state.familyError = Publr.t("Add a base color before generating a scale.");
    return;
  }
  const generated = generatedColorScale(source.value);
  if (!generated) {
    b.state.familyError = Publr.t("The base color could not be read. Use a hex, RGB, HSL, or OKLCH color value.");
    return;
  }
  const existing = new Map(shades.map((shade) => [shade.key, shade]));
  const named = shades.filter((shade) => !shade.key || !/^\d+$/.test(shade.key));
  const next = sortShades([...named, ...generated.map((shade) => ({ index: 0, originalName: existing.get(shade.key)?.originalName ?? "", ...shade }))]).map((shade, index) => ({ ...shade, index }));
  b.state.familyShades = next;
  b.state.familyMainValue = syncMain(next);
  b.state.familyError = "";
}

export function removeShade(index: number): void {
  const b = builder();
  if (b.state.familyShades.length === 1) {
    b.state.familyError = Publr.t("A color family needs at least one value.");
    return;
  }
  const shades = b.state.familyShades.filter((shade) => shade.index !== index);
  b.state.familyShades = shades;
  b.state.familyMainValue = syncMain(shades);
}

/** Why the family cannot be saved as it is, or "". */
function familyProblem(name: string, shades: readonly ShadeDraft[]): string {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return Publr.t("Use a lowercase color name beginning with a letter, such as ocean or ocean-blue.");
  if (!shades.length) return Publr.t("Add at least one color value.");
  const keys = new Set<string>();
  for (const shade of shades) {
    if (shade.key && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shade.key)) return `“${shade.key}” is not a valid shade name.`;
    if (keys.has(shade.key)) return shade.key ? Publr.t("Shade {shade} is defined more than once.", { shade: shade.key }) : Publr.t("The base color is defined more than once.");
    if (!shade.value) return Publr.t("Every shade needs a color value.");
    keys.add(shade.key);
  }
  return "";
}

export function saveFamily(): void {
  const b = builder();
  const name = b.state.familyName.trim();
  const shades = b.state.familyShades;
  const namespace = b.state.familyNamespace;
  const problem = familyProblem(name, shades);
  if (problem) {
    b.state.familyError = problem;
    return;
  }
  const originals = new Set(b.state.familyOriginalNames);
  const additions = familyTokens(namespace, name, shades);
  const outside = new Set(b.system().tokens.filter((token) => !originals.has(token.name)).map((token) => token.name));
  const conflict = additions.find((token) => outside.has(token.name));
  if (conflict) {
    b.state.familyError = `A token named --${conflict.name} already exists.`;
    return;
  }
  const save = (system: ReturnType<typeof b.system>) => {
    const managed = new Set(system.managedColorTokens.filter((token) => !originals.has(token)));
    if (namespace === "color") for (const token of additions) managed.add(token.name);
    const kept = system.tokens.filter((token) => !originals.has(token.name));
    return { ...system, tokens: [...kept, ...additions], managedColorTokens: [...managed] };
  };
  // A pure rename (the same shades under a new name) carries every usage over; anything
  // else that disappears and is still in use goes through the removal guard.
  const added = new Set(additions.map((token) => token.name));
  const dropped = [...originals].filter((original) => !added.has(original));
  const shadeOf = (token: string) => token.split("-").slice(namespace.split("-").length + 1).join("-");
  const renames = new Map<string, string>();
  for (const original of dropped) {
    const match = additions.find((token) => !originals.has(token.name) && shadeOf(token.name) === shadeOf(original));
    if (match) renames.set(original, match.name);
  }
  let system = b.system();
  for (const [from, to] of renames) system = retarget(system, [{ kind: "token", key: from }], to);
  const stillDropped = dropped.filter((original) => !renames.has(original));
  if (!stillDropped.length) {
    b.change(save(system));
    closeFamily();
    return;
  }
  requestRemoval({
    base: system,
    done: () => closeFamily(),
    title: stillDropped.length === 1 ? Publr.t("Remove {name}?", { name: stillDropped[0] }) : Publr.tn("Remove {count} colour from the {name} family?", "Remove {count} colours from the {name} family?", stillDropped.length, { name }),
    tokens: stillDropped,
    alternatives: [...system.tokens.filter((token) => token.name.startsWith(`${namespace}-`) && !originals.has(token.name) && !token.name.includes("--")), ...additions.filter((token) => !originals.has(token.name))]
      .filter((token, index, all) => all.findIndex((candidate) => candidate.name === token.name) === index)
      .map((token) => ({ key: token.name, label: token.name })),
    apply: (next) => save(next),
  });
}

export function deleteFamily(): void {
  const b = builder();
  const originals = new Set(b.state.familyOriginalNames);
  const names = [...originals];
  const label = b.state.familyName || "color";
  requestRemoval({
    done: () => closeFamily(),
    title: Publr.t("Remove the {name} family?", { name: label }),
    tokens: names,
    // Only other palette colors can stand in: a semantic role would be circular.
    alternatives: b.system().tokens.filter((token) => token.name.startsWith("color-palette-") && !originals.has(token.name) && !token.name.includes("--")).map((token) => ({ key: token.name, label: token.name.slice("color-palette-".length) })),
    apply: (next) => ({ ...next, tokens: next.tokens.filter((token) => !originals.has(token.name)), managedColorTokens: next.managedColorTokens.filter((token) => !originals.has(token)) }),
  });
}

// ── import / export ─────────────────────────────────────────────────────

export function setImportText(value: string): void {
  const b = builder();
  b.state.importText = value;
}

export function importTheme(): void {
  const b = builder();
  const parsed = themeFromCssText(b.state.importText);
  if (!parsed) {
    b.state.importStatus = "";
    b.state.importError = Publr.t("No valid tokens found. Paste CSS containing an @theme { --token: value; } block.");
    return;
  }
  b.state.importError = "";
  b.change(applyImport(b.system(), parsed));
  b.state.importStatus = Publr.tn("{count} token imported. Matching values were updated; semantic mappings and patterns were preserved.", "{count} tokens imported. Matching values were updated; semantic mappings and patterns were preserved.", parsed.tokens.length);
  b.state.importText = "";
}

export type { PrimitiveRef };
