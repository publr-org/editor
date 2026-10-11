// The removal guard's dialog: what still uses the thing, and what could take its place.
import type { DesignSystem } from "../model/system";
import type { BuilderProps, State } from "../state";

export type RemovalHit = { id: string; label: string; count: number; note: string };

export const initial = () => ({
  removeOpen: false,
  removeTitle: "",
  removeHits: [] as RemovalHit[],
  removeAlternatives: [] as { key: string; label: string }[],
  removeReplacement: "",
  removeCanSwitch: false,
  removeBlocked: "",
});

export function view(_system: DesignSystem, _state: State, _props: BuilderProps): Partial<State> {
  return {};
}
