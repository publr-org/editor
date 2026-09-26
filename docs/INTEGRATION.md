# Editor integration contract (CMS side)

From the core roadmap §3.5, with the vocabulary of the current core (`record`,
`expected_version`). The CMS registers an editor per content type; the editor
never talks to the CMS except through this surface and the operation table.

```zig
pub const Editor = struct {
    id: []const u8,                          // "form" | "block" | plugin ids
    assets: []const Asset,                   // served at /admin/editors/<id>/<name>
    full_bleed: bool = false,                // layout hint (replaces "takeover" inference)
    bootstrap: *const fn (EditorArgs, *std.Io.Writer) anyerror!void,
};
pub const EditorArgs = struct {
    def: *const ContentTypeDef,              // def.editor, def.editor_config (validated)
    record: *const Record,                   // already loaded
    form_id: []const u8,                     // "entry-form"
    csrf: []const u8,
};
```

- The editor keeps `<input name=<content_field>>` and `<input name=<editing_field>>`
  current inside `#entry-form` and fires a bubbling `input` on change.
- Saving is the ordinary `record.save` operation, posted as `op=record.save` to
  `/admin/action`, carrying `expected_version` for optimistic concurrency; a 409
  is shown by the editor as a recovery, never swallowed.
- Boot JS ships as a real `.js` asset (CSP-compatible), never inline.
- The CMS stores editor HTML as opaque data but owns the trust policy: stored
  content is sanitised on the way out for any public render, and the media
  adapter endpoints are the only upload path.
- Themes, design, templates and preview are not part of this contract; they
  return with a site plugin through the editor's own host seams.
- Browser end-to-end tests cover create → edit → publish through the editor.
