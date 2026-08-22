import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { pathToFileURL } from "node:url";
import { $ } from "bun";
import {
  assertCameraDeclarationSource,
  assertCameraRootExportsSource,
  assertRootBrowserSubpathOnlyDeclarationsSource,
  rootBrowserSubpathOnlyValueExports
} from "./declaration-hygiene.ts";
import { formatMissingPackageArtifactsMessage, getMissingPackageArtifacts } from "./package-artifacts.ts";

type PackageJson = {
  name: string;
  version: string;
  packageManager?: string;
  private?: boolean;
  types?: string;
  files?: string[];
  exports?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

const rootDir = join(import.meta.dir, "..");
const packagePath = join(rootDir, "package.json");
const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
const runExternalConsumer = process.argv.includes("--external-consumer");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const bunCommand = process.platform === "win32" ? "bun.cmd" : "bun";
const expectedPackageFiles = [
  "LICENSE",
  "CHANGELOG.md",
  "SECURITY.md",
  "browser/engine.js",
  "dist/core.js",
  "dist/wasm-runtime.js",
  "dist/experimental.js",
  "dist/net.js",
  "dist/protocol.js",
  "dist/server.js",
  "dist/mmo.js",
  "dist/render.js",
  "dist/render-3d.js",
  "dist/render-3d-core.js",
  "dist/render-3d-scene.js",
  "dist/render-3d-webgl2.js",
  "dist/physics-3d.js",
  "dist/physics-2d.js",
  "dist/physics-rigid-3d.js",
  "dist/motion.js",
  "dist/motion-three.js",
  "dist/migrations.js",
  "dist/project.js",
  "dist/project-runtime-2d.js",
  "dist/project-runtime-navigation-2d.js",
  "dist/project-runtime-save-2d.js",
  "dist/project-runtime-story-2d.js",
  "dist/project-runtime-3d.js",
  "dist/project-filesystem.js",
  "dist/project-neutral-export.js",
  "dist/navigation.js",
  "dist/content.js",
  "dist/save.js",
  "dist/save-browser.js",
  "dist/audio.js",
  "dist/effects.js",
  "dist/ui.js",
  "dist/ui-core.js",
  "dist/assets/loader.js",
  "dist/assets/gltf-static.js",
  "dist/assets/gltf-skin-animation.js",
  "dist/assets/templates.js",
  "dist/post-processing-prototype.js",
  "dist/src/",
  "docs/architectural-resilience-matrix.md",
  "docs/schema/editor-project-v2.schema.json",
  "docs/browser-support.md",
  "docs/compatibility-policy.md",
  "docs/licensing-model.md",
  "docs/production-readiness.md",
  "docs/public-api-v0.1.json",
  "wasm/collision-kernel.wasm",
  "wasm/collision-kernel.wasm.d.ts",
  "readme.md",
  "third-party-notices.md",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function packagePathMatchesExactCasing(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  let currentDir = rootDir;

  for (const part of parts) {
    const entries = new Set(readdirSync(currentDir));
    if (!entries.has(part)) return false;
    currentDir = join(currentDir, part);
  }

  return true;
}

function assertPackageArtifacts() {
  const missingArtifacts = getMissingPackageArtifacts(rootDir);

  assert(
    missingArtifacts.length === 0,
    formatMissingPackageArtifactsMessage(missingArtifacts),
  );
}

function findAncestorTool(startDir: string, relativeToolPath: string) {
  let current = startDir;
  const { root } = parse(startDir);
  while (true) {
    const candidate = join(current, relativeToolPath);
    if (existsSync(candidate)) return candidate;
    if (current === root) return undefined;
    current = dirname(current);
  }
}

function filesUnder(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...filesUnder(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

assert(manifest.name === "@hyperfocus/engine", "package name must stay stable for consumers");
assert(/^0\.1\.\d+$/.test(manifest.version), "package version must stay inside the documented 0.1.x contract");
assert(manifest.packageManager === "bun@1.3.14", "the release toolchain must declare its pinned Bun version");
assert(manifest.private === false, "package must be publishable");
assert(manifest.types === "./dist/src/index.d.ts", "top-level types must point at generated declarations");
assert(
  manifest.files?.length === expectedPackageFiles.length && expectedPackageFiles.every((path) => manifest.files?.includes(path)),
  "package files must stay on the explicit runtime, declaration, WASM, and README allowlist",
);
assert(manifest.peerDependencies?.three === "^0.163.0", "the render/3d peer dependency must match its supported Three.js line");
assert(manifest.peerDependencies?.["@types/three"] === "^0.163.0", "render/3d must publish its exposed Three.js type peer");
assert(manifest.peerDependenciesMeta?.three?.optional === true, "Three.js must remain optional for consumers that do not import render/3d");
assert(manifest.peerDependenciesMeta?.["@types/three"]?.optional === true, "Three.js types must remain optional outside render/3d");
for (const packageFile of manifest.files ?? []) {
  assert(packagePathMatchesExactCasing(packageFile), `package files entry must match on-disk casing exactly: ${packageFile}`);
}

const thirdPartyNotices = readFileSync(join(rootDir, "third-party-notices.md"), "utf8");
for (const packageName of ["flatbush", "flatqueue", "meshoptimizer"] as const) {
  const bundledManifest = JSON.parse(readFileSync(join(rootDir, "node_modules", packageName, "package.json"), "utf8")) as {
    version?: string;
  };
  assert(bundledManifest.version, `installed ${packageName} package must declare its version`);
  assert(
    thirdPartyNotices.includes(`## ${packageName} ${bundledManifest.version}`),
    `third-party notices must match the bundled ${packageName} version`,
  );
}

const rootExport = manifest.exports?.["."] as { import?: string; types?: string } | undefined;
assert(rootExport?.import === "./browser/engine.js", "root import must resolve to the browser ESM build");
assert(rootExport?.types === "./dist/src/index.d.ts", "root export types must resolve to generated declarations");

const coreExport = manifest.exports?.["./core"] as { import?: string; types?: string } | undefined;
assert(coreExport?.import === "./dist/core.js", "core import must resolve to the DOM-free emitted module");
assert(coreExport?.types === "./dist/src/core.d.ts", "core export types must resolve to generated declarations");

const wasmRuntimeExport = manifest.exports?.["./wasm"] as { import?: string; types?: string } | undefined;
assert(wasmRuntimeExport?.import === "./dist/wasm-runtime.js", "wasm import must resolve to the generated runtime helpers");
assert(wasmRuntimeExport?.types === "./dist/src/wasm/index.d.ts", "wasm export types must resolve to generated declarations");

const experimentalExport = manifest.exports?.["./experimental"] as { import?: string; types?: string } | undefined;
assert(experimentalExport?.import === "./dist/experimental.js", "experimental import must resolve to the capability-gated adapters");
assert(experimentalExport?.types === "./dist/src/experimental/index.d.ts", "experimental export types must resolve to generated declarations");

const browserExport = manifest.exports?.["./browser"] as { import?: string; types?: string } | undefined;
assert(browserExport?.import === "./browser/engine.js", "browser subpath import must resolve to the browser ESM build");
assert(browserExport?.types === "./dist/src/index.d.ts", "browser subpath types must resolve to generated root declarations");

const netExport = manifest.exports?.["./net"] as { import?: string; types?: string } | undefined;
assert(netExport?.import === "./dist/net.js", "net import must resolve to the generated multiplayer ESM build");
assert(netExport?.types === "./dist/src/net/index.d.ts", "net export types must resolve to generated net declarations");

const protocolExport = manifest.exports?.["./protocol"] as { import?: string; types?: string } | undefined;
assert(protocolExport?.import === "./dist/protocol.js", "protocol import must resolve to the generated protocol ESM build");
assert(protocolExport?.types === "./dist/src/protocol/index.d.ts", "protocol export types must resolve to generated protocol declarations");

const serverExport = manifest.exports?.["./server"] as { import?: string; types?: string } | undefined;
assert(serverExport?.import === "./dist/server.js", "server import must resolve to the generated authoritative server ESM build");
assert(serverExport?.types === "./dist/src/server/index.d.ts", "server export types must resolve to generated server declarations");

const mmoExport = manifest.exports?.["./mmo"] as { import?: string; types?: string } | undefined;
assert(mmoExport?.import === "./dist/mmo.js", "mmo import must resolve to the generated MMO ESM build");
assert(mmoExport?.types === "./dist/src/mmo/index.d.ts", "mmo export types must resolve to generated MMO declarations");

const renderExport = manifest.exports?.["./render"] as { import?: string; types?: string } | undefined;
assert(renderExport?.import === "./dist/render.js", "render import must resolve to the generated render ESM build");
assert(renderExport?.types === "./dist/src/render/index.d.ts", "render export types must resolve to generated render declarations");

const render3dExport = manifest.exports?.["./render/3d"] as { import?: string; types?: string } | undefined;
assert(render3dExport?.import === "./dist/render-3d.js", "render/3d import must resolve to the generated 3D render ESM build");
assert(render3dExport?.types === "./dist/src/render/3d.d.ts", "render/3d export types must resolve to generated 3D render declarations");

const render3dCoreExport = manifest.exports?.["./render/3d-core"] as { import?: string; types?: string } | undefined;
assert(render3dCoreExport?.import === "./dist/render-3d-core.js", "render/3d-core import must resolve to the generated first-party 3D core build");
assert(render3dCoreExport?.types === "./dist/src/render/3d-core.d.ts", "render/3d-core export types must resolve to generated first-party 3D declarations");

const render3dSceneExport = manifest.exports?.["./render/3d-scene"] as { import?: string; types?: string } | undefined;
assert(render3dSceneExport?.import === "./dist/render-3d-scene.js", "render/3d-scene import must resolve to the generated first-party scene build");
assert(render3dSceneExport?.types === "./dist/src/render/3d-scene.d.ts", "render/3d-scene export types must resolve to generated scene declarations");

const render3dWebgl2Export = manifest.exports?.["./render/3d-webgl2"] as { import?: string; types?: string } | undefined;
assert(render3dWebgl2Export?.import === "./dist/render-3d-webgl2.js", "render/3d-webgl2 import must resolve to the generated first-party browser backend");
assert(render3dWebgl2Export?.types === "./dist/src/render/3d-webgl2.d.ts", "render/3d-webgl2 export types must resolve to generated backend declarations");

const physics3dExport = manifest.exports?.["./physics/3d"] as { import?: string; types?: string } | undefined;
assert(physics3dExport?.import === "./dist/physics-3d.js", "physics/3d import must resolve to the generated 3D physics ESM build");
assert(physics3dExport?.types === "./dist/src/physics/3d.d.ts", "physics/3d export types must resolve to generated 3D physics declarations");

const physics2dExport = manifest.exports?.["./physics/2d"] as { import?: string; types?: string } | undefined;
assert(physics2dExport?.import === "./dist/physics-2d.js", "physics/2d import must resolve to the generated first-party 2D physics build");
assert(physics2dExport?.types === "./dist/src/physics/2d.d.ts", "physics/2d export types must resolve to generated 2D physics declarations");

const rigid3dExport = manifest.exports?.["./physics/rigid-3d"] as { import?: string; types?: string } | undefined;
assert(rigid3dExport?.import === "./dist/physics-rigid-3d.js", "physics/rigid-3d import must resolve to the generated bounded 3D world");
assert(rigid3dExport?.types === "./dist/src/physics/rigid-3d.d.ts", "physics/rigid-3d types must resolve to generated declarations");

const motionExport = manifest.exports?.["./motion"] as { import?: string; types?: string } | undefined;
assert(motionExport?.import === "./dist/motion.js", "motion import must resolve to the renderer-neutral motion build");
assert(motionExport?.types === "./dist/src/motion/index.d.ts", "motion export types must resolve to generated motion declarations");

const motionThreeExport = manifest.exports?.["./motion/three"] as { import?: string; types?: string } | undefined;
assert(motionThreeExport?.import === "./dist/motion-three.js", "motion/three import must resolve to the Three adapter build");
assert(motionThreeExport?.types === "./dist/src/motion/three.d.ts", "motion/three export types must resolve to generated Three adapter declarations");

const migrationsExport = manifest.exports?.["./migrations"] as { import?: string; types?: string } | undefined;
assert(migrationsExport?.import === "./dist/migrations.js", "migrations import must resolve to the generated migration build");
assert(migrationsExport?.types === "./dist/src/migrations/index.d.ts", "migrations export types must resolve to generated migration declarations");

const projectExport = manifest.exports?.["./project"] as { import?: string; types?: string } | undefined;
assert(projectExport?.import === "./dist/project.js", "project import must resolve to the generated portable project build");
assert(projectExport?.types === "./dist/src/project/index.d.ts", "project export types must resolve to generated portable project declarations");

const projectRuntime2dExport = manifest.exports?.["./project/runtime-2d"] as { import?: string; types?: string } | undefined;
assert(projectRuntime2dExport?.import === "./dist/project-runtime-2d.js", "project/runtime-2d import must resolve to the generated portable runtime build");
assert(projectRuntime2dExport?.types === "./dist/src/project/runtime-2d.d.ts", "project/runtime-2d export types must resolve to generated runtime declarations");

const projectRuntimeNavigation2dExport = manifest.exports?.["./project/runtime-navigation-2d"] as { import?: string; types?: string } | undefined;
assert(projectRuntimeNavigation2dExport?.import === "./dist/project-runtime-navigation-2d.js", "project/runtime-navigation-2d import must resolve to the generated navigation adapter");
assert(projectRuntimeNavigation2dExport?.types === "./dist/src/project/runtime-navigation-2d.d.ts", "project/runtime-navigation-2d types must resolve to generated declarations");

const projectRuntimeSave2dExport = manifest.exports?.["./project/runtime-save-2d"] as { import?: string; types?: string } | undefined;
assert(projectRuntimeSave2dExport?.import === "./dist/project-runtime-save-2d.js", "project/runtime-save-2d import must resolve to the generated save adapter");
assert(projectRuntimeSave2dExport?.types === "./dist/src/project/runtime-save-2d.d.ts", "project/runtime-save-2d types must resolve to generated declarations");

const projectRuntimeStory2dExport = manifest.exports?.["./project/runtime-story-2d"] as { import?: string; types?: string } | undefined;
assert(projectRuntimeStory2dExport?.import === "./dist/project-runtime-story-2d.js", "project/runtime-story-2d import must resolve to the generated story adapter");
assert(projectRuntimeStory2dExport?.types === "./dist/src/project/runtime-story-2d.d.ts", "project/runtime-story-2d types must resolve to generated declarations");

const projectRuntime3dExport = manifest.exports?.["./project/runtime-3d"] as { import?: string; types?: string } | undefined;
assert(projectRuntime3dExport?.import === "./dist/project-runtime-3d.js", "project/runtime-3d import must resolve to the generated portable 3D runtime");
assert(projectRuntime3dExport?.types === "./dist/src/project/runtime-3d.d.ts", "project/runtime-3d types must resolve to generated declarations");

const projectFilesystemExport = manifest.exports?.["./project/filesystem"] as { import?: string; types?: string } | undefined;
assert(projectFilesystemExport?.import === "./dist/project-filesystem.js", "project/filesystem import must resolve to the generated filesystem build");
assert(projectFilesystemExport?.types === "./dist/src/project/filesystem.d.ts", "project/filesystem types must resolve to generated declarations");

const projectNeutralExport = manifest.exports?.["./project/neutral-export"] as { import?: string; types?: string } | undefined;
assert(projectNeutralExport?.import === "./dist/project-neutral-export.js", "project/neutral-export import must resolve to the shared escape-export build");
assert(projectNeutralExport?.types === "./dist/src/project/neutral-export.d.ts", "project/neutral-export types must resolve to generated declarations");

const editorSchemaExport = manifest.exports?.["./schema/editor-project-v2.json"] as { default?: string } | undefined;
assert(editorSchemaExport?.default === "./docs/schema/editor-project-v2.schema.json", "editor schema export must resolve to the published JSON Schema");

const navigationExport = manifest.exports?.["./navigation"] as { import?: string; types?: string } | undefined;
assert(navigationExport?.import === "./dist/navigation.js", "navigation import must resolve to the generated navigation build");
assert(navigationExport?.types === "./dist/src/navigation/index.d.ts", "navigation export types must resolve to generated navigation declarations");

const contentExport = manifest.exports?.["./content"] as { import?: string; types?: string } | undefined;
assert(contentExport?.import === "./dist/content.js", "content import must resolve to the generated content build");
assert(contentExport?.types === "./dist/src/content/index.d.ts", "content export types must resolve to generated content declarations");
const saveExport = manifest.exports?.["./save"] as { import?: string; types?: string } | undefined;
assert(saveExport?.import === "./dist/save.js", "save import must resolve to the generated save build");
assert(saveExport?.types === "./dist/src/save/index.d.ts", "save export types must resolve to generated save declarations");
const saveBrowserExport = manifest.exports?.["./save/browser"] as { import?: string; types?: string } | undefined;
assert(saveBrowserExport?.import === "./dist/save-browser.js", "save/browser import must resolve to the generated IndexedDB adapter");
assert(saveBrowserExport?.types === "./dist/src/save/browser.d.ts", "save/browser types must resolve to generated declarations");
const audioExport = manifest.exports?.["./audio"] as { import?: string; types?: string } | undefined;
assert(audioExport?.import === "./dist/audio.js", "audio import must resolve to the generated audio build");
assert(audioExport?.types === "./dist/src/audio/index.d.ts", "audio export types must resolve to generated audio declarations");
const effectsExport = manifest.exports?.["./effects"] as { import?: string; types?: string } | undefined;
assert(effectsExport?.import === "./dist/effects.js", "effects import must resolve to the generated effects build");
assert(effectsExport?.types === "./dist/src/effects/index.d.ts", "effects export types must resolve to generated effects declarations");

const uiExport = manifest.exports?.["./ui"] as { import?: string; types?: string } | undefined;
assert(uiExport?.import === "./dist/ui.js", "ui import must resolve to the generated UI ESM build");
assert(uiExport?.types === "./dist/src/ui/index.d.ts", "ui export types must resolve to generated UI declarations");
const uiCoreExport = manifest.exports?.["./ui/core"] as { import?: string; types?: string } | undefined;
assert(uiCoreExport?.import === "./dist/ui-core.js", "ui/core import must resolve to the DOM-free UI controller build");
assert(uiCoreExport?.types === "./dist/src/ui/core.d.ts", "ui/core export types must resolve to generated controller declarations");

const templateAssetsExport = manifest.exports?.["./assets/templates"] as { import?: string; types?: string } | undefined;
assert(templateAssetsExport?.import === "./dist/assets/templates.js", "template assets import must resolve to the generated template assets ESM build");
assert(templateAssetsExport?.types === "./dist/src/assets/templates/index.d.ts", "template assets export types must resolve to generated template asset declarations");

const assetLoaderExport = manifest.exports?.["./assets/loader"] as { import?: string; types?: string } | undefined;
assert(assetLoaderExport?.import === "./dist/assets/loader.js", "asset loader import must resolve to the generated asset loader ESM build");
assert(assetLoaderExport?.types === "./dist/src/assets/loader.d.ts", "asset loader export types must resolve to generated asset loader declarations");

const gltfStaticExport = manifest.exports?.["./assets/gltf-static"] as { import?: string; types?: string } | undefined;
assert(gltfStaticExport?.import === "./dist/assets/gltf-static.js", "assets/gltf-static import must resolve to the generated neutral glTF cooker");
assert(gltfStaticExport?.types === "./dist/src/assets/gltf-static.d.ts", "assets/gltf-static types must resolve to generated cooker declarations");

const gltfSkinAnimationExport = manifest.exports?.["./assets/gltf-skin-animation"] as { import?: string; types?: string } | undefined;
assert(gltfSkinAnimationExport?.import === "./dist/assets/gltf-skin-animation.js", "assets/gltf-skin-animation import must resolve to the generated skin/animation cooker");
assert(gltfSkinAnimationExport?.types === "./dist/src/assets/gltf-skin-animation.d.ts", "assets/gltf-skin-animation types must resolve to generated declarations");

const prototypePostProcessingExport = manifest.exports?.["./post-processing/prototype"] as { import?: string; types?: string } | undefined;
assert(prototypePostProcessingExport?.import === "./dist/post-processing-prototype.js", "prototype post-processing import must resolve to generated ESM build");
assert(prototypePostProcessingExport?.types === "./dist/src/canvas/post-processing-prototype.d.ts", "prototype post-processing export types must resolve to generated declarations");

const wasmExport = manifest.exports?.["./wasm/collision-kernel.wasm"] as { default?: string; types?: string } | undefined;
assert(wasmExport?.default === "./wasm/collision-kernel.wasm", "WASM asset export must stay explicit");
assert(wasmExport?.types === "./wasm/collision-kernel.wasm.d.ts", "WASM asset export must expose an asset URL type");
const viteWasmUrlExport = manifest.exports?.["./wasm/collision-kernel.wasm?url"] as { default?: string; types?: string } | undefined;
assert(viteWasmUrlExport?.default === "./wasm/collision-kernel.wasm", "Vite WASM URL export must point at the same asset");
assert(viteWasmUrlExport?.types === "./wasm/collision-kernel.wasm.d.ts", "Vite WASM URL export must expose an asset URL type");

assertPackageArtifacts();

const declarationEntry = readFileSync(join(rootDir, "dist/src/index.d.ts"), "utf8");
for (const declarationPath of filesUnder(join(rootDir, "dist")).filter((path) => path.endsWith(".d.ts"))) {
  const declarationSource = readFileSync(declarationPath, "utf8");
  assert(
    !/(?:from\s+|import\s+|import\s*\(\s*)["'][^"']+\.ts["']/.test(declarationSource),
    `declaration must not expose a TypeScript module specifier: ${declarationPath}`,
  );
}
const cameraDeclarations = readFileSync(join(rootDir, "dist/src/canvas/camera.d.ts"), "utf8");
assertCameraDeclarationSource(cameraDeclarations, "camera declarations");
assertCameraRootExportsSource(declarationEntry, "root declarations");
assertRootBrowserSubpathOnlyDeclarationsSource(declarationEntry, "root declarations");

const browserBuild = await import(pathToFileURL(join(rootDir, "browser/engine.js")).href);
const coreBuild = await import(pathToFileURL(join(rootDir, "dist/core.js")).href);
const wasmRuntimeBuild = await import(pathToFileURL(join(rootDir, "dist/wasm-runtime.js")).href);
const experimentalBuild = await import(pathToFileURL(join(rootDir, "dist/experimental.js")).href);
const netBuild = await import(pathToFileURL(join(rootDir, "dist/net.js")).href);
const protocolBuild = await import(pathToFileURL(join(rootDir, "dist/protocol.js")).href);
const serverBuild = await import(pathToFileURL(join(rootDir, "dist/server.js")).href);
const mmoBuild = await import(pathToFileURL(join(rootDir, "dist/mmo.js")).href);
const renderBuild = await import(pathToFileURL(join(rootDir, "dist/render.js")).href);
const render3dBuild = await import(pathToFileURL(join(rootDir, "dist/render-3d.js")).href);
const render3dCoreBuild = await import(pathToFileURL(join(rootDir, "dist/render-3d-core.js")).href);
const render3dSceneBuild = await import(pathToFileURL(join(rootDir, "dist/render-3d-scene.js")).href);
const render3dWebgl2Build = await import(pathToFileURL(join(rootDir, "dist/render-3d-webgl2.js")).href);
const physics3dBuild = await import(pathToFileURL(join(rootDir, "dist/physics-3d.js")).href);
const physics2dBuild = await import(pathToFileURL(join(rootDir, "dist/physics-2d.js")).href);
const rigid3dBuild = await import(pathToFileURL(join(rootDir, "dist/physics-rigid-3d.js")).href);
const motionBuild = await import(pathToFileURL(join(rootDir, "dist/motion.js")).href);
const motionThreeBuild = await import(pathToFileURL(join(rootDir, "dist/motion-three.js")).href);
const migrationsBuild = await import(pathToFileURL(join(rootDir, "dist/migrations.js")).href);
const projectBuild = await import(pathToFileURL(join(rootDir, "dist/project.js")).href);
const projectRuntime2dBuild = await import(pathToFileURL(join(rootDir, "dist/project-runtime-2d.js")).href);
const projectRuntimeNavigation2dBuild = await import(pathToFileURL(join(rootDir, "dist/project-runtime-navigation-2d.js")).href);
const projectRuntimeSave2dBuild = await import(pathToFileURL(join(rootDir, "dist/project-runtime-save-2d.js")).href);
const projectRuntimeStory2dBuild = await import(pathToFileURL(join(rootDir, "dist/project-runtime-story-2d.js")).href);
const projectRuntime3dBuild = await import(pathToFileURL(join(rootDir, "dist/project-runtime-3d.js")).href);
const projectFilesystemBuild = await import(pathToFileURL(join(rootDir, "dist/project-filesystem.js")).href);
const projectNeutralExportBuild = await import(pathToFileURL(join(rootDir, "dist/project-neutral-export.js")).href);
const navigationBuild = await import(pathToFileURL(join(rootDir, "dist/navigation.js")).href);
const contentBuild = await import(pathToFileURL(join(rootDir, "dist/content.js")).href);
const saveBuild = await import(pathToFileURL(join(rootDir, "dist/save.js")).href);
const saveBrowserBuild = await import(pathToFileURL(join(rootDir, "dist/save-browser.js")).href);
const audioBuild = await import(pathToFileURL(join(rootDir, "dist/audio.js")).href);
const effectsBuild = await import(pathToFileURL(join(rootDir, "dist/effects.js")).href);
const uiBuild = await import(pathToFileURL(join(rootDir, "dist/ui.js")).href);
const uiCoreBuild = await import(pathToFileURL(join(rootDir, "dist/ui-core.js")).href);
const assetLoaderBuild = await import(pathToFileURL(join(rootDir, "dist/assets/loader.js")).href);
const gltfStaticBuild = await import(pathToFileURL(join(rootDir, "dist/assets/gltf-static.js")).href);
const gltfSkinAnimationBuild = await import(pathToFileURL(join(rootDir, "dist/assets/gltf-skin-animation.js")).href);
const templateAssetsBuild = await import(pathToFileURL(join(rootDir, "dist/assets/templates.js")).href);
const prototypePostProcessingBuild = await import(pathToFileURL(join(rootDir, "dist/post-processing-prototype.js")).href);

const render3dSource = readFileSync(join(rootDir, "dist/render-3d.js"), "utf8");
assert(/from\s*["']three["']/.test(render3dSource), "render/3d must externalize its declared Three.js peer dependency");
const motionThreeSource = readFileSync(join(rootDir, "dist/motion-three.js"), "utf8");
assert(/from\s*["']three["']/.test(motionThreeSource), "motion/three must externalize its declared Three.js peer dependency");

const deferredRootExports = [
  "createOnScreenGamepad",
  "bindKey",
  "isActionDown",
  "isKeyDown",
  "installInputListeners",
  "setVirtualKeyState",
  "updateInputFrame",
  "createAssetLoader",
  "createAudioSystem",
  "createRenderer",
  "createSceneGraph",
] as const;

for (const exportName of deferredRootExports) {
  assert(!(exportName in browserBuild), `${exportName} must stay off the root/browser package surface until consumer proof earns it`);
}

function getDeclarationValueExports(source: string) {
  const declarationValueExports = new Set<string>();
  for (const [, clause] of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*["'][^"']+["'];/g)) {
    for (const rawExport of clause.split(",")) {
      const trimmedExport = rawExport.trim();
      if (!trimmedExport || trimmedExport.startsWith("type ")) continue;

      const exportedName = trimmedExport.split(/\s+as\s+/).at(-1)?.trim();
      assert(exportedName, `could not parse declaration export: ${trimmedExport}`);
      declarationValueExports.add(exportedName);
    }
  }
  for (const [, exportedName] of source.matchAll(/export\s+declare\s+(?:const|let|var|function|class|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    declarationValueExports.add(exportedName);
  }
  return declarationValueExports;
}

function assertRuntimeMatchesDeclarations(label: string, runtimeExports: Record<string, unknown>, declarationSource: string) {
  const declarationValueExports = getDeclarationValueExports(declarationSource);
  const runtimeValueExports = new Set(Object.keys(runtimeExports));
  const missingRuntimeExports = [...declarationValueExports].filter((exportName) => !runtimeValueExports.has(exportName));
  const extraRuntimeExports = [...runtimeValueExports].filter((exportName) => !declarationValueExports.has(exportName));
  assert(
    missingRuntimeExports.length === 0 && extraRuntimeExports.length === 0,
    [
      `${label} runtime exports must match generated declaration value exports.`,
      `Missing from ${label} runtime:`,
      ...(missingRuntimeExports.length ? missingRuntimeExports.map((exportName) => `- ${exportName}`) : ["- none"]),
      `Extra in ${label} runtime:`,
      ...(extraRuntimeExports.length ? extraRuntimeExports.map((exportName) => `- ${exportName}`) : ["- none"]),
      'Run "bun run build" from ./engine before smoke:package.',
    ].join("\n"),
  );
}

assertRuntimeMatchesDeclarations("browser", browserBuild, declarationEntry);
assertRuntimeMatchesDeclarations("core", coreBuild, readFileSync(join(rootDir, "dist/src/core.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("wasm", wasmRuntimeBuild, readFileSync(join(rootDir, "dist/src/wasm/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("experimental", experimentalBuild, readFileSync(join(rootDir, "dist/src/experimental/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("net", netBuild, readFileSync(join(rootDir, "dist/src/net/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("protocol", protocolBuild, readFileSync(join(rootDir, "dist/src/protocol/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("server", serverBuild, readFileSync(join(rootDir, "dist/src/server/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("mmo", mmoBuild, readFileSync(join(rootDir, "dist/src/mmo/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("render", renderBuild, readFileSync(join(rootDir, "dist/src/render/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("render/3d", render3dBuild, readFileSync(join(rootDir, "dist/src/render/3d.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("render/3d-core", render3dCoreBuild, readFileSync(join(rootDir, "dist/src/render/3d-core.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("render/3d-scene", render3dSceneBuild, readFileSync(join(rootDir, "dist/src/render/3d-scene.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("render/3d-webgl2", render3dWebgl2Build, readFileSync(join(rootDir, "dist/src/render/3d-webgl2.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("physics/3d", physics3dBuild, readFileSync(join(rootDir, "dist/src/physics/3d.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("physics/2d", physics2dBuild, readFileSync(join(rootDir, "dist/src/physics/2d.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("physics/rigid-3d", rigid3dBuild, readFileSync(join(rootDir, "dist/src/physics/rigid-3d.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("motion/three", motionThreeBuild, readFileSync(join(rootDir, "dist/src/motion/three.d.ts"), "utf8"));
for (const exportName of ["createPoseBuffer", "autoMapHumanoidRig", "compileMotionGraph", "createHumanoidMotionController"]) {
  assert(exportName in motionBuild, `motion build is missing ${exportName}`);
}
assert("migrateT3RigDocument" in migrationsBuild, "migrations build is missing migrateT3RigDocument");
assertRuntimeMatchesDeclarations("project", projectBuild, readFileSync(join(rootDir, "dist/src/project/index.d.ts"), "utf8"));
assert(projectBuild.HYPERFOCUS_PROJECT_PATH === ".hyperfocus/project.json", "project build must expose the portable JSON path");
assert(projectBuild.HYPERFOCUS_ASSETS_PATH === ".hyperfocus/assets.hfp", "project build must expose the portable ZIP path");
assertRuntimeMatchesDeclarations("project/runtime-2d", projectRuntime2dBuild, readFileSync(join(rootDir, "dist/src/project/runtime-2d.d.ts"), "utf8"));
assert(typeof projectRuntime2dBuild.createPlayableWorld === "function", "project/runtime-2d build must expose createPlayableWorld");
assertRuntimeMatchesDeclarations("project/runtime-navigation-2d", projectRuntimeNavigation2dBuild, readFileSync(join(rootDir, "dist/src/project/runtime-navigation-2d.d.ts"), "utf8"));
assert(typeof projectRuntimeNavigation2dBuild.createNavigationBehaviorRegistry2D === "function", "navigation runtime build must expose its registry factory");
assertRuntimeMatchesDeclarations("project/runtime-save-2d", projectRuntimeSave2dBuild, readFileSync(join(rootDir, "dist/src/project/runtime-save-2d.d.ts"), "utf8"));
assert(typeof projectRuntimeSave2dBuild.createPlayableSaveController2D === "function", "save runtime build must expose its controller factory");
assertRuntimeMatchesDeclarations("project/runtime-story-2d", projectRuntimeStory2dBuild, readFileSync(join(rootDir, "dist/src/project/runtime-story-2d.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("project/runtime-3d", projectRuntime3dBuild, readFileSync(join(rootDir, "dist/src/project/runtime-3d.d.ts"), "utf8"));
assert(typeof projectRuntimeStory2dBuild.createPlayableStoryController2D === "function", "story runtime build must expose its controller factory");
assertRuntimeMatchesDeclarations("project/filesystem", projectFilesystemBuild, readFileSync(join(rootDir, "dist/src/project/filesystem.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("project/neutral-export", projectNeutralExportBuild, readFileSync(join(rootDir, "dist/src/project/neutral-export.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("navigation", navigationBuild, readFileSync(join(rootDir, "dist/src/navigation/index.d.ts"), "utf8"));
assert(typeof navigationBuild.createGridNavigator === "function", "navigation build must expose createGridNavigator");
assertRuntimeMatchesDeclarations("content", contentBuild, readFileSync(join(rootDir, "dist/src/content/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("save", saveBuild, readFileSync(join(rootDir, "dist/src/save/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("save/browser", saveBrowserBuild, readFileSync(join(rootDir, "dist/src/save/browser.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("audio", audioBuild, readFileSync(join(rootDir, "dist/src/audio/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("effects", effectsBuild, readFileSync(join(rootDir, "dist/src/effects/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("ui", uiBuild, readFileSync(join(rootDir, "dist/src/ui/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("ui/core", uiCoreBuild, readFileSync(join(rootDir, "dist/src/ui/core.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("asset loader", assetLoaderBuild, readFileSync(join(rootDir, "dist/src/assets/loader.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("assets/gltf-static", gltfStaticBuild, readFileSync(join(rootDir, "dist/src/assets/gltf-static.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("assets/gltf-skin-animation", gltfSkinAnimationBuild, readFileSync(join(rootDir, "dist/src/assets/gltf-skin-animation.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations("template assets", templateAssetsBuild, readFileSync(join(rootDir, "dist/src/assets/templates/index.d.ts"), "utf8"));
assertRuntimeMatchesDeclarations(
  "prototype post-processing",
  prototypePostProcessingBuild,
  readFileSync(join(rootDir, "dist/src/canvas/post-processing-prototype.d.ts"), "utf8"),
);

for (const exportName of [
  "createFixedStepLoop",
  "animationApiProfiles",
  "atlasApiProfiles",
  "createCollisionBroadphase",
  "createCollisionKernel",
  "resolveCollisionKernelWasmUrl",
  "circleRectOverlap",
  "GameMap",
  "postProcessApiProfiles",
  "SeedableRandom",
]) {
  assert(exportName in browserBuild, `browser build is missing ${exportName}`);
}

for (const exportName of ["bloom", "glitch", "pixelate", "motionBlur"]) {
  assert(!(exportName in browserBuild), `${exportName} must move off root/browser and into @hyperfocus/engine/post-processing/prototype`);
  assert(exportName in prototypePostProcessingBuild, `prototype post-processing build is missing ${exportName}`);
}

for (const exportName of ["createPeerGroup", "createMemoryPeerGroup", "createSharedStore", "createRollbackLoop", "createMultiplayer"]) {
  assert(exportName in netBuild, `net build is missing ${exportName}`);
}

for (const exportName of ["defineSchema", "encodeSnapshot", "decodeSnapshot", "encodeDelta", "decodeDelta", "encodeReplicationFrame", "decodeReplicationFrame"]) {
  assert(exportName in protocolBuild, `protocol build is missing ${exportName}`);
}

for (const exportName of [
  "SignedSessionAuthority",
  "createAuthoritativeServer",
  "createDurableMmoServices",
  "createMemoryDurableServiceStore",
  "createEntityReplicator",
  "createGracefulDrainController",
  "createInterestGrid",
  "createMmo1000Preset",
  "createMmoInterestGrid",
  "createPortableMemoryPersistenceAdapter",
  "createPortablePersistenceBackup",
  "createRoomType",
  "createServerOperations",
  "restorePortablePersistenceBackup",
]) {
  assert(exportName in serverBuild, `server build is missing ${exportName}`);
}

for (const exportName of [
  "createMmoCombatModule",
  "useMmoConsumable",
  "createMmoEntityCollectionBridge",
  "createMmoWorld",
  "createMmoRoomType",
  "createMmoEntityRegistry",
  "createMmoInterestSnapshotter",
  "createMmoPersistenceBridge",
  "createMmoGameplayKit",
  "createMmoClient",
  "createEntityInterpolator",
  "createInputMapper",
  "createMmoInventoryOps",
  "addMmoId",
  "hasMmoId",
  "parseMmoIdSet",
  "removeMmoId",
  "createMmoOccupancyTester",
  "moveMmoCircle",
  "rectAroundPoint",
  "teleportMmoEntityToTile",
  "findMmoEntityNearAim",
  "findNearestMmoEntity",
  "pointSegmentDistance",
]) {
  assert(exportName in mmoBuild, `mmo build is missing ${exportName}`);
  assert(!(exportName in browserBuild), `${exportName} must stay off root/browser and inside @hyperfocus/engine/mmo`);
}

for (const exportName of [
  "drawRenderable",
  "createCanvasRenderStage",
  "createRenderStage",
  "sortRenderCallsByY",
  "cullRenderCallsToRect",
  "resolveSpriteSheetFrame",
  "createTileCacheRenderer",
  "createActorRenderer",
  "createHudRenderer",
  "createEffectQueue",
  "truncateText",
  "wrapText",
  "createBarDrawCall",
  "createLabelDrawCall",
  "createInteractionOutlineDrawCall",
  "createTextBlockDrawCall",
]) {
  assert(exportName in renderBuild, `render build is missing ${exportName}`);
  assert(!(exportName in browserBuild), `${exportName} must stay off root/browser and inside @hyperfocus/engine/render`);
}

assert("createThreeRender3D" in render3dBuild, "render/3d build is missing createThreeRender3D");
assert("createThirdPersonCameraRig3D" in render3dBuild, "render/3d build is missing createThirdPersonCameraRig3D");
assert(!("createThreeRender3D" in browserBuild), "createThreeRender3D must stay off root/browser and inside @hyperfocus/engine/render/3d");
assert(!("createThirdPersonCameraRig3D" in browserBuild), "createThirdPersonCameraRig3D must stay off root/browser and inside @hyperfocus/engine/render/3d");

for (const exportName of ["createKinematicCharacter3D", "collidersOverlap3D", "submersionRatio", "applyOverTime", "rubberBand"]) {
  assert(exportName in physics3dBuild, `physics/3d build is missing ${exportName}`);
  assert(!(exportName in browserBuild), `${exportName} must stay off root/browser and inside @hyperfocus/engine/physics/3d`);
}

assert("createMmoUiShell" in uiBuild, "ui build is missing createMmoUiShell");
assert(!("createMmoUiShell" in browserBuild), "createMmoUiShell must stay off root/browser and inside @hyperfocus/engine/ui");
assert("createMmoUiController" in uiCoreBuild, "ui/core build is missing createMmoUiController");
assert("connectUiRenderer" in uiCoreBuild, "ui/core build is missing connectUiRenderer");
assert(!("createMmoUiShell" in uiCoreBuild), "ui/core must stay DOM-free and omit createMmoUiShell");

for (const exportName of ["templateAssetManifest", "resolveTemplateAssetUrl", "loadTemplateImages"]) {
  assert(exportName in templateAssetsBuild, `template assets build is missing ${exportName}`);
  assert(!(exportName in browserBuild), `${exportName} must stay off root/browser and inside @hyperfocus/engine/assets/templates`);
}

for (const exportName of ["createAssetLoader", "createSmoothedAssetProgress", "createCanvasAssetLoader", "createAssetLoaderUi"]) {
  assert(exportName in assetLoaderBuild, `asset loader build is missing ${exportName}`);
  assert(!(exportName in browserBuild), `${exportName} must stay off root/browser and inside @hyperfocus/engine/assets/loader`);
}

assert(typeof browserBuild.createFixedStepLoop === "function", "browser build is missing createFixedStepLoop");
assert(typeof browserBuild.createCollisionBroadphase === "function", "browser build is missing createCollisionBroadphase");
assert(typeof browserBuild.createCollisionKernel === "function", "browser build is missing createCollisionKernel");
assert(typeof browserBuild.GameMap === "function", "browser build is missing GameMap");
assert(typeof browserBuild.resolveCollisionKernelWasmUrl === "function", "browser build is missing resolveCollisionKernelWasmUrl");
assert(typeof browserBuild.circleRectOverlap === "function", "browser build is missing circleRectOverlap");

const postProcessApiProfiles = browserBuild.postProcessApiProfiles as Record<
  string,
  { status?: string; promotion?: string; exposure?: string }
>;

function assertStableRootProfiles(label: string, profiles: Record<string, { status?: string; proof?: string; exposure?: string }>) {
  assert(Object.keys(profiles).length > 0, `${label} profiles must not be empty`);
  for (const [name, profile] of Object.entries(profiles)) {
    assert(profile.status === "stable", `${label}.${name} must stay stable while exposed from root`);
    assert(profile.proof === "engine-contract", `${label}.${name} root exposure must keep engine-contract proof`);
    assert(profile.exposure === "root", `${label}.${name} must stay classified as root exposure`);
  }
}

assertStableRootProfiles(
  "animationApiProfiles",
  browserBuild.animationApiProfiles as Record<string, { status?: string; proof?: string; exposure?: string }>
);
assertStableRootProfiles(
  "atlasApiProfiles",
  browserBuild.atlasApiProfiles as Record<string, { status?: string; proof?: string; exposure?: string }>
);

for (const [name, profile] of Object.entries(postProcessApiProfiles)) {
  if (profile.status === "prototype") {
    assert(profile.promotion === "blocked", `${name} prototype post-processing helper must stay promotion-blocked`);
    assert(profile.exposure === "prototype-subpath", `${name} prototype post-processing helper must stay quarantined in the prototype subpath`);
  }
  if (profile.status === "stable") {
    assert(profile.promotion === "stable", `${name} stable post-processing helper must keep stable promotion metadata`);
    assert(profile.exposure === "root", `${name} stable post-processing helper must keep root exposure metadata`);
  }
}

if (!runExternalConsumer) {
  process.exit(0);
}

const packDir = mkdtempSync(join(tmpdir(), "catalog-engine-pack-"));
try {
  const packOutput = await $`${npmCommand} pack --dry-run --json --pack-destination ${packDir}`.cwd(rootDir).text();
  const [pack] = JSON.parse(packOutput) as Array<{ files: Array<{ path: string }> }>;
  const packedFiles = new Set(pack.files.map((file) => file.path));

  for (const path of [
    "package.json",
    "browser/engine.js",
    "dist/src/index.d.ts",
    "dist/core.js",
    "dist/src/core.d.ts",
    "dist/wasm-runtime.js",
    "dist/src/wasm/index.d.ts",
    "dist/experimental.js",
    "dist/src/experimental/index.d.ts",
    "dist/net.js",
    "dist/src/net/index.d.ts",
    "dist/protocol.js",
    "dist/src/protocol/index.d.ts",
    "dist/server.js",
    "dist/src/server/index.d.ts",
    "dist/mmo.js",
    "dist/src/mmo/index.d.ts",
    "dist/render.js",
    "dist/src/render/index.d.ts",
    "dist/render-3d.js",
    "dist/src/render/3d.d.ts",
    "dist/render-3d-core.js",
    "dist/src/render/3d-core.d.ts",
    "dist/render-3d-scene.js",
    "dist/src/render/3d-scene.d.ts",
    "dist/render-3d-webgl2.js",
    "dist/src/render/3d-webgl2.d.ts",
    "dist/physics-3d.js",
    "dist/src/physics/3d.d.ts",
    "dist/physics-2d.js",
    "dist/src/physics/2d.d.ts",
    "dist/physics-rigid-3d.js",
    "dist/src/physics/rigid-3d.d.ts",
    "dist/motion.js",
    "dist/src/motion/index.d.ts",
    "dist/motion-three.js",
    "dist/src/motion/three.d.ts",
    "dist/migrations.js",
    "dist/src/migrations/index.d.ts",
    "dist/project.js",
    "dist/src/project/index.d.ts",
    "dist/project-runtime-2d.js",
    "dist/src/project/runtime-2d.d.ts",
    "dist/project-runtime-navigation-2d.js",
    "dist/src/project/runtime-navigation-2d.d.ts",
    "dist/project-runtime-save-2d.js",
    "dist/src/project/runtime-save-2d.d.ts",
    "dist/project-runtime-story-2d.js",
    "dist/src/project/runtime-story-2d.d.ts",
    "dist/project-runtime-3d.js",
    "dist/src/project/runtime-3d.d.ts",
    "dist/project-filesystem.js",
    "dist/src/project/filesystem.d.ts",
    "dist/project-neutral-export.js",
    "dist/src/project/neutral-export.d.ts",
    "dist/navigation.js",
    "dist/src/navigation/index.d.ts",
    "dist/content.js",
    "dist/src/content/index.d.ts",
    "dist/save.js",
    "dist/src/save/index.d.ts",
    "dist/save-browser.js",
    "dist/src/save/browser.d.ts",
    "dist/audio.js",
    "dist/src/audio/index.d.ts",
    "dist/effects.js",
    "dist/src/effects/index.d.ts",
    "dist/ui.js",
    "dist/src/ui/index.d.ts",
    "dist/ui-core.js",
    "dist/src/ui/core.d.ts",
    "dist/assets/loader.js",
    "dist/src/assets/loader.d.ts",
    "dist/assets/gltf-static.js",
    "dist/src/assets/gltf-static.d.ts",
    "dist/assets/gltf-skin-animation.js",
    "dist/src/assets/gltf-skin-animation.d.ts",
    "dist/assets/templates.js",
    "dist/src/assets/templates/index.d.ts",
    "dist/post-processing-prototype.js",
    "dist/src/canvas/post-processing-prototype.d.ts",
    "docs/architectural-resilience-matrix.md",
    "docs/schema/editor-project-v2.schema.json",
    "docs/licensing-model.md",
    "wasm/collision-kernel.wasm",
    "wasm/collision-kernel.wasm.d.ts",
    "readme.md",
    "third-party-notices.md",
  ]) {
    assert(packedFiles.has(path), `package tarball would omit ${path}`);
  }

  const allowedPackedFiles = new Set([
    "package.json",
    ...expectedPackageFiles.filter((path) => path !== "dist/src/"),
  ]);
  const unexpectedPackedFiles = [...packedFiles].filter(
    (path) =>
      !allowedPackedFiles.has(path) &&
      !(path.startsWith("dist/src/") && (path.endsWith(".d.ts") || path.endsWith(".d.ts.map"))),
  );
  assert(
    unexpectedPackedFiles.length === 0,
    [
      "package tarball contains files outside the public artifact allowlist:",
      ...unexpectedPackedFiles.map((path) => `- ${path}`),
    ].join("\n"),
  );

  const consumerDir = mkdtempSync(join(tmpdir(), "catalog-engine-consumer-"));
  try {
    const tarballOutput = await $`${npmCommand} pack --json --pack-destination ${packDir}`.cwd(rootDir).text();
    const [tarball] = JSON.parse(tarballOutput) as Array<{ filename: string }>;
    const tarballPath = join(packDir, tarball.filename);
    const tscPath = findAncestorTool(rootDir, join("node_modules", ".bin", process.platform === "win32" ? "tsc.exe" : "tsc"));
    const threePath = join(rootDir, "node_modules", "three");
    const threeTypesPath = join(rootDir, "node_modules", "@types", "three");
    const localPeerPackages = {
      three: threePath,
      "@types/three": threeTypesPath,
      "@tweenjs/tween.js": join(rootDir, "node_modules", "@tweenjs", "tween.js"),
      "@types/stats.js": join(rootDir, "node_modules", "@types", "stats.js"),
      "@types/webxr": join(rootDir, "node_modules", "@types", "webxr"),
      fflate: join(rootDir, "node_modules", "fflate"),
      meshoptimizer: join(rootDir, "node_modules", "meshoptimizer"),
    };

    assert(tscPath, "local TypeScript install is required for offline consumer typecheck");
    assert(existsSync(threePath), "local Three.js install is required for the offline render/3d consumer");
    assert(existsSync(threeTypesPath), "local Three.js type install is required for the offline render/3d consumer");
    for (const [packageName, packagePath] of Object.entries(localPeerPackages)) {
      assert(existsSync(packagePath), `local ${packageName} install is required for the offline render/3d type consumer`);
    }

    writeFileSync(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          type: "module",
          dependencies: {
            "@hyperfocus/engine": tarballPath,
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(consumerDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            lib: ["ES2022", "DOM"],
            module: "ESNext",
            moduleResolution: "Bundler",
            noEmit: true,
            skipLibCheck: false,
            strict: true,
            target: "ES2022",
          },
          include: [
            "consumer.ts",
            "core-consumer.ts",
            "browser-consumer.ts",
            "net-consumer.ts",
            "protocol-consumer.ts",
            "server-consumer.ts",
            "mmo-consumer.ts",
            "render-consumer.ts",
            "render-3d-consumer.ts",
            "render-3d-core-consumer.ts",
            "render-3d-scene-consumer.ts",
            "render-3d-webgl2-consumer.ts",
            "physics-3d-consumer.ts",
            "physics-2d-consumer.ts",
            "physics-rigid-3d-consumer.ts",
            "motion-consumer.ts",
            "motion-three-consumer.ts",
            "migrations-consumer.ts",
            "project-consumer.ts",
            "project-runtime-2d-consumer.ts",
            "project-runtime-navigation-2d-consumer.ts",
            "project-runtime-save-2d-consumer.ts",
            "project-runtime-story-2d-consumer.ts",
            "project-runtime-3d-consumer.ts",
            "project-filesystem-consumer.ts",
            "project-neutral-export-consumer.ts",
            "navigation-consumer.ts",
            "content-consumer.ts",
            "save-consumer.ts",
            "save-browser-consumer.ts",
            "audio-consumer.ts",
            "effects-consumer.ts",
            "subpath-negative-consumer.ts",
            "ui-consumer.ts",
            "ui-core-consumer.ts",
            "asset-loader-consumer.ts",
            "gltf-static-consumer.ts",
            "gltf-skin-animation-consumer.ts",
            "template-assets-consumer.ts",
            "prototype-post-processing-consumer.ts",
          ],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(consumerDir, "tsconfig.nodenext.json"),
      JSON.stringify(
        {
          compilerOptions: {
            lib: ["ES2022", "DOM"],
            module: "NodeNext",
            moduleResolution: "NodeNext",
            noEmit: true,
            skipLibCheck: false,
            strict: true,
            target: "ES2022",
          },
          include: [
            "consumer.ts",
            "core-consumer.ts",
            "browser-consumer.ts",
            "net-consumer.ts",
            "protocol-consumer.ts",
            "server-consumer.ts",
            "mmo-consumer.ts",
            "render-consumer.ts",
            "render-3d-consumer.ts",
            "render-3d-core-consumer.ts",
            "render-3d-scene-consumer.ts",
            "render-3d-webgl2-consumer.ts",
            "physics-3d-consumer.ts",
            "physics-2d-consumer.ts",
            "physics-rigid-3d-consumer.ts",
            "motion-consumer.ts",
            "motion-three-consumer.ts",
            "migrations-consumer.ts",
            "project-consumer.ts",
            "project-runtime-2d-consumer.ts",
            "project-runtime-navigation-2d-consumer.ts",
            "project-runtime-save-2d-consumer.ts",
            "project-runtime-story-2d-consumer.ts",
            "project-runtime-3d-consumer.ts",
            "project-filesystem-consumer.ts",
            "project-neutral-export-consumer.ts",
            "navigation-consumer.ts",
            "content-consumer.ts",
            "save-consumer.ts",
            "save-browser-consumer.ts",
            "audio-consumer.ts",
            "effects-consumer.ts",
            "subpath-negative-consumer.ts",
            "ui-consumer.ts",
            "ui-core-consumer.ts",
            "asset-loader-consumer.ts",
            "gltf-static-consumer.ts",
            "gltf-skin-animation-consumer.ts",
            "template-assets-consumer.ts",
            "prototype-post-processing-consumer.ts",
          ],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(consumerDir, "core-consumer.ts"),
      [
        'import { circleRectOverlap, createAabb, createCollisionBroadphase, createObjectPool, createStage, gridKey } from "@hyperfocus/engine/core";',
        "",
        "const key: string = gridKey({ x: 2, y: 3 });",
        "const hit: boolean = circleRectOverlap({ x: 0, y: 0, r: 4 }, { x: 2, y: 2, w: 8, h: 8 });",
        "const broadphase = createCollisionBroadphase<string>();",
        "broadphase.upsert('player', createAabb(0, 0, 10, 10));",
        "broadphase.upsert('coin', createAabb(8, 8, 2, 2));",
        "const pool = createObjectPool({ create: () => ({ active: false }), reset: (item) => { item.active = false; } });",
        "const entity = pool.acquire();",
        "entity.active = true;",
        "const stage = createStage<typeof entity>();",
        "stage.spawn(entity);",
        "if (key !== '2,3' || hit !== true || broadphase.pairs().length !== 1 || stage.count() !== 1) throw new Error('unexpected core result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "consumer.ts"),
      [
        'import { circleRectOverlap, createAabb, createAnimationClip, createAnimationPlayer, createAtlasClip, createCamera, createCollisionBroadphase, createCollisionKernel, createFixedStepLoop, createTextureAtlas, createTileset, extractCollisionRects, GameMap, generateTileMap, getTileAt, resolveCollisionKernelWasmUrl, seededRandom, type AnimationClip, type Camera, type CollisionKernelOptions, type InitOptions, type KeyboardActionOptions, type MapMarker, type ScaleMode, type TextureAtlas, type TileMap } from "@hyperfocus/engine";',
        'import wasmPath from "@hyperfocus/engine/wasm/collision-kernel.wasm";',
        'import viteWasmPath from "@hyperfocus/engine/wasm/collision-kernel.wasm?url";',
        "",
        "const camera: Camera = createCamera({ viewportWidth: 320, viewportHeight: 180 });",
        "camera.pan(8, 4).zoomTo(2).setViewport(640, 360).clearFollow().update();",
        "const cameraX: number = camera.visibleRect().x;",
        "const gameMap = new GameMap({ shape: 'circle', pixelX: 0, pixelY: 0, width: 64, height: 64, zoom: 1, mode: 'FOLLOW_TARGET', borderStyle: false, compass: false });",
        "const mapMarkers: MapMarker[] = [{ id: 'player', worldX: 0, worldY: 0, color: '#fff' }];",
        "gameMap.update(0, 0, 0, 0);",
        "const mapPoint = gameMap.worldToMapSpace(mapMarkers[0].worldX, mapMarkers[0].worldY);",
        "const scaleMode: ScaleMode = 'fit';",
        "const initOptions: InitOptions = { width: 320, height: 180, scaleMode };",
        "const keyboardOptions: KeyboardActionOptions = { resetOnBlur: true };",
        "const loop = createFixedStepLoop({ update: () => undefined, render: () => undefined });",
        "loop.stop();",
        "const atlas: TextureAtlas = createTextureAtlas({ frames: { idle_0: { frame: { x: 0, y: 0, w: 8, h: 8 } }, idle_1: { frame: { x: 8, y: 0, w: 8, h: 8 } } } });",
        "const clip: AnimationClip = createAnimationClip({ id: 'idle', frames: ['idle_0', 'idle_1'], frameDurationMs: 100 });",
        "const player = createAnimationPlayer(clip, atlas).play().update(100);",
        "const atlasClip = createAtlasClip(atlas, ['idle_0', 'idle_1'], { framesPerSecond: 10 });",
        "const broadphase = createCollisionBroadphase<number>();",
        "broadphase.upsert(1, createAabb(0, 0, 10, 10));",
        "broadphase.upsert(2, createAabb(20, 20, 5, 5));",
        "const tileset = createTileset({ tileSize: 8, columns: 2, tileCount: 2, tiles: { 1: { tags: ['solid'], solid: true } } });",
        "const map: TileMap = generateTileMap({ tileset, width: 4, height: 4, baseTile: 0, seed: 'consumer-map', rules: [{ type: 'border', tile: 1 }] });",
        "const collisionRects = extractCollisionRects(map);",
        "const seeded = seededRandom('consumer-map')();",
        "const overlaps: boolean = circleRectOverlap({ x: 0, y: 0, r: 4 }, { x: 2, y: 2, w: 8, h: 8 });",
        "const defaultWasmUrl: string = resolveCollisionKernelWasmUrl();",
        "const kernelOptions: CollisionKernelOptions = { url: String(wasmPath), onFallback: (diagnostic) => { if (diagnostic.reason === 'fetch') console.info(diagnostic.url); } };",
        "const viteWasmUrl: string = String(viteWasmPath).replaceAll('\\\\', '/');",
        "if (!defaultWasmUrl.endsWith('/wasm/collision-kernel.wasm')) throw new Error('unexpected default wasm url');",
        "if (!viteWasmUrl.endsWith('/wasm/collision-kernel.wasm')) throw new Error('unexpected Vite wasm url');",
        "const kernel = await createCollisionKernel(kernelOptions);",
        "const maybeFastOverlap: boolean = kernel.circleRectOverlap({ x: 0, y: 0, r: 1 }, { x: 5, y: 5, w: 1, h: 1 });",
        "if (!Number.isFinite(cameraX) || mapPoint.x !== 32 || mapPoint.y !== 32 || initOptions.scaleMode !== 'fit' || keyboardOptions.resetOnBlur !== true || player.getCurrentAtlasFrame()?.name !== 'idle_1' || atlasClip.update(0.1).name !== 'idle_1' || broadphase.query(createAabb(1, 1, 1, 1))[0] !== 1 || getTileAt(map, 0, 0)?.tileId !== 1 || collisionRects.length === 0 || !Number.isFinite(seeded) || overlaps !== true || maybeFastOverlap !== false) throw new Error('unexpected engine result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "browser-consumer.ts"),
      [
        'import { createFixedStepLoop, init } from "@hyperfocus/engine/browser";',
        "",
        "const options: Parameters<typeof init>[0] = { width: 320, height: 180 };",
        "const loop = createFixedStepLoop({ update: () => undefined, render: () => undefined });",
        "loop.stop();",
        "if (typeof init !== 'function' || options.width !== 320) throw new Error('unexpected browser subpath result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "net-consumer.ts"),
      [
        'import { createMemoryPeerGroup, createSharedStore, createRollbackLoop, type PeerGroup } from "@hyperfocus/engine/net";',
        "",
        "const a: PeerGroup = createMemoryPeerGroup({ lobbyId: 'consumer', peerId: 'a' });",
        "const b = createMemoryPeerGroup({ lobbyId: 'consumer', peerId: 'b' });",
        "const store = createSharedStore({ players: { a: { color: 'red' } } });",
        "store.players.a.color = 'blue';",
        "let state = { x: 0 };",
        "const loop = createRollbackLoop({ peerIds: ['a'], localPeerId: 'a', defaultInput: 0, getLocalInput: () => 1, getState: () => state, setState: (next) => { state = next; }, update: (inputs) => { state.x += inputs.a; } });",
        "loop.tick();",
        "if (a.peers()[0]?.id !== 'b' || b.peers()[0]?.id !== 'a' || store.players.a.color !== 'blue' || state.x !== 1) throw new Error('unexpected net result');",
        "a.close();",
        "b.close();",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "protocol-consumer.ts"),
      [
        'import { defineSchema, encodeSnapshot, decodeSnapshot, encodeDelta, decodeDelta, encodeReplicationFrame, decodeReplicationFrame } from "@hyperfocus/engine/protocol";',
        "",
        "const schema = defineSchema<{ id: string; x: number; hp: number }>({ id: 'string:16', x: 'f32', hp: 'u16' });",
        "const before = { id: 'p1', x: 1, hp: 10 };",
        "const after = { id: 'p1', x: 2, hp: 10 };",
        "const snapshot = encodeSnapshot(schema, before);",
        "const decoded = decodeSnapshot<typeof before>(schema, snapshot);",
        "const delta = encodeDelta(schema, before, after);",
        "const frame = decodeReplicationFrame(encodeReplicationFrame({ kind: 'delta', sequence: 1, baseline: 0, bytes: delta }));",
        "if (decoded.id !== 'p1' || frame.sequence !== 1 || decodeDelta(schema, before, frame.bytes).x !== 2) throw new Error('unexpected protocol result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "server-consumer.ts"),
      [
        'import { SignedSessionAuthority, createAuthoritativeServer, createDurableMmoServices, createGracefulDrainController, createMemoryDurableServiceStore, createRoomType, createInterestGrid, createMmo1000Preset, createMmoInterestGrid, createPortableMemoryPersistenceAdapter, createPortablePersistenceBackup, createServerOperations, restorePortablePersistenceBackup, type PortablePersistenceSnapshot, type ServerOperationsHealth } from "@hyperfocus/engine/server";',
        'import { defineSchema } from "@hyperfocus/engine/protocol";',
        "",
        "const room = createRoomType<{ ticks: number }>({ name: 'field', schema: defineSchema<{ ticks: number }>({ ticks: 'u16' }), createState: () => ({ ticks: 0 }), update: (ctx) => { ctx.state.ticks += 1; } });",
        "const scale = createMmo1000Preset({ publicRoomType: 'field', publicRoomPrefix: 'field', publicRooms: 1, playersPerRoom: 2 });",
        "const server = createAuthoritativeServer({ transport: 'websocket', port: 0, rooms: [room], scale });",
        "await server.tick();",
        "const grid = createInterestGrid({ cellSize: 32 });",
        "const mmoGrid = createMmoInterestGrid();",
        "grid.upsert({ id: 'e1', x: 0, y: 0 });",
        "mmoGrid.upsert({ id: 'm1', x: 0, y: 0 });",
        "const state = server.rooms()[0].ctx.state as { ticks: number };",
        "const secret = new Uint8Array(32).fill(7);",
        "let nonce = 0;",
        "const persistence = createPortableMemoryPersistenceAdapter();",
        "await persistence.savePlayer('player-1', { score: 3 });",
        "const operations = createServerOperations({ sessions: { issuer: 'consumer-game', audience: 'consumer-server', keys: [{ id: 'active', secret }], activeKeyId: 'active', nonce: () => `consumer-${++nonce}` }, persistence });",
        "const durable = createDurableMmoServices(createMemoryDurableServiceStore());",
        "await durable.inventory.grant('player-1', 'potion', 2, undefined, 'grant-1');",
        "await durable.economy.credit('player-1', 'gold', 20, 'system', 'credit-1');",
        "if (!(operations.sessions instanceof SignedSessionAuthority)) throw new Error('unexpected session authority');",
        "const token = await operations.sessions.issue('player-1', { attributes: { role: 'player' } });",
        "const identity = await operations.auth.verify(token);",
        "const backup = await operations.backup({ createdAt: 1 });",
        "await persistence.savePlayer('player-1', { score: 9 });",
        "const health: ServerOperationsHealth = operations.health({ rooms: 1, players: 1 });",
        "await operations.drain.shutdown(() => undefined, { drainTimeoutMs: 100, stopTimeoutMs: 100 });",
        "const restored: PortablePersistenceSnapshot = await operations.restore(backup);",
        "const directBackup = await createPortablePersistenceBackup(persistence, { createdAt: 2 });",
        "await restorePortablePersistenceBackup(persistence, directBackup);",
        "const standaloneDrain = createGracefulDrainController({ maxInFlight: 1 });",
        "await standaloneDrain.run('smoke', async () => undefined);",
        "await standaloneDrain.shutdown(() => undefined, { drainTimeoutMs: 100, stopTimeoutMs: 100 });",
        "if (state.ticks !== 1 || grid.query({ x: 0, y: 0, radius: 10 })[0] !== 'e1' || mmoGrid.query({ x: 0, y: 0, radius: 10 })[0] !== 'm1' || !identity.ok || identity.userId !== 'player-1' || health.status !== 'ok' || restored.players[0]?.id !== 'player-1' || (await persistence.loadPlayer('player-1') as { score: number }).score !== 3 || (await durable.inventory.list('player-1')).items[0]?.quantity !== 2 || await durable.economy.balance('player-1', 'gold') !== 20) throw new Error('unexpected server result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "mmo-consumer.ts"),
      [
        'import { addMmoId, createEntityInterpolator, createInputMapper, createMmoClient, createMmoCombatModule, createMmoEntityCollectionBridge, createMmoEntityRegistry, createMmoGameplayKit, createMmoInterestSnapshotter, createMmoInventoryOps, createMmoPersistenceBridge, createMmoRoomType, createMmoWorld, findMmoEntityNearAim, findNearestMmoEntity, hasMmoId, moveMmoCircle, parseMmoIdSet, pointSegmentDistance, rectAroundPoint, removeMmoId, teleportMmoEntityToTile, useMmoConsumable } from "@hyperfocus/engine/mmo";',
        "",
        "const registry = createMmoEntityRegistry({ initialEntities: [{ id: 'p1', type: 'player', x: 0, y: 0, ownerId: 'p1', publicData: { name: 'Mira' }, ownerData: { gold: 3 } }, { id: 'loot-1', type: 'loot', x: 4, y: 0, ownerId: 'p1', visibility: 'owner', publicData: { itemId: 'gold' } }] });",
        "const snapshotter = createMmoInterestSnapshotter({ registry, defaultRadius: 32 });",
        "const snapshot = snapshotter.snapshotFor('p1', { x: 0, y: 0, radius: 32 });",
        "const bridge = createMmoEntityCollectionBridge({ entities: registry.all() });",
        "const inv = createMmoInventoryOps({ aliases: { berry: 'berries' } });",
        "const bag: Record<string, number> = {};",
        "inv.add(bag, 'berry', 2);",
        "const actor = { hp: 1, maxHp: 5 };",
        "const used = useMmoConsumable(actor, bag, 'berries', { berries: { apply: ({ actor }) => { actor.hp = actor.maxHp; } } });",
        "const flags = addMmoId(parseMmoIdSet(['seen']), 'ready');",
        "removeMmoId(flags, 'seen');",
        "const combat = createMmoCombatModule<{ id: string }, { hp: number }>({ mitigate: ({ amount }) => amount - 1 });",
        "const target = { hp: 4 };",
        "const hit = combat.damage({ id: 'a' }, target, 3);",
        "const mover = { x: 1, y: 1, radius: 1 };",
        "moveMmoCircle(mover, 2, 0, { rectBlocked: () => false, circleBlocked: () => false, blockedAt: () => false });",
        "const rect = rectAroundPoint(mover, 1);",
        "const teleport = teleportMmoEntityToTile(mover, 2, 3, 8);",
        "const nearest = findNearestMmoEntity({ x: 0, y: 0 }, [{ id: 'n', x: 3, y: 0 }]);",
        "const aimed = findMmoEntityNearAim({ x: 0, y: 0 }, { x: 4, y: 0 }, [{ id: 'a', x: 3, y: 1 }], { maxAimDistance: 2 });",
        "const segment = pointSegmentDistance({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 });",
        "const kit = createMmoGameplayKit({ skills: [{ id: 'combat' }], lootTables: { goblin: [{ itemId: 'gold', min: 1, max: 1 }] }, quests: [{ id: 'first', goals: { talk: 1 } }] });",
        "const progress = { combat: { xp: 0, level: 1 } };",
        "kit.awardXp(progress, 'combat', 100);",
        "const world = createMmoWorld({ id: 'consumer-mmo', gameplay: kit });",
        "const persistence = createMmoPersistenceBridge<{ id: string }>({ key: (player) => player.userId });",
        "const room = createMmoRoomType({ name: 'room', world: {}, update: ({ ctx }) => { ctx.state.tick += 1; } });",
        "const client = createMmoClient<{ entities: Record<string, never> }>({ transport: { connect: async () => undefined, close: () => undefined, sendInput: () => undefined, onSnapshot: () => () => undefined } });",
        "const mapper = createInputMapper({ pointerActions: { primary: 'attack' } });",
        "const mapped = mapper.map({ pointer: { x: 4, y: 0, primaryDown: true }, actor: { x: 0, y: 0 }, candidates: [{ id: 'goblin', x: 8, y: 0, type: 'npc' }] });",
        "const interpolator = createEntityInterpolator();",
        "interpolator.pushSnapshot({ entities: snapshot.snapshot.entities }, 0);",
        "if (!snapshot.visibleIds.includes('loot-1') || bridge.ids({ viewerId: 'p1' }).length !== 2 || bridge.ids().length !== 1 || inv.get(bag, 'berries') !== 1 || !used.ok || !hasMmoId(flags, 'ready') || target.hp !== 2 || hit.amount !== 2 || rect.width !== 2 || !teleport.ok || nearest?.id !== 'n' || aimed?.id !== 'a' || segment !== 1 || progress.combat.level < 2 || world.id !== 'consumer-mmo' || persistence.keyFor({ id: 'p', userId: 'u' } as never) !== 'u' || room.name !== 'room' || typeof client.connect !== 'function' || mapped.action !== 'attack' || !interpolator.sample(0).p1) throw new Error('unexpected mmo result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "render-consumer.ts"),
      [
        'import { createActorRenderer, createBarDrawCall, createCanvasRenderStage, createEffectQueue, createHudRenderer, createInteractionOutlineDrawCall, createLabelDrawCall, createRenderStage, createTextBlockDrawCall, createTileCacheRenderer, cullRenderCallsToRect, drawRenderable, resolveSpriteSheetFrame, sortRenderCallsByY, truncateText, wrapText, type RenderDrawContext } from "@hyperfocus/engine/render";',
        "",
        "const calls: string[] = [];",
        "const ctx = { canvas: { width: 64, height: 64 }, globalAlpha: 1, font: '10px sans-serif', save() {}, restore() {}, clearRect() {}, scale() {}, translate() {}, rotate() {}, beginPath() {}, closePath() {}, arc() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {}, fill() { calls.push('fill-path'); }, stroke() { calls.push('stroke'); }, moveTo() {}, lineTo() {}, setLineDash() {}, fillRect() { calls.push('fill'); }, strokeRect() { calls.push('stroke-rect'); }, drawImage() { calls.push('image'); }, fillText(text: string) { calls.push(text); }, strokeText() {}, measureText(text: string) { return { width: text.length * 8 }; } } as unknown as CanvasRenderingContext2D;",
        "const stage = createRenderStage(ctx, {});",
        "stage.addLayer('world', { sort: 'y-axis' });",
        "stage.setCamera({ x: 1, y: 2 });",
        "stage.pushMany('world', [{ kind: 'rect', x: 0, y: 0, width: 4, height: 4, fill: 'red' }]);",
        "const canvasStage = createCanvasRenderStage({ getContext: () => ctx });",
        "canvasStage.addLayer('hud', { ignoreCamera: true });",
        "const tileRenderer = createTileCacheRenderer({ image: { width: 16, height: 16 } as unknown as CanvasImageSource, tileWidth: 8, tileHeight: 8, columns: 2 });",
        "const actorRenderer = createActorRenderer({ width: 16, height: 16 });",
        "const hud = createHudRenderer();",
        "const effects = createEffectQueue();",
        "effects.push({ ttl: 1, draw: () => calls.push('effect') });",
        "const result = stage.render();",
        "const sorted = sortRenderCallsByY([{ kind: 'rect', x: 0, y: 4, width: 1, height: 1 }, { kind: 'rect', x: 0, y: 1, width: 1, height: 1 }]);",
        "const culled = cullRenderCallsToRect(sorted, { x: 0, y: 0, width: 10, height: 2 });",
        "const frame = resolveSpriteSheetFrame({ width: 64, height: 32, frameWidth: 16, frameHeight: 32, timeMs: 150, frameMs: 150 });",
        "const tile = tileRenderer.toDrawCall({ id: 1, tileX: 0, tileY: 0 });",
        "const actor = actorRenderer.toDrawCall({ x: 0, y: 0, label: 'Hero' });",
        "const drawState: RenderDrawContext = { camera: {}, layer: 'direct', layerOptions: { sort: 'none', ignoreCamera: true, order: 0 }, order: 0 };",
        "hud.render(ctx, [hud.text({ text: 'HP', x: 0, y: 0 }), createTextBlockDrawCall({ text: 'two words', x: 0, y: 10, maxWidth: 40 })]);",
        "const bar = drawRenderable(ctx, createBarDrawCall({ x: 0, y: 0, width: 10, height: 2, value: 1, max: 2, fill: 'red' }), drawState);",
        "const label = drawRenderable(ctx, createLabelDrawCall({ x: 0, y: 0, text: 'Name' }), drawState);",
        "const outline = drawRenderable(ctx, createInteractionOutlineDrawCall({ x: 0, y: 0, width: 10, height: 6, shape: 'ellipse' }), drawState);",
        "if (result.drawn !== 1 || canvasStage.flush().layers !== 1 || sorted.length !== 2 || culled.length !== 1 || frame?.frame !== 1 || !tile || !actor || !bar || !label || !outline || truncateText(ctx, 'abcdef', 24) !== '...' || wrapText(ctx, 'aa bb cc', 40).length !== 2) throw new Error('unexpected render result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "render-3d-consumer.ts"),
      [
        'import { createThirdPersonCameraRig3D, createThreeRender3D, createToroidalWorld3D, type ThreeLikeGeometry, type ThreeLikeMaterial, type ThreeModuleLike } from "@hyperfocus/engine/render/3d";',
        "",
        "class Vec { x = 0; y = 0; z = 0; set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } setScalar(value: number) { this.set(value, value, value); } }",
        "class Obj { position = new Vec(); rotation = { x: 0, y: 0, z: 0 }; scale = new Vec(); visible = true; children: Obj[] = []; add(...items: Obj[]) { this.children.push(...items); } remove(...items: Obj[]) { this.children = this.children.filter((item) => !items.includes(item)); } updateMatrix() {} }",
        "class Camera extends Obj { aspect = 1; fov = 55; near = 0.1; far = 1000; lookAt() {}; updateProjectionMatrix() {} }",
        "class Renderer { domElement = { width: 64, height: 64, clientWidth: 64, clientHeight: 64 } as HTMLCanvasElement; renders = 0; setPixelRatio() {}; setSize(width: number, height: number) { this.domElement.width = width; this.domElement.height = height; }; setClearColor() {}; render() { this.renders += 1; }; dispose() {} }",
        "class Geometry implements ThreeLikeGeometry {}",
        "class Material implements ThreeLikeMaterial {}",
        "class Action { stopped = false; enabled = false; looped = false; weight = 1; timeScale = 1; reset() { return this; } fadeIn() { return this; } fadeOut() { return this; } play() { return this; } stop() { this.stopped = true; return this; } }",
        "class Mixer { actions: Action[] = []; clipAction() { const action = new Action(); this.actions.push(action); return action; } update() {} stopAllAction() {} }",
        "class Mesh extends Obj { constructor(public geometry: ThreeLikeGeometry, public material: ThreeLikeMaterial) { super(); } }",
        "class Matrix { elements: number[] = []; fromArray(values: ArrayLike<number>) { this.elements = Array.from({ length: 16 }, (_, index) => values[index] ?? 0); } }",
        "class InstancedMesh extends Obj { instanceMatrix = { needsUpdate: false }; constructor(public geometry: ThreeLikeGeometry, public material: ThreeLikeMaterial, public count: number) { super(); } setMatrixAt() {} }",
        "const three = { WebGLRenderer: Renderer, Scene: Obj, Group: Obj, PerspectiveCamera: Camera, OrthographicCamera: Camera, Color: class { constructor(public color: unknown) {} }, AmbientLight: Obj, HemisphereLight: Obj, DirectionalLight: Obj, PointLight: Obj, BoxGeometry: Geometry, SphereGeometry: Geometry, Mesh, InstancedMesh, Matrix4: Matrix, MeshBasicMaterial: Material, AnimationMixer: Mixer } as unknown as ThreeModuleLike;",
        "const view = await createThreeRender3D({ three, width: 64, height: 64 });",
        "view.registerMesh('hero', { geometry: new Geometry(), material: new Material() });",
        "const world = createToroidalWorld3D({ width: 100, depth: 60, origin: [-50, -30] });",
        "const wrapped = world.wrapPosition([55, 2, -31]);",
        "const delta = world.shortestDelta([48, 0, 0], [-48, 0, 0]);",
        "const offsets = world.visibleDuplicateOffsets([-48, 0, 28], 6);",
        "const rigState = createThirdPersonCameraRig3D({ pitch: 0, distance: 10, smoothing: { follow: 0, rotation: 0, distance: 0, collision: 0 }, collision: { enabled: false } }).pan([1, 0, 0]).setShoulderOffset(0.5).orbit(0.2, 0.1).snapTo({ distance: 12 }).snapshot();",
        "const animation = view.createAnimationController(new Obj(), [{ name: 'idle' }], { initial: 'idle' });",
        "const ragdoll = view.createRagdoll({ position: [0, 0, 0], incomingForce: [1, 0, 0], ttl: 0.1 });",
        "const result = view.render({ camera: { kind: 'perspective', position: [0, 12, 18], target: [0, 0, 0] }, calls: [{ kind: 'mesh', mesh: 'hero', transform: { position: [1, 2, 3] } }] });",
        "if (result.calls !== 1 || wrapped[0] !== -45 || wrapped[2] !== 29 || delta[0] !== 4 || offsets.length !== 3 || rigState.distance !== 12 || rigState.position.length !== 3 || !animation.play('idle') || !ragdoll.update(0.05) || typeof view.loadAddon !== 'function') throw new Error('unexpected render/3d result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "physics-3d-consumer.ts"),
      [
        'import { applyOverTime, collidersOverlap3D, createKinematicCharacter3D, placeOnGround3D, rubberBand, submersionRatio, type HeightField3D } from "@hyperfocus/engine/physics/3d";',
        'import * as root from "@hyperfocus/engine";',
        "",
        "const heightField: HeightField3D = { heightAt: (x, z) => x + z };",
        "const placed = placeOnGround3D([1, 99, 2], heightField, { yOffset: 0.5 });",
        "const player = { kind: 'capsule' as const, a: [0, 0, 0] as const, b: [0, 2, 0] as const, radius: 0.5 };",
        "const water = submersionRatio(player, 1);",
        "const overlap = collidersOverlap3D(player, { kind: 'box', center: [0.5, 1, 0], halfSize: [0.5, 1, 0.5] });",
        "const actor = createKinematicCharacter3D({ heightField: { heightAt: () => 0 }, gravity: 10, groundSnap: 0.1 });",
        "actor.addForce([2, 0, 0]);",
        "actor.addForce([1, 0, 0], { continuous: true, durationMs: 100, damping: 4 });",
        "actor.applyOverTime(100, () => undefined);",
        "actor.rubberBand(100, () => undefined);",
        "actor.step(0.1);",
        "const values: number[] = [];",
        "const timed = applyOverTime(100, (ratio) => { values.push(ratio); });",
        "const band = rubberBand(100, (ratio) => { values.push(ratio); });",
        "timed.update(0.1);",
        "band.update(0.05);",
        "band.update(0.05);",
        "if ('createKinematicCharacter3D' in root || placed.y !== 3.5 || !overlap || water <= 0 || actor.state.position.x <= 0 || values.at(-1) !== 0) throw new Error('unexpected physics/3d result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "render-3d-core-consumer.ts"),
      [
        'import { TransformHierarchy3D, createFrustumPlanes3D, createMat4, extractFrustumPlanes3D, perspectiveMat4 } from "@hyperfocus/engine/render/3d-core";',
        "const hierarchy = new TransformHierarchy3D(2);",
        "const root = hierarchy.create();",
        "hierarchy.setPosition(root, 1, 2, 3);",
        "hierarchy.updateWorldMatrices();",
        "const projection = perspectiveMat4(createMat4(), { fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 100 });",
        "const frustum = extractFrustumPlanes3D(createFrustumPlanes3D(), projection);",
        "if (root !== 0 || hierarchy.count !== 1 || frustum.length !== 24) throw new Error('unexpected first-party 3D core result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "physics-2d-consumer.ts"),
      [
        'import { PHYSICS_DEBUG_SEGMENT_STRIDE, createPhysicsWorld2D } from "@hyperfocus/engine/physics/2d";',
        "const world = createPhysicsWorld2D({ capacity: 2, gravityY: 0 });",
        "world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfWidth: 1, halfHeight: 1 }, x: 4 });",
        "world.addBody({ id: 'ball', shape: { kind: 'circle', radius: 1 }, x: 1, velocityX: 2 });",
        "world.step(0.1);",
        "const hit = world.raycast(0, 0, 1, 0, 10);",
        "const debug = new Float32Array(world.debugSegmentCount(4) * PHYSICS_DEBUG_SEGMENT_STRIDE);",
        "if (hit?.id !== 'ball' || world.writeDebugSegments(debug, 4) < 1) throw new Error('unexpected first-party 2D physics result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "physics-rigid-3d-consumer.ts"),
      [
        'import { RIGID_DEBUG_SEGMENT_STRIDE_3D, createRigidWorld3D } from "@hyperfocus/engine/physics/rigid-3d";',
        "const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });",
        "world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 1, halfZ: 1 }, x: 4 });",
        "world.addBody({ id: 'ball', shape: { kind: 'sphere', radius: 1 }, x: 1, velocityX: 2 });",
        "world.step(0.1);",
        "const output = new Float32Array(world.debugSegmentCount() * RIGID_DEBUG_SEGMENT_STRIDE_3D);",
        "if (world.writeDebugSegments(output) < 1) throw new Error('unexpected rigid 3D result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "render-3d-scene-consumer.ts"),
      [
        'import { createBoundedScene3D, createRenderCommandBuffer3D } from "@hyperfocus/engine/render/3d-scene";',
        "const scene = createBoundedScene3D({ transforms: 1, meshes: 1, materials: 1, lights: 0, instances: 1 });",
        "const transform = scene.transforms.create();",
        "const mesh = scene.registerMesh({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) });",
        "const material = scene.createMaterial({ baseColor: [1, 0, 0, 1] });",
        "scene.createInstance({ mesh, material, transform });",
        "const commands = scene.compile(createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 0 }));",
        "if (commands.commandCount !== 1 || commands.instanceCount !== 1) throw new Error('unexpected first-party 3D scene result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "render-3d-webgl2-consumer.ts"),
      [
        'import { createWebGl2Renderer3D, supportsWebGl2Renderer3D } from "@hyperfocus/engine/render/3d-webgl2";',
        "if (typeof createWebGl2Renderer3D !== 'function' || supportsWebGl2Renderer3D() !== false) throw new Error('unexpected first-party WebGL2 surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "motion-consumer.ts"),
      [
        'import { createPoseBuffer, createPoseBufferLayout, sampleCanonicalHumanoidGait } from "@hyperfocus/engine/motion";',
        'import * as root from "@hyperfocus/engine";',
        "",
        "const pose = createPoseBuffer(createPoseBufferLayout(2, 3));",
        "const gait = sampleCanonicalHumanoidGait(0.25);",
        "if ('createPoseBuffer' in root || pose.totalCount !== 3 || gait.footLift <= 0) throw new Error('unexpected motion result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "motion-three-consumer.ts"),
      [
        'import { Bone, Skeleton } from "three";',
        'import { describeThreeSkeleton } from "@hyperfocus/engine/motion/three";',
        "",
        "const bone = new Bone();",
        "bone.name = 'Hips';",
        "const source = describeThreeSkeleton(new Skeleton([bone]));",
        "if (source.bones.length !== 1 || source.normalization.metersPerUnit !== 1) throw new Error('unexpected motion/three result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "migrations-consumer.ts"),
      [
        'import { migrateT3RigDocument, t3RigMigrations } from "@hyperfocus/engine/migrations";',
        "",
        "if (typeof migrateT3RigDocument !== 'function' || !Array.isArray(t3RigMigrations)) throw new Error('unexpected migrations result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "subpath-negative-consumer.ts"),
      [
        'import * as root from "@hyperfocus/engine";',
        'import * as browser from "@hyperfocus/engine/browser";',
        "",
        `const blockedExports = ${JSON.stringify(Object.values(rootBrowserSubpathOnlyValueExports).flat())} as const;`,
        "",
        "for (const exportName of blockedExports) {",
        "  if (exportName in root) throw new Error(`${exportName} leaked through @hyperfocus/engine`);",
        "  if (exportName in browser) throw new Error(`${exportName} leaked through @hyperfocus/engine/browser`);",
        "}",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "ui-consumer.ts"),
      [
        'import { createMmoUiShell, darkFantasyMmoUiTheme, type MmoUiShellConfig } from "@hyperfocus/engine/ui";',
        "",
        "const config: MmoUiShellConfig = { login: false, title: 'Realm' };",
        "if (typeof createMmoUiShell !== 'function' || darkFantasyMmoUiTheme.radius !== '8px' || config.title !== 'Realm') throw new Error('unexpected ui result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "ui-core-consumer.ts"),
      [
        'import { createMmoUiController, type MmoUiControllerState } from "@hyperfocus/engine/ui/core";',
        "",
        "const controller = createMmoUiController({ status: 'Ready' });",
        "const state: MmoUiControllerState = controller.getSnapshot();",
        "controller.actions.setStatus('Online');",
        "if (state.status !== 'Ready' || controller.getSnapshot().status !== 'Online') throw new Error('unexpected UI controller state');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "asset-loader-consumer.ts"),
      [
        'import { createAssetLoader, createAssetLoadSnapshot, createSmoothedAssetProgress, type AssetLoadSnapshot } from "@hyperfocus/engine/assets/loader";',
        'import * as root from "@hyperfocus/engine";',
        "",
        "const loader = createAssetLoader([{ id: 'hero', load: () => 7 }]);",
        "const value = await loader.loadAsset<number>('hero');",
        "const base: AssetLoadSnapshot = createAssetLoadSnapshot({ status: 'loading', actualProgress: 0.5, startedAt: 1, updatedAt: 1 });",
        "const smoother = createSmoothedAssetProgress({ speed: 4, minAdvancePerSecond: 0, now: () => 0 });",
        "const smoothed = smoother.update(base, 0);",
        "if ('createAssetLoader' in root || value !== 7 || smoothed.visibleProgress !== 0) throw new Error('unexpected asset loader result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "gltf-static-consumer.ts"),
      [
        'import { cookGltfStaticMeshes, resolveGltfStaticBuffers } from "@hyperfocus/engine/assets/gltf-static";',
        "if (typeof cookGltfStaticMeshes !== 'function' || typeof resolveGltfStaticBuffers !== 'function') throw new Error('unexpected glTF cooker surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "gltf-skin-animation-consumer.ts"),
      [
        'import { cookGltfSkinAnimations, createGltfPoseOutput, evaluateGltfAnimationPose, resolveAndCookGltfSkinAnimations } from "@hyperfocus/engine/assets/gltf-skin-animation";',
        "if (typeof cookGltfSkinAnimations !== 'function' || typeof resolveAndCookGltfSkinAnimations !== 'function' || typeof createGltfPoseOutput !== 'function' || typeof evaluateGltfAnimationPose !== 'function') throw new Error('unexpected glTF skin/animation surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "template-assets-consumer.ts"),
      [
        'import { resolveTemplateAssetUrl, templateAssetManifest } from "@hyperfocus/engine/assets/templates";',
        "",
        "const embedded = resolveTemplateAssetUrl(templateAssetManifest[0].id);",
        "const path = resolveTemplateAssetUrl(templateAssetManifest[0].id, { baseUrl: '/assets', mode: 'path' });",
        "if (!embedded.startsWith('data:image/png;base64,') || !path.startsWith('/assets/')) throw new Error('unexpected template asset result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-consumer.ts"),
      [
        'import { HYPERFOCUS_ASSETS_PATH, HYPERFOCUS_PROJECT_PATH, createHyperfocusProjectFiles, openHyperfocusProjectFiles } from "@hyperfocus/engine/project";',
        "",
        "const source = new Uint8Array([1, 2, 3]);",
        "const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', source))).map((value) => value.toString(16).padStart(2, '0')).join('');",
        "const files = await createHyperfocusProjectFiles({ assets: [{ id: 'data', name: 'data.bin', mimeType: 'application/octet-stream', size: 3, sha256: digest }] }, [{ id: 'data', name: 'data.bin', bytes: source }]);",
        "const opened = await openHyperfocusProjectFiles(files.projectJson, files.assetsArchive);",
        "if (HYPERFOCUS_PROJECT_PATH !== '.hyperfocus/project.json' || HYPERFOCUS_ASSETS_PATH !== '.hyperfocus/assets.hfp' || opened.assets[0]?.bytes[2] !== 3) throw new Error('unexpected portable project result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-2d-consumer.ts"),
      [
        'import { createPlayableWorld } from "@hyperfocus/engine/project/runtime-2d";',
        "",
        "const world = createPlayableWorld({ activeSceneId: 'main', scenes: [{ id: 'main', entities: [] }], tilemap: { columns: 1, rows: 1, tileSize: 16, values: [0] }, settings: { input: [] } });",
        "world.step();",
        "if (world.tick !== 1 || world.snapshot().sceneId !== 'main') throw new Error('unexpected portable runtime result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-navigation-2d-consumer.ts"),
      [
        'import { auditNavigationProject2D, createNavigationBehaviorRegistry2D } from "@hyperfocus/engine/project/runtime-navigation-2d";',
        "const project = { activeSceneId: 'main', scenes: [{ id: 'main', entities: [{ id: 'agent', label: 'Agent', x: 5, y: 5, width: 2, height: 2, scale: 1, layer: 1, color: '#fff', accent: '#000', kind: 'actor', components: [{ id: 'nav', type: 'behavior', enabled: true, values: { module: 'builtin:navigate', targetX: 15, targetY: 5, speed: 10 } }] }] }], tilemap: { columns: 2, rows: 1, tileSize: 10, values: [0, 0] }, settings: { input: [] } };",
        "const registry = createNavigationBehaviorRegistry2D(project);",
        "if (auditNavigationProject2D(project).length !== 0 || typeof registry['builtin:navigate#update'] !== 'function') throw new Error('unexpected portable navigation result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-save-2d-consumer.ts"),
      [
        'import { PLAYABLE_WORLD_SAVE_SCHEMA, createPlayableSaveController2D, validatePlayableSaveProject2D } from "@hyperfocus/engine/project/runtime-save-2d";',
        "if (PLAYABLE_WORLD_SAVE_SCHEMA !== 'portable-world-snapshot-v1' || typeof createPlayableSaveController2D !== 'function' || typeof validatePlayableSaveProject2D !== 'function') throw new Error('unexpected portable save runtime surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-story-2d-consumer.ts"),
      [
        'import { auditPlayableStoryProject2D, createPlayableStoryController2D } from "@hyperfocus/engine/project/runtime-story-2d";',
        "if (typeof auditPlayableStoryProject2D !== 'function' || typeof createPlayableStoryController2D !== 'function') throw new Error('unexpected portable story surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-3d-consumer.ts"),
      [
        'import { auditHyperfocus3DProject, createHyperfocus3DRuntime, hasHyperfocus3DProject } from "@hyperfocus/engine/project/runtime-3d";',
        "const empty = { extensions: {} };",
        "if (hasHyperfocus3DProject(empty) || auditHyperfocus3DProject(empty, []).length === 0 || typeof createHyperfocus3DRuntime !== 'function') throw new Error('unexpected portable 3D surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-filesystem-consumer.ts"),
      [
        'import { readHyperfocusProjectPair, recoverHyperfocusProjectPair, writeHyperfocusProjectPair } from "@hyperfocus/engine/project/filesystem";',
        "if (typeof readHyperfocusProjectPair !== 'function' || typeof recoverHyperfocusProjectPair !== 'function' || typeof writeHyperfocusProjectPair !== 'function') throw new Error('unexpected project filesystem surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-neutral-export-consumer.ts"),
      [
        'import { NEUTRAL_EXPORT_FORMAT, auditNeutralExport, createNeutralExportBundle } from "@hyperfocus/engine/project/neutral-export";',
        "if (NEUTRAL_EXPORT_FORMAT !== 'hyperfocus-neutral-export' || typeof auditNeutralExport !== 'function' || typeof createNeutralExportBundle !== 'function') throw new Error('unexpected neutral export surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "navigation-consumer.ts"),
      [
        'import { createGridNavigator } from "@hyperfocus/engine/navigation";',
        "const output = new Int32Array(4);",
        "const result = createGridNavigator({ columns: 2, rows: 2 }).findPath(0, 3, output);",
        "if (result.status !== 'found' || output[0] !== 0 || output[result.length - 1] !== 3) throw new Error('unexpected navigation result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "content-consumer.ts"),
      [
        'import { createScenePrefabCatalog, createStoryCatalog } from "@hyperfocus/engine/content";',
        "const scene = createScenePrefabCatalog({ scenes: [{ id: 'main', entities: [] }] }).instantiateScene('main');",
        "const text = createStoryCatalog({ defaultLocale: 'en', locales: [{ locale: 'en', messages: { hello: 'Hello' } }] }).format('en', 'hello');",
        "if (scene.sceneId !== 'main' || text !== 'Hello') throw new Error('unexpected content result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "save-consumer.ts"),
      [
        'import { createSaveProfile, withSaveSlot } from "@hyperfocus/engine/save";',
        "const profile = withSaveSlot(createSaveProfile('game', 'player', 1), 'auto', { x: 1 }, 0, 2);",
        "if (profile.slots[0]?.name !== 'auto') throw new Error('unexpected save result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "save-browser-consumer.ts"),
      [
        'import { IndexedDbSaveStorage, type IndexedDbSaveStorageOptions } from "@hyperfocus/engine/save/browser";',
        "const options: IndexedDbSaveStorageOptions = { databaseName: 'consumer', maxBytes: 1024 };",
        "if (typeof IndexedDbSaveStorage !== 'function' || options.maxBytes !== 1024) throw new Error('unexpected browser save surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "audio-consumer.ts"),
      [
        'import { chooseAudioLoadPolicy, computeSpatialAudio } from "@hyperfocus/engine/audio";',
        "if (chooseAudioLoadPolicy({ byteLength: 1_000, durationSeconds: 1 }).mode !== 'buffer' || computeSpatialAudio({ x: 0, y: 0 }, { x: 0, y: 0 }).gain !== 1) throw new Error('unexpected audio result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "effects-consumer.ts"),
      [
        'import { PARTICLE_INSTANCE_STRIDE, createParticleEmitter2D, createTimeline } from "@hyperfocus/engine/effects";',
        "const values = new Float64Array(1);",
        "createTimeline({ duration: 1, tracks: [{ id: 'x', keyframes: [{ time: 0, value: 0 }, { time: 1, value: 2 }] }] }).sample(0.5, values);",
        "const emitter = createParticleEmitter2D({ capacity: 1, seed: 1 });",
        "emitter.emit(1);",
        "const instances = new Float32Array(PARTICLE_INSTANCE_STRIDE);",
        "if (values[0] !== 1 || emitter.writeInstances(instances) !== 1) throw new Error('unexpected effects result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "prototype-post-processing-consumer.ts"),
      [
        'import { bloom, glitch, pixelate } from "@hyperfocus/engine/post-processing/prototype";',
        'import * as root from "@hyperfocus/engine";',
        "",
        "if ('bloom' in root || typeof bloom !== 'function' || typeof glitch !== 'function' || typeof pixelate !== 'function') throw new Error('unexpected post-processing prototype surface');",
      ].join("\n"),
    );

    await $`${npmCommand} install --offline --ignore-scripts --no-audit --no-fund --package-lock=false`.cwd(consumerDir).quiet();
    // npm treats directory dependencies as source checkouts and may run their prepare scripts.
    // Stage the already-installed peer artifacts directly so this smoke stays offline and side-effect free.
    for (const [packageName, packagePath] of Object.entries(localPeerPackages)) {
      const target = join(consumerDir, "node_modules", ...packageName.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      cpSync(packagePath, target, { recursive: true });
    }
    await $`${bunCommand} ./consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./core-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./browser-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./net-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./protocol-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./server-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./mmo-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./render-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./render-3d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./render-3d-core-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./render-3d-scene-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./render-3d-webgl2-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./physics-3d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./physics-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./physics-rigid-3d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./motion-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./motion-three-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./migrations-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-navigation-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-save-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-story-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-3d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-filesystem-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-neutral-export-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./navigation-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./content-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./save-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./save-browser-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./audio-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./effects-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./subpath-negative-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./ui-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./ui-core-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./asset-loader-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./gltf-static-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./gltf-skin-animation-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./template-assets-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./prototype-post-processing-consumer.ts`.cwd(consumerDir).quiet();
    await $`${tscPath} --noEmit`.cwd(consumerDir).quiet();
    await $`${tscPath} --noEmit -p ./tsconfig.nodenext.json`.cwd(consumerDir).quiet();
  } finally {
    rmSync(consumerDir, { force: true, recursive: true });
  }
} finally {
  rmSync(packDir, { force: true, recursive: true });
}
