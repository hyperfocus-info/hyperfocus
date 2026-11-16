import { buildConfiguredBrand } from '@hyperfocus/branding/config';
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

await buildConfiguredBrand({configPath:import.meta.dir+'/brand.json',directory:import.meta.dir+'/brand',htmlPath:import.meta.dir+'/index.html'});
