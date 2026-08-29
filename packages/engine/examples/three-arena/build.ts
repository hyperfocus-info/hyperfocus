import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExampleBundles } from "@hyperfocus/engine/tooling/example-build";

const here = dirname(fileURLToPath(import.meta.url));

await buildExampleBundles("Three Arena", resolve(here, "dist"), [
  {
    entrypoints: [resolve(here, "server.ts")],
    target: "bun",
    format: "esm",
    naming: { entry: "[name].js" },
    expectedOutputs: ["server.js"]
  },
  {
    entrypoints: [resolve(here, "src/client.ts")],
    target: "browser",
    format: "esm",
    naming: { entry: "[name].js" },
    expectedOutputs: ["client.js"]
  }
]);

console.info("Built Three Arena bundles.");
