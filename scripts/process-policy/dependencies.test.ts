import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { inspectProcessPolicy } from "./check";

async function javascriptFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...await javascriptFiles(join(directory, entry.name)));
    else if (entry.name.endsWith(".js")) result.push(join(directory, entry.name));
  }
  return result;
}

for (const dependency of ["@openai/codex-sdk", "@mariozechner/pi-coding-agent", "playwright-core"]) {
  test(`${dependency} installed command launch paths preserve hidden Windows execution`, async () => {
    const app = resolve(import.meta.dir, "../../apps/harness");
    const consumer = dependency === "playwright-core" ? dirname(Bun.resolveSync("playwright", app)) : app;
    const distribution = dirname(Bun.resolveSync(dependency, consumer));
    const files = await javascriptFiles(distribution);
    const failures = [];
    let processModules = 0;
    const parser = new Bun.Transpiler({ loader: "js" });
    for (const file of files) {
      const source = await readFile(file, "utf8");
      try { parser.scan(source); }
      catch (error) { throw new Error(`Patched dependency JavaScript must remain valid: ${file}`, { cause: error }); }
      if (source.includes("child_process")) processModules += 1;
      failures.push(...inspectProcessPolicy({ file, source, enforceHeadless: false }));
    }
    expect(processModules).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
}
