import { join } from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import { buildExampleBundles } from "@hyperfocus/engine/tooling/example-build";
import { stylexSolidPlugin } from "@hyperfocus/ui/build/stylex-solid-plugin";

const root = import.meta.dir;

const standalone = await Bun.build({
  entrypoints: [join(root, "src", "standalone-entry.ts")],
  format: "iife",
  minify: true,
  target: "browser",
});
if (!standalone.success) {
  throw new Error(`Standalone playable runtime build failed:\n${standalone.logs.map((log) => log.message).join("\n")}`);
}
const standaloneOutput = standalone.outputs.find((output) => output.path.endsWith(".js"));
if (!standaloneOutput) throw new Error("Standalone playable runtime build produced no JavaScript output.");
const standaloneRuntimeSource = await standaloneOutput.text();

await buildExampleBundles("editor", join(root, "dist"), [
  {
    entrypoints: [join(root, "src", "main.tsx")],
    expectedOutputs: ["main.js", "main.css"],
    format: "esm",
    minify: false,
    naming: "[dir]/[name].[ext]",
    sourcemap: "external",
    target: "browser",
    metafile: true,
    plugins: [
      stylexSolidPlugin({
        useCSSLayers: { before: ["reset", "legacy"], prefix: "hyperfocus" },
        importSources: ["@stylexjs/stylex"]
      })
    ],
    define: {
      __HYPERFOCUS_STANDALONE_RUNTIME_SOURCE__: JSON.stringify(standaloneRuntimeSource),
    },
  },
]);

await mkdir(join(root, "wasm"), { recursive: true });
await copyFile(join(root, "..", "..", "packages", "engine", "wasm", "collision-kernel.wasm"), join(root, "wasm", "collision-kernel.wasm"));

console.log(`Hyperfocus Editor built: apps/engine-editor/dist/main.js (embedded standalone runtime: ${standaloneRuntimeSource.length} bytes)`);
