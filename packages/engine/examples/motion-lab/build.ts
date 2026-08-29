import { join } from "node:path";
import { buildExampleBundles } from "@hyperfocus/engine/tooling/example-build";

const root = import.meta.dir;

await buildExampleBundles("motion-lab", join(root, "dist"), [
  {
    entrypoints: [join(root, "src", "client.ts")],
    expectedOutputs: ["client.js"],
    format: "esm",
    minify: false,
    naming: "[dir]/[name].[ext]",
    sourcemap: "external",
    target: "browser",
  },
]);

console.log("Motion laboratory built: examples/motion-lab/dist/client.js");
