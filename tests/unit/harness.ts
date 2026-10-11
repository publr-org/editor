// A small test harness that runs in the browser: `test` registers, `run` executes every
// test and reports to the page and to `window.unitResults` for the browser runner.

type Test = { name: string; fn: () => void | Promise<void> };

const tests: Test[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn });
}

export class AssertionError extends Error {}

const show = (value: unknown) => {
  try {
    return typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value, null, 1);
  } catch {
    return String(value);
  }
};

export function equal(actual: unknown, expected: unknown, message = ""): void {
  if (actual !== expected) throw new AssertionError(`${message}\n  expected ${show(expected)}\n  actual   ${show(actual)}`);
}

/** Structural equality over plain data (key order ignored). */
export function same(actual: unknown, expected: unknown, message = ""): void {
  const normal = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normal);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value as object).sort().map((key) => [key, normal((value as Record<string, unknown>)[key])]));
    }
    return value;
  };
  const a = JSON.stringify(normal(actual));
  const b = JSON.stringify(normal(expected));
  if (a !== b) throw new AssertionError(`${message}\n  expected ${b}\n  actual   ${a}`);
}

export function ok(value: unknown, message = "expected a truthy value"): void {
  if (!value) throw new AssertionError(message);
}

export function includes(haystack: string, needle: string, message = ""): void {
  if (!haystack.includes(needle)) throw new AssertionError(`${message}\n  expected to find ${show(needle)}\n  in ${show(haystack)}`);
}

export function excludes(haystack: string, needle: string, message = ""): void {
  if (haystack.includes(needle)) throw new AssertionError(`${message}\n  expected not to find ${show(needle)}\n  in ${show(haystack)}`);
}

export type Result = { name: string; ok: boolean; error?: string };

export async function run(target: HTMLElement): Promise<Result[]> {
  const results: Result[] = [];
  for (const { name, fn } of tests) {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error instanceof Error ? `${error.message}\n${error instanceof AssertionError ? "" : error.stack ?? ""}` : String(error) });
    }
  }
  const failed = results.filter((result) => !result.ok);
  const list = target.ownerDocument.createElement("pre");
  list.className = "p-6 text-sm whitespace-pre-wrap";
  list.textContent = `${results.length - failed.length}/${results.length} passed\n\n` + results.map((result) => `${result.ok ? "ok  " : "FAIL"} ${result.name}${result.error ? `\n${result.error}` : ""}`).join("\n");
  target.replaceChildren(list);
  (globalThis as unknown as { unitResults: Result[] }).unitResults = results;
  return results;
}
