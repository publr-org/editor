// The icons library: categories with counts, the filtered grid, the add panel and the
// icon being edited.
import { Publr } from "publr-jsx";
import { iconImage } from "../model/icons";
import type { DesignSystem } from "../model/system";
import type { BuilderProps, State } from "../state";

export type IconRow = { name: string; label: string; category: string; svg: string; image: string };
export type IconCategoryRow = { key: string; label: string; count: number; active: boolean };

export const initial = () => ({
  iconQuery: "",
  iconCategory: "",
  iconCategories: [] as IconCategoryRow[],
  iconRows: [] as IconRow[],
  iconTotal: 0,
  iconAddOpen: false,
  iconError: "",
  /** The paste form's fields. */
  iconPasteName: "",
  iconPasteSvg: "",
  /** The icon open in the editor ("" none), its draft name and markup, its preview. */
  iconEditing: "",
  iconEditName: "",
  iconEditSvg: "",
  iconEditImage: "",
  iconEditError: "",
  iconEmpty: "",
});

export function view(system: DesignSystem, state: State, _props: BuilderProps): Partial<State> {
  const query = state.iconQuery.trim().toLowerCase();
  const category = state.iconCategory;
  const counts = new Map<string, number>();
  for (const icon of system.icons) counts.set(icon.category, (counts.get(icon.category) ?? 0) + 1);
  const rows = system.icons
    .filter((icon) => !category || icon.category === category)
    .filter((icon) => !query || icon.name.includes(query) || icon.label.toLowerCase().includes(query) || icon.category.toLowerCase().includes(query))
    .map((icon) => ({ ...icon, image: iconImage(icon.svg) }));
  const editing = system.icons.some((icon) => icon.name === state.iconEditing);
  return {
    iconTotal: system.icons.length,
    iconCategories: [{ key: "", label: Publr.t("View all"), count: system.icons.length, active: category === "" }, ...[...counts].map(([key, count]) => ({ key, label: key, count, active: category === key }))],
    iconRows: rows,
    iconEmpty: system.icons.length ? Publr.t("No icons match that search.") : Publr.t("No icons yet — add some."),
    ...(editing ? {} : { iconEditing: "" }),
  };
}
