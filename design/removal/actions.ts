// The removal guard: something still in use is never dropped silently. A removal with
// no usages happens at once; otherwise the dialog lists where it is used and offers to
// switch every usage to another value first. A usage the builder cannot rewrite (a
// pattern kept in the app's files) blocks the removal until it is changed there.
import { Publr } from "publr-jsx";
import { builder } from "../Builder.ptsx";
import type { DesignSystem } from "../model/system";
import { findAllUsages, retarget, retargetLibrary, usageSources } from "../model/usage";
import type { PrimitiveRef } from "../model/usage";
import type { State } from "../state";

export type RemovalRequest = {
  /** "Remove the navy family?" */
  title: string;
  /** What is being removed, as token names (each a `token` primitive). */
  tokens?: string[];
  /** What is being removed, as primitives of any kind (contexts, roles, breakpoints). */
  refs?: PrimitiveRef[];
  /** What may take its place: `{ key, label }`, the key written in every usage. */
  alternatives: { key: string; label: string }[];
  /** The removal itself, on the system with every usage already moved to `replacement`
   * ("" when nothing used it). */
  apply: (system: DesignSystem, replacement: string) => DesignSystem;
  /** The system to start from, when it is not the working copy (an edit not yet kept). */
  base?: DesignSystem;
  /** After the removal is applied (a dialog that waited for it closes). */
  done?: () => void;
};

type Pending = { refs: PrimitiveRef[]; request: RemovalRequest };

const pending = new WeakMap<object, Pending>();

const refsOf = (request: RemovalRequest): PrimitiveRef[] => [...(request.refs ?? []), ...(request.tokens ?? []).map((key) => ({ kind: "token" as const, key }))];

function close(state: State): void {
  pending.delete(state);
  state.removeOpen = false;
  state.modal = false;
}

/** Removes at once when nothing uses it, or asks first. */
export function requestRemoval(request: RemovalRequest): void {
  const b = builder();
  const system = request.base ?? b.system();
  const refs = refsOf(request);
  const hits = findAllUsages(refs, usageSources(system, b.props.library));
  if (!hits.length) {
    b.change(request.apply(system, ""));
    request.done?.();
    return;
  }
  pending.set(b.state, { refs, request: { ...request, base: system } });
  const readOnly = hits.filter((hit) => !hit.rewritable);
  const alternatives = request.alternatives;
  Object.assign(b.state, {
    removeTitle: request.title,
    removeHits: hits.map((hit) => ({ id: hit.id, label: hit.label, count: hit.count, note: hit.rewritable ? "" : Publr.t("read-only") })),
    removeAlternatives: alternatives,
    removeReplacement: alternatives[0]?.key ?? "",
    removeCanSwitch: !readOnly.length && alternatives.length > 0,
    removeBlocked: readOnly.length
      ? Publr.tn("{names} is managed outside the theme. Remove the usage there first.", "{names} are managed outside the theme. Remove the usage there first.", readOnly.length, { names: readOnly.map((hit) => hit.label).join(", ") })
      : alternatives.length
        ? ""
        : Publr.t("Nothing else can take its place. Remove the usages first."),
    removeOpen: true,
    modal: true,
  });
}

export function setReplacement(key: string): void {
  builder().state.removeReplacement = key;
}

export function cancelRemoval(): void {
  close(builder().state);
}

/** Every usage moved onto the chosen replacement, then the removal. The library's
 * documents are kept through the host as they are rewritten. */
export async function confirmRemoval(): Promise<void> {
  const b = builder();
  const waiting = pending.get(b.state);
  const replacement = b.state.removeReplacement;
  if (!waiting || !replacement || !b.state.removeCanSwitch) return;
  close(b.state);
  const moved = retarget(waiting.request.base ?? b.system(), waiting.refs, replacement);
  b.change(waiting.request.apply(moved, replacement));
  waiting.request.done?.();
  const problem = await retargetLibrary(b.props.library, waiting.refs, replacement);
  b.state.problem = problem ?? "";
  b.refresh();
}
