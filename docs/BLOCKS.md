# Blocks the rewrite must cover

The 31 blocks the previous editor shipped, by the names its wire contract uses
(`data-pb-block="<name>"`). Each has a manual spec under `tests/manual/blocks/`
with a fixture in the exact carrier markup its `render()` emitted.

accordion · audio · button · buttons · code · columns · container · cover ·
details · embed · file · gallery · group · heading · html · icon · image ·
list · math · media-text · paragraph · preformatted · pullquote · quote ·
separator · spacer · table · verse · video

Internal, parent-scoped (covered by the parent's spec): accordion-item ·
column · list-item.

Patterns are a manifest concept, not blocks: a named composition inserted as a
fragment (see `docs/WIRE-CONTRACT.md`, "Patterns").
