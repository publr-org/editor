// The demo site's homepage patterns: the Hearth & Home library (harness/hearth.ts). The
// homepage is composed of them, stamped fresh from the registered designs every time.
import { downcast } from "../model/codec";
import { getPattern, registerPattern, stampPattern } from "../model/patterns";
import { HEARTH_HOME, HEARTH_PATTERNS } from "./hearth";

export const HOME_PATTERNS = HEARTH_HOME;

export function registerHomePatterns(): void {
  for (const pattern of HEARTH_PATTERNS) {
    if (getPattern(pattern.name)) continue;
    registerPattern(pattern.name, { label: pattern.label, category: pattern.category, description: pattern.description, html: pattern.html });
  }
}

/** A document of fresh stamps of the named patterns. */
export const stampedDocument = (names: string[]) => downcast(names.map(stampPattern), "editing");
