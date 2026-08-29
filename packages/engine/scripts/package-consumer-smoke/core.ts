import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, parse, relative } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertCameraDeclarationSource,
  assertCameraRootExportsSource,
  assertRootBrowserSubpathOnlyDeclarationsSource
} from "../declaration-hygiene.ts";
import { formatMissingPackageArtifactsMessage, getMissingPackageArtifacts } from "../package-artifacts.ts";
import { readApiProfiles, readBundledPackageVersion, readPackageManifest } from "../smoke/json-boundaries.ts";

const rootDir = join(import.meta.dir, "..", "..");
const packagePath = join(rootDir, "package.json");
const manifest = readPackageManifest(packagePath);
const packageRequire = createRequire(packagePath);
const flatbushManifestPath = packageRequire.resolve("flatbush/package.json");
const bundledPackageManifestPaths = {
  flatbush: flatbushManifestPath,
  flatqueue: createRequire(flatbushManifestPath).resolve("flatqueue/package.json"),
  meshoptimizer: packageRequire.resolve("meshoptimizer/package.json")
} as const;
const runExternalConsumer = process.argv.includes("--external-consumer");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const bunCommand = process.platform === "win32" ? "bun.cmd" : "bun";
const expectedPackageFiles = [
  "LICENSE",
  "CHANGELOG.md",
  "SECURITY.md",
  "browser/",
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
  "dist/project-runtime-timeline-2d.js",
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
  "docs/README.md",
  "docs/architectural-resilience-matrix.md",
  "docs/schema/editor-project-v2.schema.json",
  "docs/browser-support.md",
  "docs/compatibility-policy.md",
  "docs/licensing-model.md",
  "docs/production-readiness.md",
  "docs/public-api-v0.0.json",
  "wasm/collision-kernel.wasm",
  "wasm/collision-kernel.wasm.d.ts",
  "wasm/collision-kernel.scalar.wasm",
  "wasm/collision-kernel.simd.wasm",
  "tooling/cdp-client.ts",
  "tooling/create-project.ts",
  "tooling/example-build.ts",
  "tooling/server.ts",
  "readme.md",
  "third-party-notices.md",
] as const;

const expectedBrowserPackageFiles = filesUnder(join(rootDir, "browser"))
  .map((path) => relative(rootDir, path).replaceAll("\\", "/"))
  .sort();

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
assert(/^0\.0\.\d+$/.test(manifest.version), "package version must stay inside the documented 0.0.x contract");
assert(manifest.packageManager === "bun@1.4.0", "the release toolchain must declare its pinned Bun version");
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
  const bundledVersion = readBundledPackageVersion(bundledPackageManifestPaths[packageName]);
  assert(bundledVersion, `installed ${packageName} package must declare its version`);
  assert(
    thirdPartyNotices.includes(`## ${packageName} ${bundledVersion}`),
    `third-party notices must match the bundled ${packageName} version`,
  );
}

const rootExport = manifest.exports?.["."];
assert(rootExport?.import === "./browser/engine.js", "root import must resolve to the browser ESM build");
assert(rootExport?.types === "./dist/src/index.d.ts", "root export types must resolve to generated declarations");

const coreExport = manifest.exports?.["./core"];
assert(coreExport?.import === "./dist/core.js", "core import must resolve to the DOM-free emitted module");
assert(coreExport?.types === "./dist/src/core.d.ts", "core export types must resolve to generated declarations");

const wasmRuntimeExport = manifest.exports?.["./wasm"];
assert(wasmRuntimeExport?.import === "./dist/wasm-runtime.js", "wasm import must resolve to the generated runtime helpers");
assert(wasmRuntimeExport?.types === "./dist/src/wasm/index.d.ts", "wasm export types must resolve to generated declarations");

const experimentalExport = manifest.exports?.["./experimental"];
assert(experimentalExport?.import === "./dist/experimental.js", "experimental import must resolve to the capability-gated adapters");
assert(experimentalExport?.types === "./dist/src/experimental/index.d.ts", "experimental export types must resolve to generated declarations");

const browserExport = manifest.exports?.["./browser"];
assert(browserExport?.import === "./browser/engine.js", "browser subpath import must resolve to the browser ESM build");
assert(browserExport?.types === "./dist/src/index.d.ts", "browser subpath types must resolve to generated root declarations");

const netExport = manifest.exports?.["./net"];
assert(netExport?.import === "./dist/net.js", "net import must resolve to the generated multiplayer ESM build");
assert(netExport?.types === "./dist/src/net/index.d.ts", "net export types must resolve to generated net declarations");

const protocolExport = manifest.exports?.["./protocol"];
assert(protocolExport?.import === "./dist/protocol.js", "protocol import must resolve to the generated protocol ESM build");
assert(protocolExport?.types === "./dist/src/protocol/index.d.ts", "protocol export types must resolve to generated protocol declarations");

const serverExport = manifest.exports?.["./server"];
assert(serverExport?.import === "./dist/server.js", "server import must resolve to the generated authoritative server ESM build");
assert(serverExport?.types === "./dist/src/server/index.d.ts", "server export types must resolve to generated server declarations");

const mmoExport = manifest.exports?.["./mmo"];
assert(mmoExport?.import === "./dist/mmo.js", "mmo import must resolve to the generated MMO ESM build");
assert(mmoExport?.types === "./dist/src/mmo/index.d.ts", "mmo export types must resolve to generated MMO declarations");

const renderExport = manifest.exports?.["./render"];
assert(renderExport?.import === "./dist/render.js", "render import must resolve to the generated render ESM build");
assert(renderExport?.types === "./dist/src/render/index.d.ts", "render export types must resolve to generated render declarations");

const render3dExport = manifest.exports?.["./render/3d"];
assert(render3dExport?.import === "./dist/render-3d.js", "render/3d import must resolve to the generated 3D render ESM build");
assert(render3dExport?.types === "./dist/src/render/3d.d.ts", "render/3d export types must resolve to generated 3D render declarations");

const render3dCoreExport = manifest.exports?.["./render/3d-core"];
assert(render3dCoreExport?.import === "./dist/render-3d-core.js", "render/3d-core import must resolve to the generated first-party 3D core build");
assert(render3dCoreExport?.types === "./dist/src/render/3d-core.d.ts", "render/3d-core export types must resolve to generated first-party 3D declarations");

const render3dSceneExport = manifest.exports?.["./render/3d-scene"];
assert(render3dSceneExport?.import === "./dist/render-3d-scene.js", "render/3d-scene import must resolve to the generated first-party scene build");
assert(render3dSceneExport?.types === "./dist/src/render/3d-scene.d.ts", "render/3d-scene export types must resolve to generated scene declarations");

const render3dWebgl2Export = manifest.exports?.["./render/3d-webgl2"];
assert(render3dWebgl2Export?.import === "./dist/render-3d-webgl2.js", "render/3d-webgl2 import must resolve to the generated first-party browser backend");
assert(render3dWebgl2Export?.types === "./dist/src/render/3d-webgl2.d.ts", "render/3d-webgl2 export types must resolve to generated backend declarations");

const physics3dExport = manifest.exports?.["./physics/3d"];
assert(physics3dExport?.import === "./dist/physics-3d.js", "physics/3d import must resolve to the generated 3D physics ESM build");
assert(physics3dExport?.types === "./dist/src/physics/3d.d.ts", "physics/3d export types must resolve to generated 3D physics declarations");

const physics2dExport = manifest.exports?.["./physics/2d"];
assert(physics2dExport?.import === "./dist/physics-2d.js", "physics/2d import must resolve to the generated first-party 2D physics build");
assert(physics2dExport?.types === "./dist/src/physics/2d.d.ts", "physics/2d export types must resolve to generated 2D physics declarations");

const rigid3dExport = manifest.exports?.["./physics/rigid-3d"];
assert(rigid3dExport?.import === "./dist/physics-rigid-3d.js", "physics/rigid-3d import must resolve to the generated bounded 3D world");
assert(rigid3dExport?.types === "./dist/src/physics/rigid-3d.d.ts", "physics/rigid-3d types must resolve to generated declarations");

const motionExport = manifest.exports?.["./motion"];
assert(motionExport?.import === "./dist/motion.js", "motion import must resolve to the renderer-neutral motion build");
assert(motionExport?.types === "./dist/src/motion/index.d.ts", "motion export types must resolve to generated motion declarations");

const motionThreeExport = manifest.exports?.["./motion/three"];
assert(motionThreeExport?.import === "./dist/motion-three.js", "motion/three import must resolve to the Three adapter build");
assert(motionThreeExport?.types === "./dist/src/motion/three.d.ts", "motion/three export types must resolve to generated Three adapter declarations");

const migrationsExport = manifest.exports?.["./migrations"];
assert(migrationsExport?.import === "./dist/migrations.js", "migrations import must resolve to the generated migration build");
assert(migrationsExport?.types === "./dist/src/migrations/index.d.ts", "migrations export types must resolve to generated migration declarations");

const projectExport = manifest.exports?.["./project"];
assert(projectExport?.import === "./dist/project.js", "project import must resolve to the generated portable project build");
assert(projectExport?.types === "./dist/src/project/index.d.ts", "project export types must resolve to generated portable project declarations");

const projectRuntime2dExport = manifest.exports?.["./project/runtime-2d"];
assert(projectRuntime2dExport?.import === "./dist/project-runtime-2d.js", "project/runtime-2d import must resolve to the generated portable runtime build");
assert(projectRuntime2dExport?.types === "./dist/src/project/runtime-2d.d.ts", "project/runtime-2d export types must resolve to generated runtime declarations");

const projectRuntimeTimeline2dExport = manifest.exports?.["./project/runtime-timeline-2d"];
assert(projectRuntimeTimeline2dExport?.import === "./dist/project-runtime-timeline-2d.js", "project/runtime-timeline-2d import must resolve to the generated timeline runtime build");
assert(projectRuntimeTimeline2dExport?.types === "./dist/src/project/runtime-timeline-2d.d.ts", "project/runtime-timeline-2d export types must resolve to generated timeline runtime declarations");

const projectRuntimeNavigation2dExport = manifest.exports?.["./project/runtime-navigation-2d"];
assert(projectRuntimeNavigation2dExport?.import === "./dist/project-runtime-navigation-2d.js", "project/runtime-navigation-2d import must resolve to the generated navigation adapter");
assert(projectRuntimeNavigation2dExport?.types === "./dist/src/project/runtime-navigation-2d.d.ts", "project/runtime-navigation-2d types must resolve to generated declarations");

const projectRuntimeSave2dExport = manifest.exports?.["./project/runtime-save-2d"];
assert(projectRuntimeSave2dExport?.import === "./dist/project-runtime-save-2d.js", "project/runtime-save-2d import must resolve to the generated save adapter");
assert(projectRuntimeSave2dExport?.types === "./dist/src/project/runtime-save-2d.d.ts", "project/runtime-save-2d types must resolve to generated declarations");

const projectRuntimeStory2dExport = manifest.exports?.["./project/runtime-story-2d"];
assert(projectRuntimeStory2dExport?.import === "./dist/project-runtime-story-2d.js", "project/runtime-story-2d import must resolve to the generated story adapter");
assert(projectRuntimeStory2dExport?.types === "./dist/src/project/runtime-story-2d.d.ts", "project/runtime-story-2d types must resolve to generated declarations");

const projectRuntime3dExport = manifest.exports?.["./project/runtime-3d"];
assert(projectRuntime3dExport?.import === "./dist/project-runtime-3d.js", "project/runtime-3d import must resolve to the generated portable 3D runtime");
assert(projectRuntime3dExport?.types === "./dist/src/project/runtime-3d.d.ts", "project/runtime-3d types must resolve to generated declarations");

const projectFilesystemExport = manifest.exports?.["./project/filesystem"];
assert(projectFilesystemExport?.import === "./dist/project-filesystem.js", "project/filesystem import must resolve to the generated filesystem build");
assert(projectFilesystemExport?.types === "./dist/src/project/filesystem.d.ts", "project/filesystem types must resolve to generated declarations");

const projectNeutralExport = manifest.exports?.["./project/neutral-export"];
assert(projectNeutralExport?.import === "./dist/project-neutral-export.js", "project/neutral-export import must resolve to the shared escape-export build");
assert(projectNeutralExport?.types === "./dist/src/project/neutral-export.d.ts", "project/neutral-export types must resolve to generated declarations");

const editorSchemaExport = manifest.exports?.["./schema/editor-project-v2.json"];
assert(editorSchemaExport?.default === "./docs/schema/editor-project-v2.schema.json", "editor schema export must resolve to the published JSON Schema");

const navigationExport = manifest.exports?.["./navigation"];
assert(navigationExport?.import === "./dist/navigation.js", "navigation import must resolve to the generated navigation build");
assert(navigationExport?.types === "./dist/src/navigation/index.d.ts", "navigation export types must resolve to generated navigation declarations");

const contentExport = manifest.exports?.["./content"];
assert(contentExport?.import === "./dist/content.js", "content import must resolve to the generated content build");
assert(contentExport?.types === "./dist/src/content/index.d.ts", "content export types must resolve to generated content declarations");
const saveExport = manifest.exports?.["./save"];
assert(saveExport?.import === "./dist/save.js", "save import must resolve to the generated save build");
assert(saveExport?.types === "./dist/src/save/index.d.ts", "save export types must resolve to generated save declarations");
const saveBrowserExport = manifest.exports?.["./save/browser"];
assert(saveBrowserExport?.import === "./dist/save-browser.js", "save/browser import must resolve to the generated IndexedDB adapter");
assert(saveBrowserExport?.types === "./dist/src/save/browser.d.ts", "save/browser types must resolve to generated declarations");
const audioExport = manifest.exports?.["./audio"];
assert(audioExport?.import === "./dist/audio.js", "audio import must resolve to the generated audio build");
assert(audioExport?.types === "./dist/src/audio/index.d.ts", "audio export types must resolve to generated audio declarations");
const effectsExport = manifest.exports?.["./effects"];
assert(effectsExport?.import === "./dist/effects.js", "effects import must resolve to the generated effects build");
assert(effectsExport?.types === "./dist/src/effects/index.d.ts", "effects export types must resolve to generated effects declarations");

const uiExport = manifest.exports?.["./ui"];
assert(uiExport?.import === "./dist/ui.js", "ui import must resolve to the generated UI ESM build");
assert(uiExport?.types === "./dist/src/ui/index.d.ts", "ui export types must resolve to generated UI declarations");
const uiCoreExport = manifest.exports?.["./ui/core"];
assert(uiCoreExport?.import === "./dist/ui-core.js", "ui/core import must resolve to the DOM-free UI controller build");
assert(uiCoreExport?.types === "./dist/src/ui/core.d.ts", "ui/core export types must resolve to generated controller declarations");

const templateAssetsExport = manifest.exports?.["./assets/templates"];
assert(templateAssetsExport?.import === "./dist/assets/templates.js", "template assets import must resolve to the generated template assets ESM build");
assert(templateAssetsExport?.types === "./dist/src/assets/templates/index.d.ts", "template assets export types must resolve to generated template asset declarations");

const assetLoaderExport = manifest.exports?.["./assets/loader"];
assert(assetLoaderExport?.import === "./dist/assets/loader.js", "asset loader import must resolve to the generated asset loader ESM build");
assert(assetLoaderExport?.types === "./dist/src/assets/loader.d.ts", "asset loader export types must resolve to generated asset loader declarations");

const gltfStaticExport = manifest.exports?.["./assets/gltf-static"];
assert(gltfStaticExport?.import === "./dist/assets/gltf-static.js", "assets/gltf-static import must resolve to the generated neutral glTF cooker");
assert(gltfStaticExport?.types === "./dist/src/assets/gltf-static.d.ts", "assets/gltf-static types must resolve to generated cooker declarations");

const gltfSkinAnimationExport = manifest.exports?.["./assets/gltf-skin-animation"];
assert(gltfSkinAnimationExport?.import === "./dist/assets/gltf-skin-animation.js", "assets/gltf-skin-animation import must resolve to the generated skin/animation cooker");
assert(gltfSkinAnimationExport?.types === "./dist/src/assets/gltf-skin-animation.d.ts", "assets/gltf-skin-animation types must resolve to generated declarations");

const prototypePostProcessingExport = manifest.exports?.["./post-processing/prototype"];
assert(prototypePostProcessingExport?.import === "./dist/post-processing-prototype.js", "prototype post-processing import must resolve to generated ESM build");
assert(prototypePostProcessingExport?.types === "./dist/src/canvas/post-processing-prototype.d.ts", "prototype post-processing export types must resolve to generated declarations");

const wasmExport = manifest.exports?.["./wasm/collision-kernel.wasm"];
assert(wasmExport?.default === "./wasm/collision-kernel.wasm", "WASM asset export must stay explicit");
assert(wasmExport?.types === "./wasm/collision-kernel.wasm.d.ts", "WASM asset export must expose an asset URL type");
const viteWasmUrlExport = manifest.exports?.["./wasm/collision-kernel.wasm?url"];
assert(viteWasmUrlExport?.default === "./wasm/collision-kernel.wasm", "Vite WASM URL export must point at the same asset");
assert(viteWasmUrlExport?.types === "./wasm/collision-kernel.wasm.d.ts", "Vite WASM URL export must expose an asset URL type");
for (const variant of ["scalar", "simd"] as const) {
  const assetPath = `./wasm/collision-kernel.${variant}.wasm`;
  const assetExport = manifest.exports?.[assetPath];
  assert(assetExport?.default === assetPath, `${variant} WASM asset export must stay explicit`);
  assert(assetExport?.types === "./wasm/collision-kernel.wasm.d.ts", `${variant} WASM asset export must expose an asset URL type`);
}

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
const projectRuntimeTimeline2dBuild = await import(pathToFileURL(join(rootDir, "dist/project-runtime-timeline-2d.js")).href);
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
      'Run "bun run build" in packages/engine before smoke:package.',
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
assertRuntimeMatchesDeclarations("project", projectBuild, ["index", "editor", "standalone-playable"].map((name) => readFileSync(join(rootDir, `dist/src/project/${name}.d.ts`), "utf8")).join("\n"));
assert(projectBuild.HYPERFOCUS_PROJECT_PATH === ".hyperfocus/project.json", "project build must expose the portable JSON path");
assert(projectBuild.HYPERFOCUS_ASSETS_PATH === ".hyperfocus/assets.hfp", "project build must expose the portable ZIP path");
assertRuntimeMatchesDeclarations("project/runtime-2d", projectRuntime2dBuild, readFileSync(join(rootDir, "dist/src/project/runtime-2d.d.ts"), "utf8"));
assert(typeof projectRuntime2dBuild.createPlayableWorld === "function", "project/runtime-2d build must expose createPlayableWorld");
assertRuntimeMatchesDeclarations("project/runtime-timeline-2d", projectRuntimeTimeline2dBuild, readFileSync(join(rootDir, "dist/src/project/runtime-timeline-2d.d.ts"), "utf8"));
assert(typeof projectRuntimeTimeline2dBuild.createPlayableTimeline2D === "function", "project/runtime-timeline-2d build must expose createPlayableTimeline2D");
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
  "createSeedableRandom",
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
  "SignedSessionAuthority", "createAuthoritativeServer", "createSignedSessionAuthority",
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

const postProcessApiProfiles = readApiProfiles(browserBuild.postProcessApiProfiles, "postProcessApiProfiles");

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
  readApiProfiles(browserBuild.animationApiProfiles, "animationApiProfiles")
);
assertStableRootProfiles(
  "atlasApiProfiles",
  readApiProfiles(browserBuild.atlasApiProfiles, "atlasApiProfiles")
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


export {
  assert,
  bunCommand,
  expectedPackageFiles,
  expectedBrowserPackageFiles,
  findAncestorTool,
  npmCommand,
  packagePath,
  rootDir,
  runExternalConsumer,
};
