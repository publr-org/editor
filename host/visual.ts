// A visual record's page: the full editor fills the sheet over the record's one rich
// text field, and the record's own editor moves into the editor's Document tab: its name,
// status and actions are drawn by the tab (they act through the record's own forms), its
// other fields sit under them. The field's textarea stays in `form#record`; every change is
// written into it with a bubbling `input`, so the record autosaves as it does from the form.
import { mount } from "publr/dom";
import { component } from "publr-jsx";
import { registerCorePatterns } from "../blocks/patterns";
import type { ThemeToken } from "../canvas/engine";
import { allPatterns } from "../model/patterns";
import { EditorShell } from "../shell/Shell.ptsx";
import type { DocumentAction, DocumentHost, DocumentStatus, Session } from "../shell/session";
import { boot } from "./boot";
import { hostedTemplates, registerHostedPatterns, savePattern } from "./hosted";
import { adminMedia } from "./MediaPicker.ptsx";

export type VisualOptions = { base: string; siteStyles?: readonly string[]; theme?: readonly ThemeToken[] };

/** The record's own editor as the Document tab presents it. The record editor redraws
 * itself after an action; every read looks again, and every redraw is announced. */
/** The language the record is shown in (the address's `?lang=`), and how the host
 * switches it: the canvas loads that language's body, the record's form its fields. */
export type Languages = { current: () => string; set: (code: string) => void };

/** What the record editor's props say about it. */
type RecordFacts = {
  title?: string;
  actions?: { name: string; value: string; label: string; destructive: boolean; primary: boolean }[];
  languages?: { code: string; label: string }[];
};

function recordDocument(record: HTMLElement, languages: Languages): DocumentHost {
  const editor = () => record.querySelector<HTMLElement>('[data-part="record-editor"]');
  const facts = (): RecordFacts => {
    try {
      return JSON.parse(editor()?.getAttribute("data-p") ?? "{}");
    } catch {
      return {};
    }
  };
  // What the tab draws itself leaves the record's own column: its title band, its status
  // band and its actions section.
  const fold = () => {
    const root = editor();
    if (!root) return;
    const header = root.querySelector<HTMLElement>('[data-part="page-header"]');
    if (header && !header.hidden) header.hidden = true;
    const band = root.querySelector('[data-part="status-strip"]')?.closest<HTMLElement>('[data-part="form-body"] > div > div');
    if (band && !band.hidden) band.hidden = true;
    const actions = root.querySelector('[data-part="split-button"]')?.closest<HTMLElement>("section");
    if (actions && !actions.hidden) actions.hidden = true;
  };
  const listeners = new Set<() => void>();
  let queued = false;
  new MutationObserver(() => {
    fold();
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      for (const listener of listeners) listener();
    });
  }).observe(record, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-p", "data-title"] });
  fold();
  const viewUrl = () => {
    const group = record.querySelector('[data-field-path="slug"] [data-part="input-group"]');
    const prefix = group?.querySelector('[data-ds="Text"]')?.textContent?.trim() ?? "";
    const slug = group?.querySelector("input")?.value ?? "";
    return prefix && slug ? prefix + slug : "";
  };
  const titleInput = () => record.querySelector<HTMLInputElement>('form#record input[name="title"]');
  return {
    languages: () => facts().languages ?? [],
    language: () => languages.current(),
    setLanguage: (code: string) => {
      languages.set(code);
      for (const listener of listeners) listener();
    },
    title: () => editor()?.dataset.title ?? "",
    titleValue: () => titleInput()?.value ?? "",
    setTitle(text: string) {
      const input = titleInput();
      if (!input || input.value === text) return;
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    status(): DocumentStatus | null {
      const strip = editor()?.querySelector('[data-part="status-strip"]');
      if (!strip) return null;
      const shown = [...strip.querySelectorAll<HTMLElement>(':scope > [data-ds="Status"]')];
      const status = shown[0];
      if (!status) return null;
      const tone = status.dataset.statusTone === "success" ? "success" : "neutral";
      const hint = actionsSection()?.querySelector("p")?.textContent?.trim() ?? "";
      return {
        label: status.textContent?.trim() ?? "",
        tone,
        changed: shown.some((candidate) => candidate.dataset.statusTone === "warning" && candidate !== status),
        note: strip.querySelector(':scope > [data-ds="Text"]')?.textContent?.trim() ?? "",
        hint,
      };
    },
    actions(): DocumentAction[] {
      const list: DocumentAction[] = [];
      if (viewUrl()) list.push({ id: "view", label: "View" });
      for (const action of facts().actions ?? []) {
        if (action.name === "do" && action.value === "purge") continue;
        list.push({ id: `${action.name}=${action.value}`, label: action.label, destructive: action.destructive, primary: action.primary });
      }
      if (actionsSection()?.querySelector('a[href*="version"]')) list.push({ id: "versions", label: "Versions" });
      return list;
    },
    run(id) {
      if (id === "view") {
        window.open(viewUrl(), "_blank", "noopener");
        return;
      }
      if (id === "versions") {
        const link = actionsSection()?.querySelector<HTMLAnchorElement>('a[href*="version"]');
        if (link) location.assign(link.href);
        return;
      }
      const [name, value] = id.split("=");
      const form = [...document.querySelectorAll<HTMLFormElement>("form")].find((candidate) =>
        candidate.querySelector(`input[type="hidden"][name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`),
      );
      form?.requestSubmit();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  function actionsSection(): HTMLElement | null {
    return editor()?.querySelector('[data-part="split-button"]')?.closest<HTMLElement>("section") ?? null;
  }
}

export async function mountVisualRecord(record: HTMLElement, options: VisualOptions): Promise<void> {
  record.setAttribute("data-visual-mounted", "");
  // The other apps' Editor buttons come back here.
  try {
    localStorage.setItem("publr.editor.last", window.location.pathname + window.location.search);
  } catch {
    // Privacy mode: the Editor button opens Content instead.
  }
  await boot(options);
  const saveUrl = registerHostedPatterns(record);
  if (allPatterns().length === 0) registerCorePatterns();
  const name = record.dataset.visualField ?? "";
  // A translated body is a field of its own per language (`body@pl`); the canvas writes the
  // one of the language shown.
  // The address's `?lang=`, else the content language chosen top right (`<html data-variant>`).
  let language = new URLSearchParams(location.search).get("lang") ?? document.documentElement.dataset.variant ?? "";
  let loading = false;
  const nameIn = (code: string) => (code === "" ? name : `${name}@${code}`);
  // The field's own control is the editor now: its row leaves the form's view, in every
  // language. The record editor redraws its fields (a new record's first save does), so the
  // control is looked up again on every write and its rows hidden again on every redraw.
  const claim = (): HTMLTextAreaElement | null => {
    for (const each of record.querySelectorAll<HTMLTextAreaElement>("textarea[name]")) {
      if (each.name !== name && !each.name.startsWith(`${name}@`)) continue;
      const field = each.closest<HTMLElement>("[data-rich-text]");
      field?.setAttribute("data-rich-mounted", "");
      const row = each.closest<HTMLElement>('[data-part="field"]') ?? field;
      if (row && !row.hidden) row.hidden = true;
    }
    return record.querySelector<HTMLTextAreaElement>(`textarea[name="${CSS.escape(nameIn(language))}"]`) ??
      record.querySelector<HTMLTextAreaElement>(`textarea[name="${CSS.escape(name)}"]`);
  };
  const main = () => record.querySelector<HTMLTextAreaElement>(`textarea[name="${CSS.escape(name)}"]`);
  const control = claim();
  if (!control) return;
  new MutationObserver(() => void claim()).observe(record, { childList: true, subtree: true });
  // A language not written yet starts from the main one's blocks, its words to translate.
  const contentIn = () => {
    const own = claim();
    return own && own.value !== "" ? own.value : (main()?.value ?? "");
  };
  const languages: Languages = {
    current: () => language,
    set(code: string) {
      if (code === language) return;
      language = code;
      const address = new URL(location.href);
      if (code === "") address.searchParams.delete("lang");
      else address.searchParams.set("lang", code);
      history.replaceState(history.state, "", address);
      window.dispatchEvent(new CustomEvent("publr:language", { detail: code }));
      const session = (window as unknown as { editorSession?: Session }).editorSession;
      loading = true;
      session?.editor.load(contentIn());
      loading = false;
    },
  };

  // The sheet is the page's own content area: from under its top band to the bottom.
  const host = document.createElement("div");
  host.setAttribute("data-visual-sheet", "");
  record.before(host);
  const fit = () => {
    const top = host.getBoundingClientRect().top + window.scrollY;
    host.style.height = `${Math.max(320, window.innerHeight - top)}px`;
  };
  fit();
  window.addEventListener("resize", fit);
  mount(
    host,
    () =>
      component(EditorShell, {
        content: contentIn(),
        plain: true,
        canvasStylesheet: new URL("editor/canvas/canvas.css", options.base).href,
        siteStyles: options.siteStyles,
        wide: true,
        theme: options.theme,
        entry: record,
        document: recordDocument(record, languages),
        templates: hostedTemplates(record),
        media: adminMedia(),
        // The design system and the moodboard of the record's app: the override address
        // carries the project's base and the app.
        apps: {
          design: () => location.assign((saveUrl ?? "/admin/design/override").replace("/admin/design/override", "/admin/design/system")),
          moodboard: () => location.assign((saveUrl ?? "/admin/design/override").replace("/admin/design/override", "/admin/design/moodboard")),
        },
        onPatternPublished: (pattern: string) => void savePattern(saveUrl ?? "/admin/design/override", pattern),
        onChange: (html: string) => {
          if (loading) return;
          const current = claim() ?? control;
          current.value = html;
          current.dispatchEvent(new Event("input", { bubbles: true }));
        },
        onReady: (session: Session) => {
          (window as unknown as { editorSession: Session }).editorSession = session;
        },
      }),
    {},
  );
}
