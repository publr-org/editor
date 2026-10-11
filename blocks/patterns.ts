// The core patterns: starting points in the library, stamped as independent copies. They
// draw with the site theme's semantic colours (surface, muted, accent), each with a
// neutral fallback, so a themed site gets designed sections and a bare one still reads.
import { Publr } from "publr-jsx";
import { registerPattern } from "../model/patterns";

const LINK = `<script type="application/json" data-pb-settings>{"style":"link"}</script>`;
const ACCENT = "bg-[var(--color-accent-surface,#18181b)] text-[var(--color-accent-foreground,#ffffff)]";
const MUTED = "bg-[var(--color-muted-surface,#f4f4f5)] text-[var(--color-foreground,#18181b)]";
const button = (label: string, href = "#") =>
  `<a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="${href}" class="inline-block rounded-full ${ACCENT} px-6 py-3 text-sm font-semibold no-underline">${LINK}${label}</a>`;
const quiet = (label: string, href = "#") =>
  `<a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="${href}" class="inline-block rounded-full border border-current px-6 py-3 text-sm font-semibold no-underline">${LINK}${label}</a>`;

export function registerCorePatterns(): void {
  registerPattern("hero", {
    label: Publr.t("Hero"),
    category: Publr.t("Banners"),
    description: Publr.t("A large heading, a line of copy and a call to action."),
    keywords: ["banner", "header"],
    html: `<div data-pb-block="group" data-pb-tag="tag" data-pb-children class="${MUTED} px-6 py-24 text-center"><h1 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mx-auto max-w-3xl text-5xl leading-tight font-semibold tracking-tight">A headline that says what you do</h1><p data-pb-block="paragraph" data-pb-rich="body" class="mx-auto mt-5 max-w-xl text-lg leading-relaxed opacity-80">One sentence of supporting copy that tells a visitor why to stay.</p><div data-pb-block="buttons" data-pb-children class="mt-8 flex flex-wrap items-center justify-center gap-4"><script type="application/json" data-pb-settings>{"justify":"center","gap":"md"}</script>${button("Get started")}</div></div>`,
  });
  registerPattern("cover-banner", {
    label: Publr.t("Cover banner"),
    category: Publr.t("Banners"),
    description: Publr.t("A heading over a full-width image."),
    html: `<div data-pb-block="cover" class="relative isolate flex overflow-hidden"><img data-pb-image="image" src="https://placehold.co/1200x430/png" alt="" class="absolute inset-0 -z-20 h-full w-full object-cover"><span class="absolute inset-0 -z-10 bg-black opacity-50" aria-hidden="true"></span><div data-pb-children class="relative flex min-h-[420px] flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center text-white"><h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="text-4xl font-semibold tracking-tight">Big news</h2><p data-pb-block="paragraph" data-pb-rich="body" class="max-w-lg text-lg opacity-90">Tell everyone about it.</p></div></div>`,
  });
  registerPattern("call-to-action", {
    label: Publr.t("Call to action"),
    category: Publr.t("Call to action"),
    description: Publr.t("A heading, a sentence and two buttons."),
    keywords: ["cta"],
    html: `<div data-pb-block="group" data-pb-tag="tag" data-pb-children class="${ACCENT} px-6 py-20 text-center"><h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="text-4xl font-semibold tracking-tight">Ready to start?</h2><p data-pb-block="paragraph" data-pb-rich="body" class="mx-auto mt-4 max-w-lg text-lg opacity-80">It takes a minute, and you can change everything later.</p><div data-pb-block="buttons" data-pb-children class="mt-8 flex flex-wrap items-center justify-center gap-4"><script type="application/json" data-pb-settings>{"justify":"center","gap":"md"}</script><a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="inline-block rounded-full bg-[var(--color-accent-foreground,#ffffff)] px-6 py-3 text-sm font-semibold text-[var(--color-accent-surface,#18181b)] no-underline">${LINK}Sign up</a>${quiet("Learn more")}</div></div>`,
  });
  registerPattern("feature-columns", {
    label: Publr.t("Feature columns"),
    category: Publr.t("Columns"),
    description: Publr.t("Three features side by side."),
    keywords: ["features", "three columns"],
    html: `<div data-pb-block="columns" data-pb-children class="flex gap-10 px-6 py-16 max-md:flex-col">${["Fast", "Simple", "Yours"]
      .map(
        (title) =>
          `<div data-pb-block="column" data-pb-children class="min-w-0 flex-1 border-t border-current/15 pt-6"><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="text-xl font-semibold">${title}</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-2 leading-relaxed opacity-75">A sentence about why it matters.</p></div>`,
      )
      .join("")}</div>`,
  });
  registerPattern("testimonials", {
    label: Publr.t("Two testimonials"),
    category: Publr.t("Testimonials"),
    description: Publr.t("Two quotes from people who use it."),
    keywords: ["quotes", "reviews"],
    html: `<h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="px-6 pt-16 text-center text-3xl font-semibold tracking-tight">What people say</h2><div data-pb-block="columns" data-pb-children class="flex gap-6 px-6 pt-10 pb-16 max-md:flex-col"><div data-pb-block="column" data-pb-children class="min-w-0 flex-1"><blockquote data-pb-block="quote" class="rounded-2xl ${MUTED} p-8 text-lg leading-relaxed"><div data-pb-rich="body">Exactly the tool I did not know I needed.</div><cite data-pb-text="citation" class="mt-4 block text-sm font-semibold not-italic opacity-70">Alex, maker</cite></blockquote></div><div data-pb-block="column" data-pb-children class="min-w-0 flex-1"><blockquote data-pb-block="quote" class="rounded-2xl ${MUTED} p-8 text-lg leading-relaxed"><div data-pb-rich="body">Set up in minutes, shipped the same day.</div><cite data-pb-text="citation" class="mt-4 block text-sm font-semibold not-italic opacity-70">Sam, founder</cite></blockquote></div></div>`,
  });
}
