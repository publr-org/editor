// A template as its file draws it, opened in the editor: the file's markers are blocks.
import { downcast, upcastBlocks } from "../../model/codec";
import { fromFile } from "../../host/hosted";
import { equal, same, test } from "./harness";

const FILE = `<h1 data-publr-slot="title" class="text-brand"></h1><div data-publr-slot="content"></div><p class="file-note">From the file</p><header data-publr-template-part="header"><p>File header</p></header>`;

test("a file's slots and parts open as template blocks, keeping each slot's element and classes", () => {
  const blocks = upcastBlocks(fromFile(FILE));
  same(blocks.map((block) => block.type), ["template-slot", "template-slot", "raw-html", "template-part"]);
  equal(blocks[0].fields.tag, "h1");
  equal(blocks[0].settings.slot, "title");
  equal(blocks[1].settings.slot, "content");
  equal(blocks[3].settings.part, "header");
  const out = downcast(blocks, "data");
  equal(out.includes('<h1 data-publr-slot="title" class="text-brand"></h1>'), true, out);
  equal(out.includes('data-publr-slot="content"'), true);
  equal(out.includes('data-publr-template-part="header"'), true);
  equal(out.includes("File header"), false, "a part is drawn from its own source");
});

test("markup without markers is left as it is", () => {
  equal(fromFile("<p>Plain</p>"), "<p>Plain</p>");
});
