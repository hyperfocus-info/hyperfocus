import { mkdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { build } from "esbuild";
import { checkBundleBytes, compressedBundleBytes, javascriptArtifacts, measureDeliveredBundle, sumBundleBytes } from "./bundle-size/measurement.ts";
import { browserDistributionBudget, bundleBudget, bundleRawBudgets, runtimeDistributionBudget, toolingDistributionBudget, totalDistributionBudget } from "./bundle-size/policy.ts";

const root = resolve(import.meta.dir, "..");
const report = resolve(root, "../../.local/engine-release/bundle-sizes.json");
mkdirSync(dirname(report), { recursive: true });
await Bun.write(report, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), passed: false, state: "running" }) + "\n");
const failures: string[] = [];
const measurements = [];
const manifest: { exports: Record<string, string | { import?: string }> } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const configured = new Set(Object.keys(bundleRawBudgets));
for (const [subpath, target] of Object.entries(manifest.exports)) {
  const imported = typeof target === "string" ? target : target.import;
  if (imported?.endsWith(".js") && !configured.has(imported.replace(/^\.\//, ""))) failures.push(`Export ${subpath} has no bundle budget: ${imported}`);
}

for (const [path, raw] of Object.entries(bundleRawBudgets)) {
  const budget = bundleBudget(path, raw);
  const artifact = compressedBundleBytes(readFileSync(resolve(root, path)));
  const delivered = await measureDeliveredBundle(root, path);
  const nativeBudget = path === "browser/engine.js" ? browserDistributionBudget : budget;
  failures.push(...checkBundleBytes(path, artifact, budget));
  failures.push(...checkBundleBytes(`${path} native graph`, delivered.native, nativeBudget));
  failures.push(...checkBundleBytes(`${path} rebundled`, delivered.rebundled, nativeBudget));
  measurements.push({ path, budget, artifact, ...delivered });
  console.log(`${path}: native ${delivered.native.raw}/${nativeBudget.raw}; gzip ${delivered.native.gzip}/${nativeBudget.gzip}; brotli ${delivered.native.brotli}/${nativeBudget.brotli}; rebundled ${delivered.rebundled.raw} bytes`);
}

const outputs = ["browser", "dist"].flatMap((directory) => javascriptArtifacts(resolve(root, directory)))
  .map((path) => ({ path: relative(root, path).replaceAll("\\", "/"), ...compressedBundleBytes(readFileSync(path)) }));
const browser = sumBundleBytes(outputs.filter((output) => output.path.startsWith("browser/")));
const total = sumBundleBytes(outputs);
const tooling = sumBundleBytes(outputs.filter((output) => output.path.startsWith("dist/tooling/")));
const runtime = sumBundleBytes(outputs.filter((output) => !output.path.startsWith("dist/tooling/")));
failures.push(...checkBundleBytes("runtime distribution", runtime, runtimeDistributionBudget));
failures.push(...checkBundleBytes("authoring tooling distribution", tooling, toolingDistributionBudget));
failures.push(...checkBundleBytes("browser distribution", browser, browserDistributionBudget));
failures.push(...checkBundleBytes("total distribution", total, totalDistributionBudget));
console.log(`all ${outputs.length} JavaScript outputs: raw ${total.raw}/${totalDistributionBudget.raw}; gzip ${total.gzip}/${totalDistributionBudget.gzip}; brotli ${total.brotli}/${totalDistributionBudget.brotli}`);

const consumers = [];
for (const consumer of [
  { label: "minimal canvas", imports: ["init"], maximumBytes: 8_000 },
  { label: "canonical browser app", imports: ["createBrowserApp", "createFrameMetrics"], maximumBytes: 18_000 },
]) {
  for (const source of ["./src/index.ts", "./browser/engine.js"]) {
    const names = consumer.imports.join(", ");
    const result = await build({
      stdin: { contents: `import { ${names} } from "${source}"; globalThis.__engineConsumer = [${names}];`, resolveDir: root, sourcefile: "engine-consumer.ts" },
      bundle: true, minify: true, format: "esm", platform: "browser", write: false,
    });
    const bytes = sumBundleBytes(result.outputFiles.map((output) => compressedBundleBytes(output.contents)));
    consumers.push({ label: consumer.label, source, maximumGzipBytes: consumer.maximumBytes, ...bytes });
    console.log(`${consumer.label} (${source}): gzip ${bytes.gzip}/${consumer.maximumBytes} bytes`);
    if (bytes.gzip > consumer.maximumBytes) failures.push(`${consumer.label} (${source}) gzip is ${bytes.gzip - consumer.maximumBytes} bytes over budget`);
  }
}

await Bun.write(report, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), passed: failures.length === 0, state: "complete", scope: "Delivered JavaScript; external Three.js peer, esbuild host tool and WASM assets are excluded.", measurements, outputs, browser, runtime, tooling, total, consumers, failures }, null, 2) + "\n");
if (failures.length) throw new Error(`bundle size budget failed:\n${failures.join("\n")}`);
