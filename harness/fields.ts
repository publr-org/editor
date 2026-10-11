// The embed showcase: three rich text fields in a form, each its own editor (its own
// history and selection), each offering the formats its field allows.
import { mountRichFields } from "../host/boot";
import { startChrome, siteStyles } from "./chrome";
import { DEMO_THEME } from "./demo-theme";

await startChrome();
const app = document.getElementById("app")!;
app.className = "mx-auto grid max-w-2xl gap-6 p-8";
app.innerHTML = "";
const form = document.createElement("form");
form.id = "record";
form.className = "grid gap-6";
const fields = [
  { name: "summary", label: "Summary (bold, italic, link)", formats: undefined, value: "<p>A field written <strong>before</strong> the editor existed.</p>" },
  { name: "note", label: "Note (bold only)", formats: "bold", value: "" },
  { name: "plain", label: "Plain (no formats)", formats: "", value: "Just text." },
];
for (const field of fields) {
  const label = document.createElement("label");
  label.className = "grid gap-1.5 text-sm font-medium";
  label.textContent = field.label;
  const textarea = document.createElement("textarea");
  textarea.name = field.name;
  textarea.setAttribute("data-rich-text", "");
  if (field.formats !== undefined) textarea.dataset.formats = field.formats;
  textarea.value = field.value;
  label.append(textarea);
  form.append(label);
}
const output = document.createElement("pre");
output.setAttribute("data-form-values", "");
output.className = "whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-2xs";
form.addEventListener("input", () => {
  output.textContent = JSON.stringify(Object.fromEntries(new FormData(form)), null, 1);
});
app.append(form, output);
await mountRichFields(document, { base: new URL("../../", import.meta.url).href, siteStyles, theme: DEMO_THEME });
document.documentElement.setAttribute("data-editor-ready", "");
