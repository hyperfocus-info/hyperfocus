import { resolve } from "node:path";
import { buildExampleBundles } from "../build-utils.ts";

await buildExampleBundles("First-party WebGL2", resolve(import.meta.dir, "dist"), [{
  entrypoints: [resolve(import.meta.dir, "main.ts")],
  target: "browser",
  format: "esm",
  naming: { entry: "client.js" },
  expectedOutputs: ["client.js"],
}]);
