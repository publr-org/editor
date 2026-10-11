// What the icons library does: search, filter, add (paste or upload), edit and remove.
import { builder } from "../Builder.ptsx";
import { addIcons, iconImage, removeIcon, saveIcon } from "../model/icons";

export function searchIcons(query: string): void {
  const b = builder();
  b.state.iconQuery = query;
  b.refresh();
}

export function selectIconCategory(category: string): void {
  const b = builder();
  b.state.iconCategory = category;
  b.refresh();
}

export function toggleIconAdd(): void {
  const b = builder();
  b.state.iconAddOpen = !b.state.iconAddOpen;
  b.state.iconError = "";
}

function add(b: ReturnType<typeof builder>, candidates: { name: string; svg: string }[]): void {
  const result = addIcons(b.system(), candidates);
  b.state.iconError = result.error;
  if (result.error) return;
  b.state.iconAddOpen = false;
  b.state.iconPasteName = "";
  b.state.iconPasteSvg = "";
  b.change(result.system);
}

export function addPastedIcon(): void {
  const b = builder();
  add(b, [{ name: b.state.iconPasteName, svg: b.state.iconPasteSvg }]);
}

export async function uploadIcons(event: Event): Promise<void> {
  const b = builder();
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (!files.length) return;
  add(b, await Promise.all(files.map(async (file) => ({ name: file.name, svg: await file.text() }))));
}

export function removeIconNamed(name: string): void {
  const b = builder();
  if (b.state.iconEditing === name) b.state.iconEditing = "";
  b.change(removeIcon(b.system(), name));
}

export function editIcon(name: string): void {
  const b = builder();
  const icon = b.system().icons.find((candidate) => candidate.name === name);
  if (!icon) return;
  b.state.iconEditing = name;
  b.state.iconEditName = icon.name;
  b.state.iconEditSvg = icon.svg;
  b.state.iconEditImage = iconImage(icon.svg);
  b.state.iconEditError = "";
  b.state.modal = true;
}

export function setIconEditSvg(markup: string): void {
  const b = builder();
  b.state.iconEditSvg = markup;
  b.state.iconEditImage = iconImage(markup);
}

export function cancelIconEdit(): void {
  const b = builder();
  b.state.iconEditing = "";
  b.state.iconEditError = "";
  b.state.modal = false;
}

export function saveEditedIcon(): void {
  const b = builder();
  const result = saveIcon(b.system(), b.state.iconEditing, b.state.iconEditName, b.state.iconEditSvg);
  b.state.iconEditError = result.error;
  if (result.error) return;
  b.state.iconEditing = "";
  b.state.modal = false;
  b.change(result.system);
}

export function removeEditedIcon(): void {
  const b = builder();
  const name = b.state.iconEditing;
  b.state.iconEditing = "";
  b.state.modal = false;
  b.change(removeIcon(b.system(), name));
}
