//! The editor build: `editor_gen <editor_dir> <ui_dir> <icons_dir> <runtime_dir> <jit_wasm> <preflight_css> <default_theme_zon> <out_dir>`.
//!
//! Lowers every `.ptsx` and `.ts` under the editor's source directories, the design
//! system's `src`, the gallery theme and the icon set through the DOM target into ES
//! modules, keeping the workspace's directory shape so the relative imports keep
//! resolving. Copies the runtime and the jit engine beside them, writes the class
//! manifest the admin's stylesheet is compiled from, the manual tests as a module the
//! harness loads its fixtures from, and the pages, whose import map resolves the bare
//! `publr` specifiers.
//!
//! With `--admin` as an eighth argument it writes the build Publr serves under
//! `/admin/editor/`: bare `publr` specifiers point at the admin's own runtime files
//! (`/admin/publr.js`, `/admin/publr-dom.js`, ...), so the page runs one PublrJS; no
//! runtime copies and no harness pages; and a `files.zig` that embeds every file.
//!
//! Run from `zig build`; no node anywhere.
const std = @import("std");
const publr_icons = @import("publr_icons");
const pjsx = @import("pjsx");

const file_bytes_max = 4 << 20;
const runtime_import = "publr-jsx";

/// The editor's source directories, lowered into `editor/<dir>`.
const source_dirs = [_][]const u8{ "model", "blocks", "canvas", "shell", "host", "design", "moodboard", "harness", "tests/unit" };

const Gen = struct {
    arena: std.mem.Allocator,
    io: std.Io,
    out: std.Io.Dir,
    /// Every class token the lowered `.ptsx` modules name, for `classes.txt`.
    classes: std.StringArrayHashMapUnmanaged(void) = .empty,
    lowered: u32 = 0,
    failures: u32 = 0,
    /// The build Publr serves: bare specifiers point at the admin's runtime.
    admin: bool = false,
    /// Every file written, for `files.zig`.
    written: std.ArrayList([]const u8) = .empty,
};

pub fn main(init: std.process.Init) u8 {
    return run(init) catch |err| {
        std.debug.print("editor_gen: {s}\n", .{@errorName(err)});
        return 1;
    };
}

fn usage() u8 {
    std.debug.print("usage: editor_gen <editor_dir> <ui_dir> <icons_dir> <runtime_dir> <jit_wasm> <preflight_css> <default_theme_zon> <out_dir>\n", .{});
    return 2;
}

fn run(init: std.process.Init) !u8 {
    const arena = init.arena.allocator();
    const io = init.io;
    var args = try init.minimal.args.iterateAllocator(arena);
    _ = args.next();
    const editor_dir = args.next() orelse return usage();
    const ui_dir = args.next() orelse return usage();
    const icons_dir = args.next() orelse return usage();
    const runtime_dir = args.next() orelse return usage();
    const jit_wasm = args.next() orelse return usage();
    const preflight_css = args.next() orelse return usage();
    const default_theme = args.next() orelse return usage();
    const out_dir_path = args.next() orelse return usage();
    const admin = if (args.next()) |flag| std.mem.eql(u8, flag, "--admin") else false;
    if (args.next() != null) return usage();

    const cwd = std.Io.Dir.cwd();
    try cwd.createDirPath(io, out_dir_path);
    var gen: Gen = .{
        .arena = arena,
        .io = io,
        .out = try cwd.openDir(io, out_dir_path, .{}),
        .admin = admin,
    };
    defer gen.out.close(io);

    for (source_dirs) |dir| {
        if (admin and (std.mem.eql(u8, dir, "harness") or std.mem.eql(u8, dir, "tests/unit"))) continue;
        try lower_tree(&gen, editor_dir, dir, try std.fmt.allocPrint(arena, "editor/{s}", .{dir}));
    }
    try lower_tree(&gen, ui_dir, "src", "ui/src");
    try lower_file(&gen, ui_dir, "gallery/app/runtime/theme.ts", "ui/gallery/app/runtime/theme.js");
    try lower_file(&gen, icons_dir, "src/index.ts", "icons/src/index.js");
    // The runtime adapter re-exports the runtime's source tree; here the runtime is the
    // built one, reached by the import map.
    try write_out(&gen, "ui/src/publr-runtime.js", "export * from \"publr\";\n");
    if (gen.failures != 0) {
        std.debug.print("editor_gen: {d} of {d} modules did not lower\n", .{ gen.failures, gen.lowered + gen.failures });
        return 1;
    }

    if (!admin) try copy_tree(&gen, runtime_dir, "runtime", ".js");
    try copy_file(&gen, jit_wasm, "runtime/jit_engine.wasm");
    try copy_file(&gen, preflight_css, "preflight.css");
    try write_default_theme(&gen, default_theme);
    try copy_file(&gen, try std.fs.path.join(arena, &.{ ui_dir, "gallery/app/styles/gallery.css" }), "palette.css");
    try copy_file(&gen, try std.fs.path.join(arena, &.{ editor_dir, "canvas/canvas.css" }), "editor/canvas/canvas.css");
    try copy_file(&gen, try std.fs.path.join(arena, &.{ editor_dir, "harness/site.css" }), "editor/harness/site.css");
    try copy_file(&gen, try std.fs.path.join(arena, &.{ editor_dir, "harness/hearth.css" }), "editor/harness/hearth.css");
    try write_classes(&gen);
    if (admin) {
        try write_files(&gen);
        return 0;
    }
    try write_manual(&gen, try std.fs.path.join(arena, &.{ editor_dir, "tests/manual" }));
    for (pages) |page| {
        try gen.out.writeFile(io, .{
            .sub_path = page.path,
            .data = try page_html(&gen, page),
        });
    }

    return 0;
}

/// Lowers every source file under `<root>/<sub>` into `<out>/<prefix>/...`.
fn lower_tree(gen: *Gen, root: []const u8, sub: []const u8, prefix: []const u8) !void {
    const base = try std.fs.path.join(gen.arena, &.{ root, sub });
    var dir = std.Io.Dir.cwd().openDir(gen.io, base, .{
        .iterate = true,
    }) catch |err| switch (err) {
        error.FileNotFound => return,
        else => return err,
    };
    defer dir.close(gen.io);
    var walker = try dir.walk(gen.arena);
    defer walker.deinit();

    while (try walker.next(gen.io)) |entry| {
        if (entry.kind != .file) continue;
        const name = entry.basename;
        const source_kind: enum { ptsx, ts, skip } = if (std.mem.endsWith(u8, name, ".ptsx"))
            .ptsx
        else if (std.mem.endsWith(u8, name, ".d.ts"))
            .skip
        else if (std.mem.endsWith(u8, name, ".ts"))
            .ts
        else
            .skip;
        if (source_kind == .skip) continue;

        const stem = name[0 .. name.len - (if (source_kind == .ptsx) @as(usize, 5) else 3)];
        const rel_dir = std.fs.path.dirname(entry.path) orelse "";
        const out_path = try std.fmt.allocPrint(gen.arena, "{s}/{s}{s}{s}.js", .{
            prefix, rel_dir, if (rel_dir.len > 0) "/" else "", stem,
        });
        try lower_file(gen, base, try gen.arena.dupe(u8, entry.path), out_path);
    }
}

fn lower_file(gen: *Gen, root: []const u8, sub_path: []const u8, out_path: []const u8) !void {
    const filename = try std.fs.path.join(gen.arena, &.{ root, sub_path });
    const source = try std.Io.Dir.cwd().readFileAlloc(gen.io, filename, gen.arena, .limited(file_bytes_max));
    var resolver = pjsx.FileResolver{
        .io = gen.io,
    };
    const output = pjsx.dom.transformPjsxToDom(gen.arena, source, .{
        .filename = filename,
        .runtime_import = runtime_import,
        .resolver = resolver.resolver(),
    }) catch {
        std.debug.print("{s}: {s}\n", .{ filename, pjsx.lastError() });
        gen.failures += 1;
        return;
    };
    if (std.mem.endsWith(u8, filename, ".ptsx")) try collect_classes(gen, source, filename);
    try write_out(gen, out_path, try browser_specifiers(gen.arena, output.code, gen.admin));
    gen.lowered += 1;
}

/// The class tokens the admin's stylesheet is compiled from: what its class scan
/// collects from its views, here over the editor's chrome and the design system.
fn collect_classes(gen: *Gen, source: []const u8, filename: []const u8) !void {
    const tokens = pjsx.analyze.collectSourceClassTokens(gen.arena, source, filename) catch {
        std.debug.print("{s}: classes: {s}\n", .{ filename, pjsx.lastError() });
        gen.failures += 1;
        return;
    };
    for (tokens) |token| try gen.classes.put(gen.arena, token, {});
}

fn write_classes(gen: *Gen) !void {
    const tokens = gen.classes.keys();
    std.mem.sort([]const u8, tokens, {}, string_less_than);
    var out: std.Io.Writer.Allocating = .init(gen.arena);
    for (tokens) |token| try out.writer.print("{s}\n", .{token});
    try write_out(gen, "classes.txt", out.written());
}

/// `editor/harness/generated/manual.js`: every manual test, parsed. A test is a
/// markdown file with a `title:` front matter line, a `## Checks` list, and fences:
/// the first `html` fence is the fixture, a `json` fence with a `tokens` key is a
/// theme, any other `json` fence is the editor's policy.
fn write_manual(gen: *Gen, manual_dir: []const u8) !void {
    var dir = try std.Io.Dir.cwd().openDir(gen.io, manual_dir, .{
        .iterate = true,
    });
    defer dir.close(gen.io);
    var walker = try dir.walk(gen.arena);
    defer walker.deinit();
    var paths: std.ArrayList([]const u8) = .empty;
    while (try walker.next(gen.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.basename, ".md")) continue;
        if (std.mem.eql(u8, entry.path, "README.md")) continue;
        try paths.append(gen.arena, try gen.arena.dupe(u8, entry.path));
    }
    std.mem.sort([]const u8, paths.items, {}, string_less_than);

    var out: std.Io.Writer.Allocating = .init(gen.arena);
    const w = &out.writer;
    try w.writeAll("// Generated by editor_gen from tests/manual: one entry per manual test.\nexport const manualTests = [\n");
    for (paths.items) |path| {
        const source = try dir.readFileAlloc(gen.io, path, gen.arena, .limited(file_bytes_max));
        const test_case = parse_manual(source);
        const key = path[0 .. path.len - ".md".len];
        const slash = std.mem.indexOfScalar(u8, key, '/') orelse 0;
        try w.writeAll("  { key: ");
        try write_json_string(w, key);
        try w.writeAll(", group: ");
        try write_json_string(w, key[0..slash]);
        try w.writeAll(", title: ");
        try write_json_string(w, test_case.title);
        try w.writeAll(", intro: ");
        try write_json_string(w, test_case.intro);
        try w.print(", wide: {}, checks: [", .{test_case.wide});
        var checks = std.mem.splitScalar(u8, test_case.checks, '\n');
        var first = true;
        while (checks.next()) |line| {
            const trimmed = std.mem.trim(u8, line, " \t\r");
            if (!std.mem.startsWith(u8, trimmed, "- [ ] ")) continue;
            if (!first) try w.writeAll(", ");
            first = false;
            try write_json_string(w, trimmed["- [ ] ".len..]);
        }
        try w.writeAll("], fixture: ");
        try write_json_string(w, test_case.fixture);
        try w.writeAll(", policy: ");
        try write_json_string(w, test_case.policy);
        try w.writeAll(", theme: ");
        try write_json_string(w, test_case.theme);
        try w.writeAll(" },\n");
    }
    try w.writeAll("];\n");
    try write_out(gen, "editor/harness/generated/manual.js", out.written());
}

const ManualTest = struct {
    title: []const u8 = "",
    intro: []const u8 = "",
    checks: []const u8 = "",
    fixture: []const u8 = "",
    policy: []const u8 = "",
    theme: []const u8 = "",
    wide: bool = false,
};

fn parse_manual(source: []const u8) ManualTest {
    var result: ManualTest = .{};
    var body = source;
    if (std.mem.startsWith(u8, source, "---\n")) {
        if (std.mem.indexOfPos(u8, source, 4, "\n---\n")) |end| {
            var lines = std.mem.splitScalar(u8, source[4..end], '\n');
            while (lines.next()) |line| {
                if (std.mem.startsWith(u8, line, "title:")) {
                    result.title = std.mem.trim(u8, line["title:".len..], " \"");
                } else if (std.mem.startsWith(u8, line, "wide:")) {
                    result.wide = std.mem.indexOf(u8, line, "true") != null;
                }
            }
            body = source[end + "\n---\n".len ..];
        }
    }
    const first_heading = std.mem.indexOf(u8, body, "\n## ") orelse body.len;
    result.intro = std.mem.trim(u8, body[0..first_heading], " \n");
    if (std.mem.indexOf(u8, body, "## Checks")) |at| {
        const rest = body[at..];
        const end = std.mem.indexOfPos(u8, rest, 1, "\n## ") orelse rest.len;
        result.checks = rest[0..end];
    }
    // A fence starts a line; "```json" in prose is not one.
    var rest = body;
    while (std.mem.indexOf(u8, rest, "\n```")) |newline| {
        const open = newline + 1;
        const info_end = std.mem.indexOfScalarPos(u8, rest, open, '\n') orelse break;
        const info = std.mem.trim(u8, rest[open + 3 .. info_end], " \r");
        const close = std.mem.indexOfPos(u8, rest, info_end + 1, "\n```") orelse break;
        const content = rest[info_end + 1 .. close];
        if (std.mem.eql(u8, info, "html") and result.fixture.len == 0) {
            result.fixture = content;
        } else if (std.mem.eql(u8, info, "json")) {
            if (std.mem.indexOf(u8, content, "\"tokens\"") != null) result.theme = content else result.policy = content;
        }
        rest = rest[close + 4 ..];
    }
    return result;
}

fn write_json_string(w: *std.Io.Writer, value: []const u8) !void {
    try w.writeByte('"');
    for (value) |c| switch (c) {
        '"' => try w.writeAll("\\\""),
        '\\' => try w.writeAll("\\\\"),
        '\n' => try w.writeAll("\\n"),
        '\r' => {},
        '\t' => try w.writeAll("\\t"),
        '<' => try w.writeAll("\\u003c"),
        else => if (c < 0x20) try w.print("\\u{x:0>4}", .{c}) else try w.writeByte(c),
    };
    try w.writeByte('"');
}

/// The compiler rewrites `.ptsx` imports to `.js` but passes TypeScript-style
/// specifiers through; a browser resolves none of those, so every relative
/// specifier in the output ends in `.js` exactly once.
fn browser_specifiers(arena: std.mem.Allocator, code: []const u8, admin: bool) ![]const u8 {
    var out: std.Io.Writer.Allocating = .init(arena);
    const w = &out.writer;
    var rest = code;
    while (std.mem.indexOf(u8, rest, "\"")) |open| {
        const close = std.mem.indexOfScalarPos(u8, rest, open + 1, '"') orelse break;
        const specifier = rest[open + 1 .. close];
        const before = std.mem.trimEnd(u8, rest[0..open], " \t\n");
        const is_import = std.mem.endsWith(u8, before, "from") or std.mem.endsWith(u8, before, "import") or std.mem.endsWith(u8, before, "import(");
        try w.writeAll(rest[0 .. open + 1]);
        if (is_import and specifier.len > 0 and specifier[0] == '.') {
            var stem = specifier;
            for ([_][]const u8{ ".ptsx", ".tsx", ".ts", ".js" }) |extension| {
                if (std.mem.endsWith(u8, stem, extension)) {
                    stem = stem[0 .. stem.len - extension.len];
                    break;
                }
            }
            try w.print("{s}.js", .{stem});
        } else if (is_import and admin and std.mem.eql(u8, specifier, "publr-jsx")) {
            try w.writeAll("/admin/publr-jsx.js");
        } else if (is_import and admin and std.mem.eql(u8, specifier, "publr")) {
            try w.writeAll("/admin/publr.js");
        } else if (is_import and admin and std.mem.startsWith(u8, specifier, "publr/")) {
            try w.print("/admin/publr-{s}.js", .{specifier["publr/".len..]});
        } else {
            try w.writeAll(specifier);
        }
        try w.writeAll("\"");
        rest = rest[close + 1 ..];
    }
    try w.writeAll(rest);
    return out.written();
}

fn write_out(gen: *Gen, out_path: []const u8, data: []const u8) !void {
    if (std.fs.path.dirname(out_path)) |dir| try gen.out.createDirPath(gen.io, dir);
    try gen.out.writeFile(gen.io, .{
        .sub_path = out_path,
        .data = data,
    });
    try gen.written.append(gen.arena, try gen.arena.dupe(u8, out_path));
}

/// `files.zig`: every file of the admin build, embedded, by the path it is served at.
fn write_files(gen: *Gen) !void {
    std.mem.sort([]const u8, gen.written.items, {}, string_less_than);
    var out: std.Io.Writer.Allocating = .init(gen.arena);
    const w = &out.writer;
    try w.writeAll("//! Generated by editor_gen --admin: the editor's files, by the path under /admin/editor/.\n");
    try w.writeAll("pub const File = struct { path: []const u8, data: []const u8 };\n\npub const files = [_]File{\n");
    for (gen.written.items) |path| try w.print("    .{{ .path = \"{s}\", .data = @embedFile(\"{s}\") }},\n", .{ path, path });
    try w.writeAll("};\n");
    try gen.out.writeFile(gen.io, .{
        .sub_path = "files.zig",
        .data = out.written(),
    });
}

/// The jit's default theme as a module the design system builder imports: the tokens
/// every app's stylesheet starts from (`editor/design/model/jit-defaults.js`).
fn write_default_theme(gen: *Gen, from: []const u8) !void {
    const Theme = struct {
        tokens: []const struct {
            name: []const u8,
            value: []const u8,
        },
    };
    const source = try std.Io.Dir.cwd().readFileAllocOptions(gen.io, from, gen.arena, .limited(file_bytes_max), .of(u8), 0);
    const theme = try std.zon.parse.fromSliceAlloc(Theme, gen.arena, source, null, .{
        .ignore_unknown_fields = true,
    });
    var out: std.Io.Writer.Allocating = .init(gen.arena);
    try out.writer.writeAll("// Generated by editor_gen from the jit's default-theme.zon.\nexport const JIT_DEFAULT_TOKENS = ");
    try std.json.Stringify.value(theme.tokens, .{}, &out.writer);
    try out.writer.writeAll(";\n");
    try write_out(gen, "editor/design/model/jit-defaults.js", out.written());
}

fn copy_file(gen: *Gen, from: []const u8, out_path: []const u8) !void {
    const data = try std.Io.Dir.cwd().readFileAlloc(gen.io, from, gen.arena, .limited(64 << 20));
    try write_out(gen, out_path, data);
}

fn copy_tree(gen: *Gen, from: []const u8, out_prefix: []const u8, extension: []const u8) !void {
    var dir = try std.Io.Dir.cwd().openDir(gen.io, from, .{
        .iterate = true,
    });
    defer dir.close(gen.io);
    var walker = try dir.walk(gen.arena);
    defer walker.deinit();
    while (try walker.next(gen.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.basename, extension)) continue;
        const source = try std.fs.path.join(gen.arena, &.{ from, entry.path });
        const out_path = try std.fs.path.join(gen.arena, &.{ out_prefix, entry.path });
        try copy_file(gen, source, try gen.arena.dupe(u8, out_path));
    }
}

fn string_less_than(_: void, a: []const u8, b: []const u8) bool {
    return std.mem.lessThan(u8, a, b);
}

const Page = struct {
    path: []const u8,
    title: []const u8,
    entry: []const u8,
};

/// The harness pages: the demo editor, the manual tests, and the unit tests.
const pages = [_]Page{
    .{
        .path = "index.html",
        .title = "Editor",
        .entry = "./editor/harness/main.js",
    },
    .{
        .path = "manual.html",
        .title = "Editor manual tests",
        .entry = "./editor/harness/manual.js",
    },
    .{
        .path = "tests.html",
        .title = "Editor unit tests",
        .entry = "./editor/tests/unit/run.js",
    },
    .{
        .path = "fields.html",
        .title = "Editor on rich text fields",
        .entry = "./editor/harness/fields.js",
    },
    .{
        .path = "design.html",
        .title = "Design system",
        .entry = "./editor/harness/design.js",
    },
    .{
        .path = "moodboard.html",
        .title = "Moodboard",
        .entry = "./editor/harness/moodboard.js",
    },
};

/// A page: the head with the import map, the mount point, the entry module and the
/// icon sprite the way a server writes it.
fn page_html(gen: *Gen, page: Page) ![]const u8 {
    var out: std.Io.Writer.Allocating = .init(gen.arena);
    const w = &out.writer;
    try w.print(page_head, .{page.title});
    try w.print("<div id=\"app\"></div>\n<script type=\"module\" src=\"{s}\"></script>\n", .{page.entry});
    try w.writeAll("<svg id=\"publr-icon-sprite\" style=\"position:absolute;width:0;height:0;overflow:hidden\" aria-hidden=\"true\">");
    inline for (@typeInfo(publr_icons.Name).@"enum".fields) |field| {
        const name = comptime publr_icons.kebab(field.name);
        try w.print("<symbol id=\"publr-icon-{s}\" viewBox=\"{s}\" fill=\"none\">{s}</symbol>", .{ name, publr_icons.view_box, @field(publr_icons, field.name) });
    }
    try w.writeAll("</svg>\n</body>\n</html>\n");
    return out.written();
}

const page_head =
    \\<!doctype html>
    \\<html lang="en">
    \\<head>
    \\<meta charset="utf-8">
    \\<meta name="viewport" content="width=device-width, initial-scale=1">
    \\<title>{s}</title>
    \\<link rel="stylesheet" href="./preflight.css">
    \\<link rel="stylesheet" href="./palette.css">
    \\<script type="importmap">
    \\{{"imports":{{
    \\"publr-jsx":"./runtime/publr-jsx.js",
    \\"publr":"./runtime/publr.js",
    \\"publr/dom":"./runtime/publr-dom.js",
    \\"publr/html":"./runtime/publr-html.js",
    \\"publr/runtime":"./runtime/publr-runtime.js",
    \\"publr/transport":"./runtime/publr-transport.js",
    \\"publr/query":"./runtime/publr-query.js",
    \\"publr/focus":"./runtime/publr-focus.js",
    \\"publr/position":"./runtime/publr-position.js",
    \\"publr/router":"./runtime/publr-router.js",
    \\"publr/class-merge":"./runtime/publr-class-merge.js"
    \\}}}}
    \\</script>
    \\</head>
    \\<body class="bg-background text-foreground">
    \\
;
