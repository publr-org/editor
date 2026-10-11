// The typography page's In use layout: a storefront's nav, hero and aside drawn with the
// editor's own blocks, every text set in a font role (`font-heading`, `font-body`,
// `font-code`), so retargeting a role redraws it in the new family. Its frame and quiet
// text take the builder chrome's neutrals, as the rest of the page does.
const p = (classes: string, text: string) => `<p data-pb-block="paragraph" data-pb-rich="body" class="${classes}">${text}</p>`;
const group = (classes: string, children: string) => `<div data-pb-block="group" data-pb-tag="tag" data-pb-children class="${classes}">${children}</div>`;

const MUTED = "text-[#737373]";
const BORDER = "border-[#e5e5e5]";

export function inUseHtml(): string {
  const nav = group(
    `flex items-center justify-between gap-4 border-b ${BORDER} px-7 py-4`,
    p("m-0 font-heading text-[15px] leading-[1.4]", "Hearth &amp; Home") +
      group(`flex items-center gap-5 font-body text-[11px] leading-[1.4] ${MUTED}`, p("m-0", "Cookware") + p("m-0", "Storage") + p("m-0", "Journal") + p("m-0 text-[#0a0a0a]", "Contact")),
  );
  const hero = group(
    "p-10",
    p(`m-0 font-body text-[10px] leading-[1.4] font-medium tracking-[0.14em] uppercase ${MUTED}`, "New collection") +
      `<h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="m-0 mt-4 max-w-[520px] font-heading text-[52px] leading-[1.05] font-normal text-[#0a0a0a]">Type that carries the whole brand.</h3>` +
      p(`m-0 mt-5 max-w-md font-body text-[13px] leading-[1.65] ${MUTED}`, "A confident display face for the loud moments, a body text that stays out of the way — this is how the pairing reads at real sizes.") +
      group(
        "mt-8 flex items-center gap-3 font-body text-[11px] leading-[1.4]",
        p("m-0 rounded-full bg-[#171717] px-5 py-2.5 font-semibold text-white", "Shop cookware") + p(`m-0 rounded-full border ${BORDER} px-5 py-2.5 font-semibold text-[#0a0a0a]`, "Our materials"),
      ),
  );
  const aside = group(
    `flex flex-col justify-between gap-8 border-l ${BORDER} p-8`,
    p("m-0 font-heading text-[20px] leading-snug text-[#0a0a0a]", "“It finally looks like something on purpose.”") + p(`m-0 font-code text-[11px] leading-[1.4] ${MUTED}`, "heading · body · code — every role in one layout"),
  );
  return group(`overflow-hidden rounded-2xl border ${BORDER} bg-white text-[#0a0a0a]`, nav + group("grid grid-cols-[1.4fr_0.6fr]", hero + aside));
}
