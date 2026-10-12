# Editor integration contract (CMS side)

How the core hosts the editor, as agreed on 2026-10-08 (`../.agents/specs/editor-rewrite.md`,
"What stays"). The editor talks to the CMS only through this surface.

- **Which types.** A content type with `editor` `visual` is edited by the editor over one
  rich text field: the one `editor_config` `{"field": …}` names, else the type's first.
  Every `rich` control in a form mounts the editor inline, offering the formats the field
  allows (`options.richtext.formats`).
- **Value.** The field holds the editor's annotated HTML (the wire contract), one copy.
  Plain HTML in a field opens as paragraphs. The CMS sanitizes on the way out: a page
  printing the value gets plain markup.
- **Saving.** The editor keeps the field's control inside `form#record` current and fires
  a bubbling `input`; the record editor's autosave posts it as `record.save` with
  `expected_version`. A conflict comes back as the record editor's recovery, never
  swallowed.
- **The page.** On a visual record the editor fills the sheet; the record's own editor
  (status, actions, the other fields) is mounted in its Entry panel.
- **Delivery.** The editor's ES modules are built into the Publr binary and served under
  `/admin/editor/`. They import the admin's own PublrJS runtime: the build rewrites bare
  specifiers to `publr-jsx.js`, `publr.js` and `publr-<addon>.js` in the admin's folder,
  by a relative path (`../../../publr.js` from `editor/host/apps.js`) so an admin under a
  base path (an environment, the browser build at a worker's scope) finds them too, and
  there is no import map. `ui/layouts/Document.ptsx` loads
  `/admin/editor/editor/host/admin.js` as a module on every admin page; nothing is inline.
- **The site.** `data-editor-site` on the record's wrapper holds `{"styles", "theme"}`:
  the editor's reset and the app's `/_app/app.css`, and the tokens the app declares. The
  canvas draws with them; the chrome keeps the admin's stylesheet.
- **Media.** Uploads go to `POST /media/upload?filename=<name>` (the file's bytes, with
  `X-Csrf-Token`) and come back as the library's file; picking opens a grid of the
  library through `media.list`, as the person signed in. The editor never uploads
  elsewhere.
- **Design system.** `/admin/design/system` carries `data-design-system="<app>"`,
  `data-fonts` (`[{family, url}]`) and the app's tokens in `data-editor-site`; the builder
  saves `design.save_system {app, tokens, fonts}`. Roles are kept as tokens
  (`color-primary: var(--color-brand)`) and read back from them, so the app's tokens are
  the whole system.
- **Moodboard.** `/admin/design/moodboard` carries `data-moodboard="<app>"` and
  `data-items` (the board); every change saves `design.save_moodboard {app, items}`, a
  moment after the last one.
- **Templates and patterns.** Host hooks give the editor the route's template, its parts
  and the app's patterns, and save overrides as records (`template`, `template_part`,
  `pattern`); the CMS renders published overrides in place of the file's region.
- **Tests.** Browser end-to-end tests cover create, edit and publish through the editor.
