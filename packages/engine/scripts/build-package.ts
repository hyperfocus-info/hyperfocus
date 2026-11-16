import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { runReleaseCommand } from "./smoke/run-command.ts";
import { build, type BuildOptions } from "esbuild";
import { buildAuthoringTools } from "./project-build/build-authoring.ts";
import { emitPackageDeclarations } from "./build-types.ts";
import { formatMissingPackageArtifactsMessage, getMissingPackageArtifacts } from "./package-artifacts.ts";

const artifactDirectoryNames = ["browser", "dist", "wasm"] as const;
const rootDir = join(import.meta.dir, "..");
const filesystemRetryDelaysMs = [25, 75, 150, 300, 500] as const;

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

function retryArtifactFileSystemOperation(operation: () => void) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      operation();
      return;
    } catch (error) {
      const delayMs = filesystemRetryDelaysMs[attempt];
      if (delayMs === undefined || !isRetryableFileSystemError(error)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
}

function moveArtifactDirectory(source: string, destination: string) {
  try {
    retryArtifactFileSystemOperation(() => renameSync(source, destination));
    return;
  } catch (error) {
    if (!isRetryableFileSystemError(error)) throw error;
    cpSync(source, destination, { errorOnExist: true, force: false, recursive: true });
    try {
      retryArtifactFileSystemOperation(() => rmSync(source, { force: true, recursive: true }));
    } catch (removeError) {
      retryArtifactFileSystemOperation(() => rmSync(destination, { force: true, recursive: true }));
      throw new AggregateError(
        [error, removeError],
        "artifact directory copy fallback could not remove the source directory",
      );
    }
  }
}

function isRetryableFileSystemError(error: unknown) {
  const code = getErrorCode(error);
  return code === "EPERM" || code === "EACCES" || code === "ENOTEMPTY";
}

function getErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
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
  const localRoot = assertDirectChild(packageRoot, ".local");
  mkdirSync(localRoot, { recursive: true });
  const backupRoot = assertDirectChild(localRoot, `package-build-backup-${nonce}`);
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
      moveArtifactDirectory(liveDirectory, join(backupRoot, directoryName));
      backedUp.add(directoryName);
    }

    for (const [index, directoryName] of artifactDirectoryNames.entries()) {
      options.beforeInstall?.(directoryName, index);
      moveArtifactDirectory(
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
        retryArtifactFileSystemOperation(() => rmSync(assertDirectChild(packageRoot, directoryName), { force: true, recursive: true }));
      } catch (error) {
        rollbackErrors.push(error);
      }
    }

    for (const directoryName of artifactDirectoryNames) {
      if (!backedUp.has(directoryName)) continue;
      try {
        moveArtifactDirectory(join(backupRoot, directoryName), assertDirectChild(packageRoot, directoryName));
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
      retryArtifactFileSystemOperation(() => rmSync(backupRoot, { force: true, recursive: true }));
    }
  }
}

type BundleSpec = {
  entry: string;
  outfile: string;
  options?: Pick<BuildOptions, "external" | "platform" | 'plugins'>;
};

async function buildBundles(stagingRoot: string) {
  const specs: readonly BundleSpec[] = [
    { entry: "src/core.ts", outfile: "dist/core.js" },
    { entry: "src/wasm/index.ts", outfile: "dist/wasm-runtime.js" },
    { entry: "src/experimental/index.ts", outfile: "dist/experimental.js" },
    { entry: "src/experimental/simulation/mailbox.ts", outfile: "dist/experimental-simulation-mailbox.js" },
    { entry: "src/physics/target-rays.ts", outfile: "dist/experimental-target-rays.js" },
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
    { entry: "src/render/materials/3d-presets.ts", outfile: "dist/render-3d-material-presets.js" },
    { entry: "src/render/3d-webgl2.ts", outfile: "dist/render-3d-webgl2.js" },
    { entry: "src/physics/3d.ts", outfile: "dist/physics-3d.js" },
    { entry: "src/physics/2d.ts", outfile: "dist/physics-2d.js" },
    { entry: "src/physics/rigid-3d.ts", outfile: "dist/physics-rigid-3d.js" },
    { entry: "src/physics/ragdoll-3d.ts", outfile: "dist/physics-ragdoll-3d.js" },
    { entry: "src/physics/physical-performance-3d.ts", outfile: "dist/physics-physical-performance-3d.js" },
    { entry: "src/motion/index.ts", outfile: "dist/motion.js" },
    { entry: "src/motion/solvers/pose-safety.ts", outfile: "dist/motion-pose-safety.js" },
    {
      entry: "src/motion/three.ts",
      outfile: "dist/motion-three.js",
      options: { external: ["three"] },
    },
    { entry: "src/migrations/index.ts", outfile: "dist/migrations.js" },
    { entry: "src/project/index.ts", outfile: "dist/project.js" },
    { entry: "src/project/metadata/index.ts", outfile: "dist/project-metadata.js" },
    { entry: "src/project/delivery/index.ts", outfile: "dist/project-delivery.js", options: { plugins: [{ name: 'reuse-project-container', setup(api) {
      api.onResolve({ filter: /index\.ts$/ }, args => resolve(args.resolveDir, args.path) === resolve(rootDir, 'src/project/index.ts') ? { path: './project.js', external: true } : undefined);
    } }] } },
    { entry: "src/project/runtime-2d.ts", outfile: "dist/project-runtime-2d.js" },
    { entry: "src/project/runtime-timeline-2d.ts", outfile: "dist/project-runtime-timeline-2d.js" },
    { entry: "src/project/runtime-navigation-2d.ts", outfile: "dist/project-runtime-navigation-2d.js" },
    { entry: "src/project/runtime-save-2d.ts", outfile: "dist/project-runtime-save-2d.js" },
    { entry: "src/project/runtime-story-2d.ts", outfile: "dist/project-runtime-story-2d.js" },
    { entry: "src/project/runtime-3d.ts", outfile: "dist/project-runtime-3d.js" },
    { entry: "src/project/filesystem.ts", outfile: "dist/project-filesystem.js", options: { platform: "node" } },
    { entry: "src/project/neutral-export.ts", outfile: "dist/project-neutral-export.js" },
    { entry: "src/navigation/index.ts", outfile: "dist/navigation.js" },
    { entry: 'src/combat/index.ts', outfile: 'dist/combat.js' },
    { entry: 'src/combat/net/protocol.ts', outfile: 'dist/combat-net.js' },
    { entry: 'src/progression/index.ts', outfile: 'dist/progression.js' },
    { entry: "src/content/index.ts", outfile: "dist/content.js" },
    { entry: "src/save/index.ts", outfile: "dist/save.js" },
    { entry: "src/save/browser.ts", outfile: "dist/save-browser.js" },
    { entry: "src/audio/index.ts", outfile: "dist/audio.js" },
    { entry: "src/effects/index.ts", outfile: "dist/effects.js" },
    { entry: "src/ui/index.ts", outfile: "dist/ui.js" },
    { entry: "src/ui/core.ts", outfile: "dist/ui-core.js" },
    { entry: "src/assets/loader.ts", outfile: "dist/assets/loader.js" },
    { entry: "src/assets/gltf-static.ts", outfile: "dist/assets/gltf-static.js" },
    { entry: "src/assets/model-cooking.ts", outfile: "dist/assets/model-cooking.js" },
    { entry: "src/assets/gltf-skin-animation.ts", outfile: "dist/assets/gltf-skin-animation.js" },
    { entry: "src/assets/templates/index.ts", outfile: "dist/assets/templates.js" },
    {
      entry: "src/canvas/post-processing-prototype.ts",
      outfile: "dist/post-processing-prototype.js",
    },
  ];

  const browserEntryPoints = Object.fromEntries([
    ["engine", "src/index.ts"],
    ...specs.filter((spec) => spec.options?.platform !== "node")
      .map((spec) => [basename(spec.outfile, ".js"), spec.entry])
  ]);

  const builds = [build({
    absWorkingDir: rootDir,
    bundle: true,
    chunkNames: "chunks/[name]-[hash]",
    entryNames: "[name]",
    entryPoints: browserEntryPoints,
    external: ["three"],
    format: "esm",
    minify: true,
    outdir: join(stagingRoot, "browser"),
    splitting: true,
  }), ...specs.map((spec) =>
    build({
      absWorkingDir: rootDir,
      bundle: true,
      minify: true,
      entryPoints: [spec.entry],
      format: "esm",
      outfile: join(stagingRoot, spec.outfile),
      ...spec.options,
    }))];
  const results = await Promise.allSettled(builds);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      `${failures.length} package bundle${failures.length === 1 ? "" : "s"} failed`,
    );
  }
  for (const entryName of Object.keys(browserEntryPoints)) {
    if (entryName !== "engine") rmSync(join(stagingRoot, "browser", `${entryName}.js`), { force: true });
  }
  pruneUnreferencedBrowserChunks(stagingRoot);
}

function pruneUnreferencedBrowserChunks(stagingRoot: string) {
  const browserRoot = resolve(stagingRoot, "browser");
  const chunksRoot = join(browserRoot, "chunks");
  const pending = [join(browserRoot, "engine.js")];
  const reachable = new Set<string>();
  const importPattern = /\b(?:from|import\()\s*["']([^"']+\.js)["']/g;

  while (pending.length) {
    const sourcePath = pending.pop()!;
    if (reachable.has(sourcePath)) continue;
    reachable.add(sourcePath);
    const source = readFileSync(sourcePath, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier?.startsWith(".")) continue;
      const importedPath = resolve(dirname(sourcePath), specifier);
      const importedRelativePath = relative(browserRoot, importedPath);
      if (importedRelativePath.startsWith("..") || isAbsolute(importedRelativePath)) continue;
      if (existsSync(importedPath)) pending.push(importedPath);
    }
  }

  if (!existsSync(chunksRoot)) return;
  for (const chunkName of readdirSync(chunksRoot)) {
    const chunkPath = resolve(chunksRoot, chunkName);
    if (statSync(chunkPath).isFile() && !reachable.has(chunkPath)) rmSync(chunkPath);
  }
}

async function buildWasm(stagingRoot: string) {
  const stagedWasmDir = join(stagingRoot, "wasm");
  mkdirSync(stagedWasmDir, { recursive: true });
  copyFileSync(
    join(rootDir, "wasm", "collision-kernel.wasm.d.ts"),
    join(stagedWasmDir, "collision-kernel.wasm.d.ts"),
  );
  for (const variant of ["scalar", "simd"] as const) {
    await runReleaseCommand({ cwd: rootDir, cmd: [process.execPath, "run", "asc",
      `./assembly/collision-kernel${variant === "scalar" ? "-scalar" : ""}.ts`,
      "--outFile", join(stagedWasmDir, `collision-kernel.${variant}.wasm`),
      "--textFile", join(stagedWasmDir, `collision-kernel.${variant}.wat`),
      "--runtime", "stub", "--exportRuntime", ...(variant === "simd" ? ["--enable", "simd"] : []), "-O3", "--noAssert",
    ] });
  }
  copyFileSync(join(stagedWasmDir, "collision-kernel.scalar.wasm"), join(stagedWasmDir, "collision-kernel.wasm"));
  copyFileSync(join(stagedWasmDir, "collision-kernel.scalar.wat"), join(stagedWasmDir, "collision-kernel.wat"));
}

function assertCompleteStagedPackage(stagingRoot: string) {
  const missingArtifacts = getMissingPackageArtifacts(stagingRoot);
  if (missingArtifacts.length) {
    throw new Error(formatMissingPackageArtifactsMessage(missingArtifacts));
  }
}

export async function buildPackage() {
  const nonce = `${process.pid}-${Date.now()}`;
  const localRoot = assertDirectChild(rootDir, ".local");
  mkdirSync(localRoot, { recursive: true });
  const stagingRoot = assertDirectChild(localRoot, `package-build-staging-${nonce}`);
  mkdirSync(stagingRoot);

  try {
    mkdirSync(join(stagingRoot, "browser"));
    mkdirSync(join(stagingRoot, "dist"));
    await emitPackageDeclarations(join(stagingRoot, "dist"));
    await buildWasm(stagingRoot);
    await buildBundles(stagingRoot);
    await buildAuthoringTools({ packageRoot: rootDir, outputRoot: stagingRoot });
    assertCompleteStagedPackage(stagingRoot);
    swapPackageArtifactDirectories(rootDir, stagingRoot, { nonce });
  } finally {
    rmSync(stagingRoot, { force: true, recursive: true });
  }
}

if (import.meta.main) {
  if (process.argv.includes("--wasm-only")) await buildWasm(rootDir);
  else await buildPackage();
}
