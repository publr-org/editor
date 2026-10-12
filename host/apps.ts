// The design system builder on its admin page. The page carries what `design.system`
// read as JSON on the element it fills, with the moodboard's size and where Build and the
// agent lead. Publish saves through `design.save_system`: the tokens and fonts into the
// app's `app.zon`, the structure into its `design/system.zon`. Build posts the brief to
// the admin's AI ask, which opens the conversation. The moodboard mounts from moodboard.ts.
import { mount } from "publr/dom";
import { component } from "publr-jsx";
import { send } from "publr/operations";
import { registerCoreBlocks } from "../blocks/index";
import { isRegistered } from "../model/registry";
import { BuilderBar, DesignSystemBuilder } from "../design/Builder.ptsx";
import { fromSaved, toSaved } from "../design/model/saved";
import type { SavedSystem } from "../design/model/saved";
import type { DesignSystem } from "../design/model/system";
import type { ThemeToken } from "../canvas/engine";
import type { LibraryData, LibraryHost } from "../design/library/host";
import { boot } from "./boot";
import { fromFile, output, post } from "./hosted";
import { adminMedia } from "./MediaPicker.ptsx";

export type AppsOptions = { base: string; siteStyles?: readonly string[]; theme?: readonly ThemeToken[] };

function json<T>(element: HTMLElement, name: string, fallback: T): T {
  try {
    return JSON.parse(element.getAttribute(name) ?? "") as T;
  } catch {
    return fallback;
  }
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Posts the brief as the dashboard's ask does: a plain form, so the browser follows the
 * answer into the conversation's workspace. */
function ask(href: string, brief: string): null {
  const csrf = document.querySelector<HTMLMetaElement>('meta[name="publr-csrf"]')?.content ?? "";
  const form = document.createElement("form");
  form.method = "post";
  form.action = href;
  form.hidden = true;
  for (const [name, value] of [
    ["csrf", csrf],
    ["prompt", brief],
    ["scope", "write"],
  ]) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
  return null;
}

/** The app's library from `data-library`, each save an override record, as the record
 * page's editor saves them (`/admin/design/override`). */
function library(element: HTMLElement): LibraryHost | undefined {
  const data = json<(LibraryData & { saveUrl: string }) | null>(element, "data-library", null);
  if (!data) return undefined;
  const opened = <T extends { html: string; overridden: boolean }>(source: T): T => (source.overridden ? source : { ...source, html: fromFile(source.html) });
  return {
    patterns: data.patterns,
    templates: data.templates.map(opened),
    parts: data.parts.map(opened),
    savePattern: (pattern) => post(data.saveUrl, { kind: "pattern", name: pattern.name, html: pattern.html, output: "", label: pattern.label, category: pattern.category, description: pattern.description ?? "" }),
    saveTemplate: (name, html) => post(data.saveUrl, { kind: "template", name, html, output: output(html) }),
    savePart: (name, html) => post(data.saveUrl, { kind: "part", name, html, output: output(html) }),
  };
}

/** The sheet is the page's own content area: from under its top band to the bottom. */
function fill(element: HTMLElement): void {
  const fit = () => {
    const top = element.getBoundingClientRect().top + window.scrollY;
    element.style.height = `${Math.max(480, window.innerHeight - top)}px`;
  };
  fit();
  window.addEventListener("resize", fit);
}

export async function mountDesignSystem(element: HTMLElement, options: AppsOptions): Promise<void> {
  element.setAttribute("data-app-mounted", "");
  await boot(options);
  if (!isRegistered("paragraph")) registerCoreBlocks();
  const app = element.getAttribute("data-design-system") ?? "";
  const data = element.dataset;
  const published = fromSaved(json<SavedSystem>(element, "data-system", { tokens: [], fonts: [], system: null, saved: false }));
  const media = adminMedia();
  // The builder's draft state and actions go in the admin's top bar, after the plugins'.
  const slot = document.querySelector<HTMLElement>('[data-slot="top_bar"]');
  fill(element);
  mount(
    element,
    () =>
      component(DesignSystemBuilder, {
        system: published,
        app,
        bar: slot ? "host" : "own",
        draftKey: `publr.design.draft.${app}`,
        siteStyles: options.siteStyles?.filter((href) => !href.endsWith("/_app/app.css")),
        moodboardCount: Number(data.moodboardCount ?? "0") || 0,
        openEditor: () => {
          let last = "";
          try {
            last = localStorage.getItem("publr.editor.last") ?? "";
          } catch {
            last = "";
          }
          window.location.assign(last || data.contentHref || "/admin/content");
        },
        openMoodboard: () => window.location.assign(data.moodboardHref ?? "/admin/design/moodboard"),
        aiReady: data.aiReady === "true",
        aiSettingsHref: data.aiSettings ?? "",
        build: (brief: string) => ask(data.askHref ?? "/admin/ai/ask", brief),
        agent: { site: data.site ?? window.location.origin, devicesHref: data.devicesHref, guideHref: data.agentHref },
        library: library(element),
        media: { upload: (file: File) => media.upload(file).then((picked) => ({ src: picked.src })) },
        save: (system: DesignSystem) =>
          send("design.save_system", { app, ...toSaved(system) })
            .then(() => null)
            .catch(reason),
      }),
    {},
  );
  if (slot) {
    const bar = document.createElement("div");
    bar.setAttribute("data-part", "builder-bar");
    slot.append(bar);
    mount(bar, () => component(BuilderBar, {}), {});
  }
}
