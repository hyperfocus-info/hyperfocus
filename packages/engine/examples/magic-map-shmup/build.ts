import { buildConfiguredBrand } from '@hyperfocus/branding/config';
import { resolve } from "node:path";
import { buildExampleBundles } from "@hyperfocus/engine/tooling/example-build";

const here = import.meta.dir;

await buildExampleBundles("Magic Map Shmup", resolve(here, "dist"), [
  {
    entrypoints: [resolve(here, "src/main.ts")],
    target: "browser",
    format: "iife",
    naming: { entry: "[name].js" },
    expectedOutputs: ["main.js"]
  }
]);

console.info("Built Magic Map Shmup bundle.");

await buildConfiguredBrand({configPath:import.meta.dir+'/brand.json',directory:import.meta.dir+'/brand',htmlPath:import.meta.dir+'/index.html'});
