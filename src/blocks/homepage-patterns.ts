// Warm editorial-commerce pattern library used by the demo theme. The visual
// language is intentionally token-driven: ivory/default, slate-blue/brand,
// and terracotta/inverse contexts share the same semantic roles, so authored
// blocks keep their meaning as sections change palette.

import { registerPattern } from "../patterns";
import type { PatternDefinition } from "../patterns";

const KITCHEN =
  "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1600&q=85";
const COUNTER =
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=85";
const COOKING =
  "https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=1200&q=85";
const TABLE =
  "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=85";

const linkSettings = `<script type="application/json" data-pb-settings>{"style":"link"}</script>`;

/** [name, definition] in registration (= inserter) order. */
export const HOMEPAGE_PATTERNS: readonly [string, PatternDefinition][] = [
  [
    "home-header",
    {
      label: "Editorial shop header",
      category: "Headers",
      description: "Announcement strip, wordmark, navigation, and compact utility links.",
      content: `
<header data-pb-block="group" data-pb-tag="tag" data-pb-children class="bg-surface text-foreground">
  <div data-pb-block="paragraph" data-pb-rich="body" class="bg-brand-accent-surface px-5 py-2 text-center text-xs font-semibold tracking-wide text-brand-accent-foreground">Limited time · save on the complete kitchen collection</div>
  <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="pbe-container--on pbe-container--wide flex items-center justify-between gap-6 border-b border-border py-5">
    <a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="text-xs font-semibold tracking-[0.16em] uppercase text-foreground">${linkSettings}Shop all</a>
    <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="font-serif text-3xl font-semibold tracking-tight">Hearth &amp; Home</h2>
    <div data-pb-block="buttons" data-pb-children><script type="application/json" data-pb-settings>{"justify":"right"}</script>
      <a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="text-sm text-foreground">${linkSettings}Search</a>
      <a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="text-sm text-foreground">${linkSettings}Cart · 0</a>
    </div>
  </div>
  <div data-pb-block="group" data-pb-children class="pbe-container--on pbe-container--wide">
    <div data-pb-block="buttons" data-pb-children class="flex flex-wrap justify-center gap-x-8 gap-y-2 py-3 text-xs font-medium"><script type="application/json" data-pb-settings>{"justify":"center","gap":"sm"}</script>
      <a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="text-foreground">${linkSettings}Cookware</a>
      <a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="text-foreground">${linkSettings}Bakeware</a>
      <a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="text-foreground">${linkSettings}Food storage</a>
      <a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="text-foreground">${linkSettings}Kitchen tools</a>
    </div>
  </div>
</header>`,
    },
  ],
  [
    "home-hero",
    {
      label: "Commerce story hero",
      category: "Heroes",
      description: "Editorial split hero using the brand context and a large lifestyle image.",
      content: `
<section data-pb-block="group" data-pb-tag="tag" data-pb-children class="bg-brand-surface text-brand-foreground">
  <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="pbe-container--off pbe-container--wide grid min-h-[620px] grid-cols-1 lg:pbe-container--on lg:pbe-container--bleed-right lg:grid-cols-2">
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="pbe-container--on pbe-container--wide flex flex-col justify-center py-20 lg:pbe-container--off">
      <p data-pb-block="paragraph" data-pb-rich="body" class="mb-5 text-xs font-semibold tracking-[0.18em] uppercase text-brand-foreground opacity-80">A kitchen worth gathering in</p>
      <h1 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="max-w-xl font-serif text-5xl font-semibold leading-[0.98] tracking-tight sm:text-7xl">Beautiful tools for everyday rituals.</h1>
      <p data-pb-block="paragraph" data-pb-rich="body" class="mt-7 max-w-lg text-base leading-relaxed text-brand-foreground opacity-80">Thoughtful cookware and home essentials designed to work hard, look beautiful, and stay with you for years.</p>
      <div data-pb-block="buttons" data-pb-children class="mt-9"><script type="application/json" data-pb-settings>{"gap":"sm"}</script>
        <a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="rounded-full bg-brand-accent-surface px-6 py-3 text-sm font-semibold text-brand-accent-foreground no-underline">${linkSettings}Shop the collection</a>
        <a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="px-4 py-3 text-sm font-semibold text-brand-foreground">${linkSettings}Our materials →</a>
      </div>
    </div>
    <figure data-pb-block="image" class="min-h-[420px] overflow-hidden"><img data-pb-image="image" src="${KITCHEN}" alt="Warm modern kitchen" class="h-full min-h-[420px] w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure>
  </div>
</section>`,
    },
  ],
  [
    "home-giveaway",
    {
      label: "Prize promotion banner",
      category: "Promotions",
      description: "A compact terracotta prize or campaign announcement.",
      content: `
<section data-pb-block="group" data-pb-tag="tag" data-pb-children class="grid grid-cols-1 items-center gap-8 bg-inverse-surface px-8 py-10 text-inverse-foreground md:grid-cols-[1fr_auto_1fr] lg:px-20">
  <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="font-serif text-3xl font-semibold md:text-right">What you’ll win →</h2>
  <div data-pb-block="paragraph" data-pb-rich="body" class="flex h-24 w-24 items-center justify-center rounded-full bg-inverse-muted-surface font-serif text-4xl text-inverse-muted-foreground">12</div>
  <p data-pb-block="paragraph" data-pb-rich="body" class="max-w-sm text-sm leading-relaxed text-inverse-foreground opacity-80">A complete cooking collection, pantry organization, and a kitchen refresh designed around your home.</p>
</section>`,
    },
  ],
  [
    "home-steps",
    {
      label: "How to enter steps",
      category: "How it works",
      description: "A self-contained three-step explainer for campaigns or processes.",
      content: `
<section data-pb-block="group" data-pb-tag="tag" data-pb-children class="bg-surface py-16 text-foreground">
  <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="pbe-container--on pbe-container--wide">
    <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mb-12 font-serif text-3xl font-semibold">How to enter</h2>
    <div data-pb-block="columns" data-pb-children class="grid gap-10 md:grid-cols-3">
      <div data-pb-block="column" data-pb-children class="border-t border-border pt-6"><p data-pb-block="paragraph" data-pb-rich="body" class="mb-5 flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground font-serif text-xl">1</p><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="font-serif text-xl">Shop to earn</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-2 text-sm leading-relaxed text-foreground opacity-70">Every purchase is an entry. Look for products with entry multipliers.</p></div>
      <div data-pb-block="column" data-pb-children class="border-t border-border pt-6"><p data-pb-block="paragraph" data-pb-rich="body" class="mb-5 flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground font-serif text-xl">2</p><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="font-serif text-xl">Get social</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-2 text-sm leading-relaxed text-foreground opacity-70">Share your kitchen ritual and tag the community for another entry.</p></div>
      <div data-pb-block="column" data-pb-children class="border-t border-border pt-6"><p data-pb-block="paragraph" data-pb-rich="body" class="mb-5 flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground font-serif text-xl">3</p><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="font-serif text-xl">Win big</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-2 text-sm leading-relaxed text-foreground opacity-70">One winner receives the full collection and a consultation with our team.</p></div>
    </div>
  </div>
</section>`,
    },
  ],
  [
    "home-products",
    {
      label: "Curated product grid",
      category: "Commerce",
      description: "Four editorial product cards with imagery, reviews, prices, and badges.",
      content: `
<section data-pb-block="group" data-pb-tag="tag" data-pb-children class="bg-surface py-20 text-foreground">
  <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="pbe-container--on pbe-container--wide">
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="mb-9 flex items-end justify-between gap-6"><div data-pb-block="group" data-pb-tag="tag" data-pb-children><p data-pb-block="paragraph" data-pb-rich="body" class="text-xs font-semibold tracking-[0.15em] uppercase text-foreground opacity-70">Shop clean, live well</p><h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-2 font-serif text-4xl font-semibold">New arrivals</h2></div><a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="text-sm font-semibold text-foreground underline underline-offset-4">${linkSettings}Shop all</a></div>
    <div data-pb-block="group" data-pb-children class="grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">
      <article data-pb-block="group" data-pb-tag="tag" data-pb-children><figure data-pb-block="image" class="aspect-square overflow-hidden rounded-t-[2rem] bg-muted-surface"><img data-pb-image="image" src="${COUNTER}" alt="Cream cookware set" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><p data-pb-block="paragraph" data-pb-rich="body" class="mt-4 text-[10px] font-semibold tracking-wide uppercase text-foreground">Bundle &amp; save</p><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-1 font-serif text-xl">Clean Start Bundle</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-1 text-sm text-foreground opacity-70">★★★★★ · 4.7</p><p data-pb-block="paragraph" data-pb-rich="body" class="mt-2 text-sm font-semibold">$395 · four colors</p></article>
      <article data-pb-block="group" data-pb-tag="tag" data-pb-children><figure data-pb-block="image" class="aspect-square overflow-hidden rounded-t-[2rem] bg-muted-surface"><img data-pb-image="image" src="${COOKING}" alt="Frying pan set" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><p data-pb-block="paragraph" data-pb-rich="body" class="mt-4 text-[10px] font-semibold tracking-wide uppercase text-foreground">Bestseller</p><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-1 font-serif text-xl">Fry Pan Trio</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-1 text-sm text-foreground opacity-70">★★★★★ · 4.9</p><p data-pb-block="paragraph" data-pb-rich="body" class="mt-2 text-sm font-semibold">$265 · six colors</p></article>
      <article data-pb-block="group" data-pb-tag="tag" data-pb-children><figure data-pb-block="image" class="aspect-square overflow-hidden rounded-t-[2rem] bg-muted-surface"><img data-pb-image="image" src="${TABLE}" alt="Tableware collection" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><p data-pb-block="paragraph" data-pb-rich="body" class="mt-4 text-[10px] font-semibold tracking-wide uppercase text-foreground">New</p><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-1 font-serif text-xl">Table Set</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-1 text-sm text-foreground opacity-70">★★★★★ · 4.8</p><p data-pb-block="paragraph" data-pb-rich="body" class="mt-2 text-sm font-semibold">$185 · four colors</p></article>
      <article data-pb-block="group" data-pb-tag="tag" data-pb-children><figure data-pb-block="image" class="aspect-square overflow-hidden rounded-t-[2rem] bg-muted-surface"><img data-pb-image="image" src="${KITCHEN}" alt="Kitchen storage" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><p data-pb-block="paragraph" data-pb-rich="body" class="mt-4 text-[10px] font-semibold tracking-wide uppercase text-foreground">Just in</p><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-1 font-serif text-xl">Pantry System</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-1 text-sm text-foreground opacity-70">★★★★★ · 4.6</p><p data-pb-block="paragraph" data-pb-rich="body" class="mt-2 text-sm font-semibold">$120 · three sizes</p></article>
    </div>
  </div>
</section>`,
    },
  ],
  [
    "home-categories",
    {
      label: "Round category rail",
      category: "Commerce",
      description: "A horizontal category collection with circular lifestyle imagery.",
      content: `
<section data-pb-block="group" data-pb-tag="tag" data-pb-children class="bg-surface py-20 text-foreground">
  <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mb-10 text-center font-serif text-4xl font-semibold">Make the swap to a healthier home</h2>
  <div data-pb-block="group" data-pb-children class="pbe-container--on pbe-container--wide grid grid-cols-2 gap-7 sm:grid-cols-3 lg:grid-cols-5">
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="text-center"><figure data-pb-block="image" class="aspect-square overflow-hidden rounded-full bg-muted-surface"><img data-pb-image="image" src="${COOKING}" alt="Cookware" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-4 font-serif text-lg">Cookware →</h3></div>
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="text-center"><figure data-pb-block="image" class="aspect-square overflow-hidden rounded-full bg-muted-surface"><img data-pb-image="image" src="${TABLE}" alt="Bakeware" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-4 font-serif text-lg">Bakeware →</h3></div>
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="text-center"><figure data-pb-block="image" class="aspect-square overflow-hidden rounded-full bg-muted-surface"><img data-pb-image="image" src="${COUNTER}" alt="Storage" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-4 font-serif text-lg">Food storage →</h3></div>
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="text-center"><figure data-pb-block="image" class="aspect-square overflow-hidden rounded-full bg-muted-surface"><img data-pb-image="image" src="${KITCHEN}" alt="Kitchen tools" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-4 font-serif text-lg">Kitchen tools →</h3></div>
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="text-center"><figure data-pb-block="image" class="aspect-square overflow-hidden rounded-full bg-muted-surface"><img data-pb-image="image" src="${TABLE}" alt="Linens" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-4 font-serif text-lg">Table linens →</h3></div>
  </div>
</section>`,
    },
  ],
  [
    "home-community",
    {
      label: "Community callout",
      category: "Social proof",
      description: "A brand-context invitation with one focused community action.",
      content: `
<section data-pb-block="group" data-pb-tag="tag" data-pb-children class="bg-brand-surface px-6 py-16 text-center text-brand-foreground">
  <h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="font-serif text-4xl font-semibold">Join the conversation</h2><p data-pb-block="paragraph" data-pb-rich="body" class="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-brand-foreground opacity-80">Share what you are cooking, organizing, and gathering around. We feature a new home every week.</p><div data-pb-block="buttons" data-pb-children class="mt-7"><script type="application/json" data-pb-settings>{"justify":"center"}</script><a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="rounded-full bg-brand-accent-surface px-6 py-3 text-sm font-semibold text-brand-accent-foreground no-underline">${linkSettings}Follow along →</a></div>
</section>`,
    },
  ],
  [
    "home-social-wall",
    {
      label: "Community social wall",
      category: "Social proof",
      description: "An editorial social gallery with a follower-count introduction.",
      content: `
<section data-pb-block="group" data-pb-tag="tag" data-pb-children class="bg-surface py-16 text-foreground">
  <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="pbe-container--on pbe-container--wide grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children><p data-pb-block="paragraph" data-pb-rich="body" class="text-xs font-semibold tracking-[0.15em] uppercase text-foreground opacity-70">850k+ followers</p><h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-3 font-serif text-4xl font-semibold leading-tight">Home cooks who make the everyday special.</h2></div>
    <div data-pb-block="group" data-pb-children class="grid grid-cols-2 gap-3 md:grid-cols-4"><figure data-pb-block="image" class="aspect-[3/4] overflow-hidden rounded-2xl"><img data-pb-image="image" src="${KITCHEN}" alt="Community kitchen" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><figure data-pb-block="image" class="aspect-[3/4] overflow-hidden rounded-2xl"><img data-pb-image="image" src="${COOKING}" alt="Home cooking" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><figure data-pb-block="image" class="aspect-[3/4] overflow-hidden rounded-2xl"><img data-pb-image="image" src="${TABLE}" alt="Shared meal" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure><figure data-pb-block="image" class="aspect-[3/4] overflow-hidden rounded-2xl"><img data-pb-image="image" src="${COUNTER}" alt="Organized kitchen" class="h-full w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure></div>
  </div>
</section>`,
    },
  ],
  [
    "home-standards",
    {
      label: "Image and standards",
      category: "Story",
      description: "Large lifestyle image paired with a calm material-transparency statement.",
      content: `
<section data-pb-block="group" data-pb-tag="tag" data-pb-children class="grid grid-cols-1 bg-muted-surface text-muted-foreground lg:grid-cols-2">
  <figure data-pb-block="image" class="min-h-[560px] overflow-hidden"><img data-pb-image="image" src="${COUNTER}" alt="Natural kitchen materials" class="h-full min-h-[560px] w-full object-cover"><figcaption data-pb-rich="caption"></figcaption></figure>
  <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="flex flex-col justify-center px-8 py-20 sm:px-14 lg:px-20"><p data-pb-block="paragraph" data-pb-rich="body" class="text-xs font-semibold tracking-[0.15em] uppercase">Intentionally designed</p><h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="mt-3 font-serif text-4xl font-semibold sm:text-5xl">Transparency is our standard.</h2><p data-pb-block="paragraph" data-pb-rich="body" class="mt-6 max-w-xl leading-relaxed">Every piece is independently tested by accredited laboratories. Our materials are chosen for performance, longevity, and peace of mind.</p><ul data-pb-block="list" data-pb-children class="mt-7 space-y-4"><li data-pb-block="list-item" data-pb-rich="content">No forever chemicals or mystery coatings</li><li data-pb-block="list-item" data-pb-rich="content">Third-party laboratory results published for every collection</li><li data-pb-block="list-item" data-pb-rich="content">Designed for repair, reuse, and a long life</li></ul><div data-pb-block="buttons" data-pb-children class="mt-8"><a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="rounded-full bg-accent-surface px-6 py-3 text-sm font-semibold text-accent-foreground no-underline">${linkSettings}Read our standards →</a></div></div>
</section>`,
    },
  ],
  [
    "home-footer",
    {
      label: "Commerce footer",
      category: "Footers",
      description: "Service promises, newsletter signup, and compact navigation columns.",
      content: `
<footer data-pb-block="group" data-pb-tag="tag" data-pb-children class="bg-surface text-foreground">
  <div data-pb-block="columns" data-pb-children class="grid grid-cols-2 border-y border-muted-border bg-muted-surface px-6 py-7 text-center text-xs font-semibold text-muted-foreground md:grid-cols-4"><div data-pb-block="column" data-pb-children>Free shipping over $90</div><div data-pb-block="column" data-pb-children>Hassle-free returns</div><div data-pb-block="column" data-pb-children>30-day home trial</div><div data-pb-block="column" data-pb-children>Lifetime support</div></div>
  <div data-pb-block="group" data-pb-tag="tag" data-pb-children class="pbe-container--on pbe-container--wide grid grid-cols-1 gap-12 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children><h2 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="font-serif text-3xl font-semibold">Unlock thoughtful living.</h2><p data-pb-block="paragraph" data-pb-rich="body" class="mt-3 max-w-sm text-sm leading-relaxed text-foreground opacity-70">New collections, useful guides, and recipes worth keeping—sent occasionally.</p><div data-pb-block="buttons" data-pb-children class="mt-6"><a data-pb-block="button" data-pb-rich="label" data-pb-link="url" href="#" class="rounded-full bg-accent-surface px-6 py-3 text-sm font-semibold text-accent-foreground no-underline">${linkSettings}Join the list →</a></div></div>
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="font-serif text-lg">Shop</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-4 text-sm leading-7 text-foreground opacity-70">Cookware<br>Bakeware<br>Storage<br>Kitchen tools</p></div>
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="font-serif text-lg">Company</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-4 text-sm leading-7 text-foreground opacity-70">Our story<br>Materials<br>Journal<br>Careers</p></div>
    <div data-pb-block="group" data-pb-tag="tag" data-pb-children><h3 data-pb-block="heading" data-pb-tag="level" data-pb-rich="text" class="font-serif text-lg">Help</h3><p data-pb-block="paragraph" data-pb-rich="body" class="mt-4 text-sm leading-7 text-foreground opacity-70">FAQ<br>Shipping<br>Returns<br>Contact</p></div>
  </div>
  <p data-pb-block="paragraph" data-pb-rich="body" class="border-t border-border px-8 py-6 text-center text-xs text-foreground opacity-70">© 2026 Hearth &amp; Home · Terms · Privacy · Accessibility</p>
</footer>`,
    },
  ],
];

export function registerHomepagePatterns(): void {
  for (const [name, def] of HOMEPAGE_PATTERNS) registerPattern(name, def);
}
