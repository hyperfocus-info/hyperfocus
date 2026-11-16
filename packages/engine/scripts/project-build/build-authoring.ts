import { join, resolve } from "node:path";
import { build } from "esbuild";

/** Package the existing authoring implementation without copying the editor source tree. */
export async function buildAuthoringTools(options: { packageRoot: string; outputRoot: string }) {
  const { packageRoot, outputRoot } = options;
  await build({
    absWorkingDir: packageRoot,
    entryPoints: { "create-project": "tooling/create-project-runtime.ts", "build-project": "tooling/build-project.ts", "dev-project": "scripts/dev-project.ts" },
    outdir: join(outputRoot, "dist/tooling"),
    bundle: true,
    splitting: true,
    minify: true,
    platform: "node",
    format: "esm",
    external: ["esbuild"],
    define: { "import.meta.main": "false", __HYPERFOCUS_PACKAGED_TOOLING__: "true" },
  });
  await build({
    absWorkingDir: packageRoot,
    entryPoints: {
      'standalone-runtime': resolve(packageRoot, '../../apps/engine-editor/src/standalone-entry.ts'),
      'standalone-runtime-2d': resolve(packageRoot, '../../apps/engine-editor/src/standalone/entry-2d.ts'),
      'standalone-runtime-3d': resolve(packageRoot, '../../apps/engine-editor/src/standalone/entry-3d.ts'),
    },
    outdir: join(outputRoot, "dist/tooling"),
    entryNames: '[name]',
    chunkNames: 'runtime-chunks/[name]-[hash]',
    splitting: true,
    bundle: true,
    platform: "browser",
    format: "esm",
    minify: true,
    // Standalone hosts consume these public bundles during the same atomic build.
    // Resolve against staging so a clean checkout never needs an older dist tree.
    alias: {
      '@hyperfocus/engine/combat/net': join(outputRoot, 'dist/combat-net.js'),
      '@hyperfocus/engine/render/3d-material-presets': join(outputRoot, 'dist/render-3d-material-presets.js'),
    },
    define: { __HYPERFOCUS_STANDALONE_AUTO_BOOT__: "false" },
  });
}
