import { statSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { build } from "esbuild";

const budgets = {
  "browser/engine.js": 150_000,
  "dist/core.js": 45_000,
  "dist/wasm-runtime.js": 8_000,
  "dist/experimental.js": 24_000,
  "dist/net.js": 56_000,
  "dist/protocol.js": 32_000,
  "dist/server.js": 170_000,
  "dist/mmo.js": 70_000,
  "dist/render.js": 48_000,
  "dist/render-3d.js": 90_000,
  "dist/render-3d-core.js": 24_000,
  "dist/render-3d-scene.js": 30_000,
  "dist/render-3d-webgl2.js": 32_000,
  "dist/physics-3d.js": 22_000,
  "dist/physics-2d.js": 28_000,
  "dist/physics-rigid-3d.js": 34_000,
  "dist/motion.js": 120_000,
  "dist/motion-three.js": 95_000,
  "dist/migrations.js": 13_000,
  "dist/project.js": 20_000,
  "dist/project-runtime-2d.js": 24_000,
  "dist/project-runtime-navigation-2d.js": 14_000,
  "dist/project-runtime-save-2d.js": 24_000,
  "dist/project-runtime-story-2d.js": 34_000,
  "dist/project-runtime-3d.js": 92_000,
  "dist/project-filesystem.js": 28_000,
  "dist/project-neutral-export.js": 18_000,
  "dist/navigation.js": 14_000,
  "dist/content.js": 30_000,
  "dist/save.js": 28_000,
  "dist/save-browser.js": 8_000,
  "dist/audio.js": 28_000,
  "dist/effects.js": 24_000,
  "dist/ui.js": 35_000,
  "dist/ui-core.js": 8_000,
  "dist/post-processing-prototype.js": 9_000,
  "dist/assets/loader.js": 28_000,
  "dist/assets/gltf-static.js": 24_000,
  "dist/assets/gltf-skin-animation.js": 38_000,
  "dist/assets/templates.js": 6_000,
} as const;

const root = resolve(import.meta.dir, "..");
const failures: string[] = [];
let totalBytes = 0;

for (const [relativePath, maximumBytes] of Object.entries(budgets)) {
  const absolutePath = resolve(root, relativePath);
  const file = Bun.file(absolutePath);
  const contents = new Uint8Array(await file.arrayBuffer());
  const bytes = statSync(absolutePath).size;
  const gzipBytes = gzipSync(contents).length;
  const brotliBytes = brotliCompressSync(contents).length;
  totalBytes += bytes;
  const percent = Math.round((bytes / maximumBytes) * 1000) / 10;
  console.log(`${relativePath}: raw ${bytes} / ${maximumBytes}; gzip ${gzipBytes}; brotli ${brotliBytes} bytes (${percent}% raw)`);
  if (bytes > maximumBytes) failures.push(`${relativePath} is ${bytes - maximumBytes} bytes over budget`);
  const gzipBudget = Math.ceil(maximumBytes * 0.45);
  const brotliBudget = Math.ceil(maximumBytes * 0.4);
  if (gzipBytes > gzipBudget) failures.push(`${relativePath} gzip is ${gzipBytes - gzipBudget} bytes over budget`);
  if (brotliBytes > brotliBudget) failures.push(`${relativePath} brotli is ${brotliBytes - brotliBudget} bytes over budget`);
}

const totalBudgetBytes = 1_375_000;
if (totalBytes > totalBudgetBytes) failures.push(`total bundles are ${totalBytes - totalBudgetBytes} bytes over budget`);
console.log(`total: ${totalBytes} / ${totalBudgetBytes} bytes`);

for (const consumer of [
  { label: "minimal canvas", imports: ["init"], maximumBytes: 8_000 },
  { label: "canonical browser app", imports: ["createBrowserApp", "createFrameMetrics"], maximumBytes: 18_000 }
]) {
  const names = consumer.imports.join(", ");
  const result = await build({
    stdin: {
      contents: `import { ${names} } from "./src/index.ts"; globalThis.__engineConsumer = [${names}];`,
      resolveDir: root,
      sourcefile: "engine-consumer.ts"
    },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    write: false
  });
  const output = result.outputFiles[0]?.contents ?? new Uint8Array();
  const gzipBytes = gzipSync(output).length;
  console.log(`${consumer.label} consumer: raw ${output.length}; gzip ${gzipBytes} / ${consumer.maximumBytes} bytes`);
  if (gzipBytes > consumer.maximumBytes) failures.push(`${consumer.label} consumer gzip is ${gzipBytes - consumer.maximumBytes} bytes over budget`);
}

if (failures.length) throw new Error(`bundle size budget failed:\n${failures.join("\n")}`);
