// The inline formatting engine: marks as set arithmetic over character ranges.
import { linkIn, linkTargetIn, marksIn, normalize, plainText, setLink, splitAt, textLength, toggleMark } from "../../model/format";
import { equal, ok, same, test } from "./harness";

test("bold toggles on and off over a range", () => {
  const on = toggleMark("Hello world", 0, 5, "bold");
  equal(on, "<strong>Hello</strong> world");
  equal(toggleMark(on, 0, 5, "bold"), "Hello world");
});

test("toggling a partly bold range bolds all of it", () => {
  equal(toggleMark("<strong>He</strong>llo", 0, 5, "bold"), "<strong>Hello</strong>");
});

test("marks nest in canonical order and merge", () => {
  const html = toggleMark(toggleMark("abc", 0, 3, "italic"), 0, 3, "bold");
  equal(html, "<strong><em>abc</em></strong>");
  same([...marksIn(html, 0, 3)].sort(), ["bold", "italic"]);
});

test("structural elements keep their identity", () => {
  const html = "<dl><dt>a</dt><dt>b</dt></dl>";
  equal(toggleMark(html, 0, 2, "bold"), "<dl><dt><strong>a</strong></dt><dt><strong>b</strong></dt></dl>");
});

test("atoms survive formatting", () => {
  const html = toggleMark("a<br>b", 0, 2, "italic");
  equal(html, "<em>a<br>b</em>");
});

test("links set, read and clear", () => {
  const linked = setLink("go here", 3, 7, "https://example.com");
  equal(linked, `go <a href="https://example.com">here</a>`);
  equal(linkIn(linked, 4, 5), "https://example.com");
  equal(setLink(linked, 3, 7, null), "go here");
});

test("a classed strong is structure, not a bold mark", () => {
  const html = `<strong class="x">a</strong>`;
  ok(!marksIn(html, 0, 1).has("bold"));
});

test("split keeps marks on both sides", () => {
  same(splitAt("one <em>two three</em>", 8), ["one <em>two </em>", "<em>three</em>"]);
  same(splitAt("abc", 3), ["abc", ""]);
  same(splitAt("abc", 0), ["", "abc"]);
});

test("lengths and plain text count characters only", () => {
  equal(textLength("a <b>bc</b><br>"), 4);
  equal(plainText("a <b>bc</b>"), "a bc");
});

test("escaping round-trips", () => {
  equal(toggleMark("a &lt; b", 0, 1, "bold"), "<strong>a</strong> &lt; b");
});

test("a link opening in a new tab: target and rel written, read back and round-tripped", () => {
  const linked = setLink("go here", 3, 7, "https://example.com", "_blank");
  equal(linked, `go <a href="https://example.com" target="_blank" rel="noopener">here</a>`);
  equal(linkIn(linked, 4, 5), "https://example.com");
  equal(linkTargetIn(linked, 4, 5), "_blank");
  equal(normalize(linked), linked);
  equal(setLink(linked, 3, 7, "https://example.com"), `go <a href="https://example.com">here</a>`);
  equal(linkTargetIn(setLink(linked, 3, 7, "https://example.com"), 4, 5), "");
});

test("an anchor with another target or rel stays structural, never a link mark", () => {
  const html = `go <a href="/x" target="_self">here</a>`;
  equal(linkIn(html, 4, 5), null);
  equal(normalize(html), html);
  const loose = `go <a href="/x" target="_blank">here</a>`;
  equal(linkIn(loose, 4, 5), null);
  equal(normalize(loose), loose);
});
