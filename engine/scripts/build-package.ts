import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { $ } from "bun";
import { build, type BuildOptions } from "esbuild";
import { emitPackageDeclarations } from "./build-types.ts";
import { formatMissingPackageArtifactsMessage, getMissingPackageArtifacts } from "./package-artifacts.ts";

const artifactDirectoryNames = ["browser", "dist", "wasm"] as const;
const rootDir = join(import.meta.dir, "..");

type ArtifactDirectoryName = (typeof artifactDirectoryNames)[number];

export type ArtifactSwapOptions = {
  /** Test-only failure injection used to prove rollback after a partial install. */
  beforeInstall?: (directoryName: ArtifactDirectoryName, index: number) => void;
  nonce?: string;
};

function assertDirectChild(root: string, name: string) {
  const child = resolve(root, name);
  if (dirname(child) !== resolve(root)) {
    throw new Error(`artifact directory must be a direct child of the package root: ${name}`);
  }
  return child;
}

function assertStagedArtifactDirectories(stagingRoot: string) {
  for (const directoryName of artifactDirectoryNames) {
    const stagedDirectory = assertDirectChild(stagingRoot, directoryName);
    if (!existsSync(stagedDirectory) || !statSync(stagedDirectory).isDirectory()) {
      throw new Error(`staged package artifact directory is missing: ${directoryName}`);
    }
  }
}

/**
 * Replaces all package artifact directories as one rollback-capable transaction.
 * Every staged directory is validated before a live artifact is moved.
 */
export function swapPackageArtifactDirectories(
  packageRoot: string,
  stagingRoot: string,
  options: ArtifactSwapOptions = {},
) {
  assertStagedArtifactDirectories(stagingRoot);

  const nonce = options.nonce ?? `${process.pid}-${Date.now()}`;
  const backupRoot = assertDirectChild(packageRoot, `.package-build-backup-${nonce}`);
  if (existsSync(backupRoot)) {
    throw new Error(`package build backup already exists: ${backupRoot}`);
  }
  mkdirSync(backupRoot);

  const backedUp = new Set<ArtifactDirectoryName>();
  const installed: ArtifactDirectoryName[] = [];
  let committed = false;

  try {
    for (const directoryName of artifactDirectoryNames) {
      const liveDirectory = assertDirectChild(packageRoot, directoryName);
      if (!existsSync(liveDirectory)) continue;
      renameSync(liveDirectory, join(backupRoot, directoryName));
      backedUp.add(directoryName);
    }

    for (const [index, directoryName] of artifactDirectoryNames.entries()) {
      options.beforeInstall?.(directoryName, index);
      renameSync(
        assertDirectChild(stagingRoot, directoryName),
        assertDirectChild(packageRoot, directoryName),
      );
      installed.push(directoryName);
    }

    committed = true;
  } catch (buildError) {
    const rollbackErrors: unknown[] = [];

    for (const directoryName of [...installed].reverse()) {
      try {
        rmSync(assertDirectChild(packageRoot, directoryName), { force: true, recursive: true });
      } catch (error) {
        rollbackErrors.push(error);
      }
    }

    for (const directoryName of artifactDirectoryNames) {
      if (!backedUp.has(directoryName)) continue;
      try {
        renameSync(join(backupRoot, directoryName), assertDirectChild(packageRoot, directoryName));
      } catch (error) {
        rollbackErrors.push(error);
      }
    }

    if (rollbackErrors.length) {
      throw new AggregateError(
        [buildError, ...rollbackErrors],
        "package build failed and prior artifacts could not be completely restored",
      );
    }
    throw buildError;
  } finally {
    if (committed || readdirSync(backupRoot).length === 0) {
      rmSync(backupRoot, { force: true, recursive: true });
    }
  }
}

type BundleSpec = {
  entry: string;
  outfile: string;
  options?: Pick<BuildOptions, "external" | "platform">;
};

async function buildBundles(stagingRoot: string) {
  const specs: readonly BundleSpec[] = [
    { entry: "src/index.ts", outfile: "browser/engine.js" },
    { entry: "src/core.ts", outfile: "dist/core.js" },
    { entry: "src/wasm/index.ts", outfile: "dist/wasm-runtime.js" },
    { entry: "src/experimental/index.ts", outfile: "dist/experimental.js" },
    { entry: "src/net/index.ts", outfile: "dist/net.js" },
    { entry: "src/protocol/index.ts", outfile: "dist/protocol.js" },
    {
      entry: "src/server/index.ts",
      outfile: "dist/server.js",
      options: { external: ["bun:sqlite"], platform: "node" },
    },
    { entry: "src/mmo/index.ts", outfile: "dist/mmo.js" },
    { entry: "src/render/index.ts", outfile: "dist/render.js" },
    {
      entry: "src/render/3d.ts",
      outfile: "dist/render-3d.js",
      options: { external: ["three"] },
    },
    { entry: "src/render/3d-core.ts", outfile: "dist/render-3d-core.js" },
    { entry: "src/render/3d-scene.ts", outfile: "dist/render-3d-scene.js" },
    { entry: "src/render/3d-webgl2.ts", outfile: "dist/render-3d-webgl2.js" },
    { entry: "src/physics/3d.ts", outfile: "dist/physics-3d.js" },
    { entry: "src/physics/2d.ts", outfile: "dist/physics-2d.js" },
    { entry: "src/physics/rigid-3d.ts", outfile: "dist/physics-rigid-3d.js" },
    { entry: "src/motion/index.ts", outfile: "dist/motion.js" },
    {
      entry: "src/motion/three.ts",
      outfile: "dist/motion-three.js",
      options: { external: ["three"] },
    },
    { entry: "src/migrations/index.ts", outfile: "dist/migrations.js" },
    { entry: "src/project/index.ts", outfile: "dist/project.js" },
    { entry: "src/project/runtime-2d.ts", outfile: "dist/project-runtime-2d.js" },
    { entry: "src/project/runtime-navigation-2d.ts", outfile: "dist/project-runtime-navigation-2d.js" },
    { entry: "src/project/runtime-save-2d.ts", outfile: "dist/project-runtime-save-2d.js" },
    { entry: "src/project/runtime-story-2d.ts", outfile: "dist/project-runtime-story-2d.js" },
    { entry: "src/project/runtime-3d.ts", outfile: "dist/project-runtime-3d.js" },
    { entry: "src/project/filesystem.ts", outfile: "dist/project-filesystem.js", options: { platform: "node" } },
    { entry: "src/project/neutral-export.ts", outfile: "dist/project-neutral-export.js" },
    { entry: "src/navigation/index.ts", outfile: "dist/navigation.js" },
    { entry: "src/content/index.ts", outfile: "dist/content.js" },
    { entry: "src/save/index.ts", outfile: "dist/save.js" },
    { entry: "src/save/browser.ts", outfile: "dist/save-browser.js" },
    { entry: "src/audio/index.ts", outfile: "dist/audio.js" },
    { entry: "src/effects/index.ts", outfile: "dist/effects.js" },
    { entry: "src/ui/index.ts", outfile: "dist/ui.js" },
    { entry: "src/ui/core.ts", outfile: "dist/ui-core.js" },
    { entry: "src/assets/loader.ts", outfile: "dist/assets/loader.js" },
    { entry: "src/assets/gltf-static.ts", outfile: "dist/assets/gltf-static.js" },
    { entry: "src/assets/gltf-skin-animation.ts", outfile: "dist/assets/gltf-skin-animation.js" },
    { entry: "src/assets/templates/index.ts", outfile: "dist/assets/templates.js" },
    {
      entry: "src/canvas/post-processing-prototype.ts",
      outfile: "dist/post-processing-prototype.js",
    },
  ];

  const builds = specs.map((spec) =>
    build({
      absWorkingDir: rootDir,
      bundle: true,
      minify: true,
      entryPoints: [spec.entry],
      format: "esm",
      outfile: join(stagingRoot, spec.outfile),
      ...spec.options,
    }),
  );
  const results = await Promise.allSettled(builds);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      `${failures.length} package bundle${failures.length === 1 ? "" : "s"} failed`,
    );
  }
}

async function buildWasm(stagingRoot: string) {
  const stagedWasmDir = join(stagingRoot, "wasm");
  mkdirSync(stagedWasmDir, { recursive: true });
  copyFileSync(
    join(rootDir, "wasm", "collision-kernel.wasm.d.ts"),
    join(stagedWasmDir, "collision-kernel.wasm.d.ts"),
  );
  await $`bun run asc ./assembly/collision-kernel.ts --outFile ${join(stagedWasmDir, "collision-kernel.wasm")} --textFile ${join(stagedWasmDir, "collision-kernel.wat")} --runtime stub --exportRuntime --enable simd -O3 --noAssert`.cwd(
    rootDir,
  );
}

function assertCompleteStagedPackage(stagingRoot: string) {
  const missingArtifacts = getMissingPackageArtifacts(stagingRoot);
  if (missingArtifacts.length) {
    throw new Error(formatMissingPackageArtifactsMessage(missingArtifacts));
  }
}

export async function buildPackage() {
  const nonce = `${process.pid}-${Date.now()}`;
  const stagingRoot = assertDirectChild(rootDir, `.package-build-staging-${nonce}`);
  mkdirSync(stagingRoot);

  try {
    mkdirSync(join(stagingRoot, "browser"));
    mkdirSync(join(stagingRoot, "dist"));
    await emitPackageDeclarations(join(stagingRoot, "dist"));
    await buildWasm(stagingRoot);
    await buildBundles(stagingRoot);
    assertCompleteStagedPackage(stagingRoot);
    swapPackageArtifactDirectories(rootDir, stagingRoot, { nonce });
  } finally {
    rmSync(stagingRoot, { force: true, recursive: true });
  }
}

if (import.meta.main) {
  await buildPackage();
}
