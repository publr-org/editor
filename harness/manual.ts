// The manual test harness entry.
import { mount } from "publr/dom";
import { component } from "publr-jsx";
import { registerCoreBlocks } from "../blocks/index";
import { registerCorePatterns } from "../blocks/patterns";
import { registerHomePatterns } from "./home-patterns";
import { startChrome } from "./chrome";
import { Manual } from "./ManualTests.ptsx";
import type { ManualTest } from "./ManualTests.ptsx";

registerCoreBlocks();
registerCorePatterns();
registerHomePatterns();
await startChrome();
const { manualTests } = (await import("./generated/manual.js")) as { manualTests: ManualTest[] };
const selected = new URLSearchParams(location.search).get("fixture") ?? manualTests[0]?.key ?? "";
mount(document.getElementById("app")!, () => component(Manual, { tests: manualTests, selected }), {});
document.documentElement.setAttribute("data-editor-ready", "");
