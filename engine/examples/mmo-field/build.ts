import { resolve } from "node:path";
import { buildExampleBundles } from "../build-utils.ts";

await buildExampleBundles("MMO Field", resolve(import.meta.dir, "dist"), [{
  entrypoints: [resolve(import.meta.dir, "src/client.ts")],
  target: "browser",
  format: "esm",
  naming: { entry: "[name].js" },
  expectedOutputs: ["client.js"],
}]);
