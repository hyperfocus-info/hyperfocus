import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExampleBundles } from "../build-utils.ts";

const here = dirname(fileURLToPath(import.meta.url));

await buildExampleBundles("MMO Skill Demo", resolve(here, "dist"), [
  {
    entrypoints: [resolve(here, "server.ts")],
    target: "bun",
    format: "esm",
    external: ["bun:sqlite"],
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

console.info("Built MMO Skill Demo bundles.");
