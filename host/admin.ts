// The admin's entry: loaded by every admin page as a module, it puts the editor on the
// page's rich text fields (now, and whenever the record editor swaps fields in), and on
// a visual record's sheet. The site's styles and theme come from the page: a
// `data-editor-site` attribute (or a `publr-editor-site` meta) holding
// `{"styles": [...], "theme": [...]}`. The design system and moodboard pages mount their
// apps on `[data-design-system]` and `[data-moodboard]`.
import type { ThemeToken } from "../canvas/engine";

type Site = { styles: string[]; theme: ThemeToken[] };

const base = new URL("../../", import.meta.url).href;

function site(): Site {
  const carrier = document.querySelector<HTMLElement>("[data-editor-site]:not([data-editor-site=''])");
  const meta = document.querySelector<HTMLMetaElement>('meta[name="publr-editor-site"]');
  try {
    const parsed = carrier ? (JSON.parse(carrier.dataset.editorSite ?? "{}") as Partial<Site>) : meta ? (JSON.parse(meta.content) as Partial<Site>) : {};
    return { styles: parsed.styles ?? [new URL("preflight.css", base).href], theme: parsed.theme ?? [] };
  } catch {
    return { styles: [new URL("preflight.css", base).href], theme: [] };
  }
}

let busy = false;

async function scan(): Promise<void> {
  if (busy) return;
  const visual = document.querySelector<HTMLElement>("[data-visual-record]:not([data-visual-record=\"\"]):not([data-visual-mounted])");
  const fields = document.querySelector("[data-rich-text]:not([data-rich-mounted])");
  const system = document.querySelector<HTMLElement>("[data-design-system]:not([data-app-mounted])");
  const board = document.querySelector<HTMLElement>("[data-moodboard]:not([data-app-mounted])");
  if (!visual && !fields && !system && !board) return;
  busy = true;
  try {
    const { styles, theme } = site();
    if (visual) {
      const { mountVisualRecord } = await import("./visual");
      await mountVisualRecord(visual, { base, siteStyles: styles, theme });
    }
    if (system) {
      const { mountDesignSystem } = await import("./apps");
      await mountDesignSystem(system, { base, siteStyles: styles, theme });
    }
    if (board) {
      // The moodboard is its own app: it loads without the builder or the editor.
      const { mountMoodboard } = await import("./moodboard");
      mountMoodboard(board);
    }
    const { mountRichFields } = await import("./boot");
    await mountRichFields(document, { base, siteStyles: styles, theme });
  } finally {
    busy = false;
  }
}

await scan();
new MutationObserver(() => void scan()).observe(document.body, { childList: true, subtree: true });
