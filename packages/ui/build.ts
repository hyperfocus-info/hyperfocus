import { rm } from "node:fs/promises";
import path from "node:path";
import { stylexSolidPlugin } from "./build-tools/stylex-solid-plugin";

const sourceRoot = path.join(import.meta.dir, "src");
const outdir = path.join(import.meta.dir, "dist");
const entrypoints = [
  "index.ts",
  "composer/index.ts",
  "primitives/index.ts",
  "source-editor/index.ts",
  "terminal/index.ts",
  "transcript/index.ts",
  "workbench/index.ts"
].map((entrypoint) => path.join(sourceRoot, entrypoint));

await rm(outdir, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints,
  outdir,
  target: "browser",
  format: "esm",
  external: ["solid-js", "solid-js/*", "@stylexjs/stylex"],
  plugins: [stylexSolidPlugin()]
});

if (!result.success) {
  throw new AggregateError(result.logs.map((log) => new Error(log.message)), "@hyperfocus/ui build failed");
}

for (const output of result.outputs.filter((candidate) => candidate.path.endsWith(".js"))) {
  const source = await output.text();
  if (source.includes("React.")) throw new Error(`Solid UI output contains React calls: ${output.path}`);
  if (source.includes("stylex.create")) throw new Error(`UI output contains uncompiled StyleX definitions: ${output.path}`);
}

console.log(`Built @hyperfocus/ui (${result.outputs.filter((output) => output.path.endsWith(".js")).length} JavaScript entrypoints)`);
