import { rm } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.join(import.meta.dir, "src");
const outdir = path.join(import.meta.dir, "dist");
const entrypoints: string[] = [];

for await (const entry of new Bun.Glob("*.ts").scan({ cwd: sourceRoot, onlyFiles: true })) {
  if (!entry.endsWith(".test.ts")) entrypoints.push(path.join(sourceRoot, entry));
}

entrypoints.sort();
await rm(outdir, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints,
  outdir,
  target: "bun",
  format: "esm",
  external: ["zod"],
});

if (!result.success) {
  throw new AggregateError(
    result.logs.map((log) => new Error(log.message)),
    "@hyperfocus/pad-pilot build failed",
  );
}

console.log(`Built @hyperfocus/pad-pilot (${result.outputs.length} outputs).`);
