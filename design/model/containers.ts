// Containers: named page widths blocks refer to by key. `publr-containers` is the ordered
// key list; per key `container-<key>` is the max width, `container-<key>-padding` the
// horizontal gutter (`-padding-<breakpoint>` overrides it mobile first),
// `publr-container-<key>-label` the label, and `container-<key>-<css property>` (and its
// `-<breakpoint>` overrides) the optional box styles.
import { CONTAINER_LIST_TOKEN, CONTAINER_PADDING_DEFAULT, DEFAULT_CONTAINER_TOKENS, cssLengthPx, setToken, titleCase, tokenValue } from "./system";
import type { DesignSystem, Token } from "./system";

export const CONTAINER_STYLE_PROPS = {
  paddingTop: "padding-top",
  paddingBottom: "padding-bottom",
  marginTop: "margin-top",
  marginBottom: "margin-bottom",
  borderWidth: "border-width",
  borderColor: "border-color",
  borderRadius: "border-radius",
  borderStyle: "border-style",
} as const;
export type ContainerStyleProp = keyof typeof CONTAINER_STYLE_PROPS;
/** What the box model edits: the gutter (`padding`) or one of the box styles. */
export type ContainerProp = "padding" | ContainerStyleProp;

export type Container = {
  key: string;
  label: string;
  maxWidth: string;
  padding: Record<string, string>;
  styles: Partial<Record<ContainerStyleProp, Record<string, string>>>;
};

export const CONTAINER_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isContainerKey = (key: string) => CONTAINER_KEY_PATTERN.test(key) && !key.endsWith("-padding") && key !== "padding";

export const containerLabelToken = (key: string) => `publr-container-${key}-label`;

/** The token one container prop takes at a breakpoint. */
export function containerToken(key: string, prop: ContainerProp, breakpoint = "base"): string {
  const base = prop === "padding" ? `container-${key}-padding` : `container-${key}-${CONTAINER_STYLE_PROPS[prop]}`;
  return breakpoint === "base" ? base : `${base}-${breakpoint}`;
}

function tokenPart(name: string, key: string): { prop: ContainerProp; breakpoint: string } | null {
  const prefix = `container-${key}-`;
  if (!name.startsWith(prefix)) return null;
  const rest = name.slice(prefix.length);
  const suffixes: [string, ContainerProp][] = [...(Object.entries(CONTAINER_STYLE_PROPS) as [ContainerStyleProp, string][]).map(([prop, css]) => [css, prop] as [string, ContainerProp]), ["padding", "padding"]];
  for (const [suffix, prop] of suffixes) {
    if (rest === suffix) return { prop, breakpoint: "base" };
    if (rest.startsWith(`${suffix}-`)) {
      const breakpoint = rest.slice(suffix.length + 1);
      if (/^[a-z0-9]+$/.test(breakpoint)) return { prop, breakpoint };
    }
  }
  return null;
}

/** Every token belonging to one container, never the list token itself. */
export const isContainerToken = (name: string, key: string) => name === `container-${key}` || name === containerLabelToken(key) || tokenPart(name, key) !== null;

export function containerKeys(system: DesignSystem): string[] {
  return (tokenValue(system, CONTAINER_LIST_TOKEN) ?? "").split(/\s+/).filter(isContainerKey);
}

/** The ordered containers; a theme that declares none resolves to the starter's two. */
export function containers(system: DesignSystem): Container[] {
  const keys = containerKeys(system);
  const source: DesignSystem = keys.length ? system : { ...system, tokens: DEFAULT_CONTAINER_TOKENS.map((token) => ({ ...token })) };
  return containerKeys(source).map((key) => {
    const padding: Record<string, string> = { base: tokenValue(source, containerToken(key, "padding")) ?? CONTAINER_PADDING_DEFAULT };
    const styles: Container["styles"] = {};
    for (const token of source.tokens) {
      const part = tokenPart(token.name, key);
      if (!part) continue;
      if (part.prop === "padding") {
        if (part.breakpoint !== "base") padding[part.breakpoint] = token.value;
      } else (styles[part.prop] ??= {})[part.breakpoint] = token.value;
    }
    return { key, label: tokenValue(source, containerLabelToken(key)) ?? titleCase(key), maxWidth: tokenValue(source, `container-${key}`) ?? "960px", padding, styles };
  });
}

/** The list token written out, so an edit to a theme on the starter list keeps it. */
function declared(system: DesignSystem): DesignSystem {
  if (containerKeys(system).length) return system;
  let next = system;
  for (const token of DEFAULT_CONTAINER_TOKENS) if (!tokenValue(next, token.name)) next = setToken(next, token.name, token.value);
  return next;
}

/** A container's own tokens stay together: a new one goes after its last. */
function insertAfterContainer(tokens: Token[], key: string, token: Token): Token[] {
  const rest = tokens.filter((candidate) => candidate.name !== token.name);
  let at = -1;
  rest.forEach((candidate, index) => {
    if (isContainerToken(candidate.name, key)) at = index;
  });
  return at < 0 ? [...rest, token] : [...rest.slice(0, at + 1), token, ...rest.slice(at + 1)];
}

export function nextContainerKey(system: DesignSystem): string {
  const taken = new Set(containers(system).map((container) => container.key));
  let count = 1;
  while (taken.has(count === 1 ? "custom" : `custom-${count}`)) count += 1;
  return count === 1 ? "custom" : `custom-${count}`;
}

/** A new container ("Container 3 · max 960px"), appended to the list. */
export function addContainer(system: DesignSystem): { system: DesignSystem; key: string } {
  const next = declared(system);
  const key = nextContainerKey(next);
  const count = containers(next).length + 1;
  const keys = [...containerKeys(next), key];
  let result = setToken(next, CONTAINER_LIST_TOKEN, keys.join(" "));
  result = setToken(result, `container-${key}`, "960px");
  result = setToken(result, containerToken(key, "padding"), CONTAINER_PADDING_DEFAULT);
  result = setToken(result, containerLabelToken(key), `Container ${count}`);
  return { system: result, key };
}

export function removeContainer(system: DesignSystem, key: string): DesignSystem {
  const next = declared(system);
  const remaining = containerKeys(next).filter((candidate) => candidate !== key);
  if (!remaining.length) return system;
  return setToken({ ...next, tokens: next.tokens.filter((token) => !isContainerToken(token.name, key)) }, CONTAINER_LIST_TOKEN, remaining.join(" "));
}

export function renameContainer(system: DesignSystem, key: string, label: string): DesignSystem {
  const next = declared(system);
  const name = containerLabelToken(key);
  const trimmed = label.trim();
  if (!trimmed) return { ...next, tokens: next.tokens.filter((token) => token.name !== name) };
  return { ...next, tokens: insertAfterContainer(next.tokens, key, { name, value: trimmed }) };
}

/** A container's max width, a positive CSS length (a bare number is px); null when not. */
export function containerWidth(raw: string): string | null {
  const trimmed = raw.trim();
  const value = /^\d+(?:\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed;
  const px = cssLengthPx(value);
  return value && px != null && px > 0 ? value : null;
}

export function setContainerWidth(system: DesignSystem, key: string, width: string): DesignSystem {
  return setToken(declared(system), `container-${key}`, width);
}

/** Set (or with an empty value, clear) one box prop of a container at a breakpoint. */
export function setContainerProp(system: DesignSystem, key: string, prop: ContainerProp, breakpoint: string, raw: string): DesignSystem {
  const next = declared(system);
  const name = containerToken(key, prop, breakpoint);
  const trimmed = raw.trim();
  const value = /^-?\d+(?:\.\d+)?$/.test(trimmed) && prop !== "borderColor" && prop !== "borderStyle" ? `${trimmed}px` : trimmed;
  if (!value) return prop === "padding" && breakpoint === "base" ? next : { ...next, tokens: next.tokens.filter((token) => token.name !== name) };
  return { ...next, tokens: insertAfterContainer(next.tokens, key, { name, value }) };
}

/** A prop's value at a breakpoint, the nearest smaller breakpoint's when it sets none. */
export function containerValue(container: Container, prop: ContainerProp, breakpoints: readonly string[], breakpoint: string): { value: string; own: boolean } {
  const values = prop === "padding" ? container.padding : (container.styles[prop] ?? {});
  const upto = breakpoints.slice(0, Math.max(0, breakpoints.indexOf(breakpoint)) + 1).reverse();
  for (const candidate of upto) if (values[candidate] !== undefined) return { value: values[candidate], own: candidate === breakpoint };
  return { value: "", own: false };
}
