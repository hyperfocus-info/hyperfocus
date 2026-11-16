import { stylexSolidPlugin } from "@hyperfocus/ui/build/stylex-solid-plugin";
import { cp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function buildSynaestheticDashboard({
  outputDirectory = resolve(import.meta.dir, "..", "build", "synaesthetic-evaluator", "dashboard"),
} = {}) {
  const dashboardRoot = join(import.meta.dir, "synaesthetic-evaluator", "dashboard");
  await mkdir(outputDirectory, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(dashboardRoot, "main.tsx")],
    outdir: outputDirectory,
    naming: {
      entry: "dashboard.[ext]",
      chunk: "[name]-[hash].[ext]",
      asset: "[name]-[hash].[ext]",
    },
    target: "browser",
    format: "esm",
    sourcemap: "linked",
    plugins: [stylexSolidPlugin({ cssOutputFile: "dashboard.css" })],
  });
  if (!result.success) {
    throw new Error("Synaesthetic dashboard build failed.");
  }
  await cp(join(dashboardRoot, "index.html"), join(outputDirectory, "index.html"), { force: true });
  return outputDirectory;
}

if (import.meta.main) {
  const outputDirectory = await buildSynaestheticDashboard();
  console.log(`Synaesthetic dashboard built: ${outputDirectory}`);
}
