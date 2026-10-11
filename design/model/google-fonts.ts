// The Fonts library's Google Fonts source. The css2 endpoint needs no API key and
// answers CORS, so a family is verified, and its served weights found, by fetching
// what the site will later load (GoogleFont in system.ts). Listing the catalog does
// need a key, so a curated catalog ships here for search; any family typed verbatim
// is still probed against the endpoint.
import { FONT_WEIGHT_STOPS } from "./system";
import type { FontFallback } from "./system";

export type GoogleFontCategory = "sans-serif" | "serif" | "monospace" | "display" | "handwriting";

export interface GoogleFontEntry {
  family: string;
  category: GoogleFontCategory;
}

const entries = (category: GoogleFontCategory, families: string): GoogleFontEntry[] =>
  families
    .split("|")
    .map((family) => family.trim())
    .filter(Boolean)
    .map((family) => ({ family, category }));

/** Popular families, searched client-side. Not exhaustive — see
 * probeGoogleFont for families outside this list. */
export const GOOGLE_FONTS: readonly GoogleFontEntry[] = [
  ...entries(
    "sans-serif",
    "Inter|Roboto|Open Sans|Lato|Montserrat|Poppins|Nunito|Nunito Sans|Raleway|Work Sans|DM Sans|Manrope|Plus Jakarta Sans|Outfit|Figtree|Space Grotesk|IBM Plex Sans|Source Sans 3|Noto Sans|Rubik|Karla|Mulish|Sora|Urbanist|Lexend|Onest|Geist|Instrument Sans|Bricolage Grotesque|Archivo|Barlow|Cabin|Josefin Sans|Oswald|Fira Sans|Ubuntu|PT Sans|Hind|Heebo|Quicksand|Red Hat Display|Red Hat Text|Public Sans|Libre Franklin|Schibsted Grotesk|Albert Sans|Be Vietnam Pro|Jost|Kanit|Prompt|Exo 2|Titillium Web|Chivo|Assistant|Questrial|Overpass|Syne|Epilogue|Hanken Grotesk|Gabarito|Golos Text|Wix Madefor Text|Atkinson Hyperlegible|Roboto Condensed|Roboto Flex|Commissioner|Familjen Grotesk|Host Grotesk|Funnel Sans|Inter Tight|Reddit Sans|Sarabun|Mukta|Tajawal|Cairo|Almarai|Noto Sans JP|Noto Sans KR|Noto Sans SC",
  ),
  ...entries(
    "serif",
    "Playfair Display|Merriweather|Lora|PT Serif|Libre Baskerville|Crimson Pro|Crimson Text|EB Garamond|Cormorant Garamond|Cormorant|Source Serif 4|Noto Serif|DM Serif Display|DM Serif Text|Fraunces|Instrument Serif|Newsreader|Literata|Spectral|Bitter|Zilla Slab|Arvo|Domine|Cardo|Libre Caslon Text|Vollkorn|Alegreya|Gelasio|Bodoni Moda|Young Serif|Josefin Slab|Roboto Slab|Playfair|Cormorant Infant|Old Standard TT|Prata|Marcellus|Cinzel|Frank Ruhl Libre|Brygada 1918|Petrona|Lustria|Rufina|Eczar|Castoro|Gloock|Rozha One",
  ),
  ...entries(
    "monospace",
    "JetBrains Mono|Fira Code|Source Code Pro|IBM Plex Mono|Roboto Mono|Space Mono|DM Mono|Geist Mono|Inconsolata|Ubuntu Mono|Courier Prime|Red Hat Mono|Martian Mono|Azeret Mono|Chivo Mono|Sono|Spline Sans Mono|Noto Sans Mono|Overpass Mono|Anonymous Pro|Cousine|Share Tech Mono|VT323",
  ),
  ...entries(
    "display",
    "Bebas Neue|Anton|Unbounded|Archivo Black|Alfa Slab One|Bungee|Righteous|Comfortaa|Fredoka|Baloo 2|Abril Fatface|Press Start 2P|Silkscreen|Major Mono Display|Lobster|Pacifico|Rubik Mono One|Black Ops One|Passion One|Bowlby One|Fugaz One|Lilita One|Titan One|Chango|Bagel Fat One|Climate Crisis|Rubik Glitch|Monoton|Limelight|Poiret One|Audiowide|Orbitron|Chakra Petch|Russo One|Teko|Staatliches|Squada One|Big Shoulders Display",
  ),
  ...entries(
    "handwriting",
    "Dancing Script|Caveat|Great Vibes|Satisfy|Kalam|Permanent Marker|Shadows Into Light|Indie Flower|Amatic SC|Sacramento|Patrick Hand|Architects Daughter|Homemade Apple|Courgette|Kaushan Script|Cookie|Parisienne|Allura|Yellowtail|Gochi Hand|Reenie Beanie|Nothing You Could Do|Handlee|Delius|Gloria Hallelujah",
  ),
];

/** The generic family a category degrades to when the web font is unavailable. */
export function googleFontFallback(category: GoogleFontCategory): FontFallback {
  return category === "handwriting" ? "cursive" : category === "display" ? "sans-serif" : category;
}

/** Filter the catalog by a case-insensitive substring (prefix matches first)
 * and optionally by category. */
export function searchGoogleFonts(
  query: string,
  limit = 12,
  category?: GoogleFontCategory,
): GoogleFontEntry[] {
  const catalog = category
    ? GOOGLE_FONTS.filter((entry) => entry.category === category)
    : GOOGLE_FONTS;
  const q = query.trim().toLowerCase();
  if (!q) return catalog.slice(0, limit);
  const hits = catalog.filter((entry) => entry.family.toLowerCase().includes(q));
  hits.sort((a, b) => {
    const pa = a.family.toLowerCase().startsWith(q) ? 0 : 1;
    const pb = b.family.toLowerCase().startsWith(q) ? 0 : 1;
    return pa - pb || a.family.localeCompare(b.family);
  });
  return hits.slice(0, limit);
}

/** One stylesheet that renders several families' regular faces for just the
 * characters in `text` — the search results' live specimens. */
export function googleFontsPreviewUrl(families: string[], text: string): string {
  const params = families
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, "+")}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap&text=${encodeURIComponent(text)}`;
}

/** One css2 stylesheet loading several weights of ONE family for just the
 * characters in `text` — the add/edit dialogs' per-weight specimen rows. */
export function googleFontWeightsPreviewUrl(
  family: string,
  weights: number[],
  text: string,
  italic = false,
): string {
  const encoded = encodeURIComponent(family).replace(/%20/g, "+");
  const axis = italic
    ? `ital,wght@${[...weights.map((w) => `0,${w}`), ...weights.map((w) => `1,${w}`)].join(";")}`
    : `wght@${weights.join(";")}`;
  return `https://fonts.googleapis.com/css2?family=${encoded}:${axis}&display=swap&text=${encodeURIComponent(text)}`;
}

/** Whether a stylesheet URL comes from Google Fonts. */
export function isGoogleFontStylesheet(url: string): boolean {
  return url.startsWith("https://fonts.googleapis.com/");
}

/** What Google serves for a family. The legacy `css` endpoint answers one
 * request for all eighteen variants with only the faces that exist (the
 * css2 endpoint rejects the whole request over one missing weight, and its
 * rejections carry no CORS headers). Null: the family does not exist (or
 * the endpoint is unreachable). */
export async function probeGoogleFont(
  family: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ weights: number[]; italic: boolean } | null> {
  if (!family.trim()) return null;
  const encoded = encodeURIComponent(family.trim()).replace(/%20/g, "+");
  const variants = FONT_WEIGHT_STOPS.flatMap((weight) => [`${weight}`, `${weight}i`]).join(",");
  let css: string;
  try {
    const response = await fetchImpl(
      `https://fonts.googleapis.com/css?family=${encoded}:${variants}&display=swap`,
      { mode: "cors" },
    );
    if (!response.ok) return null;
    css = await response.text();
  } catch {
    return null;
  }
  const weights = new Set<number>();
  let italic = false;
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const weight = Number(/font-weight\s*:\s*(\d+)/.exec(block[1])?.[1]);
    if (!FONT_WEIGHT_STOPS.includes(weight)) continue;
    if (/font-style\s*:\s*italic/.test(block[1])) italic = true;
    else weights.add(weight);
  }
  if (!weights.size) return null;
  return { weights: [...weights].sort((a, b) => a - b), italic };
}
