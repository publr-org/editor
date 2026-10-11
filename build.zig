const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // The jit engine the canvas compiles the classes typed into blocks with.
    const jit = b.dependency("publr_jit", .{
        .target = target,
        .optimize = optimize,
    });
    const engine = b.addExecutable(.{
        .name = "jit_engine",
        .root_module = b.createModule(.{
            .root_source_file = jit.path("src/wasm.zig"),
            .target = b.resolveTargetQuery(.{
                .cpu_arch = .wasm32,
                .os_tag = .freestanding,
            }),
            .optimize = .ReleaseSmall,
        }),
    });
    engine.entry = .disabled;
    engine.rdynamic = true;
    engine.export_memory = true;

    // The editor: every module lowered by pjsx's dom target, served as it is behind an
    // import map. No bundler, no minifier.
    const pjsx_host = b.dependency("pjsx", .{
        .target = b.graph.host,
    });
    const tool = b.addExecutable(.{
        .name = "editor_gen",
        .root_module = b.createModule(.{
            .root_source_file = b.path("scripts/editor_gen.zig"),
            .target = b.graph.host,
            .optimize = .Debug,
            .imports = &.{
                .{
                    .name = "pjsx",
                    .module = pjsx_host.module("pjsx"),
                },
                .{
                    .name = "publr_icons",
                    .module = b.createModule(.{
                        .root_source_file = b.path("../icons/publr_icons.zig"),
                    }),
                },
            },
        }),
    });
    const gen = b.addRunArtifact(tool);
    gen.addDirectoryArg(b.path("."));
    gen.addDirectoryArg(b.path("../ui"));
    gen.addDirectoryArg(b.path("../icons"));
    gen.addDirectoryArg(b.path("../publr-js/dist"));
    gen.addArtifactArg(engine);
    gen.addFileArg(jit.path("src/preflight.css"));
    gen.addFileArg(jit.path("src/default-theme.zon"));
    const site = gen.addOutputDirectoryArg("site");
    for ([_][]const u8{ "model", "blocks", "canvas", "shell", "host", "design", "moodboard", "harness", "tests/unit", "tests/manual" }) |dir| {
        declare_inputs(b, gen, dir);
    }
    declare_inputs(b, gen, "../ui/src");
    declare_inputs(b, gen, "../ui/gallery/app/runtime");
    declare_inputs(b, gen, "../ui/gallery/app/styles");
    declare_inputs(b, gen, "../icons/src");
    declare_inputs(b, gen, "../publr-js/dist");

    // The build Publr embeds and serves under /admin/editor/, on the admin's own runtime.
    const admin_gen = b.addRunArtifact(tool);
    admin_gen.addDirectoryArg(b.path("."));
    admin_gen.addDirectoryArg(b.path("../ui"));
    admin_gen.addDirectoryArg(b.path("../icons"));
    admin_gen.addDirectoryArg(b.path("../publr-js/dist"));
    admin_gen.addArtifactArg(engine);
    admin_gen.addFileArg(jit.path("src/preflight.css"));
    admin_gen.addFileArg(jit.path("src/default-theme.zon"));
    const admin_site = admin_gen.addOutputDirectoryArg("admin");
    admin_gen.addArg("--admin");
    for (gen.file_inputs.items) |input| admin_gen.addFileInput(input);
    b.addNamedLazyPath("admin", admin_site);

    const install = b.addInstallDirectory(.{
        .source_dir = site,
        .install_dir = .prefix,
        .install_subdir = "site",
    });
    b.getInstallStep().dependOn(&install.step);

    const http = b.dependency("http_server", .{
        .target = target,
    });
    const serve = b.addRunArtifact(http.artifact("publr-http"));
    serve.addArg("--root");
    serve.addDirectoryArg(site);
    serve.addArgs(&.{ "--response-bytes-max", "8388608", "--port", "8300" });
    if (b.args) |args| serve.addArgs(args);
    b.step("serve", "Serve the editor, its manual tests and unit tests at http://127.0.0.1:8300").dependOn(&serve.step);
}

/// A directory argument is hashed by path, so every file under it is declared
/// as an input and an edit anywhere re-runs the tool.
fn declare_inputs(b: *std.Build, run: *std.Build.Step.Run, dir: []const u8) void {
    const io = b.graph.io;
    const base = b.pathFromRoot(dir);
    var handle = std.Io.Dir.cwd().openDir(io, base, .{
        .iterate = true,
    }) catch {
        std.debug.panic("editor inputs: cannot open {s}", .{base});
    };
    defer handle.close(io);
    var walker = handle.walk(b.allocator) catch @panic("out of memory");
    defer walker.deinit();
    while (walker.next(io) catch @panic("cannot walk the editor inputs")) |entry| {
        if (entry.kind == .file) {
            run.addFileInput(.{
                .cwd_relative = b.pathJoin(&.{ base, b.dupe(entry.path) }),
            });
        }
    }
}
