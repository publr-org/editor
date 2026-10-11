// The library's actions. Patterns, templates and parts open in the full editor over the
// builder (the builder is built around the editor) and come back on save or cancel;
// Primitive blocks keeps one embedded editor and loads each block's default into it.
import { mount } from "publr/dom";
import { Publr, component } from "publr-jsx";
import { getPattern } from "../../model/patterns";
import type { TemplateHost } from "../../model/templates";
import { EditorShell } from "../../shell/Shell.ptsx";
import type { Session } from "../../shell/session";
import { builder } from "../Builder.ptsx";
import { starterDocument } from "../model/library";
import { fontStylesheets, resolveValue } from "../model/system";
import type { DesignSystem } from "../model/system";
import type { BuilderInstance, State } from "../state";
import { BlockHeader } from "./BlockHeader.ptsx";

const canvasStylesheet = new URL("../../canvas/canvas.css", import.meta.url).href;

type Kept = Promise<string | null> | string | null;

/** A host's answer, sync or not: its error lands on the page. */
function kept(b: BuilderInstance, answer: Kept | undefined): void {
  Promise.resolve(answer ?? null).then((error) => {
    b.state.libraryError = error ?? "";
  });
}

// ── patterns ────────────────────────────────────────────────────────────

export function selectPatternCategory(name: string): void {
  const b = builder();
  b.state.patternCategory = name;
  b.refresh();
}

// ── the full editor over the builder ────────────────────────────────────

type Overlay = { element: HTMLElement; dispose: () => void; follow: () => void };
const overlays = new WeakMap<State, Overlay>();

function close(b: BuilderInstance): void {
  const overlay = overlays.get(b.state);
  if (!overlay) return;
  overlays.delete(b.state);
  window.removeEventListener("resize", overlay.follow);
  overlay.dispose();
  overlay.element.remove();
  b.state.libraryEditing = "";
  b.state.libraryEditingName = "";
  b.refresh();
}

/** The template host the open template or part is edited through. */
function templateHost(b: BuilderInstance, name: string): TemplateHost {
  const library = b.props.library!;
  const template = () => library.templates.find((candidate) => candidate.name === name) ?? null;
  return {
    template: () => template(),
    part: (part) => library.parts.find((candidate) => candidate.name === part) ?? null,
    saveTemplate(html) {
      const found = template();
      if (!found) return Publr.t("No template “{name}”.", { name });
      if (!html.includes('data-publr-slot="content"')) return Publr.t("A template needs a content slot.");
      found.html = html;
      found.overridden = true;
      kept(b, library.saveTemplate?.(name, html));
      return null;
    },
    savePart(part, html) {
      const found = library.parts.find((candidate) => candidate.name === part);
      if (!found) return Publr.t("No part “{name}”.", { name: part });
      found.html = html;
      found.overridden = true;
      kept(b, library.savePart?.(part, html));
      return null;
    },
    title: () => Publr.t("Page title"),
  };
}

/** Opens a pattern, template or part in the full editor, covering the builder. */
function edit(b: BuilderInstance, from: Element, kind: "pattern" | "template" | "part", name: string): void {
  if (overlays.has(b.state)) return;
  const root = from.closest<HTMLElement>("[data-design-builder]");
  if (!root) return;
  const element = document.createElement("div");
  element.setAttribute("data-library-editor", kind);
  element.style.position = "fixed";
  element.style.zIndex = "60";
  const follow = () => {
    const box = root.getBoundingClientRect();
    Object.assign(element.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  };
  follow();
  window.addEventListener("resize", follow);
  document.body.append(element);
  const library = b.props.library;
  const system = b.system();
  const dispose = mount(
    element,
    () =>
      component(EditorShell, {
        content: "",
        canvasStylesheet,
        siteStyles: [...(b.props.siteStyles ?? []), ...fontStylesheets(system)],
        theme: system.tokens,
        templates: kind === "pattern" ? undefined : templateHost(b, name),
        onPatternPublished: (published: string) => {
          const pattern = getPattern(published);
          const listed = library?.patterns.find((candidate) => candidate.name === published);
          if (!pattern) return;
          if (listed) listed.html = pattern.html;
          kept(b, library?.savePattern?.({ name: published, label: pattern.label, category: pattern.category, description: pattern.description, html: pattern.html }));
        },
        onReady: (session: Session) => {
          (window as unknown as { libraryEditor?: Session }).libraryEditor = session;
          // Isolate once the canvas is up, so it draws the edit on its own sheet.
          const begin = () => {
            if (!session.canvas) return void requestAnimationFrame(begin);
            if (kind === "pattern") session.editPatternDefinition(name);
            else if (kind === "template") session.editTemplate();
            else session.editPart(name);
            // A template or part opens on its first region, ready to act on.
            const first = kind === "pattern" ? null : session.editor.model.blocks[0];
            if (first) select(session.editor, first.id);
            // Saved or cancelled: the isolated edit is gone, and so is the editor.
            session.onUpdate(() => {
              if (!session.isolation) queueMicrotask(() => close(b));
            });
          };
          begin();
        },
      }),
    {},
  );
  overlays.set(b.state, { element, dispose, follow });
  b.state.libraryEditing = kind;
  b.state.libraryEditingName = name;
  b.state.libraryError = "";
}

export function editPattern(name: string, event: Event): void {
  edit(builder(), event.currentTarget as Element, "pattern", name);
}

export function editTemplate(name: string, event: Event): void {
  edit(builder(), event.currentTarget as Element, "template", name);
}

export function editPart(name: string, event: Event): void {
  edit(builder(), event.currentTarget as Element, "part", name);
}

/** Enter or Space on a card opens it, as a click does. */
export function cardKeys(event: KeyboardEvent, open: (event: Event) => void): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  open(event);
}

// ── primitive blocks ────────────────────────────────────────────────────

type BlockEditor = { session: Session | null; host: HTMLElement; drafts: Map<string, string>; timer: number };
const blockEditors = new WeakMap<State, BlockEditor>();

/** Selects a block, and again once the frame settled (its stylesheets land, the sheet
 * sizes to its blocks), so the toolbar sits on the block's final place. */
function select(editor: Session["main"], id: string): void {
  editor.selectBlocks([id]);
  setTimeout(() => {
    if (!editor.getBlock(id)) return;
    editor.select({ blocks: [], caret: null });
    editor.selectBlocks([id]);
  }, 300);
}

/** The block-default canvas reads as the site: its surface, its text color and fonts,
 * the block on a reading measure. */
function siteCanvas(system: DesignSystem): string {
  const value = (name: string, fallback: string) => {
    const resolved = resolveValue(system, `var(--${name})`);
    return resolved.startsWith("var(") ? fallback : resolved;
  };
  const css = `html:root{background:${value("color-surface", "#fff")}}body{color:${value("color-foreground", "inherit")};font-family:${value("font-body", "inherit")}}h1,h2,h3,h4,h5,h6{font-family:${value("font-heading", "inherit")}}body [data-canvas-root]{max-width:none;padding:64px max(48px,calc((100% - 760px) / 2)) 120px}`;
  return `data:text/css;charset=utf-8,${encodeURIComponent(css)}`;
}

/** Loads a block's default into the open editor and selects it, caret at its end. */
function load(b: BuilderInstance, editor: BlockEditor): void {
  const session = editor.session;
  if (!session) return;
  const type = b.state.blockType;
  session.main.load(editor.drafts.get(type) ?? starterDocument(type, b.system().blockDefaults[type]));
  const first = session.main.model.blocks[0];
  if (first) select(session.main, first.id);
}

/** The embedded editor's host (a ref callback): mounted once, then reused per block. */
export function blockEditorInto(host: Element | null): void {
  if (!host) return;
  const b = builder();
  const known = blockEditors.get(b.state);
  if (known?.host === host) return;
  const editor: BlockEditor = { session: null, host: host as HTMLElement, drafts: known?.drafts ?? new Map(), timer: 0 };
  blockEditors.set(b.state, editor);
  const system = b.system();
  let header: Node | null = null;
  queueMicrotask(() =>
    mount(
      host,
      () =>
        component(EditorShell, {
          content: "",
          chrome: "embedded",
          canvasStylesheet,
          siteStyles: [...(b.props.siteStyles ?? []), ...fontStylesheets(system), siteCanvas(system)],
          theme: system.tokens,
          // Made on the first read, inside the editor, so its list-view toggle reaches
          // that editor; later reads give the same bar back.
          get header() {
            header ??= component(BlockHeader, { model: b.state, onCancel: () => cancel(b), onSave: () => save(b) });
            return header;
          },
          onReady: (session: Session) => {
            editor.session = session;
            (window as unknown as { blockEditor?: Session }).blockEditor = session;
            load(b, editor);
          },
        }),
      {},
    ),
  );
}

export function selectBlock(type: string): void {
  const b = builder();
  const editor = blockEditors.get(b.state);
  if (editor?.session) editor.drafts.set(b.state.blockType, editor.session.main.serialize("editing"));
  b.state.blockType = type;
  b.state.blockStatus = Publr.t("Live draft");
  b.state.blockToast = "";
  b.refresh();
  if (editor) load(b, editor);
}

export const saveDefault = () => save(builder());

function save(b: BuilderInstance): void {
  const editor = blockEditors.get(b.state);
  if (!editor?.session) return;
  const type = b.state.blockType;
  const html = editor.session.main.serialize("editing");
  editor.drafts.delete(type);
  const system = b.system();
  b.change({ ...system, blockDefaults: { ...system.blockDefaults, [type]: html } });
  b.state.blockStatus = Publr.t("Saved");
  b.state.blockToast = Publr.t("{name} default saved", { name: b.state.blockLabel });
  clearTimeout(editor.timer);
  editor.timer = window.setTimeout(() => {
    b.state.blockToast = "";
    b.state.blockStatus = Publr.t("Live draft");
  }, 2200);
}

/** Cancel: the edits since the last save go; the saved default comes back. */
export const cancelDefault = () => cancel(builder());

function cancel(b: BuilderInstance): void {
  const editor = blockEditors.get(b.state);
  if (!editor) return;
  editor.drafts.delete(b.state.blockType);
  b.state.blockToast = "";
  b.state.blockStatus = Publr.t("Live draft");
  load(b, editor);
}
