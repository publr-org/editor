---
title: File
---

Link to a downloadable file: a main anchor carrying the rich `name` and the
`href` link carrier, plus an always-present download-button anchor whose
label is the `downloadLabel` text field. `showDownloadButton` hides the
button with a derived class; the button's href mirrors the link field.

## Checks

- [ ] The first file renders a grey bar: filename on the left, blue Download button on the right; clicking selects it, breadcrumb reads Document › File.
- [ ] The filename is editable rich text; when cleared it shows the "File name…" ghost.
- [ ] The Download button label is editable text ("Download" by default).
- [ ] Sidebar "File URL" shows https://example.com/whitepaper.pdf; editing it updates both anchors' href in the wire output (⋮ → Show output).
- [ ] The second file shows no Download button — sidebar "Show download button" is OFF; toggling it ON reveals the button, undo hides it again.
- [ ] Wire output: only the second file carries a settings island; the hidden button anchor is still present in the markup.

## Fixture

```html
<div
  data-pb-block="file"
  class="flex items-center justify-between gap-4 rounded-sm bg-neutral-100 px-4 py-3"
>
  <a
    data-pb-rich="name"
    data-pb-link="href"
    href="https://example.com/whitepaper.pdf"
    class="min-w-0 font-semibold [overflow-wrap:anywhere] text-inherit no-underline"
    >whitepaper.pdf</a
  >
  <a
    href="https://example.com/whitepaper.pdf"
    download
    data-pb-text="downloadLabel"
    class="flex-none rounded-sm bg-[var(--color-accent,#3858e9)] px-3.5 py-1.5 text-[13px] font-semibold text-white no-underline"
    >Download</a
  >
</div>
<div
  data-pb-block="file"
  class="flex items-center justify-between gap-4 rounded-sm bg-neutral-100 px-4 py-3"
>
  <script type="application/json" data-pb-settings>
    { "showDownloadButton": false }
  </script>
  <a
    data-pb-rich="name"
    data-pb-link="href"
    href="https://example.com/press-kit.zip"
    class="min-w-0 font-semibold [overflow-wrap:anywhere] text-inherit no-underline"
    >press-kit.zip</a
  >
  <a
    href="https://example.com/press-kit.zip"
    download
    data-pb-text="downloadLabel"
    class="flex-none rounded-sm bg-[var(--color-accent,#3858e9)] px-3.5 py-1.5 text-[13px] font-semibold text-white no-underline hidden"
    >Download</a
  >
</div>
```
