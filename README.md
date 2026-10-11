# Publr Editor

The block editor, rebuilt from scratch in PJSX on the design-system components
and idiomatic PublrJS. Status: **ported** (model, blocks, canvas, the shell, the design
system builder and the moodboard; `zig build serve`, then http://127.0.0.1:8300; see
`../.agents/specs/editor-rewrite.md`). `CONTRACT.md` is what it will honour;
`docs/` is the inherited spec; `tests/manual/` are the 57 behavioural specs
(blocks, features, issues) it must pass, each with its fixture.

The previous editor (`publr-editor` in the old workspace) is reference only:
its wire contract and specs are inherited here, its source is not.
