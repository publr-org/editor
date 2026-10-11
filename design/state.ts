// The builder's store and what a page reaches through it. The store is one reactive
// object made of slices: the frame's own (the page, publishing, the overview) and one per
// area (tokens, colors, fonts, ...), each from its folder's `view.ts`. After every change
// the root writes each area's view of the document into the store (`refresh`), so the
// pages only read `state.*`. Area actions reach the instance through `builder()`.
import type { DesignSystem } from "./model/system";
import type { LibraryHost } from "./library/host";
import type { initial as overview } from "./overview/view";
import type { initial as tokens } from "./tokens/view";
import type { initial as removal } from "./removal/view";
import type { initial as colors } from "./colors/view";
import type { initial as fonts } from "./fonts/view";
import type { initial as typography } from "./typography/view";
import type { initial as typescale } from "./typescale/view";
import type { initial as icons } from "./icons/view";
import type { initial as containers } from "./containers/view";
import type { initial as breakpoints } from "./breakpoints/view";
import type { initial as library } from "./library/view";

/** The pages the left nav opens. `advanced` is the token library; `transfer` is shown
 * over it by the top bar's Import / export. */
export type Page =
  | "overview"
  | "advanced"
  | "fonts"
  | "icons"
  | "containers"
  | "foundations"
  | "typography"
  | "type-scale"
  | "components"
  | "breakpoints"
  | "patterns"
  | "templates"
  | "settings";

/** Pages that keep the main nav (the rest slide the left panel into their own list). */
export const LEAF_PAGES: ReadonlySet<string> = new Set(["advanced", "overview", "settings", "fonts", "typography", "type-scale", "icons", "containers", "breakpoints", "foundations"]);

export type FrameState = {
  page: Page;
  /** The left panel shows the main nav (true) or the open page's own list. */
  home: boolean;
  /** Import / export is shown on the token library's page. */
  transfer: boolean;
  /** The working copy differs from what is published. */
  dirty: boolean;
  saving: boolean;
  status: string;
  publishLabel: string;
  /** Why the last publish failed. */
  problem: string;
  /** A modal is open: the frame's actions dim. */
  modal: boolean;
};

export type State = FrameState &
  ReturnType<typeof overview> &
  ReturnType<typeof tokens> &
  ReturnType<typeof removal> &
  ReturnType<typeof colors> &
  ReturnType<typeof fonts> &
  ReturnType<typeof typography> &
  ReturnType<typeof typescale> &
  ReturnType<typeof icons> &
  ReturnType<typeof containers> &
  ReturnType<typeof breakpoints> &
  ReturnType<typeof library>;

export type MediaHost = {
  /** Keeps a file (a font face, an SVG) and answers with where it is served. */
  upload: (file: File) => Promise<{ src: string }>;
};

export type BuilderProps = {
  /** The published design system. */
  system: DesignSystem;
  /** The app it belongs to, for the agent's brief. */
  app?: string;
  /** Where the browser keeps the unpublished draft; none keeps no draft. */
  draftKey?: string;
  /** The site's stylesheets, for previews drawn with the editor's blocks. */
  siteStyles?: readonly string[];
  /** Every change, as the whole document. */
  onChange?: (system: DesignSystem) => void;
  /** Publish: keep the system; an error to show, or null. */
  save?: (system: DesignSystem) => Promise<string | null> | string | null;
  /** How many references the moodboard holds. */
  moodboardCount?: number;
  openMoodboard?: () => void;
  /** The editor app, from the top bar's pencil. */
  openEditor?: () => void;
  /** Build: hand the brief to the AI; an error to show, or null (it navigates away). */
  build?: (brief: string) => Promise<string | null> | string | null;
  /** Where the AI is set up, when Build is not ready. */
  aiSettingsHref?: string;
  /** Builds can run (an AI provider is set up). */
  aiReady?: boolean;
  /** The way an agent of the person's own reaches this site; none hides the pill. */
  agent?: { site: string; devicesHref?: string; guideHref?: string };
  media?: MediaHost;
  /** Hands the host the instance once it exists (tests, host actions). */
  onReady?: (instance: BuilderInstance) => void;
  /** The app's patterns, templates and parts, and how edits to them are kept. */
  library?: LibraryHost;
};

/** What an area's actions reach: the instance they run under. Take it synchronously at
 * the start of an action (`const b = builder()`); it stays valid across awaits. */
export type BuilderInstance = {
  state: State;
  props: BuilderProps;
  system: () => DesignSystem;
  /** Replace the working copy: marks the draft, refreshes every view, tells the host. */
  change: (next: DesignSystem) => void;
  /** Re-derive every view from the document and the store's inputs. */
  refresh: () => void;
  open: (page: Page) => void;
};
