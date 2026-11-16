import type { BundleBytes } from "./measurement.ts";

// Temporary owner-approved exception, 2026-10-07; standalone and its distribution ceilings doubled.
// Previous targets, review/removal conditions: docs/bundle-size-evidence.md.
export const bundleRawBudgets = {
  "browser/engine.js": 100_000,
  "dist/tooling/create-project.js": 738_477,
  "dist/tooling/build-project.js": 740_309,
  "dist/tooling/dev-project.js": 747_875,
  "dist/tooling/standalone-runtime.js": 4_495_464,
  "dist/core.js": 45_000,
  "dist/wasm-runtime.js": 8_000,
  "dist/experimental.js": 24_000,
  "dist/experimental-simulation-mailbox.js": 1_500,
  "dist/experimental-target-rays.js": 3_200,
  "dist/net.js": 71_000,
  "dist/protocol.js": 32_000,
  "dist/server.js": 210_016,
  "dist/mmo.js": 75_000,
  "dist/render.js": 48_000,
  "dist/render-3d.js": 90_000,
  "dist/render-3d-core.js": 24_000,
  "dist/render-3d-scene.js": 37_563,
  "dist/render-3d-material-presets.js": 9_000,
  "dist/render-3d-webgl2.js": 49_955,
  "dist/physics-3d.js": 54_051,
  "dist/physics-2d.js": 28_000,
  "dist/physics-rigid-3d.js": 115_042,
  "dist/physics-ragdoll-3d.js": 104_639,
  "dist/physics-physical-performance-3d.js": 292_268,
  "dist/motion.js": 201_034,
  "dist/motion-pose-safety.js": 8_000,
  "dist/motion-three.js": 158_136,
  "dist/migrations.js": 13_000,
  "dist/project.js": 145_405,
  "dist/project-delivery.js": 240_000,
  "dist/project-metadata.js": 1_600,
  "dist/project-runtime-2d.js": 55_000,
  "dist/project-runtime-timeline-2d.js": 18_319,
  "dist/project-runtime-navigation-2d.js": 19_000,
  "dist/project-runtime-save-2d.js": 27_000,
  "dist/project-runtime-story-2d.js": 34_000,
  "dist/project-runtime-3d.js": 1_086_376,
  "dist/project-filesystem.js": 28_000,
  "dist/project-neutral-export.js": 18_000,
  "dist/navigation.js": 14_000,
  'dist/combat.js': 96_561,
  'dist/combat-net.js': 14_888,
  'dist/progression.js': 3_000,
  "dist/content.js": 30_000,
  "dist/save.js": 28_000,
  "dist/save-browser.js": 8_000,
  "dist/audio.js": 56_293,
  "dist/effects.js": 29_993,
  "dist/ui.js": 38_000,
  "dist/ui-core.js": 8_000,
  "dist/post-processing-prototype.js": 9_000,
  "dist/assets/loader.js": 28_000,
  "dist/assets/gltf-static.js": 24_000,
  "dist/assets/model-cooking.js": 10000,
  "dist/assets/gltf-skin-animation.js": 38_000,
  "dist/assets/templates.js": 6_000,
} as const;

// Expanded features use measured compressed ceilings, not loose raw-size ratios.
const featureCompressionBudgets: Record<string, Pick<BundleBytes, "gzip" | "brotli">> = {
  "dist/effects.js": { gzip: 10884, brotli: 9704 },
  "dist/audio.js": { gzip: 19326, brotli: 17050 },
  "dist/combat-net.js": { gzip: 5175, brotli: 4600 },
  "dist/physics-3d.js": { gzip: 17391, brotli: 14490 },
  "dist/server.js": { gzip: 90000, brotli: 80000 },
  "dist/tooling/create-project.js": { gzip: 229085, brotli: 187805 },
  "dist/tooling/build-project.js": { gzip: 229177, brotli: 188027 },
  "dist/tooling/dev-project.js": { gzip: 232674, brotli: 191115 },
  "dist/tooling/standalone-runtime.js": { gzip: 1412924, brotli: 1131902 },
  "dist/combat.js": { gzip: 22909, brotli: 19126 },
  "dist/render-3d-scene.js": { gzip: 12291, brotli: 10697 },
  "dist/render-3d-webgl2.js": { gzip: 14209, brotli: 12509 },
  "dist/physics-rigid-3d.js": { gzip: 38526, brotli: 31764 },
  "dist/physics-ragdoll-3d.js": { gzip: 32065, brotli: 27188 },
  "dist/physics-physical-performance-3d.js": { gzip: 90369, brotli: 74349 },
  "dist/motion.js": { gzip: 64108, brotli: 53823 },
  "dist/motion-three.js": { gzip: 50173, brotli: 42053 },
  "dist/project.js": { gzip: 43488, brotli: 37478 },
  "dist/project-delivery.js": { gzip: 73000, brotli: 63500 },
  "dist/project-metadata.js": { gzip: 650, brotli: 550 },
  "dist/project-runtime-2d.js": { gzip: 15000, brotli: 13300 },
  "dist/project-runtime-timeline-2d.js": { gzip: 5771, brotli: 5109 },
  "dist/project-runtime-3d.js": { gzip: 347897, brotli: 282333 },
};

export function bundleBudget(path: string, raw: number): BundleBytes {
  return { raw, ...(featureCompressionBudgets[path] ?? { gzip: Math.ceil(raw * .45), brotli: Math.ceil(raw * .4) }) };
}

export const browserDistributionBudget: BundleBytes = { raw: 160_000, gzip: 60_000, brotli: 52_000 };
export const runtimeDistributionBudget: BundleBytes = { raw: 3565011, gzip: 1132576, brotli: 956405 };
export const toolingDistributionBudget: BundleBytes = { raw: 6024172, gzip: 1892198, brotli: 1526244 };
export const totalDistributionBudget: BundleBytes = { raw: 13154194, gzip: 4157350, brotli: 3439054 };
