import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

async function matches(pattern: string, globs: string[]) {
  const ripgrep = Bun.which("rg") ?? Bun.which("rg.exe");
  if (!ripgrep) throw new Error("ripgrep is required for the migration inventory");
  const process = Bun.spawn(
    [ripgrep, "-n", pattern, "apps", "packages", ...globs.flatMap((glob) => ["-g", glob])],
    { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
  );
  const output = await new Response(process.stdout).text();
  const exitCode = await process.exited;
  if (exitCode !== 0 && exitCode !== 1) throw new Error(await new Response(process.stderr).text());
  return output.trim() ? output.trim().split(/\r?\n/) : [];
}

describe("Solid 2 migration inventory", () => {
  test("all removed subpath imports remain discoverable", async () => {
    const imports = await matches("solid-js/(web|store)", ["*.ts", "*.tsx"]);
    expect(imports.length).toBeGreaterThan(0);
  });

  test("all lifecycle and effect rewrites remain discoverable", async () => {
    const calls = await matches("\\b(createEffect|createRenderEffect|onMount|onCleanup)\\b", ["*.ts", "*.tsx"]);
    expect(calls.length).toBeGreaterThan(0);
  });

  test("all store migration sites remain discoverable", async () => {
    const calls = await matches("\\b(createStore|reconcile|unwrap|produce)\\b", ["*.ts", "*.tsx"]);
    expect(calls.length).toBeGreaterThan(0);
  });

  test("all JSX classList migrations remain discoverable", async () => {
    const uses = await matches("classList=", ["*.tsx"]);
    expect(uses.length).toBeGreaterThan(0);
  });
});
