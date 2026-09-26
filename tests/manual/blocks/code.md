---
title: Code
---

A pre with one plain-text `code` carrier. The carrier sits on `<pre>`, so it is
preformatted by derivation — newlines are content, Enter never splits.

## Checks

- [ ] The snippet keeps its indentation and blank line exactly as written.
- [ ] The `&lt;` in the fixture renders as a literal < character.
- [ ] Click into the code — caret lands, typing updates it live.
- [ ] Enter inserts a newline inside the block — it never splits into two blocks.
- [ ] Add an indented line, click elsewhere, come back — the whitespace survives.
- [ ] The second, empty code block shows the ghost prompt "Write code…".
- [ ] Select the block — the breadcrumb reads Document › Code; undo reverts the last edit.

## Fixture

```html
<pre data-pb-block="code" data-pb-text="code">
fn main() {
    let total = 1 + 2;

    if total &lt; 4 {
        println!("small: {}", total);
    }
}</pre
>
<pre data-pb-block="code" data-pb-text="code"></pre>
```
