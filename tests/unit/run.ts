// The unit test page: registers the core blocks, loads the manual fixtures the codec
// tests run over, then every test module, then runs them.
import { registerCoreBlocks } from "../../blocks/index";
import { registerCorePatterns } from "../../blocks/patterns";
import { run } from "./harness";

const { manualTests } = await import("../../harness/generated/manual.js");
(globalThis as unknown as { manualTests: unknown }).manualTests = manualTests;
registerCoreBlocks();
registerCorePatterns();

await import("./codec.test");
await import("./format.test");
await import("./editor.test");
await import("./style.test");
await import("./moodboard.test");
await import("./hosted.test");
await import("./session.test");
await import("./patterns.test");
await import("./design.test");

await run(document.getElementById("app")!);
document.documentElement.setAttribute("data-unit-done", "");
