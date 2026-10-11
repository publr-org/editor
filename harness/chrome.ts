// Standalone pages compile the chrome's classes in the browser, against the design
// system's theme. In the admin they come from its build-time stylesheet instead.
import { setClassResolver } from "publr/class-merge";
import { THEME_TOKENS } from "../../ui/gallery/app/runtime/theme";
import { Watcher, compile, encodeTheme, loadEngine } from "../canvas/engine";

export async function startChrome(): Promise<void> {
  await loadEngine(new URL("../../runtime/jit_engine.wasm", import.meta.url).href);
  const theme = encodeTheme(THEME_TOKENS);
  setClassResolver((classes) => JSON.parse(compile("resolveClassesWithTheme", classes.join(" "), theme)));
  new Watcher(document, THEME_TOKENS);
}

export const canvasStylesheet = new URL("../canvas/canvas.css", import.meta.url).href;

/** The fixtures' stylesheets: the jit's preflight, the Hearth site's (its parts' containers)
 * and the fixtures' typography. */
export const siteStyles = [new URL("../../preflight.css", import.meta.url).href, new URL("./hearth.css", import.meta.url).href, new URL("./site.css", import.meta.url).href];

/** The Hearth & Home site's stylesheets, for the demo page: the jit's preflight and the site's own. */
export const hearthStyles = [new URL("../../preflight.css", import.meta.url).href, new URL("./hearth.css", import.meta.url).href];
