// The semantic colors preview: one storefront composition, drawn with the editor's own
// blocks, set entirely in one color context's roles. Every color class names a role
// token (`bg-inverse-accent-surface`), so changing a role, a palette color or the
// context redraws it in place.

/** The role class suffixes the composition uses, resolved for one context. */
export type PreviewRoles = {
  surface: string;
  foreground: string;
  border: string;
  accent: string;
  accentForeground: string;
  accentBorder: string;
  muted: string;
  mutedForeground: string;
  mutedBorder: string;
};

const p = (classes: string, text: string) => `<p data-pb-block="paragraph" data-pb-rich="body" class="${classes}">${text}</p>`;
const group = (classes: string, children: string) => `<div data-pb-block="group" data-pb-tag="tag" data-pb-children class="${classes}">${children}</div>`;

export function previewHtml(roles: PreviewRoles, font: string, contextLabel: string): string {
  const accent = `bg-${roles.accent} text-${roles.accentForeground} border-${roles.accentBorder}`;
  const nav = group(
    `flex items-center justify-between border-b border-${roles.border} px-6 py-4`,
    group(
      "flex items-center gap-2.5",
      p(`m-0 flex h-8 w-8 items-center justify-center rounded-full border text-[13px] leading-none font-black ${accent}`, "H") +
        p("m-0 text-[12px] leading-none font-bold tracking-[0.08em]", "HEARTH &amp; HOME"),
    ) +
      group(
        "flex items-center gap-5 text-[10px] leading-none font-medium",
        p("m-0", "Cookware") + p("m-0", "Storage") + p("m-0", "Our standards") + p(`m-0 rounded-full border px-3 py-2 font-semibold ${accent}`, "Shop the collection"),
      ),
  );
  const story = group(
    "flex flex-col justify-between p-10",
    group(
      "",
      group(
        `mb-5 inline-flex items-center gap-2 rounded-full border border-${roles.border} px-3 py-1.5`,
        group(`h-1.5 w-1.5 rounded-full bg-${roles.accent}`, "") + p("m-0 text-[10px] leading-[1.4] font-semibold", `${contextLabel}&nbsp; context`),
      ) +
        `<h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="m-0 max-w-[580px] text-[64px] leading-[0.98] font-semibold tracking-[-0.055em] text-${roles.foreground}">Thoughtful tools for a healthier home.</h3>` +
        p(`mt-6 mb-0 max-w-md text-[13px] leading-[1.65] text-${roles.foreground}`, "Beautifully considered cookware and storage, made for everyday rituals and designed to live well together."),
    ) +
      group(
        "mt-9 flex items-center gap-3",
        p(`m-0 rounded-full border px-5 py-3 text-[11px] leading-[1.4] font-semibold ${accent}`, "Shop cookware") +
          p(`m-0 rounded-full border border-${roles.border} px-5 py-3 text-[11px] leading-[1.4] font-semibold text-${roles.foreground}`, "Our materials"),
      ),
  );
  const featured = group(
    `m-4 flex min-h-[300px] flex-col justify-between rounded-xl border p-6 bg-${roles.muted} text-${roles.mutedForeground} border-${roles.mutedBorder}`,
    p(`m-0 text-[10px] leading-[1.4] font-semibold tracking-[0.12em] uppercase text-${roles.mutedForeground}`, "Featured collection") +
      group(
        `relative my-6 flex flex-1 items-center justify-center overflow-hidden rounded-lg border ${accent}`,
        group(`absolute h-36 w-36 rotate-12 rounded-[38%] border-[18px] opacity-80 border-${roles.accentForeground}`, "") +
          p(`relative m-0 text-[34px] leading-[1.4] font-black tracking-[-0.08em] text-${roles.accentForeground}`, "HOME"),
      ) +
      group(
        "flex items-end justify-between",
        group("", p("m-0 text-[12px] leading-[1.4] font-semibold", "Clean Cookware") + p(`mt-0.5 mb-0 text-[10px] leading-[1.4] text-${roles.mutedForeground}`, "Non-toxic · Designed to last")) +
          p("m-0 text-xl leading-[1.4]", "↗"),
      ),
  );
  return group(`${font} bg-${roles.surface} text-${roles.foreground} text-[13px] leading-[1.4]`, nav + group("grid min-h-[410px] grid-cols-[1.35fr_0.65fr]", story + featured));
}
