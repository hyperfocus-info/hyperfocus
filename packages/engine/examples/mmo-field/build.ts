import { resolve } from "node:path";
import { buildExampleBundles } from "@hyperfocus/engine/tooling/example-build";

await buildExampleBundles("MMO Field", resolve(import.meta.dir, "dist"), [{
  entrypoints: [resolve(import.meta.dir, "src/client.ts")],
  target: "browser",
  format: "esm",
  naming: { entry: "[name].js" },
  expectedOutputs: ["client.js"],
}]);
